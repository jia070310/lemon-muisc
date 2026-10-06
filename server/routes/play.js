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
import { isAllowedMediaPath, mapToContainerPath } from '../utils/filePaths.js'
import { formatUserError } from '../utils/userError.js'
import { logRuntime } from '../utils/runtimeLog.js'
import { buildPlayUrlCacheKey, getCachedPlayUrl, getOrFetchPlayUrl, clearCachedPlayUrl } from '../utils/playUrlCache.js'
import { createLimiter, withTimeout } from '../utils/asyncLimit.js'
import { getDB } from '../db.js'
import { buildSourceFallbackOffer, buildSourceInfoPayload, getSourceFallbackMode } from '../utils/sourceFallback.js'
import { extractMusicUrl } from '../utils/sourceResult.js'
import { appendStreamToken } from '../utils/streamAuth.js'
import { createStreamTicket, ticketClaimsFromStreamUrl } from '../utils/streamTicket.js'
import { resolvePathByTrackId } from '../utils/libraryCache.js'
import { ensureApePlayWav } from '../utils/apePlay.js'
import { buildMusicCdnHeaders } from '../utils/musicCdnHeaders.js'
import { ensureSmoothPlayAac, canSmoothOrRepairTranscode, warmSmoothPlayAac } from '../utils/smoothPlay.js'
import { isPlatformEnabled } from '../utils/enabledPlatforms.js'
import { AVAILABLE_SOURCES } from '../musicSdk.js'

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

function logPlayError(route, req, err, extra = {}) {
  logRuntime('error', `play:${route}`, err?.message || err, {
    status: extra.status || '',
    trackId: String(req.query?.trackId || req.body?.trackId || '').slice(0, 80),
    ext: extra.ext || path.extname(String(extra.filePath || '')).toLowerCase(),
    exists: extra.exists,
    size: extra.size,
    filePath: extra.filePath || '',
  })
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
  '.ape': 'audio/ape',
  '.webm': 'audio/webm',
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
  return appendStreamToken(url, {
    sessionToken: req.authToken,
    userId: req.user?.id,
    role: req.user?.role,
  })
}

function wrapPlayUrl(url, source) {
  if (!url || url.startsWith('/api/play/') || url.startsWith('/api/v1/play/')) return url
  if (!/^https?:\/\//i.test(url)) return url
  return `/api/play/proxy?url=${encodeURIComponent(url)}&source=${encodeURIComponent(source || '')}`
}

const LIBRARY_TRACK_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * 仅解析音乐库稳定 trackId。
 * 在线曲目也有平台 id（酷狗 hash 数字、网易 songId 等），绝不能当成库 trackId，
 * 否则 /play/url 会误返回 TRACK_NOT_FOUND，导致所有在线音源无法播放。
 */
function pickLibraryTrackId(body = {}) {
  const explicit = String(body.trackId || '').trim()
  if (explicit) return explicit
  const id = String(body.id || '').trim()
  if (!id || !LIBRARY_TRACK_ID_RE.test(id)) return ''
  // 带在线身份字段时，id 属于平台曲目
  if (body.songId || body.songmid || body.hash || body.copyrightId || body.musicId || body.strMediaMid) {
    return ''
  }
  const src = String(body.source || '').trim()
  if (src && src !== 'local') return ''
  return id
}

function resolveLocalFilePath(body = {}) {
  const trackId = pickLibraryTrackId(body)
  if (trackId) {
    const byId = resolvePathByTrackId(trackId)
    if (byId) return byId
  }
  const direct = body.localPath || body.filePath
  if (direct) return String(direct)
  const key = body.key || ''
  if (String(key).startsWith('local:')) return String(key).slice(6)
  return ''
}

/** 续签短时效媒体票（也可对任意流式相对 URL 签票） */
playRouter.post('/ticket', (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: '未登录', code: 'UNAUTHORIZED' })
    }
    let streamUrl = String(req.body?.url || '').trim()
    const libraryTrackId = pickLibraryTrackId(req.body || {})
    const localFilePath = resolveLocalFilePath(req.body || {})
    if (!streamUrl && (libraryTrackId || localFilePath)) {
      if (localFilePath && !isAllowedMediaPath(localFilePath, { userId: req.user.id })) {
        return res.status(400).json({ error: '本地文件不可用或不在允许目录内' })
      }
      const qs = libraryTrackId && LIBRARY_TRACK_ID_RE.test(libraryTrackId)
        ? `trackId=${encodeURIComponent(libraryTrackId)}`
        : `path=${encodeURIComponent(path.resolve(mapToContainerPath(localFilePath) || localFilePath))}`
      streamUrl = `/api/play/local?${qs}`
    }
    if (!streamUrl) {
      return res.status(400).json({ error: '请提供 url 或 trackId/localPath' })
    }
    if (!streamUrl.startsWith('/api/play/') && !streamUrl.startsWith('/api/v1/play/') && !streamUrl.startsWith('/api/tag/cover')) {
      return res.status(400).json({ error: '仅支持本站流式路径' })
    }
    const claims = ticketClaimsFromStreamUrl(streamUrl)
    const ttlSec = Number(req.body?.ttlSec) || undefined
    const ticket = createStreamTicket({
      userId: req.user.id,
      role: req.user.role,
      path: claims.path,
      scope: claims.scope,
      ttlSec,
    })
    const url = appendStreamToken(streamUrl, {
      userId: req.user.id,
      role: req.user.role,
      ttlSec,
    })
    res.json({
      ok: true,
      ticket,
      url,
      expiresIn: Math.max(60, Number(ttlSec) || 2 * 60 * 60),
    })
  } catch (e) {
    res.status(500).json({ error: e.message || '签发失败' })
  }
})

playRouter.post('/url', async (req, res) => {
  try {
    const { songId, source, quality, sourceApiId, skipSourceIds, refresh } = req.body
    const libraryTrackId = pickLibraryTrackId(req.body)
    const localFilePath = resolveLocalFilePath(req.body)
    // 仅显式音乐库 trackId 找不到时 404；在线曲目的平台 id 不得走此分支
    if (libraryTrackId && !localFilePath) {
      return res.status(404).json({ error: '未找到对应曲目', code: 'TRACK_NOT_FOUND' })
    }

    // 本地文件：返回可流式播放的同源 URL（APE 走转码缓存端点）
    if (localFilePath) {
      if (!isAllowedMediaPath(localFilePath, { userId: req.user?.id })) {
        return res.status(400).json({ error: '本地文件不可用或不在允许目录内，请在设置中检查音乐库/下载路径' })
      }
      const mapped = mapToContainerPath(localFilePath) || localFilePath
      const resolvedLocal = fs.existsSync(path.resolve(mapped))
        ? path.resolve(mapped)
        : path.resolve(localFilePath)
      const localExt = path.extname(resolvedLocal).toLowerCase()
      const wantSmooth = Boolean(req.body?.smooth)
        && canSmoothOrRepairTranscode(resolvedLocal)
        && localExt !== '.ape'
      // 有稳定 trackId 时用短地址，避免中文长路径被网关截断
      const tid = String(libraryTrackId || '').trim()
      const qs = tid && LIBRARY_TRACK_ID_RE.test(tid)
        ? `trackId=${encodeURIComponent(tid)}`
        : `path=${encodeURIComponent(resolvedLocal)}`
      const playPath = localExt === '.ape'
        ? `/api/play/local-ape?${qs}`
        : wantSmooth
          ? `/api/play/local-smooth?${qs}`
          : `/api/play/local?${qs}`
      const url = signPlayStreamUrl(playPath, req)
      return res.json({
        ok: true,
        url,
        local: true,
        smooth: wantSmooth || localExt === '.ape',
        format: localExt.slice(1) || undefined,
      })
    }

    if (source === 'local') {
      return res.status(400).json({ error: '缺少本地文件路径' })
    }

    if (!songId || !source) return res.status(400).json({ error: '缺少歌曲信息' })

    if (!isPlatformEnabled(req.user?.id, source)) {
      const name = AVAILABLE_SOURCES[source]?.name || source
      return res.status(400).json({ error: `平台「${name}」已关闭，请在设置 → 音源管理中开启` })
    }

    if (!hasActiveSource(getStoredActiveSourceIds(req.user?.id))) {
      return res.status(400).json({ error: '没有激活的音源，请先在设置中激活音源' })
    }

    const type = quality || req.body.quality || '128k'
    const musicInfo = buildMusicInfo({ ...req.body, source, quality: type })
    const cacheKey = buildPlayUrlCacheKey(source, musicInfo.songId, type)
    const bypassCache = Boolean(refresh)
      || Boolean(sourceApiId)
      || (Array.isArray(skipSourceIds) && skipSourceIds.length > 0)
    if (refresh) clearCachedPlayUrl(cacheKey)
    const cached = bypassCache ? null : getCachedPlayUrl(cacheKey)
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
          userId: req.user?.id,
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
  // 大文件串流期间禁止空闲超时（经 Vite 代理时尤其容易被掐断）
  try { req.setTimeout?.(0) } catch {}
  try { res.setTimeout?.(0) } catch {}
  const origin = req.headers.origin
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges')
}

function readQueryFilePath(req) {
  let filePath = req.query?.path
  if (Array.isArray(filePath)) filePath = filePath[0]
  if (!filePath || typeof filePath !== 'string') return ''
  // Express 通常已解码；仅当仍含百分号编码时再解一次，避免把文件名里的 + 改成空格
  if (/%[0-9A-Fa-f]{2}/.test(filePath)) {
    try {
      filePath = decodeURIComponent(filePath.replace(/\+/g, '%20'))
    } catch {}
  }
  return filePath
}

function resolveStreamLocalFile(req) {
  const trackId = String(req.query?.trackId || '').trim()
  if (trackId && LIBRARY_TRACK_ID_RE.test(trackId)) {
    const byId = resolvePathByTrackId(trackId)
    if (byId) return byId
  }
  const fromQuery = readQueryFilePath(req)
  if (fromQuery) return fromQuery
  const fromTicket = req.streamTicket?.path
  if (fromTicket) return String(fromTicket)
  return ''
}

function applyRangeOrFull(res, req, filePath, mime) {
  const stat = fs.statSync(filePath)
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
    let end = m[2] ? parseInt(m[2], 10) : total - 1
    if (Number.isNaN(start) || Number.isNaN(end)) return res.status(416).end()
    end = Math.min(end, total - 1)
    if (start >= total || start > end || end < 0) {
      res.setHeader('Content-Range', `bytes */${total}`)
      return res.status(416).end()
    }
    res.status(206)
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`)
    res.setHeader('Content-Length', end - start + 1)
    pipeLocalFile(res, filePath, { start, end })
    return
  }

  res.setHeader('Content-Length', total)
  pipeLocalFile(res, filePath)
}

function pipeLocalFile(res, filePath, { start = 0, end } = {}) {
  const options = end != null ? { start, end } : undefined
  const stream = fs.createReadStream(filePath, options)
  stream.on('error', (err) => {
    logPlayError('local-stream', { query: {}, body: {} }, err, { filePath })
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
    const filePath = resolveStreamLocalFile(req)
    if (!filePath) {
      logPlayError('local', req, '缺少文件路径', { status: 400 })
      return res.status(400).json({ error: '缺少文件路径' })
    }
    if (!isAllowedMediaPath(filePath, { userId: req.user?.id })) {
      logPlayError('local', req, '无权访问该文件', { status: 403, filePath })
      return res.status(403).json({ error: '无权访问该文件' })
    }

    const resolved = path.resolve(mapToContainerPath(filePath) || filePath)
    const exists = fs.existsSync(resolved) ? resolved : path.resolve(filePath)
    const ext = path.extname(exists).toLowerCase()
    if (ext === '.ape') {
      logPlayError('local', req, 'APE 需转码后播放', { status: 415, filePath: exists, ext })
      return res.status(415).json({
        error: 'APE 需转码后播放，请使用 /api/play/local-ape 或重新获取播放链接',
      })
    }
    if (!fs.existsSync(exists)) {
      logPlayError('local', req, '本地文件不存在', { status: 404, filePath: exists, ext, exists: false })
      return res.status(404).json({ error: '本地文件不存在' })
    }

    const mime = AUDIO_MIME[ext] || 'application/octet-stream'
    applyRangeOrFull(res, req, exists, mime)
  } catch (e) {
    logPlayError('local', req, e, { status: 500 })
    if (!res.headersSent) {
      res.status(500).json({ error: formatUserError(e, '读取本地文件失败') })
    }
  }
})

/** APE：ffmpeg 转成 WAV 缓存后再按本地文件流式输出（支持 Range） */
playRouter.get('/local-ape', async (req, res) => {
  try {
    const filePath = resolveStreamLocalFile(req)
    if (!filePath) {
      return res.status(400).json({ error: '缺少文件路径' })
    }
    if (!isAllowedMediaPath(filePath, { userId: req.user?.id })) {
      return res.status(403).json({ error: '无权访问该文件' })
    }

    const resolved = path.resolve(mapToContainerPath(filePath) || filePath)
    const exists = fs.existsSync(resolved) ? resolved : path.resolve(filePath)
    if (path.extname(exists).toLowerCase() !== '.ape') {
      return res.status(400).json({ error: '仅支持 APE 文件' })
    }

    const wavPath = await ensureApePlayWav(exists)
    applyRangeOrFull(res, req, wavPath, 'audio/wav')
  } catch (e) {
    logPlayError('local-ape', req, e, { status: 500 })
    if (!res.headersSent) {
      const status = /ffmpeg|无法直接播放 APE/i.test(String(e?.message || '')) ? 415 : 500
      res.status(status).json({ error: formatUserError(e, 'APE 播放失败') })
    }
  }
})

/**
 * 车机 / 弱网：本地高码率 → AAC 缓存后流式输出（支持 Range）。
 * 无线 CarPlay 与 NAS 同 WiFi 时，直出 FLAC 易欠载卡顿。
 */
playRouter.get('/local-smooth', async (req, res) => {
  try {
    const filePath = resolveStreamLocalFile(req)
    if (!filePath) {
      return res.status(400).json({ error: '缺少文件路径' })
    }
    if (!isAllowedMediaPath(filePath, { userId: req.user?.id })) {
      return res.status(403).json({ error: '无权访问该文件' })
    }

    const resolved = path.resolve(mapToContainerPath(filePath) || filePath)
    const exists = fs.existsSync(resolved) ? resolved : path.resolve(filePath)
    if (!canSmoothOrRepairTranscode(exists)) {
      return res.status(400).json({ error: '该格式无需流畅转码，请使用 /api/play/local' })
    }

    const aacPath = await ensureSmoothPlayAac(exists)
    applyRangeOrFull(res, req, aacPath, 'audio/mp4')
  } catch (e) {
    logPlayError('local-smooth', req, e, { status: 500 })
    if (!res.headersSent) {
      const status = /ffmpeg|转码/i.test(String(e?.message || '')) ? 415 : 500
      res.status(status).json({ error: formatUserError(e, '流畅播放转码失败') })
    }
  }
})

/** 预热下一首 AAC 缓存，减轻连播首卡 */
playRouter.post('/smooth-warmup', async (req, res) => {
  try {
    const filePath = String(req.body?.path || req.body?.filePath || req.body?.localPath || '').trim()
    if (!filePath) return res.status(400).json({ error: '缺少文件路径' })
    if (!isAllowedMediaPath(filePath, { userId: req.user?.id })) {
      return res.status(403).json({ error: '无权访问该文件' })
    }
    const result = await warmSmoothPlayAac(filePath)
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ error: formatUserError(e, '流畅播放预热失败') })
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

  const headers = buildMusicCdnHeaders(source, req.headers.range ? { Range: req.headers.range } : {})

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
    const clientLyric = typeof req.body?.lyric === 'string' ? req.body.lyric : ''
    const clientYlyric = typeof req.body?.ylyric === 'string' ? req.body.ylyric : ''
    const source = req.body.source
    const songId = req.body.songId || req.body.songmid || req.body.hash || req.body.copyrightId || req.body.musicId
    const musicInfo = buildMusicInfo(req.body)
    const lookupSource = source === 'local' ? '' : (source || '')
    const canLookup = Boolean(songId || musicInfo.name)

    // 仅本地嵌入/无法在线检索时，直接回传客户端歌词；勿因已有逐行 LRC 跳过拉取（否则永远拿不到 YRC）
    if (clientLyric && !canLookup) {
      return res.json({ ok: true, lyric: clientLyric, tlyric: '', rlyric: '', ylyric: clientYlyric })
    }
    if (!canLookup) {
      return res.json({ ok: true, lyric: '', tlyric: '', rlyric: '', ylyric: '' })
    }

    const result = await playMetaLimiter(() => withTimeout(
      fetchTrackLyric({
        source: lookupSource,
        songId,
        musicInfo: { ...musicInfo, source: lookupSource || musicInfo.source },
        meta: { ...req.body, source: lookupSource },
        useOtherSource: true,
        preferWords: Boolean(req.body?.preferWords),
        userId: req.user?.id,
      }),
      PLAY_META_TIMEOUT_MS,
      '获取歌词超时，请稍后重试',
    ))

    if (result?.lyric || result?.ylyric) {
      return res.json({ ok: true, ...result })
    }
    if (clientLyric) {
      return res.json({ ok: true, lyric: clientLyric, tlyric: '', rlyric: '', ylyric: clientYlyric })
    }
    res.json({ ok: true, lyric: '', tlyric: '', rlyric: '', ylyric: '' })
  } catch {
    res.json({ ok: true, lyric: '', tlyric: '', rlyric: '', ylyric: '' })
  }
})

playRouter.post('/cover', async (req, res) => {
  try {
    const { source, coverFallback } = req.body
    const rawInfo = buildMusicInfo(req.body)
    const musicInfo = coverFallback
      ? { ...rawInfo, picUrl: '', img: '', cover: '', coverFallback: true }
      : rawInfo
    const lookupSource = source === 'local' ? '' : (source || '')
    if (lookupSource) {
      const direct = resolveCoverUrl({ ...musicInfo, source: lookupSource })
      if (direct) return res.json({ ok: true, url: direct })
    }

    const url = await playMetaLimiter(() => withTimeout(
      fetchTrackCover({
        source: lookupSource,
        musicInfo: { ...musicInfo, source: lookupSource || musicInfo.source },
        meta: { ...musicInfo, source: lookupSource },
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
