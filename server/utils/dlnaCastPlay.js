import fs from 'fs'
import path from 'path'
import { dlnaPlay, getAdvertisedBaseUrl, ensureDlnaDevice, isXiaomiDlnaDevice, getCachedDevice } from './dlna.js'
import { getEpisodeForUser } from './podcastStore.js'
import { createStreamTicket } from './streamTicket.js'
import { resolvePlayStreamRel } from '../routes/play.js'
import { ensureDlnaPlayMp3 } from './dlnaTranscode.js'
import { createDlnaCastSlot, prepareDlnaCastAudio, estimateMp3Bytes } from './dlnaCastMedia.js'
import { resolvePathByTrackId } from './libraryCache.js'
import { mapToContainerPath } from './filePaths.js'

export function captureDlnaHttpContext(req) {
  return {
    user: { id: req.user.id, role: req.user.role },
    headers: {
      host: req.headers?.host || '',
      'x-forwarded-proto': req.headers?.['x-forwarded-proto'] || '',
      'x-forwarded-host': req.headers?.['x-forwarded-host'] || '',
    },
    protocol: req.protocol || 'http',
  }
}

export function makeDlnaReq(ctx, body) {
  return {
    user: ctx.user,
    headers: ctx.headers || {},
    protocol: ctx.protocol || 'http',
    body: body || {},
  }
}

function toAbs(req, relUrl, { nearHost = '' } = {}) {
  let base = getAdvertisedBaseUrl(req, { nearHost })
  base = String(base || '').replace(/^https:/i, 'http:')
  if (!relUrl) return ''
  if (/^https?:\/\//i.test(relUrl)) return relUrl.replace(/^https:/i, 'http:')
  const pathPart = relUrl.startsWith('/') ? relUrl : `/${relUrl}`
  return `${base}${pathPart}`
}

function signCastRel(req, castId, kind = 'audio') {
  const ticket = createStreamTicket({
    userId: req.user.id,
    role: req.user.role,
    scope: 'cast',
    path: String(castId),
    ttlSec: 4 * 60 * 60,
  })
  const rel = kind === 'cover'
    ? `/api/play/cast/${castId}/cover.jpg`
    : `/api/play/cast/${castId}/audio.mp3`
  return `${rel}?ticket=${encodeURIComponent(ticket)}`
}

function pickCoverUrl(body = {}, req, nearHost = '') {
  const raw = String(
    body.picUrl || body.img || body.coverUrl || body.imageUrl || body.albumArt || '',
  ).trim()
  if (!raw || /^blob:/i.test(raw)) return ''
  if (/^data:image\//i.test(raw)) return raw
  if (/^https?:\/\//i.test(raw)) {
    // 本机试听封面代理地址电视未必能带 cookie；优先用其 url= 里的原始图
    try {
      const u = new URL(raw)
      if (/\/api\/(?:v1\/)?play\/cover-img$/i.test(u.pathname)) {
        const origin = u.searchParams.get('url')
        if (origin && /^https?:\/\//i.test(origin)) return origin
      }
    } catch {}
    return raw
  }
  if (raw.startsWith('/')) return toAbs(req, raw, { nearHost })
  return ''
}

function resolveLocalPathForCast(req) {
  const tid = String(req.body?.trackId || '').trim()
  let file = tid ? (resolvePathByTrackId(tid) || '') : ''
  if (!file) file = String(req.body?.localPath || req.body?.filePath || '')
  if (!file) return ''
  const resolved = path.resolve(mapToContainerPath(file) || file)
  const exists = fs.existsSync(resolved) ? resolved : path.resolve(file)
  return fs.existsSync(exists) ? exists : ''
}

function isLosslessQuality(q) {
  return /flac|hires|hi-res|hi_res|master|ape|wav|sq|999k|2000k/i.test(String(q || ''))
}

function remoteUrlFromPlayRel(rel) {
  try {
    return new URL(String(rel || ''), 'http://local.invalid').searchParams.get('url') || ''
  } catch {
    return ''
  }
}

function guessMimeFromPlayRel(rel) {
  const raw = String(rel || '')
  if (/\/play\/(?:dlna\.mp3|proxy\.mp3)\b/i.test(raw)) return 'audio/mpeg'
  const remote = remoteUrlFromPlayRel(raw)
  const probe = `${raw} ${remote}`.toLowerCase()
  if (/\.(m4a|aac|mp4)(\?|#|$)/i.test(probe) || /audio\/mp4|audio\/aac/.test(probe)) return 'audio/mp4'
  if (/\.flac(\?|#|$)/i.test(probe) || /audio\/flac/.test(probe)) return 'audio/flac'
  if (/\.wav(\?|#|$)/i.test(probe)) return 'audio/wav'
  if (/\.ogg(\?|#|$)/i.test(probe)) return 'audio/ogg'
  if (/\.mp3(\?|#|$)/i.test(probe)) return 'audio/mpeg'
  return 'audio/mpeg'
}

function toDlnaFriendlyRel(rel, extra = {}) {
  const raw = String(rel || '')
  if (!raw) return raw
  if (extra.local || /\/play\/(?:local(?:-smooth|-ape)?|dlna\.mp3)\b/i.test(raw)) {
    const q = raw.includes('?') ? raw.slice(raw.indexOf('?')) : ''
    if (/\/play\/dlna\.mp3\b/i.test(raw)) return raw
    return `/api/play/dlna.mp3${q}`
  }
  // 在线路：仅真实 MP3 才改成 proxy.mp3（小爱依赖扩展名）；
  // 播客 m4a / AAC 等保持原格式，避免假装 MP3 导致电视拒播
  if (/\/play\/proxy(?:\.mp3)?\?/i.test(raw)) {
    const remote = remoteUrlFromPlayRel(raw)
    const isMp3 = /\.mp3(\?|#|$)/i.test(remote)
    let next = raw
    if (isMp3 && raw.includes('/play/proxy?')) {
      next = raw.replace('/play/proxy?', '/play/proxy.mp3?')
    } else if (!isMp3 && raw.includes('/play/proxy.mp3?')) {
      next = raw.replace('/play/proxy.mp3?', '/play/proxy?')
    }
    if (!/[?&]dlna=1\b/i.test(next)) {
      next += next.includes('?') ? '&dlna=1' : '?dlna=1'
    }
    return next
  }
  return raw
}

/** 客户端已在播的本站流，投屏优先复用，避免再打一次不稳定的音源取链 */
function sanitizeClientStreamRel(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  try {
    const u = new URL(s, 'http://local.invalid')
    let pathname = u.pathname || ''
    if (pathname.startsWith('/api/v1/play/')) pathname = pathname.replace('/api/v1/', '/api/')
    if (!pathname.startsWith('/api/play/')) return ''
    // 拒绝跳转到外站
    if (u.hostname && u.hostname !== 'local.invalid') return ''
    u.searchParams.delete('token')
    u.searchParams.delete('ticket')
    const qs = []
    u.searchParams.forEach((value, key) => {
      qs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    })
    return `${pathname}${qs.length ? `?${qs.join('&')}` : ''}`
  } catch {
    return ''
  }
}

function isSourceConnError(err) {
  return /socket hang up|ECONNRESET|EPIPE|ECONNABORTED|ETIMEDOUT|ESOCKETTIMEDOUT|timeout|获取播放链接失败|获取播放链接超时/i
    .test(String(err?.message || err || ''))
}

async function resolveDlnaStreamRel(req) {
  const reused = sanitizeClientStreamRel(req.body?.streamRel || req.body?.playRel)
  if (reused) {
    return {
      rel: toDlnaFriendlyRel(reused, {
        local: /\/play\/(?:local|dlna)/i.test(reused),
      }),
      extra: { reused: true },
    }
  }

  const saved = req.body || {}
  const tryQualities = isLosslessQuality(saved.quality)
    ? ['320k', '128k', saved.quality]
    : [saved.quality || '128k', '128k', '320k'].filter((q, i, arr) => q && arr.indexOf(q) === i)

  let lastErr = null
  for (const quality of tryQualities) {
    try {
      req.body = { ...saved, quality, type: quality }
      const result = await resolvePlayStreamRel(req)
      if (result?.rel) {
        req.body = saved
        return { ...result, rel: toDlnaFriendlyRel(result.rel, result.extra) }
      }
    } catch (e) {
      lastErr = e
      if (!isSourceConnError(e)) {
        req.body = saved
        throw e
      }
    }
  }

  // 最后带 refresh 再试一档低音质
  try {
    req.body = { ...saved, quality: '128k', type: '128k', refresh: true }
    const result = await resolvePlayStreamRel(req)
    req.body = saved
    return { ...result, rel: toDlnaFriendlyRel(result.rel, result.extra) }
  } catch (e) {
    req.body = saved
    lastErr = e
  }
  const err = lastErr || new Error('无法解析可投送的播放地址')
  if (isSourceConnError(err)) {
    const friendly = new Error('音源取链失败。请先确认本机正在播放，再点投送；或换较低音质后重试')
    friendly.status = err.status || 502
    throw friendly
  }
  throw err
}

async function warmupDlnaMp3(req) {
  const tid = String(req.body?.trackId || '').trim()
  let file = tid ? (resolvePathByTrackId(tid) || '') : ''
  if (!file) file = String(req.body?.localPath || req.body?.filePath || '')
  if (!file) return
  const resolved = path.resolve(mapToContainerPath(file) || file)
  const exists = fs.existsSync(resolved) ? resolved : path.resolve(file)
  if (!fs.existsSync(exists)) return
  if (path.extname(exists).toLowerCase() === '.mp3') return
  await ensureDlnaPlayMp3(exists)
}

export function parseDurationSeconds(value) {
  if (value == null || value === '') return 0
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 10000) return value / 1000
    return value
  }
  const str = String(value).trim()
  const parts = str.split(':').map(Number)
  if (parts.length === 2 && parts.every((n) => !Number.isNaN(n))) return parts[0] * 60 + parts[1]
  if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  const n = parseFloat(str)
  return Number.isNaN(n) ? 0 : n
}

function friendlyCastResolveError(err) {
  const msg = String(err?.message || err || '')
  if (/socket hang up|ECONNRESET|EPIPE|ECONNABORTED|ETIMEDOUT|timeout|获取播放链接/i.test(msg)) {
    const e = new Error('取链失败。请先让本机正常播放，再点投送；播客/在线源也可换一首后重试')
    e.status = err?.status || 502
    return e
  }
  return err
}

/** 把当前请求体解析成投屏 URI 并 SOAP 播放 */
export async function playTrackOnDlnaDevice(req, udn) {
  const title = String(req.body?.name || req.body?.title || '音频')
  const artist = String(req.body?.singer || req.body?.artist || '')
  const album = String(req.body?.album || '')
  let rel = ''
  let extra = {}
  try {
    const resolved = await resolveDlnaStreamRel(req)
    rel = resolved.rel
    extra = resolved.extra || {}
  } catch (e) {
    throw friendlyCastResolveError(e)
  }
  if (!rel) {
    const err = new Error('无法解析可投送的播放地址')
    err.status = 400
    throw err
  }

  const device = await ensureDlnaDevice(udn)
  let nearHost = ''
  try { nearHost = new URL(device.location || '').hostname } catch {}

  const localPath = resolveLocalPathForCast(req)
  if (localPath) {
    try { await warmupDlnaMp3(req) } catch {}
  }

  const remoteUrl = remoteUrlFromPlayRel(rel)
  const coverUrl = pickCoverUrl(req.body || {}, req, nearHost)
  let duration = parseDurationSeconds(req.body?.interval || req.body?.duration)
  const episodeId = String(req.body?.podcastEpisodeId || '').trim()
  // 播客 RSS 时长在库里；投屏请求体常丢 duration，这里强制回填
  if (duration < 1 && episodeId) {
    try {
      const ep = getEpisodeForUser(req.user.id, episodeId)
      const epDur = Number(ep?.duration) || 0
      if (epDur > 1) duration = epDur
    } catch {}
  }
  const slot = createDlnaCastSlot({
    userId: req.user.id,
    title,
    artist,
    album,
    mime: guessMimeFromPlayRel(rel),
    localPath: localPath || '',
    remoteUrl: remoteUrl || '',
    audioRel: rel,
    coverUrl,
    durationSec: duration,
  })

  // 本地可快转；远程播客不阻塞整集转码（拉流时实时转 MP3）
  try {
    await prepareDlnaCastAudio(slot)
  } catch (e) {
    if (localPath) {
      const err = new Error(
        e.message || '投屏需要先转成 MP3。请到设置启用/检测 ffmpeg 后重试',
      )
      err.status = 415
      throw err
    }
    // 远程：仍用短链 + 拉流实时转码
    slot.needsLiveTranscode = Boolean(remoteUrl)
    slot.mime = 'audio/mpeg'
  }
  // 准备阶段后可能才确定是否实时流转码
  slot.durationSec = Math.max(Number(slot.durationSec) || 0, duration)

  const uri = toAbs(req, signCastRel(req, slot.id, 'audio'), { nearHost })
  const artUri = coverUrl
    ? toAbs(req, signCastRel(req, slot.id, 'cover'), { nearHost })
    : ''
  const mime = 'audio/mpeg'
  const live = Boolean(slot.needsLiveTranscode) && !(slot.preparedMp3 && fs.existsSync(slot.preparedMp3))
  // 实时流无真实文件大小：用 CBR 估算写入 DIDL size，帮助小米显示总时长
  const size = live ? estimateMp3Bytes(duration) : 0
  try {
    const result = await dlnaPlay(udn, {
      uri,
      title,
      artist,
      album,
      mime,
      duration,
      size,
      seekable: !live,
      artUri,
    })
    const cached = getCachedDevice(udn) || {}
    const xiaomi = isXiaomiDlnaDevice(cached)
    return {
      ...result,
      uri,
      artUri,
      duration,
      mime,
      castId: slot.id,
      xiaomi,
      wallClockOnly: xiaomi || Boolean(episodeId),
    }
  } catch (e) {
    const msg = String(e?.message || e || '')
    if (/[\u4e00-\u9fff]/.test(msg)) throw e
    if (/socket hang up|ECONNRESET|ECONNREFUSED|ETIMEDOUT|timeout/i.test(msg)) {
      const err = new Error('电视控制异常，请再点一次投送；确认电视未息屏且与柠檬同一网段')
      err.status = 502
      throw err
    }
    throw e
  }
}
