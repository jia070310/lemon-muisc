import { computed, ref } from 'vue'
import { currentUser } from '../utils/auth.js'
import { api } from '../api.js'
import { cleanText, cleanTrackItem } from '../utils/text.js'
import { discoverState, loadDiscoverSources } from './discover.js'
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
const HOT_SIZE = 100
const CAR_SIZE = 60
const NIGHT_SIZE = 40

const CJK = /[\u4e00-\u9fff]/
const MANDARIN_RE = /华语|国语|普通话|mandarin|c-pop|cpop|chinese|中文/i
const NIGHT_RE = /抒情|民谣|轻音乐|ballad|r&b|rnb|jazz|soul|lounge|chill|ambient|slow|lullaby|piano|acoustic/i
const CAR_RE = /慢摇|节奏|groove|funk|soul|lounge|house|disco|chill|r&b|rnb|reggae|groove/i
const REMIX_RE = /remix|混音|edit|club/i
const NET_HOT_RE = /华语|国语|热歌|流行|榜|热门|精选|推荐|中文/i
const NET_CAR_RE = /慢摇|车载|dj|电音|节奏|夜店|舞曲|remix|酒吧|蹦迪|劲爆|嗨曲|disco/i

export const dailyMix = ref(emptyMix())
export const recoPlaylists = ref([])
export const mixLoading = ref(false)

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

function buildDaily(pool, seed) {
  const libraryKeys = new Set(pool.map(trackKey).filter(Boolean))
  const fav = favorites.value
    .map(fromSnapshot)
    .filter((t) => trackKey(t) && !isGhostLocalTrack(t, libraryKeys))
  const recent = recentPlays.value
    .map(fromSnapshot)
    .filter((t) => trackKey(t) && !isGhostLocalTrack(t, libraryKeys))
  const favPick = shufflePick(fav, 12, `${seed}-fav`)
  const recentPick = shufflePick(recent.filter(t => !favPick.some(f => trackKey(f) === trackKey(t))), 10, `${seed}-recent`)
  const used = new Set([...favPick, ...recentPick].map(trackKey))
  const similarGenres = new Set(favPick.concat(recentPick).flatMap(genreTags))
  const fillPool = pool.filter((t) => {
    const k = trackKey(t)
    if (!k || used.has(k)) return false
    if (!similarGenres.size) return true
    return genreTags(t).some(g => similarGenres.has(g)) || isMandarinTrack(t)
  })
  const fill = shufflePick(fillPool.length ? fillPool : pool.filter(t => !used.has(trackKey(t))), DAILY_SIZE, `${seed}-fill`)
  const mixed = []
  const seen = new Set()
  for (const t of [...favPick, ...recentPick, ...fill]) {
    const k = trackKey(t)
    if (!k || seen.has(k)) continue
    seen.add(k)
    mixed.push(t)
    if (mixed.length >= DAILY_SIZE) break
  }
  return mixed
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

function pickNetPlaylist(list, seed, pred, excludeId = '') {
  const unused = list.filter(p => p?.id && String(p.id) !== String(excludeId))
  const matched = pred ? unused.filter(p => pred(`${p.name || ''} ${p.desc || ''}`)) : unused
  const pool = matched.length ? matched : unused
  return summarizeNet(shufflePick(pool, 1, seed)[0])
}

async function fetchRecommendPage(source, sort) {
  const res = await api.playlist.recommend(source, sort, 1, 30)
  return res?.data?.list || []
}

async function pickDailyNetworkPlaylists({ force = false, today, uid } = {}) {
  const storeKey = `lemon-mix-net:${uid}:${today}`
  if (!force) {
    const cached = readPersist(storeKey)
    if (cached?.source && (cached.hot?.id || cached.car?.id)) return cached
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
    const car = pickNetPlaylist(list, `${today}-net-car`, t => NET_CAR_RE.test(t), hot?.id)
    if (!hot && !car) return null
    const picked = { source, hot, car, at: Date.now() }
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
  if (!mix.count) return '根据你的收藏与最近播放生成。音乐库曲目更多后会更准。'
  const bits = [`共 ${mix.count} 首`]
  if (mix.durationText) bits.push(mix.durationText)
  if (mix.themeText) bits.push(mix.themeText)
  return `根据你的收藏与最近播放生成，${bits.join('，')}。`
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
    const savedDaily = !force ? readPersist(dailyStoreKey) : null
    let tracks = savedDaily?.keys?.length ? resolveByKeys(savedDaily.keys, pool) : []
    if (tracks.length < 8) tracks = buildDaily(pool, today)
    persist(dailyStoreKey, { keys: tracks.map(trackKey), at: Date.now() })
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
    }

    const hotKey = `lemon-mix-hot:${uid}:${week}`
    const carKey = `lemon-mix-car:${uid}:${week}`
    const nightOn = isNightWindow()
    const nightKey = `lemon-mix-night:${uid}:${today}`

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
    if (nightOn) night = restore(nightKey, () => buildThemed(pool, NIGHT_SIZE, `${today}-night`, t => NIGHT_RE.test(blob(t))))

    const netHot = netPicks?.hot || null
    const netCar = netPicks?.car || null

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
          ? (night.length ? `今晚精选 · ${night.length} 首` : '晚间 22:00 后播放生成')
          : '晚间 22:00 后播放生成',
        tone: 'purple',
        icon: 'night',
        locked: !nightOn,
        tracks: night,
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
  addTracksToPlaylist(pl.id, mix.tracks, 'local')
  dailyMix.value = { ...mix, savedId: pl.id }
  return pl
}
