/**
 * 情绪地图「心情电台」：
 * - 从地图点播放后，连播相近情绪
 * - 喜欢：强化该区域；不喜欢：临时避开并切下一首
 * - 偏好带时间衰减，避免旧心情一直累计
 */
import { computed, ref } from 'vue'
import { addToQueue, enterMoodQueueMode, exitMoodQueueMode, playItem } from './player.js'
import { localCoverUrl } from './library.js'

/** 喜欢偏好半衰期（毫秒）——约 20 分钟淡一半 */
export const MOOD_LIKE_HALF_LIFE_MS = 20 * 60 * 1000
/** 不喜欢排斥半衰期——略长，避免刚踩过又播回来 */
export const MOOD_DISLIKE_HALF_LIFE_MS = 35 * 60 * 1000
/** 超过此时长无互动/无连播则清空历史偏好，只保留当前曲作种子 */
export const MOOD_PREF_IDLE_RESET_MS = 75 * 60 * 1000

export const moodRadioActive = ref(false)
/** @type {import('vue').Ref<null | { filePath: string, title: string, artist: string, album: string, x: number, y: number, hasPicture?: boolean, cover?: string, key: string }>} */
export const moodRadioNow = ref(null)
/** @type {import('vue').Ref<'' | 'like' | 'dislike'>} */
export const moodRadioFeedback = ref('')

/** @type {{ x: number, y: number, at: number }[]} */
let likeSamples = []
/** @type {{ x: number, y: number, r: number, at: number }[]} */
let dislikeSamples = []
/** @type {object[]} */
let catalog = []
const recentKeys = []
const RECENT_MAX = 24
let lastActiveAt = 0

function decayWeight(at, halfLifeMs) {
  const age = Math.max(0, Date.now() - at)
  return 2 ** (-age / Math.max(1, halfLifeMs))
}

function pruneSamples() {
  const now = Date.now()
  likeSamples = likeSamples.filter((s) => decayWeight(s.at, MOOD_LIKE_HALF_LIFE_MS) > 0.04)
  dislikeSamples = dislikeSamples.filter((s) => decayWeight(s.at, MOOD_DISLIKE_HALF_LIFE_MS) > 0.04)
  if (lastActiveAt && now - lastActiveAt > MOOD_PREF_IDLE_RESET_MS) {
    likeSamples = []
    dislikeSamples = []
  }
}

function touchActive() {
  lastActiveAt = Date.now()
}

function pointKey(p) {
  return p?.filePath ? `local:${p.filePath}` : (p?.key || '')
}

function toRadioTrack(p) {
  if (!p) return null
  const filePath = p.filePath || p.localPath || ''
  return {
    filePath,
    title: p.title || p.name || '',
    artist: p.artist || p.singer || '',
    album: p.album || '',
    x: Number(p.x) || 0,
    y: Number(p.y) || 0,
    hasPicture: Boolean(p.hasPicture),
    cover: p.hasPicture && filePath ? localCoverUrl(filePath) : (p.cover || p.picUrl || ''),
    key: pointKey(p),
  }
}

function trackPayload(p) {
  const filePath = p.filePath || p.localPath || ''
  return {
    key: filePath ? `local:${filePath}` : '',
    name: p.title || p.name || '',
    singer: p.artist || p.singer || '',
    album: p.album || '',
    localPath: filePath,
    filePath,
    source: 'local',
    picUrl: p.hasPicture ? localCoverUrl(filePath) : (p.picUrl || ''),
    moodX: Number(p.x) || 0,
    moodY: Number(p.y) || 0,
  }
}

export function setMoodCatalog(points) {
  catalog = Array.isArray(points) ? points.slice() : []
}

export function isMoodRadioActive() {
  return moodRadioActive.value
}

export const moodRadioHint = computed(() => {
  if (!moodRadioActive.value) return ''
  pruneSamples()
  const likes = likeSamples.length
  const dislikes = dislikeSamples.length
  if (!likes && !dislikes) return '连播相近心情 · 未表态则继续当前类型'
  return `偏好约 ${Math.round(MOOD_LIKE_HALF_LIFE_MS / 60000)} 分钟衰减 · 喜欢 ${likes} · 避开 ${dislikes}`
})

/** 有效目标点：当前曲 + 衰减后的喜欢样本加权 */
export function getMoodTarget() {
  pruneSamples()
  let wx = 0
  let wy = 0
  let w = 0
  const cur = moodRadioNow.value
  if (cur) {
    wx += cur.x * 1.2
    wy += cur.y * 1.2
    w += 1.2
  }
  for (const s of likeSamples) {
    const wt = decayWeight(s.at, MOOD_LIKE_HALF_LIFE_MS)
    wx += s.x * wt
    wy += s.y * wt
    w += wt
  }
  if (w < 1e-6) return cur ? { x: cur.x, y: cur.y } : { x: 0, y: 0 }
  return { x: wx / w, y: wy / w }
}

function scoreCandidate(p, target) {
  const dx = (Number(p.x) || 0) - target.x
  const dy = (Number(p.y) || 0) - target.y
  let score = -(dx * dx + dy * dy)
  for (const d of dislikeSamples) {
    const wt = decayWeight(d.at, MOOD_DISLIKE_HALF_LIFE_MS)
    if (wt < 0.05) continue
    const dd = Math.hypot((Number(p.x) || 0) - d.x, (Number(p.y) || 0) - d.y)
    const r = d.r || 0.28
    if (dd < r) score -= (1 - dd / r) * wt * 4
    else if (dd < r * 1.6) score -= ((r * 1.6 - dd) / (r * 0.6)) * wt * 0.8
  }
  const key = pointKey(p)
  const recentIdx = recentKeys.indexOf(key)
  if (recentIdx >= 0) score -= (RECENT_MAX - recentIdx) * 0.015
  return score
}

function rememberPlayed(key) {
  if (!key) return
  const i = recentKeys.indexOf(key)
  if (i >= 0) recentKeys.splice(i, 1)
  recentKeys.push(key)
  while (recentKeys.length > RECENT_MAX) recentKeys.shift()
}

export function pickMoodNext(excludeKey = '') {
  if (!catalog.length) return null
  pruneSamples()
  const target = getMoodTarget()
  const exclude = new Set(recentKeys.slice(-8))
  if (excludeKey) exclude.add(excludeKey)
  if (moodRadioNow.value?.key) exclude.add(moodRadioNow.value.key)

  const ranked = catalog
    .filter((p) => p?.filePath && !exclude.has(pointKey(p)))
    .map((p) => ({ p, score: scoreCandidate(p, target) }))
    .sort((a, b) => b.score - a.score)

  if (!ranked.length) {
    // 兜底：放开最近播放限制
    const soft = catalog
      .filter((p) => p?.filePath && pointKey(p) !== excludeKey)
      .map((p) => ({ p, score: scoreCandidate(p, target) }))
      .sort((a, b) => b.score - a.score)
    if (!soft.length) return null
    const top = soft.slice(0, Math.min(8, soft.length))
    return top[Math.floor(Math.random() * top.length)].p
  }

  // 在头部取样，避免永远同一首
  const topN = ranked.slice(0, Math.min(10, ranked.length))
  const weights = topN.map((_, i) => 1 / (1 + i * 0.55))
  const sum = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * sum
  for (let i = 0; i < topN.length; i += 1) {
    r -= weights[i]
    if (r <= 0) return topN[i].p
  }
  return topN[0].p
}

export async function startMoodRadio(point, pointsList) {
  if (Array.isArray(pointsList)) setMoodCatalog(pointsList)
  const track = toRadioTrack(point)
  if (!track?.filePath) return false
  enterMoodQueueMode()
  moodRadioActive.value = true
  moodRadioNow.value = track
  moodRadioFeedback.value = ''
  touchActive()
  rememberPlayed(track.key)
  await playItem(trackPayload(point), 'local', { mood: true })
  return true
}

export function stopMoodRadio({ restoreQueue = false } = {}) {
  moodRadioActive.value = false
  moodRadioFeedback.value = ''
  // 保留样本一段时间，便于短暂停后再开；由 idle 重置清理
  if (restoreQueue) {
    try { exitMoodQueueMode({ restore: true }) } catch {}
  }
}

export function syncMoodRadioFromPlaying(playing) {
  if (!moodRadioActive.value || !playing) return
  const filePath = playing.localPath || playing.filePath || ''
  if (!filePath) return
  const fromCatalog = catalog.find((p) => p.filePath === filePath)
  const x = fromCatalog ? Number(fromCatalog.x) : Number(playing.moodX)
  const y = fromCatalog ? Number(fromCatalog.y) : Number(playing.moodY)
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    // 非地图曲目：退出心情电台并恢复普通试听列表
    stopMoodRadio({ restoreQueue: true })
    moodRadioNow.value = null
    return
  }
  const next = toRadioTrack(fromCatalog || {
    filePath,
    title: playing.name,
    artist: playing.singer,
    album: playing.album,
    x,
    y,
    hasPicture: Boolean(playing.picUrl),
    picUrl: playing.picUrl,
  })
  if (moodRadioNow.value?.key !== next.key) {
    moodRadioFeedback.value = ''
  }
  moodRadioNow.value = next
  rememberPlayed(next.key)
  touchActive()
}

export function moodRadioLike() {
  const cur = moodRadioNow.value
  if (!cur || !moodRadioActive.value) return
  touchActive()
  likeSamples.push({ x: cur.x, y: cur.y, at: Date.now() })
  // 同一首歌改口：削弱附近不喜欢
  dislikeSamples = dislikeSamples.filter((d) => Math.hypot(d.x - cur.x, d.y - cur.y) > 0.12)
  moodRadioFeedback.value = 'like'
  pruneSamples()
}

export async function moodRadioDislike() {
  const cur = moodRadioNow.value
  if (!cur || !moodRadioActive.value) return null
  touchActive()
  dislikeSamples.push({ x: cur.x, y: cur.y, r: 0.32, at: Date.now() })
  moodRadioFeedback.value = 'dislike'
  pruneSamples()
  return playMoodRadioNext()
}

export async function playMoodRadioNext() {
  if (!moodRadioActive.value) return false
  pruneSamples()
  touchActive()
  const next = pickMoodNext(moodRadioNow.value?.key || '')
  if (!next) return false
  const track = toRadioTrack(next)
  moodRadioNow.value = track
  moodRadioFeedback.value = ''
  rememberPlayed(track.key)
  await playItem(trackPayload(next), 'local', { mood: true })
  return true
}

export function addMoodPointToQueue(point) {
  addToQueue(trackPayload(point), 'local', { mood: true })
}

export function getMoodDecaySummary() {
  pruneSamples()
  return {
    likeHalfLifeMin: Math.round(MOOD_LIKE_HALF_LIFE_MS / 60000),
    dislikeHalfLifeMin: Math.round(MOOD_DISLIKE_HALF_LIFE_MS / 60000),
    likes: likeSamples.length,
    dislikes: dislikeSamples.length,
  }
}
