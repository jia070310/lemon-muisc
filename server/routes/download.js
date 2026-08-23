import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { getDB } from '../db.js'
import { broadcast } from '../ws.js'
import { requestSource } from '../sourceManager.js'
import { writeMeta } from '../meta.js'
import { buildMusicInfoFromTask, lyricLookupExtra } from '../utils/musicInfo.js'
import { buildEmbedLyrics, fixKgLyric } from '../utils/lyric.js'
import { getDownloadSavePath } from '../utils/filePaths.js'
import { getLyric, searchMusic } from '../musicSdk.js'
import { fetchPicBuffer } from '../utils/fetchPic.js'

export const downloadRouter = Router()

const activeDownloads = new Map()
let runningCount = 0

downloadRouter.get('/list', (_req, res) => {
  const rows = getDB().prepare('SELECT * FROM download_tasks ORDER BY created_at DESC').all()
  res.json(rows.map(r => ({ ...r, meta: JSON.parse(r.meta) })))
})

downloadRouter.post('/add', async (req, res) => {
  try {
    const { tasks } = req.body
    if (!Array.isArray(tasks) || !tasks.length) return res.status(400).json({ error: '没有下载任务' })

    const settings = getSettings()
    const insert = getDB().prepare(`
      INSERT INTO download_tasks (id, name, singer, source, album, interval, quality, meta, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'waiting')
    `)

    const added = []
    const tx = getDB().transaction(() => {
      for (const t of tasks) {
        const id = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        const meta = JSON.stringify({
          songId: t.songId || t.id,
          hash: t.hash || '',
          songmid: t.songmid || '',
          copyrightId: t.copyrightId || '',
          albumAudioId: t.albumAudioId || '',
          duration: t.duration || '',
          musicId: t.musicId || '',
          rid: t.rid || '',
          dcTargetId: t.dcTargetId || '',
          albummid: t.albummid || t.albumMid || t.albumId || '',
          albumId: t.albumId || t.albumMid || t.albummid || '',
          albumMid: t.albumMid || t.albummid || t.albumId || '',
          strMediaMid: t.strMediaMid || '',
          img: t.img || t.picUrl || '',
          picUrl: t.picUrl || t.img || '',
          source: t.source,
          types: t.types || [],
          qualitys: t.qualitys || [],
        })
        insert.run(id, t.name, t.singer || '', t.source || '', t.album || '', t.interval || '', t.quality || '320k', meta)
        added.push(id)
      }
    })
    tx()

    processQueue()
    res.json({ ok: true, ids: added })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

downloadRouter.post('/pause/:id', (req, res) => {
  const dl = activeDownloads.get(req.params.id)
  if (dl?.abort) dl.abort.abort()
  getDB().prepare("UPDATE download_tasks SET status = 'paused' WHERE id = ?").run(req.params.id)
  broadcast('download:status', { id: req.params.id, status: 'paused' })
  res.json({ ok: true })
})

downloadRouter.post('/resume/:id', (req, res) => {
  getDB().prepare("UPDATE download_tasks SET status = 'waiting' WHERE id = ?").run(req.params.id)
  broadcast('download:status', { id: req.params.id, status: 'waiting' })
  processQueue()
  res.json({ ok: true })
})

downloadRouter.delete('/:id', (req, res) => {
  const dl = activeDownloads.get(req.params.id)
  if (dl?.abort) dl.abort.abort()
  activeDownloads.delete(req.params.id)

  const task = getDB().prepare('SELECT file_path FROM download_tasks WHERE id = ?').get(req.params.id)
  if (task?.file_path) {
    try { fs.unlinkSync(task.file_path) } catch {}
  }
  getDB().prepare('DELETE FROM download_tasks WHERE id = ?').run(req.params.id)
  broadcast('download:removed', { id: req.params.id })
  res.json({ ok: true })
})

downloadRouter.post('/clear-completed', (_req, res) => {
  getDB().prepare("DELETE FROM download_tasks WHERE status = 'completed'").run()
  broadcast('download:cleared', {})
  res.json({ ok: true })
})

function getSettings() {
  const rows = getDB().prepare('SELECT key, value FROM settings').all()
  const s = {}
  for (const r of rows) s[r.key] = r.value
  return s
}

async function processQueue() {
  const settings = getSettings()
  const maxDl = parseInt(settings['download.maxDownloadNum']) || 3

  while (runningCount < maxDl) {
    const task = getDB().prepare("SELECT * FROM download_tasks WHERE status = 'waiting' ORDER BY created_at ASC LIMIT 1").get()
    if (!task) break

    runningCount++
    getDB().prepare("UPDATE download_tasks SET status = 'downloading' WHERE id = ?").run(task.id)
    broadcast('download:status', { id: task.id, status: 'downloading' })

    downloadTask(task, settings).finally(() => {
      runningCount--
      activeDownloads.delete(task.id)
      processQueue()
    })
  }
}

async function downloadTask(task, settings) {
  const abort = new AbortController()
  activeDownloads.set(task.id, { abort })

  try {
    const meta = JSON.parse(task.meta)
    const source = meta.source || task.source
    const quality = task.quality || '320k'
    const musicInfo = buildMusicInfoFromTask(task, meta)

    const urlResult = await requestSource(source, 'musicUrl', {
      type: quality,
      quality,
      musicInfo,
    })

    const url = typeof urlResult === 'string' ? urlResult : urlResult?.url
    if (!url) throw new Error(`获取 ${quality} 音质下载链接失败，请尝试其他音质`)

    const ext = guessExt(url, task.quality)
    const fileName = buildFileName(settings['download.fileName'] || '{name} - {singer}', task, ext)
    const savePath = getDownloadSavePath()
    const groupDir = settings['download.isSavePathGroupByListName'] === 'true' && task.album ? path.join(savePath, sanitize(task.album)) : savePath
    fs.mkdirSync(groupDir, { recursive: true })

    const filePath = path.join(groupDir, fileName)

    if (settings['download.skipExistFile'] === 'true' && fs.existsSync(filePath)) {
      getDB().prepare("UPDATE download_tasks SET status = 'completed', file_path = ?, progress = 1 WHERE id = ?").run(filePath, task.id)
      broadcast('download:status', { id: task.id, status: 'completed', progress: 1 })
      await writeMetaIfNeeded(task, meta, filePath, ext, settings)
      return
    }

    const { default: needlePkg } = await import('needle')
    const stream = needlePkg.get(url, { follow_max: 5, signal: abort.signal })
    const writer = fs.createWriteStream(filePath)
    let downloaded = 0
    let total = 0

    stream.on('header', (code, headers) => {
      total = parseInt(headers['content-length']) || 0
      getDB().prepare('UPDATE download_tasks SET total_size = ? WHERE id = ?').run(total, task.id)
    })

    await new Promise((resolve, reject) => {
      stream.on('data', (chunk) => {
        downloaded += chunk.length
        writer.write(chunk)
        const progress = total > 0 ? downloaded / total : 0
        getDB().prepare('UPDATE download_tasks SET downloaded_size = ?, progress = ? WHERE id = ?').run(downloaded, progress, task.id)
        broadcast('download:progress', { id: task.id, progress, downloaded, total })
      })
      stream.on('done', (err) => {
        writer.end()
        if (err) reject(err); else resolve()
      })
      stream.on('err', reject)
    })

    getDB().prepare("UPDATE download_tasks SET status = 'completed', file_path = ?, progress = 1 WHERE id = ?").run(filePath, task.id)
    broadcast('download:status', { id: task.id, status: 'completed', progress: 1, filePath })

    await writeMetaIfNeeded(task, meta, filePath, ext, settings)
  } catch (e) {
    if (e.name === 'AbortError') return
    getDB().prepare("UPDATE download_tasks SET status = 'error', error = ? WHERE id = ?").run(e.message, task.id)
    broadcast('download:status', { id: task.id, status: 'error', error: e.message })
  }
}

async function writeMetaIfNeeded(task, meta, filePath, ext, settings) {
  const on = (key) => settings[key] === 'true' || settings[key] === true
  const wantEmbedPic = on('download.isEmbedPic')
  const wantEmbedLyric = on('download.isEmbedLyric')
  const wantLrcFile = on('download.isDownloadLrc')

  // 未开启任何封面/歌词相关选项则跳过
  if (!wantEmbedPic && !wantEmbedLyric && !wantLrcFile) {
    return
  }

  const source = meta.source || task.source
  const musicInfo = buildMusicInfoFromTask(task, meta)
  const canEmbed = ['.mp3', '.flac'].includes(ext)

  let picBuf = null
  if (wantEmbedPic && canEmbed) {
    try {
      picBuf = await fetchCover(source, musicInfo, meta, task)
    } catch (e) {
      console.warn('获取封面失败:', task.name, e.message)
    }
  }

  let lrcResult = null
  if (wantEmbedLyric || wantLrcFile) {
    try {
      lrcResult = await fetchLyric(source, musicInfo, meta, task, settings)
      if (lrcResult?.lyric && source === 'kg') {
        lrcResult.lyric = fixKgLyric(lrcResult.lyric)
      }
    } catch (e) {
      console.warn('获取歌词失败:', task.name, e.message)
    }
  }

  // 仅在开启内嵌且格式支持时写入音频内置标签
  if (canEmbed && (wantEmbedPic || wantEmbedLyric)) {
    const metaData = {
      title: task.name || '',
      artist: (task.singer || '').replace(/\//g, ';'),
      album: task.album || '',
    }
    if (wantEmbedPic && picBuf) metaData.pic = picBuf
    if (wantEmbedLyric && lrcResult?.lyric) {
      metaData.lyric = buildEmbedLyrics(lrcResult, settings)
    }
    try {
      await writeMeta(filePath, ext, metaData)
    } catch (e) {
      console.error('写入内嵌标签失败:', task.name, e.message)
    }
  }

  // 开启「下载歌词文件」时，在下载目录写入同名 .lrc（与音频格式无关）
  if (wantLrcFile && lrcResult?.lyric) {
    try {
      await saveLrcFile(filePath, lrcResult, settings)
    } catch (e) {
      console.error('保存歌词文件失败:', task.name, e.message)
    }
  }
}

async function fetchCover(source, musicInfo, meta, task) {
  // 1) 搜索结果里已有的封面（优先，最稳）
  const directUrls = [
    meta.picUrl,
    meta.albummid ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${meta.albummid}.jpg` : '',
  ].filter(Boolean)

  for (const url of directUrls) {
    const pic = await fetchPicBuffer(url)
    if (pic) return pic
  }

  // 2) 音源脚本 pic 接口
  try {
    const picResult = await requestSource(source, 'pic', { musicInfo })
    const picUrl = typeof picResult === 'string' ? picResult : (picResult?.url || picResult?.picUrl)
    if (picUrl) {
      const pic = await fetchPicBuffer(picUrl)
      if (pic) return pic
    }
  } catch (e) {
    console.warn('音源获取封面失败:', e?.message || e)
  }

  // 3) 按歌名再搜一次补封面（兼容旧任务无 picUrl）
  try {
    const keyword = [task?.name, task?.singer].filter(Boolean).join(' ')
    if (keyword) {
      const result = await searchMusic(keyword, source, 1, 5)
      const hit = (result.list || []).find(i => i.picUrl) || result.list?.[0]
      if (hit?.picUrl) {
        const pic = await fetchPicBuffer(hit.picUrl)
        if (pic) return pic
      }
    }
  } catch (e) {
    console.warn('搜索补封面失败:', e?.message || e)
  }

  return null
}

async function fetchLyric(source, musicInfo, meta, task, settings) {
  const songId = meta.songmid || meta.hash || meta.songId || meta.copyrightId
    || musicInfo.songmid || musicInfo.hash || musicInfo.songId

  // 1) 内置 SDK（比自定义音源脚本更稳）
  if (songId) {
    try {
      const lrc = await getLyric(songId, source, lyricLookupExtra({ ...musicInfo, ...meta, ...task }))
      if (lrc?.lyric) return lrc
    } catch (e) {
      console.warn('SDK 获取歌词失败:', e?.message || e)
    }
  }

  // 2) 音源脚本 lyric 接口
  try {
    const lrcResult = await requestSource(source, 'lyric', { musicInfo })
    if (lrcResult?.lyric) {
      return {
        lyric: lrcResult.lyric,
        tlyric: lrcResult.tlyric || '',
        rlyric: lrcResult.rlyric || '',
      }
    }
  } catch (e) {
    console.warn('音源获取歌词失败:', e?.message || e)
  }

  // 3) 按歌名搜索补歌词（可选跨平台）
  try {
    const keyword = [task?.name, task?.singer].filter(Boolean).join(' ')
    if (!keyword) return null
    const useOther = settings?.['download.isUseOtherSource'] !== 'false'
    const fallbackSources = useOther
      ? ['wy', 'tx', 'kw', 'kg', 'mg']
      : [source]
    const seen = new Set()
    for (const src of fallbackSources) {
      if (seen.has(src)) continue
      seen.add(src)
      const result = await searchMusic(keyword, src, 1, 5)
      for (const hit of result.list || []) {
        const id = hit.songmid || hit.hash || hit.songId || hit.copyrightId || hit.id
        if (!id) continue
        const lrc = await getLyric(id, hit.source || src, lyricLookupExtra(hit))
        if (lrc?.lyric) return lrc
      }
    }
  } catch (e) {
    console.warn('搜索补歌词失败:', e?.message || e)
  }

  return null
}

async function saveLrcFile(filePath, lrcResult, settings) {
  const on = (key) => settings[key] === 'true' || settings[key] === true
  const lrcPath = filePath.replace(/\.[^.]+$/, '.lrc')

  let content = lrcResult.lyric || ''
  // 与内嵌逻辑一致：按「下载翻译/罗马音」开关合并进 .lrc
  if (on('download.isDownloadTLrc') || on('download.isDownloadRLrc')) {
    content = buildEmbedLyrics(lrcResult, {
      ...settings,
      'download.isEmbedLyricT': on('download.isDownloadTLrc') ? 'true' : 'false',
      'download.isEmbedLyricR': on('download.isDownloadRLrc') ? 'true' : 'false',
    }) || content
  }

  if (!content) return

  const encoding = settings['download.lrcFormat'] === 'gbk' ? 'gbk' : 'utf-8'
  if (encoding === 'gbk') {
    const iconv = await import('iconv-lite')
    fs.writeFileSync(lrcPath, iconv.default.encode(content, 'gbk'))
  } else {
    fs.writeFileSync(lrcPath, content, 'utf-8')
  }
}

function guessExt(url, quality) {
  if (url.includes('.flac') || quality?.includes('flac')) return '.flac'
  if (url.includes('.wav')) return '.wav'
  if (url.includes('.ape')) return '.ape'
  if (url.includes('.ogg')) return '.ogg'
  return '.mp3'
}

function buildFileName(template, task, ext) {
  return sanitize(template
    .replace(/\{name\}/g, task.name || 'Unknown')
    .replace(/\{singer\}/g, task.singer || 'Unknown')
    .replace(/\{album\}/g, task.album || '')) + ext
}

function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'untitled'
}
