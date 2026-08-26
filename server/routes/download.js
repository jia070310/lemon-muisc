import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { getDB } from '../db.js'
import { broadcast } from '../ws.js'
import { requestSource } from '../sourceManager.js'
import { writeMeta } from '../meta.js'
import { buildMusicInfoFromTask } from '../utils/musicInfo.js'
import { buildEmbedLyrics } from '../utils/lyric.js'
import { getDownloadSavePath } from '../utils/filePaths.js'
import { fetchTrackLyric, fetchTrackCover } from '../utils/trackMeta.js'
import {
  getNextLowerQuality,
  isRetryableDownloadError,
  qualityLabel,
  sleep,
} from '../utils/downloadQuality.js'
import { formatUserError } from '../utils/userError.js'

export const downloadRouter = Router()

const activeDownloads = new Map()
let runningCount = 0
const SAME_QUALITY_ATTEMPTS = 3
const RETRY_DELAY_MS = 1200

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
          requestedQuality: t.quality || '320k',
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
  const row = getDB().prepare('SELECT id, meta, status FROM download_tasks WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '任务不存在' })
  let meta = {}
  try { meta = JSON.parse(row.meta || '{}') } catch { meta = {} }
  if (meta.downgradeOffer) {
    delete meta.downgradeOffer
    getDB().prepare('UPDATE download_tasks SET meta = ?, error = NULL WHERE id = ?')
      .run(JSON.stringify(meta), req.params.id)
  }
  getDB().prepare("UPDATE download_tasks SET status = 'waiting', error = NULL WHERE id = ?").run(req.params.id)
  broadcast('download:status', { id: req.params.id, status: 'waiting', error: '' })
  processQueue()
  res.json({ ok: true })
})

/** 用户确认：以降一档音质重新下载（仅在同音质重试失败后出现） */
downloadRouter.post('/confirm-downgrade/:id', (req, res) => {
  try {
    const row = getDB().prepare('SELECT * FROM download_tasks WHERE id = ?').get(req.params.id)
    if (!row) return res.status(404).json({ error: '任务不存在' })
    let meta = {}
    try { meta = JSON.parse(row.meta || '{}') } catch { meta = {} }
    const offer = meta.downgradeOffer
    if (!offer?.toQuality) {
      return res.status(400).json({ error: '没有待确认的降质选项' })
    }
    const toQuality = offer.toQuality
    delete meta.downgradeOffer
    meta.lastDowngrade = {
      from: offer.fromQuality,
      to: toQuality,
      at: new Date().toISOString(),
      reason: offer.reason || '',
    }
    getDB().prepare(`
      UPDATE download_tasks
      SET quality = ?, meta = ?, status = 'waiting', error = NULL, progress = 0, downloaded_size = 0
      WHERE id = ?
    `).run(toQuality, JSON.stringify(meta), req.params.id)
    broadcast('download:status', {
      id: req.params.id,
      status: 'waiting',
      quality: toQuality,
      error: '',
      downgradeOffer: null,
    })
    processQueue()
    res.json({ ok: true, quality: toQuality })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 用户拒绝降质：保留失败状态 */
downloadRouter.post('/reject-downgrade/:id', (req, res) => {
  try {
    const row = getDB().prepare('SELECT * FROM download_tasks WHERE id = ?').get(req.params.id)
    if (!row) return res.status(404).json({ error: '任务不存在' })
    let meta = {}
    try { meta = JSON.parse(row.meta || '{}') } catch { meta = {} }
    const reason = meta.downgradeOffer?.reason || formatUserError(row.error, '下载失败')
    delete meta.downgradeOffer
    getDB().prepare(`
      UPDATE download_tasks SET status = 'error', error = ?, meta = ? WHERE id = ?
    `).run(reason, JSON.stringify(meta), req.params.id)
    broadcast('download:status', {
      id: req.params.id,
      status: 'error',
      error: reason,
      downgradeOffer: null,
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
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

function parseTaskMeta(task) {
  try {
    return JSON.parse(task.meta || '{}')
  } catch {
    return {}
  }
}

function saveTaskMeta(taskId, meta) {
  getDB().prepare('UPDATE download_tasks SET meta = ? WHERE id = ?').run(JSON.stringify(meta), taskId)
}

async function processQueue() {
  const settings = getSettings()
  const maxDl = parseInt(settings['download.maxDownloadNum']) || 3

  while (runningCount < maxDl) {
    const task = getDB().prepare("SELECT * FROM download_tasks WHERE status = 'waiting' ORDER BY created_at ASC LIMIT 1").get()
    if (!task) break

    runningCount++
    getDB().prepare("UPDATE download_tasks SET status = 'downloading' WHERE id = ?").run(task.id)
    broadcast('download:status', { id: task.id, status: 'downloading', quality: task.quality })

    downloadTask(task, settings).finally(() => {
      runningCount--
      activeDownloads.delete(task.id)
      processQueue()
    })
  }
}

async function resolveDownloadUrl(source, quality, musicInfo) {
  const urlResult = await requestSource(source, 'musicUrl', {
    type: quality,
    quality,
    musicInfo,
  })
  const url = typeof urlResult === 'string' ? urlResult : urlResult?.url
  if (!url) throw new Error(`获取 ${qualityLabel(quality)} 音质下载链接失败，请尝试其他音质`)
  return url
}

async function streamToFile(url, filePath, taskId, abort) {
  const { default: needlePkg } = await import('needle')
  const stream = needlePkg.get(url, {
    follow_max: 5,
    signal: abort.signal,
    response_timeout: 60000,
    read_timeout: 120000,
  })
  const writer = fs.createWriteStream(filePath)
  let downloaded = 0
  let total = 0

  stream.on('header', (code, headers) => {
    if (code && code >= 400) {
      stream.emit('err', new Error(`下载响应异常 HTTP ${code}`))
      return
    }
    total = parseInt(headers['content-length']) || 0
    getDB().prepare('UPDATE download_tasks SET total_size = ? WHERE id = ?').run(total, taskId)
  })

  await new Promise((resolve, reject) => {
    stream.on('data', (chunk) => {
      downloaded += chunk.length
      writer.write(chunk)
      const progress = total > 0 ? downloaded / total : 0
      getDB().prepare('UPDATE download_tasks SET downloaded_size = ?, progress = ? WHERE id = ?')
        .run(downloaded, progress, taskId)
      broadcast('download:progress', { id: taskId, progress, downloaded, total })
    })
    stream.on('done', (err) => {
      writer.end()
      if (err) reject(err)
      else resolve()
    })
    stream.on('err', (err) => {
      try { writer.destroy() } catch {}
      reject(err)
    })
  })
}

function markAwaitConfirm(task, meta, fromQuality, toQuality, reason) {
  const friendlyReason = formatUserError(reason, '音源取链失败，请稍后重试')
  meta.downgradeOffer = {
    fromQuality,
    toQuality,
    fromLabel: qualityLabel(fromQuality),
    toLabel: qualityLabel(toQuality),
    reason: friendlyReason,
    reasonRaw: String(reason || '').slice(0, 300),
    at: new Date().toISOString(),
  }
  const tip = `${qualityLabel(fromQuality)} 多次失败（${friendlyReason}），可改用 ${qualityLabel(toQuality)}`
  getDB().prepare(`
    UPDATE download_tasks SET status = 'await_confirm', error = ?, meta = ?, progress = 0 WHERE id = ?
  `).run(tip, JSON.stringify(meta), task.id)
  broadcast('download:status', {
    id: task.id,
    status: 'await_confirm',
    error: tip,
    quality: fromQuality,
    name: task.name,
    singer: task.singer,
    downgradeOffer: meta.downgradeOffer,
  })
}

function markError(taskId, message, meta) {
  const friendly = formatUserError(message, '下载失败，请稍后重试')
  if (meta) saveTaskMeta(taskId, meta)
  getDB().prepare("UPDATE download_tasks SET status = 'error', error = ? WHERE id = ?").run(friendly, taskId)
  broadcast('download:status', { id: taskId, status: 'error', error: friendly, downgradeOffer: null })
}

async function downloadTask(task, settings) {
  const abort = new AbortController()
  activeDownloads.set(task.id, { abort })

  const meta = parseTaskMeta(task)
  const source = meta.source || task.source
  const quality = task.quality || '320k'
  const musicInfo = buildMusicInfoFromTask(task, meta)
  let lastError = null

  try {
    for (let attempt = 1; attempt <= SAME_QUALITY_ATTEMPTS; attempt++) {
      // 任务可能已被暂停
      const latest = getDB().prepare('SELECT status FROM download_tasks WHERE id = ?').get(task.id)
      if (!latest || latest.status === 'paused') return

      try {
        if (attempt > 1) {
          broadcast('download:status', {
            id: task.id,
            status: 'downloading',
            quality,
            retryAttempt: attempt,
            retryTotal: SAME_QUALITY_ATTEMPTS,
          })
          await sleep(RETRY_DELAY_MS * (attempt - 1))
        }

        const url = await resolveDownloadUrl(source, quality, musicInfo)
        const ext = guessExt(url, quality)
        const fileName = buildFileName(settings['download.fileName'] || '{name} - {singer}', task, ext)
        const savePath = getDownloadSavePath()
        const groupDir = settings['download.isSavePathGroupByListName'] === 'true' && task.album
          ? path.join(savePath, sanitize(task.album))
          : savePath
        fs.mkdirSync(groupDir, { recursive: true })
        const filePath = path.join(groupDir, fileName)

        if (settings['download.skipExistFile'] === 'true' && fs.existsSync(filePath)) {
          getDB().prepare("UPDATE download_tasks SET status = 'completed', file_path = ?, progress = 1 WHERE id = ?")
            .run(filePath, task.id)
          broadcast('download:status', { id: task.id, status: 'completed', progress: 1, quality })
          await writeMetaIfNeeded(task, meta, filePath, ext, settings)
          return
        }

        // 重试前清掉半截文件
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch {}

        await streamToFile(url, filePath, task.id, abort)

        getDB().prepare("UPDATE download_tasks SET status = 'completed', file_path = ?, progress = 1, error = NULL WHERE id = ?")
          .run(filePath, task.id)
        broadcast('download:status', { id: task.id, status: 'completed', progress: 1, filePath, quality })
        await writeMetaIfNeeded(task, meta, filePath, ext, settings)
        return
      } catch (e) {
        if (e.name === 'AbortError') return
        lastError = e
        const retryable = isRetryableDownloadError(e)
        console.warn(`[下载] ${task.name} ${quality} 第 ${attempt}/${SAME_QUALITY_ATTEMPTS} 次失败: ${e.message}`)
        if (!retryable || attempt >= SAME_QUALITY_ATTEMPTS) break
      }
    }

    const reason = lastError?.message || '下载失败'
    const available = [
      ...(Array.isArray(meta.qualitys) ? meta.qualitys : []),
      ...(Array.isArray(meta.types) ? meta.types.map(t => t?.type || t).filter(Boolean) : []),
    ]
    const nextQuality = getNextLowerQuality(quality, available)
    if (nextQuality) {
      markAwaitConfirm(task, meta, quality, nextQuality, reason)
      return
    }
    markError(task.id, reason, meta)
  } catch (e) {
    if (e.name === 'AbortError') return
    markError(task.id, e.message || '下载失败', meta)
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
      picBuf = await fetchTrackCover({
        source,
        musicInfo,
        meta,
        task,
        asBuffer: true,
        useOtherSource: true,
      })
    } catch (e) {
      console.warn('获取封面失败:', task.name, e.message)
    }
  }

  let lrcResult = null
  if (wantEmbedLyric || wantLrcFile) {
    try {
      lrcResult = await fetchTrackLyric({
        source,
        songId: meta.songmid || meta.hash || meta.songId || meta.copyrightId
          || musicInfo.songmid || musicInfo.hash || musicInfo.songId,
        musicInfo,
        meta,
        task,
        settings,
        useOtherSource: true,
      })
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
