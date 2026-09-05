import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import needle from 'needle'
import { requestSourceWithMeta, hasActiveSource } from '../sourceManager.js'
import { getStoredActiveSourceIds } from '../utils/activeSources.js'
import { buildMusicInfo } from '../utils/musicInfo.js'
import { fetchTrackLyric, fetchTrackCover } from '../utils/trackMeta.js'
import { resolveCoverUrl } from '../utils/cover.js'
import { detectImageMime, fetchPicBuffer } from '../utils/fetchPic.js'
import { isAllowedMediaPath } from '../utils/filePaths.js'
import { formatUserError } from '../utils/userError.js'
import { buildPlayUrlCacheKey, getCachedPlayUrl, getOrFetchPlayUrl } from '../utils/playUrlCache.js'
import { createLimiter, withTimeout } from '../utils/asyncLimit.js'
import { getDB } from '../db.js'
import { buildSourceFallbackOffer, buildSourceInfoPayload, getSourceFallbackMode } from '../utils/sourceFallback.js'
import { extractMusicUrl } from '../utils/sourceResult.js'
import { appendStreamToken } from '../utils/streamAuth.js'

export const playRouter = Router()

const playUrlLimiter = createLimiter(8)
const playMetaLimiter = createLimiter(6)
const PLAY_URL_TIMEOUT_MS = 25000
const PLAY_META_TIMEOUT_MS = 20000

function readSettings() {
  const rows = getDB().prepare('SELECT key, value FROM settings').all()
  const settings = {}
  for (const row of rows) settings[row.key] = row.value
  return settings
}

function formatPlayError(err) {
  return formatUserError(err, '无法获取播放链接，请尝试其他歌曲')
}

const AUDIO_MIME = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
}

const SOURCE_HEADERS = {
  tx: { Referer: 'https://y.qq.com/', Origin: 'https://y.qq.com' },
  kw: { Referer: 'https://www.kuwo.cn/' },
  kg: { Referer: 'https://www.kugou.com/' },
  wy: { Referer: 'https://music.163.com/' },
  mg: { Referer: 'https://music.migu.cn/' },
}

function isAllowedRemoteUrl(raw) {
  try {
    const u = new URL(raw)
    if (!['http:', 'https:'].includes(u.protocol)) return false
    const host = u.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local')) return false
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false
    return true
  } catch {
    return false
  }
}

function guessMimeFromUrl(url) {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase()
    return AUDIO_MIME[ext] || 'audio/mpeg'
  } catch {
    return 'audio/mpeg'
  }
}

function signPlayStreamUrl(url, req) {
  return appendStreamToken(url, req.authToken)
}

function wrapPlayUrl(url, source) {
  if (!url || url.startsWith('/api/play/')) return url
  if (!/^https?:\/\//i.test(url)) return url
  return `/api/play/proxy?url=${encodeURIComponent(url)}&source=${encodeURIComponent(source || '')}`
}

function resolveLocalFilePath(body = {}) {
  const direct = body.localPath || body.filePath
  if (direct) return String(direct)
  const key = body.key || ''
  if (String(key).startsWith('local:')) return String(key).slice(6)
  return ''
}

playRouter.post('/url', async (req, res) => {
  try {
    const { songId, source, quality, sourceApiId, skipSourceIds } = req.body
    const localFilePath = resolveLocalFilePath(req.body)

    // 本地文件：返回可流式播放的同源 URL
    if (localFilePath) {
      if (!isAllowedMediaPath(localFilePath)) {
        return res.status(400).json({ error: '本地文件不可用或不在允许目录内，请在设置中检查音乐库/下载路径' })
      }
      const url = signPlayStreamUrl(
        `/api/play/local?path=${encodeURIComponent(path.resolve(localFilePath))}`,
        req,
      )
      return res.json({ ok: true, url, local: true })
    }

    if (source === 'local') {
      return res.status(400).json({ error: '缺少本地文件路径' })
    }

    if (!songId || !source) return res.status(400).json({ error: '缺少歌曲信息' })

    if (!hasActiveSource(getStoredActiveSourceIds(req.user?.id))) {
      return res.status(400).json({ error: '没有激活的音源，请先在设置中激活音源' })
    }

    const type = quality || req.body.quality || '128k'
    const musicInfo = buildMusicInfo({ ...req.body, source, quality: type })
    const cacheKey = buildPlayUrlCacheKey(source, musicInfo.songId, type)
    const cached = getCachedPlayUrl(cacheKey)
    if (cached) {
      return res.json({ ok: true, url: signPlayStreamUrl(cached, req), cached: true })
    }

    let wrappedSourceInfo = null
    const allowedSourceIds = getStoredActiveSourceIds(req.user?.id)
    const wrapped = await playUrlLimiter(() => getOrFetchPlayUrl(cacheKey, async () => {
      const result = await withTimeout(
        requestSourceWithMeta(source, 'musicUrl', {
          type,
          quality: type,
          musicInfo,
        }, {
          fallbackMode: getSourceFallbackMode(readSettings()),
          preferredSourceId: sourceApiId || undefined,
          skipSourceIds: skipSourceIds || [],
          allowedSourceIds,
        }),
        PLAY_URL_TIMEOUT_MS,
        '获取播放链接超时，请稍后重试',
      )
      const url = extractMusicUrl(result.data)
      if (!url) throw new Error('获取播放链接失败')
      wrappedSourceInfo = buildSourceInfoPayload(result)
      return wrapPlayUrl(url, source)
    }))

    res.json({
      ok: true,
      url: signPlayStreamUrl(wrapped, req),
      ...(wrappedSourceInfo ? { sourceInfo: wrappedSourceInfo } : {}),
    })
  } catch (e) {
    const offer = buildSourceFallbackOffer(e)
    if (offer) {
      return res.status(409).json({
        error: e.message,
        code: 'SOURCE_FALLBACK_REQUIRED',
        sourceFallbackOffer: offer,
      })
    }
    res.status(500).json({ error: formatPlayError(e) })
  }
})

function setLocalStreamHeaders(res, req) {
  const origin = req.headers.origin
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges')
}

function pipeLocalFile(res, filePath, { start = 0, end } = {}) {
  const options = end != null ? { start, end } : undefined
  const stream = fs.createReadStream(filePath, options)
  stream.on('error', (err) => {
    if (!res.headersSent) {
      res.status(500).json({ error: formatUserError(err, '读取本地文件失败') })
      return
    }
    try { res.destroy() } catch {}
  })
  res.on('close', () => {
    if (!stream.destroyed) stream.destroy()
  })
  stream.pipe(res)
}

playRouter.get('/local', (req, res) => {
  try {
    let filePath = req.query.path
    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ error: '缺少文件路径' })
    }
    try {
      filePath = decodeURIComponent(filePath)
    } catch {
      filePath = String(filePath)
    }
    if (!isAllowedMediaPath(filePath)) {
      return res.status(403).json({ error: '无权访问该文件' })
    }

    const resolved = path.resolve(filePath)
    const stat = fs.statSync(resolved)
    const ext = path.extname(resolved).toLowerCase()
    const mime = AUDIO_MIME[ext] || 'application/octet-stream'
    const total = stat.size
    const range = req.headers.range

    setLocalStreamHeaders(res, req)
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Type', mime)
    res.setHeader('Cache-Control', 'private, max-age=3600')

    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!m) return res.status(416).end()
      const start = m[1] ? parseInt(m[1], 10) : 0
      const end = m[2] ? parseInt(m[2], 10) : total - 1
      if (start >= total || end >= total || start > end) {
        res.setHeader('Content-Range', `bytes */${total}`)
        return res.status(416).end()
      }
      res.status(206)
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`)
      res.setHeader('Content-Length', end - start + 1)
      pipeLocalFile(res, resolved, { start, end })
      return
    }

    res.setHeader('Content-Length', total)
    pipeLocalFile(res, resolved)
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({ error: formatUserError(e, '读取本地文件失败') })
    }
  }
})

const MAX_PLAY_PROXIES = 8
let activePlayProxies = 0

playRouter.get('/proxy', (req, res) => {
  if (activePlayProxies >= MAX_PLAY_PROXIES) {
    return res.status(503).json({ error: '播放服务繁忙，请稍后重试' })
  }

  const url = req.query.url
  const source = typeof req.query.source === 'string' ? req.query.source : ''
  if (!url || typeof url !== 'string' || !isAllowedRemoteUrl(url)) {
    return res.status(400).json({ error: '无效播放链接' })
  }

  activePlayProxies++
  let released = false
  const releaseProxy = () => {
    if (released) return
    released = true
    activePlayProxies = Math.max(0, activePlayProxies - 1)
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ...(SOURCE_HEADERS[source] || {}),
  }
  if (req.headers.range) headers.Range = req.headers.range

  const upstream = needle.get(url, { follow_max: 5, headers, parse_response: false })
  let aborted = false
  const abortUpstream = () => {
    if (aborted) return
    aborted = true
    try { upstream.request?.abort?.() } catch {}
    releaseProxy()
  }

  req.on('close', abortUpstream)
  res.on('close', abortUpstream)

  upstream.on('header', (statusCode, respHeaders) => {
    if (aborted) return
    if (statusCode >= 400) {
      if (!res.headersSent) res.status(statusCode).json({ error: '远程音频不可用' })
      abortUpstream()
      return
    }
    const mime = respHeaders['content-type']?.split(';')[0]?.trim() || guessMimeFromUrl(url)
    res.setHeader('Content-Type', mime)
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'private, no-cache')
    if (respHeaders['content-length']) res.setHeader('Content-Length', respHeaders['content-length'])
    if (statusCode === 206 && respHeaders['content-range']) {
      res.status(206)
      res.setHeader('Content-Range', respHeaders['content-range'])
    }
  })

  upstream.on('err', (err) => {
    if (!res.headersSent && !aborted) res.status(502).json({ error: formatUserError(err, '音频流传输失败') })
    abortUpstream()
  })

  upstream.pipe(res)
})

playRouter.post('/lyric', async (req, res) => {
  try {
    const { lyric } = req.body
    const source = req.body.source
    const songId = req.body.songId || req.body.songmid || req.body.hash || req.body.copyrightId || req.body.musicId
    if (typeof lyric === 'string' && lyric) {
      return res.json({ ok: true, lyric, tlyric: '', rlyric: '' })
    }
    const musicInfo = buildMusicInfo(req.body)
    const lookupSource = source === 'local' ? '' : (source || '')
    if (!songId && !musicInfo.name) {
      return res.json({ ok: true, lyric: '', tlyric: '', rlyric: '' })
    }

    const result = await playMetaLimiter(() => withTimeout(
      fetchTrackLyric({
        source: lookupSource,
        songId,
        musicInfo: { ...musicInfo, source: lookupSource || musicInfo.source },
        meta: { ...req.body, source: lookupSource },
        useOtherSource: true,
        userId: req.user?.id,
      }),
      PLAY_META_TIMEOUT_MS,
      '获取歌词超时，请稍后重试',
    ))

    if (result?.lyric) {
      return res.json({ ok: true, ...result })
    }
    res.json({ ok: true, lyric: '', tlyric: '', rlyric: '' })
  } catch {
    res.json({ ok: true, lyric: '', tlyric: '', rlyric: '' })
  }
})

playRouter.post('/cover', async (req, res) => {
  try {
    const { source } = req.body
    const musicInfo = buildMusicInfo(req.body)
    const lookupSource = source === 'local' ? '' : (source || '')
    if (lookupSource) {
      const direct = resolveCoverUrl({ ...musicInfo, source: lookupSource })
      if (direct) return res.json({ ok: true, url: direct })
    }

    const url = await playMetaLimiter(() => withTimeout(
      fetchTrackCover({
        source: lookupSource,
        musicInfo: { ...musicInfo, source: lookupSource || musicInfo.source },
        meta: { ...req.body, source: lookupSource },
        asBuffer: false,
        useOtherSource: true,
        userId: req.user?.id,
      }),
      PLAY_META_TIMEOUT_MS,
      '获取封面超时，请稍后重试',
    ))
    res.json({ ok: true, url: url || '' })
  } catch {
    res.json({ ok: true, url: '' })
  }
})

playRouter.get('/cover-img', async (req, res) => {
  const url = req.query.url
  if (!url || typeof url !== 'string' || !isAllowedRemoteUrl(url)) {
    return res.status(400).json({ error: '无效封面链接' })
  }
  try {
    const buf = await playMetaLimiter(() => withTimeout(
      fetchPicBuffer(url),
      PLAY_META_TIMEOUT_MS,
      '获取封面超时，请稍后重试',
    ))
    if (!buf?.length) return res.status(404).json({ error: '封面不可用' })
    res.setHeader('Content-Type', detectImageMime(buf))
    res.setHeader('Cache-Control', 'private, max-age=86400')
    res.send(buf)
  } catch {
    if (!res.headersSent) res.status(502).json({ error: '封面加载失败' })
  }
})
