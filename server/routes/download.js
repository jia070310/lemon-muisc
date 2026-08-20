import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { getDB } from '../db.js'
import { broadcast } from '../ws.js'
import { requestSource } from '../sourceManager.js'
import { writeMeta } from '../meta.js'
import { buildMusicInfoFromTask } from '../utils/musicInfo.js'
import { buildEmbedLyrics, fixKgLyric } from '../utils/lyric.js'
import { getDownloadSavePath } from '../utils/filePaths.js'
import { getLyric } from '../musicSdk.js'

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
          picUrl: t.picUrl || '',
          source: t.source,
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
  if (!['.mp3', '.flac'].includes(ext)) return

  const source = meta.source || task.source
  const musicInfo = buildMusicInfoFromTask(task, meta)
  const metaData = {
    title: task.name || '',
    artist: (task.singer || '').replace(/\//g, ';'),
    album: task.album || '',
  }

  try {
    if (settings['download.isEmbedPic'] === 'true') {
      const pic = await fetchCover(source, musicInfo, meta)
      if (pic) metaData.pic = pic
    }

    let lrcResult = null
    if (settings['download.isEmbedLyric'] === 'true' || settings['download.isDownloadLrc'] === 'true') {
      lrcResult = await fetchLyric(source, musicInfo, meta)
      if (lrcResult?.lyric && source === 'kg') {
        lrcResult.lyric = fixKgLyric(lrcResult.lyric)
      }
    }

    if (settings['download.isEmbedLyric'] === 'true' && lrcResult?.lyric) {
      metaData.lyric = buildEmbedLyrics(lrcResult, settings)
    }

    await writeMeta(filePath, ext, metaData)

    if (settings['download.isDownloadLrc'] === 'true' && lrcResult?.lyric) {
      await saveLrcFile(filePath, lrcResult, settings)
    }
  } catch (e) {
    console.error('写入标签失败:', task.name, e.message)
  }
}

async function fetchCover(source, musicInfo, meta) {
  try {
    const picResult = await requestSource(source, 'pic', { musicInfo })
    const picUrl = typeof picResult === 'string' ? picResult : picResult?.url
    if (picUrl) {
      const pic = await fetchPicBuffer(picUrl)
      if (pic) return pic
    }
  } catch (e) {
    console.warn('音源获取封面失败，尝试备用地址:', e.message)
  }

  if (meta.picUrl) return fetchPicBuffer(meta.picUrl)
  return null
}

async function fetchLyric(source, musicInfo, meta) {
  try {
    const lrcResult = await requestSource(source, 'lyric', { musicInfo })
    if (lrcResult?.lyric) return lrcResult
  } catch (e) {
    console.warn('音源获取歌词失败，尝试内置 SDK:', e.message)
  }

  const songId = meta.songId || meta.songmid || meta.hash || meta.copyrightId
  if (!songId) return null
  try {
    return await getLyric(songId, source)
  } catch {
    return null
  }
}

async function saveLrcFile(filePath, lrcResult, settings) {
  const lrcPath = filePath.replace(/\.[^.]+$/, '.lrc')
  let content = lrcResult.lyric
  if (settings['download.isDownloadTLrc'] === 'true' && lrcResult.tlyric) {
    content = buildEmbedLyrics(lrcResult, {
      ...settings,
      'download.isEmbedLyricT': 'true',
      'download.isEmbedLyricR': 'false',
    })
  }
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
