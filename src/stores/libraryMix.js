import { computed, ref } from 'vue'
import { currentUser } from '../utils/auth.js'
import { api } from '../api.js'
import { cleanText, cleanTrackItem } from '../utils/text.js'
import { PLATFORM_ORDER } from '../utils/platforms.js'
import { defaultSongRegion, discoverState, loadDiscoverSources } from './discover.js'
import {
  addTracksToPlaylist,
  createPlaylist,
  customPlaylists,
  favorites,
  fileToLibraryTrack,
  getLibraryTrackKey,
  libraryTracks,
  recentPlays,
  snapshotToPlayTrack,
} from './library.js'

const DAILY_SIZE = 30
/** 每日「换一批」上限 */
export const DAILY_REFRESH_MAX = 20
/** 换一批后按钮冷却（秒） */
export const DAILY_REFRESH_COOLDOWN_SEC = 20
/** 最近播放里尽量避开的条数，减少「又是刚听过的」 */
const RECENT_AVOID = 80
/** 收藏只作少量点缀，避免整单像收藏夹 */
const FAV_SEASONING = 5
const HOT_SIZE = 100
const CAR_SIZE = 60
const NIGHT_SIZE = 40

const CJK = /[\u4e00-\u9fff]/
const MANDARIN_RE = /华语|国语|普通话|mandarin|c-pop|cpop|chinese|中文/i
/** 深夜电台：轻柔舒缓向（曲名/歌手/专辑/风格） */
const NIGHT_RE = /轻音乐|轻柔|舒缓|放松|安静|温柔|治愈|助眠|安眠|睡眠|夜色|夜晚|深夜|月光|星空|雨声|咖啡|慵懒|慢歌|慢节奏|抒情|情歌|民谣|钢琴|吉他|小提琴|纯音乐|器乐|氛围|冥想|瑜伽|疗愈|温馨|暖心|ballad|chill|chillout|lo-?fi|lof|ambient|soft|slow|lullaby|piano|acoustic|jazz|soul|lounge|bossa|classical|instrumental|sleep|relax|calm|peaceful|serene|unplugged|folk/i
/** 深夜应避开的躁动向 */
const NIGHT_EXCLUDE_RE = /摇滚|朋克|金属|电音|劲爆|嗨|蹦迪|夜店|舞曲|喊麦|说唱|rap|hip-?hop|trap|dj|edm|house|techno|trance|dubstep|hardcore|metal|punk|rock|remix|混音|club|disco|鼓点|打碟|狂欢|燥|炸|battle|战歌|军歌|运动|健身|跑步/i
const CAR_RE = /慢摇|节奏|groove|funk|soul|lounge|house|disco|chill|r&b|rnb|reggae|groove/i
const REMIX_RE = /remix|混音|edit|club/i
const NET_HOT_RE = /华语|国语|热歌|流行|榜|热门|精选|推荐|中文/i
const NET_CAR_RE = /慢摇|车载|dj|电音|节奏|夜店|舞曲|remix|酒吧|蹦迪|劲爆|嗨曲|disco/i
const NET_NIGHT_RE = /轻音乐|轻柔|舒缓|放松|助眠|安眠|睡眠|治愈|纯音乐|钢琴|民谣|夜|深夜|睡前|冥想|瑜伽|氛围|lofi|lo-fi|chill|acoustic|ballad|soft|sleep|relax/i

export const dailyMix = ref(emptyMix())
export const recoPlaylists = ref([])
export const mixLoading = ref(false)
/** 每日推荐「换一批」：剩余次数 / 冷却秒数 */
export const dailyRefreshUi = ref({
  used: 0,
  remaining: DAILY_REFRESH_MAX,
  cooldownLeft: 0,
  busy: false,
})

function emptyMix() {
  return {
    dateKey: '',
    title: '每日推荐',
    dateLabel: '',
    tracks: [],
    count: 0,
    durationText: '',
    themeText: '',
    savedId: '',
    refreshUsed: 0,
  }
}

function userKey() {
  return currentUser.value?.id || 'local'
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function todayParts(d = new Date()) {
  return { y: d.getFullYear(), m: d.getMonth() + 1, day: d.getDate() }
}

function dateKey(d = new Date()) {
  const { y, m, day } = todayParts(d)
  return `${y}-${pad(m)}-${pad(day)}`
}

function weekKey(d = new Date()) {
  const start = new Date(d.getFullYear(), 0, 1)
  const week = Math.ceil((((d - start) / 86400000) + start.getDay() + 1) / 7)
  return `${d.getFullYear()}-w${week}`
}

function isNightWindow(d = new Date()) {
  const h = d.getHours()
  return h >= 22 || h < 6
}

function hashSeed(str) {
  let h = 2166136261
  for (let i = 0; i < String(str).length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return h >>> 0
}

function mulberry32(a) {
  return function rng() {
    let t = a += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

function shufflePick(list, n, seed) {
  const rng = mulberry32(hashSeed(seed))
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, Math.max(0, n))
}

function trackKey(t) {
  return getLibraryTrackKey(t) || t?.key || ''
}

function blob(t) {
  return `${t?.name || ''} ${t?.singer || ''} ${t?.album || ''} ${t?.genre || ''}`
}

function isMandarinTrack(t) {
  const text = blob(t)
  if (MANDARIN_RE.test(text)) return true
  return CJK.test(t?.name || '') || CJK.test(t?.singer || '')
}

function genreTags(t) {
  return String(t?.genre || '').split(/[/;；、,，|]/).map(s => s.trim()).filter(Boolean)
}

function formatDurationSum(tracks) {
  const sec = tracks.reduce((s, t) => s + Number(t.duration || 0), 0)
  if (!sec) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (h) return `约 ${h} 小时 ${m} 分`
  return `约 ${m} 分钟`
}

function themeLine(tracks) {
  const counts = new Map()
  let remix = 0
  for (const t of tracks) {
    if (REMIX_RE.test(blob(t))) remix++
    for (const tag of genreTags(t)) {
      counts.set(tag, (counts.get(tag) || 0) + 1)
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n]) => n)
  if (!top.length && remix) return '今天偏流行与 Remix'
  if (!top.length) return isMandarinTrack(tracks[0] || {}) ? '今天偏华语流行' : '根据你的收藏与最近播放生成'
  if (remix) return `今天偏${top[0]}与 Remix`
  return `今天偏${top.join(' / ')}`
}

function fromSnapshot(s) {
  const t = snapshotToPlayTrack(s)
  return {
    ...t,
    genre: s.genre || t.genre || '',
    duration: Number(s.duration || t.duration || 0),
    source: t.source || 'local',
  }
}

/** 本地曲若不在当前音乐库索引中，视为已删幽灵，不进推荐池 */
function isGhostLocalTrack(t, libraryKeys) {
  const k = trackKey(t)
  if (!k) return true
  if (libraryKeys.has(k)) return false
  const src = String(t?.source || '')
  const localPath = t?.localPath || t?.filePath || ''
  if (src === 'local' || localPath || k.startsWith('local:')) return true
  return false
}

function mergePool(extra = []) {
  const map = new Map()
  const libraryKeys = new Set()
  const push = (t, { requireInLibrary = false } = {}) => {
    const k = trackKey(t)
    if (!k || map.has(k)) return
    if (requireInLibrary && isGhostLocalTrack(t, libraryKeys)) return
    map.set(k, t)
  }
  for (const t of libraryTracks.value) {
    const k = trackKey(t)
    if (k) libraryKeys.add(k)
    push(t)
  }
  for (const t of extra) {
    const k = trackKey(t)
    if (k) libraryKeys.add(k)
    push(t)
  }
  // 收藏/最近仅作偏好信号；本地曲必须仍在库中，避免已删文件进每日推荐/漫游
  for (const s of favorites.value) push(fromSnapshot(s), { requireInLibrary: true })
  for (const s of recentPlays.value) push(fromSnapshot(s), { requireInLibrary: true })
  return [...map.values()]
}

async function fetchExtraPool() {
  const extra = []
  try {
    if (!api?.library?.tracks) return extra
    const seen = new Set(libraryTracks.value.map(trackKey).filter(Boolean))
    for (let page = 1; page <= 4; page++) {
      const res = await api.library.tracks({ page, limit: 80, sort: 'mtime' })
      const items = (res.data || []).map(fileToLibraryTrack)
      for (const t of items) {
        const k = trackKey(t)
        if (!k || seen.has(k)) continue
        seen.add(k)
        extra.push(t)
      }
      if (items.length < 80) break
    }
  } catch {}
  return extra
}

function persist(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

function readPersist(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function resolveByKeys(keys, pool) {
  const map = new Map(pool.map(t => [trackKey(t), t]))
  return keys.map(k => map.get(k)).filter(Boolean)
}

function recentAvoidKeys(limit = RECENT_AVOID) {
  const keys = new Set()
  for (const s of recentPlays.value.slice(0, limit)) {
    const t = fromSnapshot(s)
    const k = trackKey(t)
    if (k) keys.add(k)
  }
  return keys
}

function isLocalLikeTrack(t) {
  const src = String(t?.source || '')
  if (src === 'local' || !src) return Boolean(t?.filePath || t?.localPath || String(t?.key || '').startsWith('local:'))
  if (t?.filePath || t?.localPath) return true
  return String(t?.key || '').startsWith('local:')
}

function slimDailyTrack(t) {
  if (!t) return null
  const k = trackKey(t)
  if (!k) return null
  if (isLocalLikeTrack(t)) {
    return {
      key: k,
      source: 'local',
      name: t.name || '',
      singer: t.singer || '',
      album: t.album || t.albumName || '',
      localPath: t.localPath || t.filePath || '',
      filePath: t.filePath || t.localPath || '',
      img: t.img || '',
      duration: Number(t.duration || 0),
      genre: t.genre || '',
    }
  }
  return {
    key: k,
    source: t.source || '',
    name: t.name || '',
    singer: t.singer || '',
    album: t.album || t.albumName || '',
    albumName: t.albumName || t.album || '',
    img: t.img || '',
    interval: t.interval,
    duration: Number(t.duration || t.interval || 0),
    songmid: t.songmid,
    hash: t.hash,
    songId: t.songId ?? t.id,
    id: t.id,
    copyrightId: t.copyrightId,
    types: t.types,
    _types: t._types,
    quality: t.quality,
  }
}

function persistDailyTracks(storeKey, tracks, extra = {}) {
  const list = (tracks || []).map(slimDailyTrack).filter(Boolean)
  persist(storeKey, {
    keys: list.map((t) => t.key),
    snapshots: list,
    mixedHalf: true,
    at: Date.now(),
    ...extra,
  })
}

function resolvePersistedDaily(saved, pool) {
  if (!saved) return []
  const map = new Map((pool || []).map((t) => [trackKey(t), t]))
  const snaps = Array.isArray(saved.snapshots) ? saved.snapshots : []
  const snapMap = new Map(snaps.map((s) => [String(s.key || trackKey(s) || ''), s]).filter(([k]) => k))
  const keys = Array.isArray(saved.keys) && saved.keys.length
    ? saved.keys.map(String)
    : snaps.map((s) => String(s.key || trackKey(s) || '')).filter(Boolean)
  const out = []
  const seen = new Set()
  for (const k of keys) {
    if (!k || seen.has(k)) continue
    const hit = map.get(k) || snapMap.get(k)
    if (!hit) continue
    seen.add(k)
    out.push(cleanTrackItem({ ...hit, source: hit.source || (isLocalLikeTrack(hit) ? 'local' : hit.source) }))
  }
  return out
}

/**
 * 本地半边：曲库探索为主，少塞刚听过的；收藏少量点缀。
 */
function buildDailyLocal(pool, seed, size, { excludeKeys = new Set() } = {}) {
  const target = Math.max(0, size)
  if (!target) return []
  const libraryKeys = new Set(pool.map(trackKey).filter(Boolean))
  const avoidRecent = recentAvoidKeys()
  const blocked = new Set([...excludeKeys, ...avoidRecent])

  const fav = favorites.value
    .map(fromSnapshot)
    .filter((t) => {
      const k = trackKey(t)
      return k && !isGhostLocalTrack(t, libraryKeys) && !excludeKeys.has(k)
    })

  const preferGenres = new Set(fav.flatMap(genreTags))
  const favPick = shufflePick(
    fav.filter((t) => !avoidRecent.has(trackKey(t))),
    Math.min(FAV_SEASONING, Math.max(1, Math.floor(target / 5))),
    `${seed}-fav`,
  )

  const inPool = (t) => {
    const k = trackKey(t)
    return k && !blocked.has(k) && !favPick.some((f) => trackKey(f) === k)
  }

  let explore = pool.filter(inPool)
  if (explore.length < target) {
    explore = pool.filter((t) => {
      const k = trackKey(t)
      return k && !excludeKeys.has(k) && !favPick.some((f) => trackKey(f) === k)
    })
  }

  const softPrefer = explore.filter((t) => {
    if (!preferGenres.size) return isMandarinTrack(t)
    return genreTags(t).some((g) => preferGenres.has(g)) || isMandarinTrack(t)
  })
  const softPool = softPrefer.length >= Math.min(8, target) ? softPrefer : explore
  const need = Math.max(0, target - favPick.length)
  const explorePick = shufflePick(softPool, need, `${seed}-explore`)

  const used = new Set([...favPick, ...explorePick].map(trackKey))
  let mixed = [...favPick, ...explorePick]
  if (mixed.length < target) {
    const rest = shufflePick(
      pool.filter((t) => {
        const k = trackKey(t)
        return k && !used.has(k) && !excludeKeys.has(k)
      }),
      target - mixed.length,
      `${seed}-rest`,
    )
    mixed = [...mixed, ...rest]
  }
  return shufflePick(mixed, target, `${seed}-order`).map((t) => cleanTrackItem({ ...t, source: t.source || 'local' }))
}

/** 激活音源已开放的平台（与发现页一致，已含用户平台开关） */
async function listDailyOnlinePlatforms() {
  try {
    await loadDiscoverSources(api, { force: false })
  } catch {}
  let keys = Object.keys(discoverState.sources || {}).filter((k) => PLATFORM_ORDER.includes(k))
  if (!keys.length) {
    try {
      const res = await api.playlist.sources()
      keys = Object.keys(res?.sources || {}).filter((k) => PLATFORM_ORDER.includes(k))
    } catch {}
  }
  if (!keys.length) {
    try {
      const res = await api.search.sources()
      keys = Object.keys(res?.sources || {}).filter((k) => PLATFORM_ORDER.includes(k))
    } catch {}
  }
  return PLATFORM_ORDER.filter((k) => keys.includes(k))
}

function normalizeOnlineTrack(t, platform) {
  if (!t?.name) return null
  const item = cleanTrackItem({
    ...t,
    source: t.source || platform,
  })
  if (!trackKey(item)) return null
  return item
}

/** 从各激活平台拉一批候选在线曲（新歌 + 榜单兜底） */
async function fetchOnlineDailyCandidates(seed, { excludeKeys = new Set(), want = 20 } = {}) {
  const platforms = await listDailyOnlinePlatforms()
  if (!platforms.length) return []

  const order = shufflePick(platforms, platforms.length, `${seed}-plat`)
  const collected = []
  const seen = new Set(excludeKeys)

  const pushList = (list, platform) => {
    for (const raw of list || []) {
      const t = normalizeOnlineTrack(raw, platform)
      const k = trackKey(t)
      if (!k || seen.has(k)) continue
      seen.add(k)
      collected.push(t)
    }
  }

  await Promise.allSettled(order.map(async (platform, idx) => {
    try {
      const region = defaultSongRegion(platform)
      const res = await api.discover.newSongs(platform, region, 1, 36, { timeout: 18000 })
      pushList(res?.data?.list || [], platform)
    } catch {}
    // 新歌不足时用榜单第一页补一点
    if (collected.length < want && idx < 3) {
      try {
        const tops = await api.discover.toplists(platform, { timeout: 15000 })
        const first = (tops?.data?.list || tops?.data || [])[0]
        const tid = first?.id || first?.bangid || first?.topId
        if (tid) {
          const detail = await api.discover.toplist(platform, tid, 1, 30, { timeout: 18000 })
          pushList(detail?.data?.list || [], platform)
        }
      } catch {}
    }
  }))

  return shufflePick(collected, Math.max(want, collected.length), `${seed}-online-pool`)
}

/**
 * 每日推荐：本地与激活平台各约一半；某一侧不足时用另一侧补齐。
 */
async function composeDailyMix(localPool, seed, { excludeKeys = new Set() } = {}) {
  const half = Math.ceil(DAILY_SIZE / 2)
  const onlineWant = half
  const onlinePool = await fetchOnlineDailyCandidates(seed, { excludeKeys, want: Math.max(onlineWant * 2, 24) })
  let onlinePick = shufflePick(
    onlinePool.filter((t) => !excludeKeys.has(trackKey(t))),
    onlineWant,
    `${seed}-online`,
  )

  const localNeed = Math.max(half, DAILY_SIZE - onlinePick.length)
  let localPick = buildDailyLocal(localPool, seed, localNeed, { excludeKeys })
  const used = new Set([...onlinePick, ...localPick].map(trackKey))

  if (onlinePick.length + localPick.length < DAILY_SIZE) {
    const moreLocal = buildDailyLocal(localPool, `${seed}-fill-local`, DAILY_SIZE - onlinePick.length - localPick.length, {
      excludeKeys: new Set([...excludeKeys, ...used]),
    })
    localPick = [...localPick, ...moreLocal]
    for (const t of moreLocal) used.add(trackKey(t))
  }
  if (onlinePick.length + localPick.length < DAILY_SIZE && onlinePool.length) {
    const moreOnline = shufflePick(
      onlinePool.filter((t) => {
        const k = trackKey(t)
        return k && !used.has(k) && !excludeKeys.has(k)
      }),
      DAILY_SIZE - onlinePick.length - localPick.length,
      `${seed}-fill-online`,
    )
    onlinePick = [...onlinePick, ...moreOnline]
  }

  return shufflePick([...localPick, ...onlinePick], DAILY_SIZE, `${seed}-mix`)
}

/** @deprecated 兼容旧调用名 */
function buildDaily(pool, seed, opts) {
  return buildDailyLocal(pool, seed, DAILY_SIZE, opts)
}

function dailyRefreshStoreKey(today = dateKey()) {
  return `lemon-mix-daily-refresh:${userKey()}:${today}`
}

function readDailyRefreshMeta(today = dateKey()) {
  const raw = readPersist(dailyRefreshStoreKey(today)) || {}
  const used = Math.max(0, Math.min(DAILY_REFRESH_MAX, Number(raw.used) || 0))
  const historyKeys = Array.isArray(raw.historyKeys) ? raw.historyKeys.map(String).filter(Boolean) : []
  return {
    used,
    warned: Boolean(raw.warned),
    historyKeys: historyKeys.slice(-240),
  }
}

function writeDailyRefreshMeta(meta, today = dateKey()) {
  const used = Math.max(0, Math.min(DAILY_REFRESH_MAX, Number(meta.used) || 0))
  persist(dailyRefreshStoreKey(today), {
    used,
    warned: Boolean(meta.warned),
    historyKeys: (meta.historyKeys || []).slice(-240),
    at: Date.now(),
  })
  syncDailyRefreshUi(used)
}

function syncDailyRefreshUi(used = readDailyRefreshMeta().used) {
  dailyRefreshUi.value = {
    ...dailyRefreshUi.value,
    used,
    remaining: Math.max(0, DAILY_REFRESH_MAX - used),
  }
}

/** 换一批前检查：是否用尽、是否要弹「一天 20 次」说明 */
export function peekDailyRefreshGate() {
  const meta = readDailyRefreshMeta()
  const remaining = Math.max(0, DAILY_REFRESH_MAX - meta.used)
  return {
    used: meta.used,
    remaining,
    exhausted: remaining <= 0,
    /** 第二次换一批时提示一次 */
    needQuotaTip: meta.used === 1 && !meta.warned,
  }
}

export function markDailyRefreshWarned() {
  const meta = readDailyRefreshMeta()
  meta.warned = true
  writeDailyRefreshMeta(meta)
}

/**
 * 强制生成一批新的每日推荐（计入当日刷新次数）。
 * @returns {{ ok: boolean, reason?: string, remaining: number, tracks: any[] }}
 */
export async function regenerateDailyMix() {
  const today = dateKey()
  const meta = readDailyRefreshMeta(today)
  const remaining = Math.max(0, DAILY_REFRESH_MAX - meta.used)
  if (remaining <= 0) {
    syncDailyRefreshUi(meta.used)
    return { ok: false, reason: 'exhausted', remaining: 0, tracks: dailyMix.value.tracks || [] }
  }

  dailyRefreshUi.value = { ...dailyRefreshUi.value, busy: true }
  try {
    const extra = await fetchExtraPool()
    const pool = mergePool(extra)
    const excludeKeys = new Set(meta.historyKeys || [])
    for (const t of dailyMix.value.tracks || []) {
      const k = trackKey(t)
      if (k) excludeKeys.add(k)
    }
    const nextUsed = meta.used + 1
    const seed = `${today}-r${nextUsed}-${hashSeed(`${today}:${nextUsed}:${Date.now()}`)}`
    let tracks = await composeDailyMix(pool, seed, { excludeKeys })
    if (tracks.length < 8) {
      tracks = await composeDailyMix(pool, `${seed}-relax`, { excludeKeys: new Set() })
    }
    if (!tracks.length) {
      return { ok: false, reason: 'empty', remaining, tracks: dailyMix.value.tracks || [] }
    }

    const nextHistory = [...excludeKeys, ...tracks.map(trackKey)].map(String).filter(Boolean)
    writeDailyRefreshMeta({
      used: nextUsed,
      warned: meta.warned || nextUsed >= 2,
      historyKeys: nextHistory,
    }, today)

    const { m, day } = todayParts()
    const dailyStoreKey = `lemon-mix-daily:${userKey()}:${today}`
    persistDailyTracks(dailyStoreKey, tracks, { refresh: nextUsed })
    const savedPl = customPlaylists.value.find((p) => p.id === `mix_daily_${today}`)
    dailyMix.value = {
      dateKey: today,
      title: '每日推荐',
      dateLabel: `${m}月 ${day} 日`,
      tracks,
      count: tracks.length,
      durationText: formatDurationSum(tracks),
      themeText: tracks.length ? themeLine(tracks) : '',
      savedId: savedPl?.id || '',
      refreshUsed: nextUsed,
    }
    return {
      ok: true,
      remaining: Math.max(0, DAILY_REFRESH_MAX - nextUsed),
      tracks,
    }
  } finally {
    dailyRefreshUi.value = { ...dailyRefreshUi.value, busy: false }
  }
}

/** 磁盘文件删除后，立刻从每日推荐/推荐歌单卡片里去掉对应本地曲 */
export function pruneMixLocalTracks(filePaths) {
  const raw = (filePaths || []).filter(Boolean).map(String)
  if (!raw.length) return 0
  const goneKeys = new Set()
  const goneNorm = new Set(raw.map((p) => p.replace(/\\/g, '/').toLowerCase()))
  for (const p of raw) {
    goneKeys.add(`local:${p}`)
    goneKeys.add(`local:${p.replace(/\\/g, '/')}`)
  }
  const isGone = (t) => {
    const k = trackKey(t)
    if (k && goneKeys.has(k)) return true
    const fp = String(t?.filePath || t?.localPath || '')
    if (!fp) return false
    if (raw.includes(fp)) return true
    return goneNorm.has(fp.replace(/\\/g, '/').toLowerCase())
  }
  let n = 0
  if (dailyMix.value?.tracks?.length) {
    const before = dailyMix.value.tracks.length
    const tracks = dailyMix.value.tracks.filter((t) => !isGone(t))
    n += before - tracks.length
    if (tracks.length !== before) {
      dailyMix.value = {
        ...dailyMix.value,
        tracks,
        count: tracks.length,
        durationText: formatDurationSum(tracks),
        themeText: tracks.length ? themeLine(tracks) : '',
      }
      if (dailyMix.value.dateKey) {
        persist(`lemon-mix-daily:${userKey()}:${dailyMix.value.dateKey}`, {
          keys: tracks.map(trackKey),
          at: Date.now(),
        })
      }
    }
  }
  if (recoPlaylists.value?.length) {
    recoPlaylists.value = recoPlaylists.value.map((card) => {
      if (card?.network || !card?.tracks?.length) return card
      const before = card.tracks.length
      const tracks = card.tracks.filter((t) => !isGone(t))
      if (tracks.length === before) return card
      n += before - tracks.length
      return {
        ...card,
        tracks,
        count: tracks.length,
        durationText: formatDurationSum(tracks),
      }
    })
  }
  return n
}

function buildThemed(pool, size, seed, pred) {
  const matched = pool.filter(pred)
  const base = matched.length >= Math.min(8, size) ? matched : pool
  return shufflePick(base, size, seed)
}

function nightTextBlob(t) {
  return blob(t)
}

function isNightExcludeTrack(t) {
  const text = nightTextBlob(t)
  if (NIGHT_EXCLUDE_RE.test(text)) return true
  if (REMIX_RE.test(String(t?.name || ''))) return true
  return false
}

/** 越高越适合深夜：明确轻柔标签 > 华语抒情弱信号；排除躁动曲 */
function nightScore(t) {
  if (!t || isNightExcludeTrack(t)) return -100
  const text = nightTextBlob(t)
  let score = 0
  if (NIGHT_RE.test(text)) score += 8
  if (/轻音乐|舒缓|助眠|纯音乐|piano|ambient|chill|lo-?fi|lullaby|relax|sleep/i.test(text)) score += 6
  if (/抒情|民谣|情歌|acoustic|ballad|folk/i.test(text)) score += 3
  if (isMandarinTrack(t)) score += 1
  // 过短/过长都略降权（片头彩蛋、超长电台）
  const dur = Number(t.duration || t.interval || 0)
  if (dur > 0 && dur < 60) score -= 2
  if (dur > 600) score -= 1
  return score
}

/**
 * 深夜电台：以轻音乐 / 舒缓曲为主，强过滤劲爆/电音/摇滚等。
 * 匹配不足时，从非排除曲里按分数取，绝不回退到整库随机硬曲。
 */
function buildNightMix(pool, size, seed) {
  const scored = []
  for (const t of pool || []) {
    const s = nightScore(t)
    if (s < 0) continue
    scored.push({ t, s })
  }
  scored.sort((a, b) => b.s - a.s || 0)
  const strong = scored.filter((x) => x.s >= 8).map((x) => x.t)
  const soft = scored.filter((x) => x.s >= 3).map((x) => x.t)
  const anyOk = scored.map((x) => x.t)

  let base = strong
  if (base.length < Math.min(10, size)) base = soft.length >= Math.min(8, size) ? soft : anyOk
  if (!base.length) return []

  // 高分段多取一些再打乱，避免每天只剩同一批「标签最全」的歌
  const prefer = shufflePick(base.slice(0, Math.min(base.length, size * 3)), size, seed)
  if (prefer.length >= Math.min(8, size)) return prefer
  const used = new Set(prefer.map(trackKey))
  const rest = shufflePick(
    anyOk.filter((t) => !used.has(trackKey(t))),
    size - prefer.length,
    `${seed}-rest`,
  )
  return [...prefer, ...rest].slice(0, size)
}

function summarizeNet(item) {
  if (!item?.id) return null
  return {
    source: item.source || '',
    id: String(item.id),
    name: cleanText(item.name || '') || '网络歌单',
    img: item.img || '',
    total: Number(item.total) || 0,
    author: cleanText(item.author || ''),
  }
}

function pickNetPlaylist(list, seed, pred, excludeId = '', { strict = false } = {}) {
  const unused = list.filter(p => p?.id && String(p.id) !== String(excludeId))
  const matched = pred ? unused.filter(p => pred(`${p.name || ''} ${p.desc || ''}`)) : unused
  const pool = matched.length ? matched : (strict ? [] : unused)
  if (!pool.length) return null
  return summarizeNet(shufflePick(pool, 1, seed)[0])
}

async function fetchRecommendPage(source, sort) {
  const res = await api.playlist.recommend(source, sort, 1, 30)
  return res?.data?.list || []
}

async function pickDailyNetworkPlaylists({ force = false, today, uid } = {}) {
  const storeKey = `lemon-mix-net-v2:${uid}:${today}`
  if (!force) {
    const cached = readPersist(storeKey)
    if (cached?.source && (cached.hot?.id || cached.car?.id || cached.night?.id)) return cached
  }
  try {
    await loadDiscoverSources(api)
    const source = discoverState.activeSource || Object.keys(discoverState.sources || {})[0] || ''
    if (!source) return null
    let list = []
    try {
      list = await fetchRecommendPage(source, 'hot')
    } catch {}
    if (!list.length) {
      try { list = await fetchRecommendPage(source, 'new') } catch {}
    }
    if (!list.length) return null
    const hot = pickNetPlaylist(list, `${today}-net-hot`, t => NET_HOT_RE.test(t))
    // 深夜必须命中轻柔向歌单名，避免回退成热歌/劲爆单
    const night = pickNetPlaylist(
      list,
      `${today}-net-night`,
      t => NET_NIGHT_RE.test(t),
      hot?.id,
      { strict: true },
    )
    const car = pickNetPlaylist(
      list,
      `${today}-net-car`,
      t => NET_CAR_RE.test(t),
      night?.id || hot?.id,
    )
    if (!hot && !car && !night) return null
    const picked = { source, hot, car, night, at: Date.now() }
    persist(storeKey, picked)
    return picked
  } catch {
    return null
  }
}

export async function loadNetworkPlaylistTracks(card) {
  const n = card?.network
  if (!n?.id || !n?.source) return []
  const res = await api.playlist.fetch(n.id, n.source, { partial: true })
  const data = res?.data || {}
  let list = (data.list || []).map(t => cleanTrackItem({ ...t, source: t.source || n.source }))
  if (data.hasMore) {
    try {
      const full = await api.playlist.fetch(n.id, n.source)
      const more = (full?.data?.list || []).map(t => cleanTrackItem({ ...t, source: t.source || n.source }))
      if (more.length > list.length) list = more
    } catch {}
  }
  return list.filter(t => t?.name)
}

export const dailyMixDesc = computed(() => {
  const mix = dailyMix.value
  const left = dailyRefreshUi.value.remaining
  const tracks = mix.tracks || []
  const onlineN = tracks.filter((t) => !isLocalLikeTrack(t)).length
  const localN = tracks.length - onlineN
  if (!mix.count) {
    return '本地与激活音源平台约各一半。未激活音源或平台时则主要用本地曲库。'
  }
  const bits = [`共 ${mix.count} 首`]
  if (localN || onlineN) bits.push(`本地 ${localN} / 平台 ${onlineN}`)
  if (mix.durationText) bits.push(mix.durationText)
  if (mix.themeText) bits.push(mix.themeText)
  bits.push(`今日还可换 ${left} 次`)
  return `本地与平台约各一半生成，${bits.join('，')}。`
})

export async function refreshLibraryMix({ force = false } = {}) {
  mixLoading.value = true
  try {
    const today = dateKey()
    const uid = userKey()
    const [extra, netPicks] = await Promise.all([
      fetchExtraPool(),
      pickDailyNetworkPlaylists({ force, today, uid }),
    ])
    const pool = mergePool(extra)
    const week = weekKey()
    const { m, day } = todayParts()

    const dailyStoreKey = `lemon-mix-daily:${uid}:${today}`
    const refreshMeta = readDailyRefreshMeta(today)
    syncDailyRefreshUi(refreshMeta.used)
    const savedDaily = !force ? readPersist(dailyStoreKey) : null
    let tracks = resolvePersistedDaily(savedDaily, pool)
    const legacyLocalOnly = Boolean(savedDaily)
      && !savedDaily.mixedHalf
      && !(savedDaily.snapshots || []).some((s) => s?.source && s.source !== 'local')
    if (tracks.length < 8 || legacyLocalOnly) {
      const excludeKeys = new Set(refreshMeta.historyKeys || [])
      tracks = await composeDailyMix(pool, `${today}-init`, { excludeKeys })
      persistDailyTracks(dailyStoreKey, tracks, { refresh: refreshMeta.used, mixedHalf: true })
    }
    const savedPl = customPlaylists.value.find(p => p.id === `mix_daily_${today}`)
    dailyMix.value = {
      dateKey: today,
      title: '每日推荐',
      dateLabel: `${m}月 ${day} 日`,
      tracks,
      count: tracks.length,
      durationText: formatDurationSum(tracks),
      themeText: tracks.length ? themeLine(tracks) : '',
      savedId: savedPl?.id || '',
      refreshUsed: refreshMeta.used,
    }

    const hotKey = `lemon-mix-hot:${uid}:${week}`
    const carKey = `lemon-mix-car:${uid}:${week}`
    const nightOn = isNightWindow()
    // v2：轻柔舒缓向，避开旧版可能混入的躁动曲缓存
    const nightKey = `lemon-mix-night-v2:${uid}:${today}`

    const restore = (storeKey, builder) => {
      const cached = !force ? readPersist(storeKey) : null
      let list = cached?.keys?.length ? resolveByKeys(cached.keys, pool) : []
      if (!list.length) {
        list = builder()
        persist(storeKey, { keys: list.map(trackKey), at: Date.now() })
      }
      return list
    }

    const hot = restore(hotKey, () => buildThemed(pool, HOT_SIZE, `${week}-hot`, isMandarinTrack))
    const car = restore(carKey, () => buildThemed(pool, CAR_SIZE, `${week}-car`, t => CAR_RE.test(blob(t))))
    let night = []
    if (nightOn) {
      night = restore(nightKey, () => buildNightMix(pool, NIGHT_SIZE, `${today}-night-soft`))
    }

    const netHot = netPicks?.hot || null
    const netCar = netPicks?.car || null
    const netNight = netPicks?.night || null

    recoPlaylists.value = [
      {
        id: 'mix-hot',
        name: '华语热歌榜',
        subtitle: netHot
          ? `今日 · ${netHot.name}${netHot.total ? ` · ${netHot.total} 首` : ''}`
          : (hot.length ? `本周更新 · ${hot.length} 首` : '本周更新 · 从华语曲目中挑选'),
        tone: 'orange',
        icon: 'flame',
        locked: false,
        tracks: hot,
        network: netHot,
      },
      {
        id: 'mix-night',
        name: '深夜电台',
        subtitle: nightOn
          ? (netNight
            ? `轻柔夜听 · ${netNight.name}${netNight.total ? ` · ${netNight.total} 首` : ''}`
            : (night.length ? `轻音乐 / 舒缓 · ${night.length} 首` : '曲库暂少轻柔曲，可先听网络轻音乐歌单'))
          : '晚间 22:00 后解锁 · 轻音乐与舒缓曲',
        tone: 'purple',
        icon: 'night',
        locked: !nightOn,
        tracks: night,
        network: netNight,
      },
      {
        id: 'mix-car',
        name: '车载慢摇',
        subtitle: netCar
          ? `今日 · ${netCar.name}${netCar.total ? ` · ${netCar.total} 首` : ''}`
          : (car.length ? `${car.length} 首 · 节奏舒缓` : '60 首 · 节奏舒缓'),
        tone: 'green',
        icon: 'car',
        locked: false,
        tracks: car,
        network: netCar,
      },
    ]
  } finally {
    mixLoading.value = false
  }
}

export function saveDailyMixPlaylist() {
  const mix = dailyMix.value
  if (!mix.tracks.length) return null
  const id = `mix_daily_${mix.dateKey}`
  const name = `每日推荐 · ${mix.dateLabel.replace(/\s/g, '')}`
  let pl = customPlaylists.value.find(p => p.id === id)
  if (!pl) {
    pl = createPlaylist(name, { id, playlistType: 'generated' })
  }
  if (!pl) return null
  addTracksToPlaylist(pl.id, mix.tracks)
  dailyMix.value = { ...mix, savedId: pl.id }
  return pl
}
