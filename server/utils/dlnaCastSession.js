import {
  dlnaGetStatus,
  dlnaStop,
  dlnaPause,
  dlnaResume,
  pinDlnaDevice,
  unpinDlnaDevice,
  isXiaomiDlnaDevice,
  getCachedDevice,
} from './dlna.js'
import { broadcast } from '../ws.js'
import {
  captureDlnaHttpContext,
  makeDlnaReq,
  parseDurationSeconds,
  playTrackOnDlnaDevice,
} from './dlnaCastPlay.js'

const MAX_QUEUE = 400
const TICK_MS = 1500
const IGNORE_STOP_MS = 12000

/** 开播后忽略误报 STOPPED 的窗口；短曲不能死等 12s */
function ignoreStopMsForDuration(durationSec) {
  const dur = Number(durationSec) || 0
  if (dur > 5 && dur < 25) return Math.min(IGNORE_STOP_MS, Math.max(3500, Math.floor(dur * 450)))
  return IGNORE_STOP_MS
}

/** @type {Map<string, object>} */
const sessions = new Map()
let tickTimer = 0

const KEEP_ITEM_KEYS = [
  'name', 'singer', 'artist', 'album', 'albumName', 'id', 'trackId', 'songId', 'songmid',
  'hash', 'copyrightId', 'musicId', 'strMediaMid', 'albumAudioId', 'albumId', 'albumMid',
  'albummid', 'rid', 'dcTargetId', 'interval', 'duration', 'source', 'localPath', 'filePath',
  'path', 'podcastEpisodeId', 'podcastFeedId', 'img', 'picUrl', 'qualitys', 'types', 'quality',
  'key',
]

function slimItem(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const out = {}
  for (const k of KEEP_ITEM_KEYS) {
    if (src[k] != null && src[k] !== '') out[k] = src[k]
  }
  return out
}

function slimQueue(list) {
  const arr = Array.isArray(list) ? list.slice(0, MAX_QUEUE) : []
  return arr.map((entry) => {
    const item = slimItem(entry?.item ?? entry)
    const source = String(entry?.source || item.source || '')
    const key = String(entry?.key || item.key || '')
    return { key, source, item }
  }).filter((e) => e.item?.name)
}

export function trackKeyOf(entry) {
  const item = entry?.item || entry || {}
  const local = item.localPath || item.filePath || item.path || ''
  if (local) return `local:${local}`
  const podcastId = item.podcastEpisodeId || (item.source === 'podcast' ? item.id : '')
  if (podcastId) return `podcast:${podcastId}`
  if (entry?.key) return String(entry.key)
  const id = item.songmid || item.hash || item.songId || item.musicId || item.copyrightId || item.id
  return `${item.source || entry?.source || ''}:${id || ''}`
}

function ensureTicker() {
  if (tickTimer) return
  tickTimer = setInterval(() => {
    tickAll().catch(() => {})
  }, TICK_MS)
  if (typeof tickTimer === 'object' && tickTimer.unref) tickTimer.unref()
}

function stopTickerIfIdle() {
  if (sessions.size) return
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = 0
  }
}

function publicSession(s, extra = {}) {
  if (!s) return { active: false }
  const entry = s.queue[s.index]
  const now = Date.now()
  return {
    active: true,
    udn: s.udn,
    index: s.index,
    playMode: s.playMode,
    quality: s.quality,
    duration: s.durationSec || 0,
    paused: Boolean(s.paused),
    item: entry?.item || null,
    source: entry?.source || '',
    key: trackKeyOf(entry),
    elapsed: Math.round(sessionElapsed(s, now) * 10) / 10,
    wallClockOnly: Boolean(s.wallClockOnly),
    seenPlaying: Boolean(s.seenPlaying),
    stopSuspect: Number(s.stopSuspect) || 0,
    advancing: Boolean(s.advancing),
    ...extra,
  }
}

function notify(s, type, extra = {}) {
  broadcast(type, publicSession(s, extra), s.userId)
}

function itemToPlayBody(entry, quality) {
  const item = { ...(entry?.item || {}) }
  const source = item.podcastEpisodeId || item.source === 'podcast' || entry?.source === 'podcast'
    ? 'podcast'
    : (entry?.source || item.source || '')
  const rawId = String(item.id || item.trackId || '')
  const localPath = item.localPath || item.filePath || ''
  const trackId = localPath && /^[0-9a-f-]{36}$/i.test(rawId) ? rawId : (item.trackId || '')
  const episodeId = item.podcastEpisodeId || (source === 'podcast' ? item.id : '')
  return {
    ...item,
    source,
    quality: item.quality || quality || '128k',
    trackId: trackId || undefined,
    localPath: localPath || undefined,
    podcastEpisodeId: episodeId || undefined,
    name: item.name,
    singer: item.singer || item.artist,
    album: item.album || item.albumName,
  }
}

function nextIndex(s) {
  const n = s.queue.length
  const i = s.index
  if (!n) return -1
  if (s.playMode === 'single') return i
  if (s.playMode === 'random') {
    if (n === 1) return i
    let j = i
    let guard = 0
    while (j === i && guard < 8) {
      j = Math.floor(Math.random() * n)
      guard += 1
    }
    return j
  }
  if (i + 1 < n) return i + 1
  if (s.playMode === 'loop') return 0
  return -1
}

function isLiveSession(s) {
  return Boolean(s) && sessions.get(sessionKey(s.userId)) === s
}

async function playSessionIndex(s, index, { manageAdvancing = true } = {}) {
  if (!isLiveSession(s)) return false
  if (index < 0 || index >= s.queue.length) return false
  s.index = index
  if (manageAdvancing) s.advancing = true
  s.seenPlaying = false
  s.startedAt = Date.now()
  s.clockFrozenElapsed = 0
  s.paused = false
  s.maxRelSeen = 0
  s.stopSuspect = 0
  // 切歌必须重置曲长，否则会继承上一首偏长 duration，导致永远不切下一首
  s.durationSec = 0
  const entry = s.queue[index]
  const body = itemToPlayBody(entry, s.quality)
  const approxDur = parseDurationSeconds(body.interval || body.duration)
  s.ignoreStopUntil = Date.now() + ignoreStopMsForDuration(approxDur)
  const req = makeDlnaReq(s.http, body)
  try {
    const result = await playTrackOnDlnaDevice(req, s.udn)
    const fromResult = Number(result.duration) || 0
    const fromItem = parseDurationSeconds(body.interval || body.duration)
    s.durationSec = Math.max(fromResult, fromItem)
    s.ignoreStopUntil = Date.now() + ignoreStopMsForDuration(s.durationSec)
    s.lastUri = result.uri || ''
    pinDlnaDevice(s.udn)
    notify(s, 'dlna:now-playing')
    return true
  } finally {
    if (manageAdvancing) s.advancing = false
  }
}

async function endQueueSession(s, reason = 'queue-ended') {
  if (!isLiveSession(s)) return
  try { await dlnaStop(s.udn) } catch {}
  unpinDlnaDevice(s.udn)
  notify(s, 'dlna:queue-ended', { active: false, reason })
  sessions.delete(sessionKey(s.userId))
  stopTickerIfIdle()
}

async function advanceSession(s) {
  if (!isLiveSession(s) || s.advancing) return
  s.advancing = true
  try {
    const next = nextIndex(s)
    if (next < 0) {
      await endQueueSession(s, 'queue-ended')
      return
    }
    let idx = next
    const maxAttempts = Math.min(8, Math.max(4, s.queue.length))
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const ok = await playSessionIndex(s, idx, { manageAdvancing: false })
        if (ok) {
          console.log(`[dlna-cast] 已切歌 → #${idx} ${s.queue[idx]?.item?.name || ''}`)
          return
        }
      } catch (e) {
        console.warn('[dlna-cast] 下一首失败:', e?.message || e)
      }
      if (s.playMode === 'single') return
      const more = nextIndex({ ...s, index: idx })
      if (more < 0 || more === idx) {
        await endQueueSession(s, 'advance-exhausted')
        return
      }
      idx = more
    }
  } finally {
    if (isLiveSession(s)) s.advancing = false
  }
}

function sessionElapsed(s, now) {
  if (s.paused) return Number(s.clockFrozenElapsed) || 0
  return Math.max(0, (now - s.startedAt) / 1000)
}

function playbackLooksFinished(s, rel, now) {
  const dur = Number(s.durationSec) || 0
  const elapsed = sessionElapsed(s, now)
  const maxRel = Math.max(Number(s.maxRelSeen) || 0, Number(rel) || 0)
  // 小米电视播完常见：仍报 STOPPED 但 RelTime 归零，或卡在接近结尾；
  // 不能要求「进度接近终点且时钟也到」，否则只会结束会话、不切下一首。
  if (dur > 5) {
    if (rel >= dur - 4) return true
    if (elapsed >= dur - 1.0) return true
    if (rel < 1.5 && maxRel >= Math.max(20, dur - 12)) return true
    if (rel < 1.5 && elapsed >= dur * 0.88) return true
    return false
  }
  // 无曲长元数据时：曾推进较久后进度归零，视为播完
  if (rel < 1.0 && maxRel >= 45 && elapsed >= Math.max(40, maxRel - 3)) return true
  return false
}

function isMidTrackStop(s, rel, now) {
  const dur = Number(s.durationSec) || 0
  const elapsed = sessionElapsed(s, now)
  if (playbackLooksFinished(s, rel, now)) return false
  if (dur > 5) {
    return rel >= 0.8 && rel < dur - 8 && elapsed < dur - 5
  }
  // 无曲长：进度还在走、且开播不久，更像暂停而非播完
  return rel >= 0.8 && elapsed < Math.max(45, rel + 8)
}

function enterPaused(s, now, state = 'PAUSED_PLAYBACK') {
  if (s.paused) return
  s.clockFrozenElapsed = sessionElapsed(s, now)
  s.paused = true
  notify(s, 'dlna:transport', { paused: true, state })
}

function exitPaused(s, now) {
  if (!s.paused) return
  s.startedAt = now - (Number(s.clockFrozenElapsed) || 0) * 1000
  s.paused = false
  notify(s, 'dlna:transport', { paused: false, state: 'PLAYING' })
}

async function endSessionFromDevice(s) {
  if (!isLiveSession(s)) return
  sessions.delete(sessionKey(s.userId))
  stopTickerIfIdle()
  unpinDlnaDevice(s.udn)
  notify(s, 'dlna:queue-ended', { active: false, reason: 'device-stop' })
}

async function tickSession(s) {
  if (!isLiveSession(s) || s.advancing) return
  const now = Date.now()
  const device = getCachedDevice(s.udn)
  const xiaomi = Boolean(s.wallClockOnly) || isXiaomiDlnaDevice(device || { name: '', location: '', controlURL: '' })
  if (xiaomi) s.wallClockOnly = true

  try {
    const st = await dlnaGetStatus(s.udn)
    const state = String(st?.state || '').toUpperCase()
    const rel = Number(st?.relTime) || 0
    const durFromTv = Number(st?.duration) || 0
    if (st?.wallClockOnly || st?.xiaomi) s.wallClockOnly = true
    if (durFromTv > 1 && durFromTv < 86400) {
      // 电视曲长可用时采纳；允许变短；变长只接受小幅修正，避免短曲被冲成数分钟
      const cur = Number(s.durationSec) || 0
      if (!(cur > 1)) {
        s.durationSec = durFromTv
      } else if (Math.abs(durFromTv - cur) > 2) {
        if (durFromTv < cur) {
          if (now < s.ignoreStopUntil || durFromTv >= cur * 0.55) s.durationSec = durFromTv
        } else if (durFromTv <= Math.max(cur * 1.25, cur + 20)) {
          s.durationSec = durFromTv
        }
      }
    }

    if (rel > (Number(s.maxRelSeen) || 0)) s.maxRelSeen = rel
    if (state === 'PLAYING' || state === 'TRANSITIONING') {
      s.seenPlaying = true
      s.stopSuspect = 0
    }
    if (rel > 0.4) s.seenPlaying = true

    // 小米：Position 不可信；播完常变 STOPPED。墙钟为主，STOPPED 接近曲终时也切歌
    if (s.wallClockOnly) {
      if (state === 'PLAYING' || state === 'TRANSITIONING') {
        exitPaused(s, now)
        s.seenPlaying = true
        s.stopSuspect = 0
      } else if (
        (state === 'STOPPED' || state === 'NO_MEDIA_PRESENT')
        && now >= s.ignoreStopUntil
      ) {
        const dur = Number(s.durationSec) || 0
        const elapsed = sessionElapsed(s, now)
        s.stopSuspect = (Number(s.stopSuspect) || 0) + 1
        // 墙钟接近曲终 / 过半后持续 STOPPED / 长时间 STOPPED：按播放模式切下一首
        const nearEnd = dur > 5
          ? elapsed >= Math.max(8, dur - 4)
          : elapsed >= 25
        const mostlyDone = dur > 5
          && elapsed >= Math.max(8, dur * 0.72)
          && s.stopSuspect >= 2
        const stuckStopped = s.stopSuspect >= 4
          && (s.seenPlaying || elapsed >= Math.max(10, dur > 5 ? dur * 0.5 : 20))
        if (nearEnd || mostlyDone || stuckStopped) {
          console.log(
            `[dlna-cast] 小米切歌触发 state=${state} elapsed=${elapsed.toFixed(1)} dur=${dur} suspect=${s.stopSuspect} near=${nearEnd} mid=${mostlyDone} stuck=${stuckStopped}`,
          )
          await advanceSession(s)
          return
        }
      }
    } else {
      if (state === 'PAUSED_PLAYBACK') {
        enterPaused(s, now, state)
        return
      }

      if (state === 'PLAYING' || state === 'TRANSITIONING') {
        exitPaused(s, now)
        const dur = Number(s.durationSec) || 0
        const elapsed = sessionElapsed(s, now)
        if (dur > 5 && (elapsed >= dur + 2.5 || (rel >= dur - 1 && elapsed >= dur - 1))) {
          await advanceSession(s)
        }
        return
      }

      if (now < s.ignoreStopUntil) return
      if (!s.seenPlaying) return
      if (state === 'STOPPED' || state === 'NO_MEDIA_PRESENT') {
        if (playbackLooksFinished(s, rel, now)) {
          await advanceSession(s)
          return
        }
        if (isMidTrackStop(s, rel, now)) {
          enterPaused(s, now, state)
          return
        }
        const dur = Number(s.durationSec) || 0
        const elapsed = sessionElapsed(s, now)
        const playedEnough = dur > 5
          ? elapsed >= Math.max(25, dur * 0.92)
          : elapsed >= 45 || (Number(s.maxRelSeen) || 0) >= 40
        if (playedEnough) {
          await advanceSession(s)
          return
        }
        s.stopSuspect = (Number(s.stopSuspect) || 0) + 1
        const maxRel = Number(s.maxRelSeen) || 0
        if (maxRel < 0.5 && elapsed >= 90 && s.stopSuspect >= 10) {
          await endSessionFromDevice(s)
        }
        return
      }
    }
  } catch {
    /* 部分音箱不报状态，用曲长墙钟切歌 */
  }

  if (s.paused && !s.wallClockOnly) return
  if (now < s.ignoreStopUntil) return
  const dur = Number(s.durationSec) || 0
  const elapsed = sessionElapsed(s, now)
  if (dur > 3) {
    // 略早于曲终切歌，减少电视停住后的空窗
    if (elapsed >= dur + 0.4) await advanceSession(s)
  } else if (s.seenPlaying && elapsed >= 50) {
    // 无曲长元数据时：已开播足够久再尝试切歌
    await advanceSession(s)
  }
}

async function tickAll() {
  const list = [...sessions.values()]
  for (const s of list) {
    try { await tickSession(s) } catch {}
  }
}

function normalizePlayMode(mode) {
  return ['list', 'loop', 'single', 'random'].includes(mode) ? mode : 'list'
}

function sessionKey(userId) {
  return String(userId ?? '')
}

export function getCastSession(userId) {
  return publicSession(sessions.get(sessionKey(userId)))
}

export function attachCastSession(req, {
  udn,
  queue,
  index,
  playMode,
  quality,
} = {}) {
  const userId = req.user?.id
  if (userId == null || userId === '' || !udn) return { active: false }
  const q = slimQueue(queue)
  const idx = Math.max(0, Math.min(Number(index) || 0, Math.max(0, q.length - 1)))
  const prev = sessions.get(sessionKey(userId))
  if (prev && prev.udn && prev.udn !== udn) {
    unpinDlnaDevice(prev.udn)
  }
  const s = {
    userId,
    role: req.user.role,
    udn: String(udn),
    queue: q.length ? q : (prev?.queue || []),
    index: q.length ? idx : (prev?.index || 0),
    playMode: normalizePlayMode(playMode || prev?.playMode),
    quality: String(quality || prev?.quality || '128k'),
    http: captureDlnaHttpContext(req),
    startedAt: Date.now(),
    durationSec: 0,
    ignoreStopUntil: Date.now() + IGNORE_STOP_MS,
    seenPlaying: false,
    advancing: false,
    paused: false,
    clockFrozenElapsed: 0,
    maxRelSeen: 0,
    stopSuspect: 0,
    wallClockOnly: isXiaomiDlnaDevice({
      name: '',
      manufacturer: '',
      model: '',
      location: '',
      controlURL: '',
      ...(getCachedDevice(String(udn)) || {}),
    }),
    lastUri: '',
  }
  if (!s.queue.length && req.body) {
    s.queue = slimQueue([{ item: req.body, source: req.body.source }])
    s.index = 0
  } else if (s.queue.length && req.body) {
    const bodyKey = trackKeyOf({ item: req.body, source: req.body.source, key: req.body.key })
    const found = s.queue.findIndex((e) => trackKeyOf(e) === bodyKey)
    if (found >= 0) s.index = found
  }
  sessions.set(sessionKey(userId), s)
  pinDlnaDevice(s.udn)
  ensureTicker()
  return publicSession(s, { serverOwned: true })
}

export function updateCastQueue(req, { queue, playMode, udn, quality } = {}) {
  const s = sessions.get(sessionKey(req.user?.id))
  if (!s) return null
  if (udn && String(udn) !== s.udn) s.udn = String(udn)
  const key = trackKeyOf(s.queue[s.index])
  if (Array.isArray(queue)) {
    s.queue = slimQueue(queue)
    const found = s.queue.findIndex((e) => trackKeyOf(e) === key)
    s.index = found >= 0 ? found : Math.min(s.index, Math.max(0, s.queue.length - 1))
  }
  if (playMode) s.playMode = normalizePlayMode(playMode)
  if (quality) s.quality = String(quality)
  s.http = captureDlnaHttpContext(req)
  return publicSession(s)
}

export function markCastPlayed(userId, durationSec = 0) {
  const s = sessions.get(sessionKey(userId))
  if (!s) return
  s.startedAt = Date.now()
  s.seenPlaying = false
  s.paused = false
  s.clockFrozenElapsed = 0
  s.maxRelSeen = 0
  s.stopSuspect = 0
  const item = s.queue[s.index]?.item
  const fromItem = parseDurationSeconds(item?.interval || item?.duration)
  const fromArg = Number(durationSec) || 0
  // 新开播以本首曲长为准，不继承上一首
  s.durationSec = Math.max(fromArg, fromItem)
  s.ignoreStopUntil = Date.now() + ignoreStopMsForDuration(s.durationSec)
}

export async function pauseCastSession(userId) {
  const s = sessions.get(sessionKey(userId))
  if (!s) return null
  try { await dlnaPause(s.udn) } catch {}
  enterPaused(s, Date.now(), 'PAUSED_PLAYBACK')
  return publicSession(s)
}

export async function resumeCastSession(userId) {
  const s = sessions.get(sessionKey(userId))
  if (!s) return null
  await dlnaResume(s.udn)
  exitPaused(s, Date.now())
  s.seenPlaying = true
  return publicSession(s)
}

export async function stopCastSession(userId, { stopDevice = true } = {}) {
  const s = sessions.get(sessionKey(userId))
  if (!s) return { ok: true }
  sessions.delete(sessionKey(userId))
  stopTickerIfIdle()
  unpinDlnaDevice(s.udn)
  if (stopDevice) {
    try { await dlnaStop(s.udn) } catch {}
  }
  broadcast('dlna:queue-ended', { active: false, udn: s.udn, reason: 'stop' }, s.userId)
  return { ok: true, udn: s.udn }
}
