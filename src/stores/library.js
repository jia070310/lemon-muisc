import { ref, computed } from 'vue'

const FAVORITES_KEY = 'lemon-library-favorites'
const RECENT_KEY = 'lemon-library-recent'
const PLAYLISTS_KEY = 'lemon-library-playlists'
const RECENT_LIMIT = 200
const SESSION_TRACKS_KEY = 'lemon-library-tracks-v1'
const SESSION_TRACKS_LIMIT = 8000
const coverVersions = new Map()

export const libraryTracks = ref([])
export const libraryLoading = ref(false)
export const libraryMetaLoading = ref(false)
export const libraryScanned = ref(false)
export const libraryLoadProgress = ref('')
export const libraryScanPhase = ref('')
export const libraryScanCurrent = ref(0)
export const libraryScanTotal = ref(0)

export const libraryScanning = computed(() => libraryLoading.value || libraryMetaLoading.value)

export const libraryScanPercent = computed(() => {
  if (libraryScanPhase.value === 'tags' && libraryScanTotal.value > 0) {
    return Math.min(100, Math.round((libraryScanCurrent.value / libraryScanTotal.value) * 100))
  }
  const phaseWeight = { prepare: 10, cache: 22, sync: 38 }
  return phaseWeight[libraryScanPhase.value] || (libraryScanning.value ? 8 : 0)
})

function resetScanProgress() {
  libraryScanPhase.value = ''
  libraryScanCurrent.value = 0
  libraryScanTotal.value = 0
  libraryLoadProgress.value = ''
}

function setScanProgress(phase, { current = 0, total = 0, text = '' } = {}) {
  libraryScanPhase.value = phase
  libraryScanCurrent.value = current
  libraryScanTotal.value = total
  libraryLoadProgress.value = text
}

function loadSessionTracks() {
  try {
    const raw = sessionStorage.getItem(SESSION_TRACKS_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!Array.isArray(data) || !data.length) return null
    return data.map((file) => fileToLibraryTrack({
      ...file,
      filePath: file.filePath || file.localPath,
    }))
  } catch {
    return null
  }
}

function saveSessionTracks(tracks) {
  try {
    const slim = (tracks || []).slice(0, SESSION_TRACKS_LIMIT).map((t) => ({
      filePath: t.filePath || t.localPath,
      localPath: t.localPath || t.filePath,
      title: t.name,
      artist: t.singer,
      album: t.album,
      picUrl: t.picUrl || t.img || '',
      hasPicture: t.hasPicture,
      mtime: t.mtime || 0,
      year: t.year || '',
      genre: t.genre || '',
      format: t.format || '',
      duration: t.duration || 0,
      track: t.trackNo || '',
    }))
    sessionStorage.setItem(SESSION_TRACKS_KEY, JSON.stringify(slim))
  } catch {}
}

/** 从搜索/发现页挑选歌曲加入歌单时设置 */
export const playlistPickTarget = ref(null)

export const SMART_PLAYLIST_IDS = new Set(['recent-added', 'recent-played', 'favorites'])

/** 固定渐变图标样式，不使用歌曲封面 */
export const GRADIENT_CARD_IDS = new Set(['recent-added', 'recent-played'])

export const SMART_CARDS = [
  {
    id: 'recent-added',
    name: '最新添加',
    gradient: 'linear-gradient(135deg, #6b7280 0%, #374151 100%)',
    icon: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  },
  {
    id: 'favorites',
    name: '收藏',
    gradient: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
    icon: '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
  },
  {
    id: 'recent-played',
    name: '最近播放',
    gradient: 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)',
    icon: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
  },
]

const CUSTOM_GRADIENT = 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
const CUSTOM_ICON = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

function persistPlaylists() {
  writeJson(PLAYLISTS_KEY, customPlaylists.value)
  scheduleUserDataPersist()
}

function persistFavorites() {
  writeJson(FAVORITES_KEY, favorites.value)
  scheduleUserDataPersist()
}

function persistRecent() {
  writeJson(RECENT_KEY, recentPlays.value)
  scheduleUserDataPersist()
}

let libraryApi = null
let userDataSyncReady = false
let skipNextUserDataPersist = false
let userDataPersistTimer = null
let pendingUserDataPersist = false

function hasItems(list) {
  return Array.isArray(list) && list.length > 0
}

function applyRemoteUserData({ playlists, favorites: favs, recentPlays: recent } = {}) {
  skipNextUserDataPersist = true
  if (Array.isArray(playlists)) {
    customPlaylists.value = playlists.map(normalizePlaylist)
    writeJson(PLAYLISTS_KEY, customPlaylists.value)
  }
  if (Array.isArray(favs)) {
    favorites.value = favs
    writeJson(FAVORITES_KEY, favs)
  }
  if (Array.isArray(recent)) {
    recentPlays.value = recent
    writeJson(RECENT_KEY, recent)
  }
}

function scheduleUserDataPersist() {
  if (!libraryApi || !userDataSyncReady) {
    pendingUserDataPersist = true
    return
  }
  if (skipNextUserDataPersist) {
    skipNextUserDataPersist = false
    return
  }
  if (userDataPersistTimer) clearTimeout(userDataPersistTimer)
  userDataPersistTimer = setTimeout(async () => {
    userDataPersistTimer = null
    try {
      await libraryApi.library.userData.save({
        playlists: customPlaylists.value,
        favorites: favorites.value,
        recentPlays: recentPlays.value,
      })
    } catch {}
  }, 450)
}

function flushPendingUserDataPersist() {
  if (!pendingUserDataPersist) return
  pendingUserDataPersist = false
  scheduleUserDataPersist()
}

/** 从服务端加载歌单、收藏、最近播放；本地仅有数据时自动上传迁移 */
export async function initLibraryUserData(api) {
  libraryApi = api
  try {
    const res = await api.library.userData.get()
    const data = res.data || {}
    const serverPl = (data.playlists || []).map(normalizePlaylist)
    const serverFav = data.favorites || []
    const serverRecent = data.recentPlays || []

    const localPl = readJson(PLAYLISTS_KEY, []).map(normalizePlaylist)
    const localFav = readJson(FAVORITES_KEY, [])
    const localRecent = readJson(RECENT_KEY, [])

    if (hasItems(serverPl)) {
      customPlaylists.value = serverPl
      writeJson(PLAYLISTS_KEY, serverPl)
    } else if (hasItems(localPl)) {
      customPlaylists.value = localPl
    }

    if (hasItems(serverFav)) {
      favorites.value = serverFav
      writeJson(FAVORITES_KEY, serverFav)
    } else if (hasItems(localFav)) {
      favorites.value = localFav
    }

    if (hasItems(serverRecent)) {
      recentPlays.value = serverRecent
      writeJson(RECENT_KEY, serverRecent)
    } else if (hasItems(localRecent)) {
      recentPlays.value = localRecent
    }

    const needUpload = (
      (!hasItems(serverPl) && hasItems(localPl))
      || (!hasItems(serverFav) && hasItems(localFav))
      || (!hasItems(serverRecent) && hasItems(localRecent))
    )
    if (needUpload) {
      skipNextUserDataPersist = true
      await api.library.userData.save({
        playlists: customPlaylists.value,
        favorites: favorites.value,
        recentPlays: recentPlays.value,
      })
    }
  } catch {
    customPlaylists.value = readJson(PLAYLISTS_KEY, []).map(normalizePlaylist)
    favorites.value = readJson(FAVORITES_KEY, [])
    recentPlays.value = readJson(RECENT_KEY, [])
  } finally {
    userDataSyncReady = true
    flushPendingUserDataPersist()
  }
}

export async function reloadLibraryUserData() {
  if (!libraryApi) return
  try {
    const res = await libraryApi.library.userData.get()
    applyRemoteUserData(res.data || {})
  } catch {}
}

/** @deprecated 使用 initLibraryUserData */
export const initLibraryPlaylists = initLibraryUserData

/** @deprecated 使用 reloadLibraryUserData */
export const reloadLibraryPlaylists = reloadLibraryUserData

function normalizePlaylist(pl) {
  return {
    ...pl,
    trackKeys: Array.isArray(pl.trackKeys) ? pl.trackKeys : [],
    trackSnapshots: pl.trackSnapshots && typeof pl.trackSnapshots === 'object' ? pl.trackSnapshots : {},
    coverUrl: pl.coverUrl || '',
    coverMode: pl.coverMode === 'custom' ? 'custom' : 'auto',
  }
}

export function getLibraryTrackKey(track) {
  if (!track) return ''
  if (track.key) return track.key
  if (track.localPath) return `local:${track.localPath}`
  const id = track.songId ?? track.songmid ?? track.hash ?? track.copyrightId ?? track.id
  const source = track.source || ''
  return id ? `${source}:${id}` : ''
}

export const favorites = ref(readJson(FAVORITES_KEY, []))
export const recentPlays = ref(readJson(RECENT_KEY, []))
export const customPlaylists = ref(readJson(PLAYLISTS_KEY, []).map(normalizePlaylist))

export const favoriteKeys = computed(() => new Set(favorites.value.map(f => f.key)))

export function trackToSnapshot(track, sourceOverride) {
  const key = getLibraryTrackKey(track)
  if (!key) return null
  const source = sourceOverride || track.source || (track.localPath ? 'local' : '')
  return {
    key,
    name: track.name || '',
    singer: track.singer || track.artist || '',
    album: track.album || track.albumName || '',
    localPath: track.localPath || track.filePath || '',
    source,
    picUrl: track.picUrl || track.img || '',
    hasPicture: Boolean(track.hasPicture || track.picUrl || track.img),
    songId: track.songId ?? track.id,
    songmid: track.songmid,
    hash: track.hash,
    copyrightId: track.copyrightId,
    albumAudioId: track.albumAudioId,
    duration: track.duration || track.interval || '',
    year: track.year || '',
    genre: track.genre || '',
    format: track.format || '',
    lyric: track.lyric || '',
    interval: track.interval || '',
    types: track.types,
    qualitys: track.qualitys,
    savedAt: Date.now(),
  }
}

export function snapshotToPlayTrack(snapshot, sourceOverride) {
  const source = sourceOverride || snapshot.source || (snapshot.localPath ? 'local' : '')
  return {
    id: snapshot.songId || snapshot.songmid || snapshot.hash || snapshot.copyrightId || snapshot.key,
    songId: snapshot.songId,
    songmid: snapshot.songmid,
    hash: snapshot.hash,
    copyrightId: snapshot.copyrightId,
    albumAudioId: snapshot.albumAudioId,
    name: snapshot.name,
    singer: snapshot.singer,
    album: snapshot.album,
    localPath: snapshot.localPath,
    source,
    picUrl: snapshot.picUrl,
    lyric: snapshot.lyric,
    interval: snapshot.interval,
    types: snapshot.types,
    qualitys: snapshot.qualitys,
  }
}

export function isFavorite(track) {
  const key = getLibraryTrackKey(track)
  return key ? favoriteKeys.value.has(key) : false
}

export function toggleFavorite(track) {
  const snapshot = trackToSnapshot(track)
  if (!snapshot) return false
  const list = [...favorites.value]
  const idx = list.findIndex(f => f.key === snapshot.key)
  if (idx >= 0) list.splice(idx, 1)
  else list.unshift(snapshot)
  favorites.value = list
  persistFavorites()
  return idx < 0
}

export function recordRecentPlay(track) {
  const snapshot = trackToSnapshot(track)
  if (!snapshot) return
  snapshot.playedAt = Date.now()
  const list = [snapshot, ...recentPlays.value.filter(r => r.key !== snapshot.key)].slice(0, RECENT_LIMIT)
  recentPlays.value = list
  persistRecent()
}

export function getPlaylistCover(playlist, tracks = []) {
  if (playlist?.coverMode === 'custom' && playlist.coverUrl) return playlist.coverUrl
  const first = tracks.find(t => t?.picUrl)
  return first?.picUrl || ''
}

export function bumpLibraryCoverVersion(filePath) {
  if (filePath) coverVersions.set(filePath, Date.now())
}

export function localCoverUrl(filePath) {
  if (!filePath) return ''
  const v = coverVersions.get(filePath)
  const q = `path=${encodeURIComponent(filePath)}`
  return v ? `/api/tag/cover?${q}&v=${v}` : `/api/tag/cover?${q}`
}

function enrichLocalCover(track) {
  if (!track?.localPath || track.picUrl) return track
  if (track.hasPicture === false) return track
  const url = localCoverUrl(track.localPath)
  return { ...track, picUrl: url, img: url }
}

export function resolvePlaylistTracks(playlist, allTracks) {
  if (!playlist) return []
  const map = new Map(allTracks.map(t => [getLibraryTrackKey(t), t]))
  const snapshots = playlist.trackSnapshots || {}
  return (playlist.trackKeys || []).map((k) => {
    if (map.has(k)) return enrichLocalCover(map.get(k))
    const snap = snapshots[k]
    if (!snap) return null
    return enrichLocalCover({
      ...snap,
      key: k,
      singer: snap.singer || '未知艺术家',
      album: snap.album || '未知专辑',
    })
  }).filter(Boolean)
}

export function buildPlaylistCards(allTracks, { limit } = {}) {
  const recentAdded = [...allTracks].sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
  const smart = SMART_CARDS.map(card => {
    let tracks = []
    if (card.id === 'recent-added') tracks = recentAdded
    else if (card.id === 'recent-played') tracks = resolveTracksByKeys(recentPlays.value.map(r => r.key), allTracks, recentPlays.value)
    else if (card.id === 'favorites') tracks = resolveTracksByKeys(favorites.value.map(f => f.key), allTracks, favorites.value)
    const useGradientStyle = GRADIENT_CARD_IDS.has(card.id)
    const coverUrl = useGradientStyle ? '' : getPlaylistCover({ coverMode: 'auto' }, tracks)
    return {
      ...card,
      isSmart: true,
      coverStyle: useGradientStyle ? 'gradient' : 'cover',
      count: tracks.length,
      tracks,
      coverUrl,
    }
  })
  const custom = customPlaylists.value.map(pl => {
    const normalized = normalizePlaylist(pl)
    const tracks = resolvePlaylistTracks(normalized, allTracks)
    return {
      id: normalized.id,
      name: normalized.name,
      gradient: CUSTOM_GRADIENT,
      icon: CUSTOM_ICON,
      isSmart: false,
      coverStyle: 'cover',
      playlist: normalized,
      count: normalized.trackKeys.length,
      tracks,
      coverUrl: getPlaylistCover(normalized, tracks),
      coverMode: normalized.coverMode,
    }
  })
  const cards = [...smart, ...custom]
  return limit ? cards.slice(0, limit) : cards
}

export const PLAYLIST_SORT_OPTIONS = [
  { id: 'default', label: '默认' },
  { id: 'count', label: '歌曲数量' },
  { id: 'name', label: '名称' },
  { id: 'created', label: '创建时间' },
]

const SMART_CARD_ORDER = ['recent-added', 'favorites', 'recent-played']

function pinSmartPlaylistCards(cards) {
  const smartMap = new Map(cards.filter(c => c.isSmart).map(c => [c.id, c]))
  return SMART_CARD_ORDER.map(id => smartMap.get(id)).filter(Boolean)
}

export function sortPlaylistCards(cards, sortBy = 'default') {
  const smartSorted = pinSmartPlaylistCards(cards)
  const customSorted = [...cards.filter(c => !c.isSmart)]

  if (sortBy === 'count') {
    customSorted.sort((a, b) => (b.count || 0) - (a.count || 0)
      || String(a.name).localeCompare(String(b.name), 'zh-CN'))
  } else if (sortBy === 'name') {
    customSorted.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN'))
  } else if (sortBy === 'created') {
    customSorted.sort((a, b) => (b.playlist?.createdAt || 0) - (a.playlist?.createdAt || 0))
  }

  return [...smartSorted, ...customSorted]
}

export const ALBUM_SORT_OPTIONS = [
  { id: 'recent', label: '最近添加' },
  { id: 'count', label: '歌曲数量' },
  { id: 'name', label: '专辑名' },
  { id: 'artist', label: '艺术家' },
  { id: 'year', label: '年份' },
]

export const SONG_SORT_OPTIONS = [
  { id: 'recent', label: '最近添加' },
  { id: 'name', label: '歌名' },
  { id: 'artist', label: '歌手' },
  { id: 'album', label: '专辑' },
  { id: 'duration', label: '时长' },
]

export function sortAlbums(albums, sortBy = 'recent') {
  const list = [...albums]
  if (sortBy === 'count') {
    return list.sort((a, b) => (b.trackCount || 0) - (a.trackCount || 0)
      || String(a.name).localeCompare(String(b.name), 'zh-CN'))
  }
  if (sortBy === 'name') {
    return list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN'))
  }
  if (sortBy === 'artist') {
    return list.sort((a, b) => String(a.artist).localeCompare(String(b.artist), 'zh-CN')
      || String(a.name).localeCompare(String(b.name), 'zh-CN'))
  }
  if (sortBy === 'year') {
    return list.sort((a, b) => {
      const ya = parseInt(a.year, 10) || 0
      const yb = parseInt(b.year, 10) || 0
      return yb - ya || String(a.name).localeCompare(String(b.name), 'zh-CN')
    })
  }
  return list.sort((a, b) => (b.latestMtime || 0) - (a.latestMtime || 0))
}

export function sortLibrarySongs(tracks, sortBy = 'recent') {
  const list = [...tracks]
  if (sortBy === 'name') {
    return list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN'))
  }
  if (sortBy === 'artist') {
    return list.sort((a, b) => String(a.singer).localeCompare(String(b.singer), 'zh-CN')
      || String(a.name).localeCompare(String(b.name), 'zh-CN'))
  }
  if (sortBy === 'album') {
    return list.sort((a, b) => String(a.album).localeCompare(String(b.album), 'zh-CN')
      || String(a.name).localeCompare(String(b.name), 'zh-CN'))
  }
  if (sortBy === 'duration') {
    return list.sort((a, b) => (b.duration || 0) - (a.duration || 0)
      || String(a.name).localeCompare(String(b.name), 'zh-CN'))
  }
  return list.sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
}

export function createPlaylist(name, { coverUrl = '', coverMode = 'auto' } = {}) {
  const title = String(name || '').trim()
  if (!title) return null
  const item = normalizePlaylist({
    id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: title,
    createdAt: Date.now(),
    trackKeys: [],
    trackSnapshots: {},
    coverUrl: coverUrl || '',
    coverMode: coverMode === 'custom' && coverUrl ? 'custom' : 'auto',
  })
  const list = [item, ...customPlaylists.value]
  customPlaylists.value = list
  persistPlaylists()
  return item
}

export function updatePlaylist(id, patch) {
  const idx = customPlaylists.value.findIndex(p => p.id === id)
  if (idx < 0) return null
  const current = normalizePlaylist(customPlaylists.value[idx])
  const next = normalizePlaylist({
    ...current,
    ...patch,
    id: current.id,
    trackKeys: patch.trackKeys ?? current.trackKeys,
    trackSnapshots: patch.trackSnapshots ?? current.trackSnapshots,
    coverMode: patch.coverMode ?? current.coverMode,
    coverUrl: patch.coverUrl ?? current.coverUrl,
  })
  if (next.coverMode !== 'custom') next.coverUrl = next.coverUrl || ''
  const list = [...customPlaylists.value]
  list[idx] = next
  customPlaylists.value = list
  persistPlaylists()
  return next
}

export function deletePlaylist(id) {
  if (!id || SMART_PLAYLIST_IDS.has(id)) return false
  const idx = customPlaylists.value.findIndex(p => p.id === id)
  if (idx < 0) return false
  const list = [...customPlaylists.value]
  list.splice(idx, 1)
  customPlaylists.value = list
  persistPlaylists()
  if (playlistPickTarget.value?.id === id) {
    playlistPickTarget.value = null
  }
  return true
}

export function addTracksToPlaylist(playlistId, tracks, sourceOverride) {
  const idx = customPlaylists.value.findIndex(p => p.id === playlistId)
  if (idx < 0) return { added: 0, playlist: null }
  const pl = normalizePlaylist(customPlaylists.value[idx])
  const keys = [...pl.trackKeys]
  const snapshots = { ...pl.trackSnapshots }
  let added = 0
  for (const track of tracks) {
    const snap = trackToSnapshot(track, sourceOverride)
    if (!snap || keys.includes(snap.key)) continue
    keys.push(snap.key)
    if (!snap.localPath || !libraryTracks.value.some(t => getLibraryTrackKey(t) === snap.key)) {
      snapshots[snap.key] = snap
    }
    added++
  }
  const next = updatePlaylist(playlistId, { trackKeys: keys, trackSnapshots: snapshots })
  return { added, playlist: next }
}

export function removeTrackFromPlaylist(playlistId, trackKey) {
  const pl = customPlaylists.value.find(p => p.id === playlistId)
  if (!pl) return null
  const snapshots = { ...(pl.trackSnapshots || {}) }
  delete snapshots[trackKey]
  return updatePlaylist(playlistId, {
    trackKeys: (pl.trackKeys || []).filter(k => k !== trackKey),
    trackSnapshots: snapshots,
  })
}

export function getCustomPlaylist(id) {
  return customPlaylists.value.find(p => p.id === id) || null
}

export function isCustomPlaylist(id) {
  return !SMART_PLAYLIST_IDS.has(id)
}

export function startPlaylistPick(playlistId, playlistName = '') {
  const pl = getCustomPlaylist(playlistId)
  playlistPickTarget.value = {
    id: playlistId,
    name: playlistName || pl?.name || '歌单',
  }
}

export function stopPlaylistPick() {
  playlistPickTarget.value = null
}

export function addToPickingPlaylist(track, sourceOverride) {
  const target = playlistPickTarget.value
  if (!target?.id) return { ok: false, reason: 'no-target' }
  const res = addTracksToPlaylist(target.id, [track], sourceOverride)
  return { ok: res.added > 0, duplicate: res.added === 0, playlist: res.playlist }
}

export function resolveTracksByKeys(keys, allTracks, snapshots = []) {
  const map = new Map(allTracks.map(t => [getLibraryTrackKey(t), t]))
  const snapMap = new Map(snapshots.map(s => [s.key, s]))
  return keys.map((k) => {
    if (map.has(k)) return enrichLocalCover(map.get(k))
    const snap = snapMap.get(k)
    if (!snap) return null
    return enrichLocalCover({
      ...snap,
      key: k,
      singer: snap.singer || '未知艺术家',
      album: snap.album || '未知专辑',
    })
  }).filter(Boolean)
}

export function fileToLibraryTrack(file) {
  const picFromData = file.pictureBase64
    ? (String(file.pictureBase64).startsWith('data:')
      ? file.pictureBase64
      : `data:${file.pictureMime || 'image/jpeg'};base64,${file.pictureBase64}`)
    : ''
  const pic = picFromData || (file.filePath && file.hasPicture !== false ? localCoverUrl(file.filePath) : '')
  const ext = (file.filePath || '').match(/\.([^.]+)$/)?.[1] || ''
  const albumRaw = file.album || ''
  const name = file.title || file.parsedTitle || file.fileName
  const album = (albumRaw && albumRaw !== name) ? albumRaw : '未知专辑'
  return {
    key: `local:${file.filePath}`,
    filePath: file.filePath,
    localPath: file.filePath,
    name,
    singer: file.artist || file.parsedArtist || '未知艺术家',
    album: album || '未知专辑',
    source: 'local',
    picUrl: pic,
    img: pic,
    hasPicture: Boolean(file.hasPicture || pic),
    lyric: file.lyric || '',
    year: file.year || '',
    genre: file.genre || '',
    format: file.format || (ext ? ext.toUpperCase() : ''),
    duration: file.duration || 0,
    trackNo: file.track || '',
    mtime: file.mtime || 0,
  }
}

function sortTracksByMtime(tracks) {
  return [...tracks].sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
}

function mergeLibraryTracks(newTracks) {
  if (!newTracks?.length) return
  const map = new Map(libraryTracks.value.map(t => [t.filePath || t.localPath, t]))
  for (const t of newTracks) {
    const key = t.filePath || t.localPath
    if (key) map.set(key, t)
  }
  libraryTracks.value = sortTracksByMtime([...map.values()])
}

export function removeLibraryTracks(filePaths) {
  const removed = new Set((filePaths || []).filter(Boolean))
  if (!removed.size) return 0
  const before = libraryTracks.value.length
  libraryTracks.value = libraryTracks.value.filter(t => !removed.has(t.filePath) && !removed.has(t.localPath))
  return before - libraryTracks.value.length
}

let scanPromise = null

/** 扫描音乐库目录并读取标签（含封面地址、专辑等信息） */
export async function scanLibrary(api, { force = false, onError, onComplete } = {}) {
  if (scanPromise && !force) return scanPromise

  const run = async () => {
    if (libraryLoading.value || libraryMetaLoading.value) {
      if (!force) return null
    }
    if (libraryScanned.value && !force) return null

    libraryLoading.value = true
    libraryMetaLoading.value = false
    resetScanProgress()
    setScanProgress('prepare', { text: '读取目录' })

    let pendingCount = 0
    let tagScanned = 0

    try {
      const res = await api.paths.list()
      const dirs = res.musicPaths || res.data || []
      if (!dirs.length) {
        libraryTracks.value = []
        libraryScanned.value = true
        const result = { totalTracks: 0, scannedTags: 0, hadPending: false }
        onComplete?.(result, { force })
        return result
      }

      let showedCache = false
      if (!force) {
        const sessionTracks = loadSessionTracks()
        if (sessionTracks?.length) {
          libraryTracks.value = sortTracksByMtime(sessionTracks)
          libraryScanned.value = true
          showedCache = true
          libraryLoading.value = false
          libraryMetaLoading.value = true
          setScanProgress('cache', { text: '同步缓存' })
        }
        try {
          if (!showedCache) setScanProgress('cache', { text: '加载缓存' })
          const cachedRes = await api.library.tracks()
          const cachedList = cachedRes.data || []
          if (cachedList.length) {
            libraryTracks.value = sortTracksByMtime(cachedList.map(fileToLibraryTrack))
            libraryScanned.value = true
            showedCache = true
            libraryLoading.value = false
            libraryMetaLoading.value = true
            saveSessionTracks(libraryTracks.value)
          }
        } catch {}
      }

      setScanProgress('sync', { text: '比对文件' })
      const syncRes = await api.library.sync()
      const { cached = [], pending = [], removed = [] } = syncRes.data || {}
      pendingCount = pending.length

      if (removed.length) removeLibraryTracks(removed)

      if (cached.length) {
        mergeLibraryTracks(cached.map(fileToLibraryTrack))
      }

      if (pending.length) {
        mergeLibraryTracks(pending.map(f => fileToLibraryTrack(f)))
      } else if (!libraryTracks.value.length && !cached.length) {
        libraryTracks.value = []
      }

      libraryScanned.value = true
      libraryLoading.value = false

      if (pending.length) {
        libraryMetaLoading.value = true
        const chunk = 20
        setScanProgress('tags', { current: 0, total: pending.length, text: `读取标签 0/${pending.length}` })
        for (let i = 0; i < pending.length; i += chunk) {
          const done = Math.min(i + chunk, pending.length)
          tagScanned = done
          setScanProgress('tags', {
            current: done,
            total: pending.length,
            text: `读取标签 ${done}/${pending.length}`,
          })
          const batch = pending.slice(i, i + chunk)
          try {
            const batchRes = await api.library.scanBatch(batch)
            const tracks = (batchRes.data || []).map((row) => {
              const base = batch.find(f => f.filePath === row.filePath) || {}
              if (row.ok === false) return fileToLibraryTrack({ ...base, ...row })
              return fileToLibraryTrack({ ...base, ...row })
            })
            mergeLibraryTracks(tracks)
          } catch {
            mergeLibraryTracks(batch.map(f => fileToLibraryTrack(f)))
          }
        }
      } else if (!showedCache && !cached.length && !pending.length) {
        libraryTracks.value = []
      }

      const result = {
        totalTracks: libraryTracks.value.length,
        scannedTags: tagScanned,
        hadPending: pendingCount > 0,
      }
      saveSessionTracks(libraryTracks.value)
      onComplete?.(result, { force })
      return result
    } catch (e) {
      onError?.(e.message || '加载音乐库失败')
      throw e
    } finally {
      libraryLoading.value = false
      libraryMetaLoading.value = false
      resetScanProgress()
    }
  }

  scanPromise = run().finally(() => { scanPromise = null })
  return scanPromise
}

export function groupAlbums(tracks) {
  const map = new Map()
  for (const track of tracks) {
    const album = track.album || '未知专辑'
    const artist = track.singer || '未知艺术家'
    const id = `${artist}::${album}`
    if (!map.has(id)) {
      map.set(id, {
        id,
        name: album,
        artist,
        cover: track.picUrl || '',
        year: track.year || '',
        genre: track.genre || '',
        tracks: [],
        latestMtime: track.mtime || 0,
      })
    }
    const entry = map.get(id)
    entry.tracks.push(track)
    if (!entry.cover && track.picUrl) entry.cover = track.picUrl
    if (!entry.year && track.year) entry.year = track.year
    if (!entry.genre && track.genre) entry.genre = track.genre
    if ((track.mtime || 0) > entry.latestMtime) entry.latestMtime = track.mtime || 0
  }
  return [...map.values()].map(a => ({
    ...a,
    tracks: sortAlbumTracks(a.tracks),
    trackCount: a.tracks.length,
  })).sort((a, b) => b.latestMtime - a.latestMtime)
}

function sortAlbumTracks(tracks) {
  return [...tracks].sort((a, b) => {
    const na = parseInt(a.trackNo, 10)
    const nb = parseInt(b.trackNo, 10)
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
  })
}

export function findAlbumById(tracks, id) {
  if (!id) return null
  return groupAlbums(tracks).find(a => a.id === id) || null
}

const GENRE_THEME_COLORS = [
  { border: '#ef4444', bg: 'rgba(239, 68, 68, 0.14)' },
  { border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.14)' },
  { border: '#84cc16', bg: 'rgba(132, 204, 22, 0.14)' },
  { border: '#06b6d4', bg: 'rgba(6, 182, 212, 0.14)' },
  { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.14)' },
  { border: '#a855f7', bg: 'rgba(168, 85, 247, 0.14)' },
  { border: '#ec4899', bg: 'rgba(236, 72, 153, 0.14)' },
  { border: '#6366f1', bg: 'rgba(99, 102, 241, 0.14)' },
]

export function genreToId(name) {
  return encodeURIComponent(String(name || ''))
}

export function genreFromId(id) {
  if (!id) return ''
  try {
    return decodeURIComponent(String(id))
  } catch {
    return String(id)
  }
}

export function getGenreTheme(name) {
  const text = String(name || '')
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = (hash + text.charCodeAt(i) * (i + 1)) % GENRE_THEME_COLORS.length
  }
  return GENRE_THEME_COLORS[hash]
}

function splitGenreTags(genreRaw) {
  const raw = String(genreRaw || '').trim()
  if (!raw) return []
  const parts = raw.split(/[/;；、,，|]/).map(s => s.trim()).filter(Boolean)
  return parts.length ? parts : []
}

/** 按音乐风格分组（一首歌可属于多个风格标签） */
export function groupGenres(tracks) {
  const map = new Map()
  for (const track of tracks) {
    const tags = splitGenreTags(track.genre)
    const names = tags.length ? tags : ['未知风格']
    for (const name of names) {
      const id = genreToId(name)
      if (!map.has(id)) {
        map.set(id, {
          id,
          name,
          cover: track.picUrl || '',
          tracks: [],
          latestMtime: track.mtime || 0,
          artistSet: new Set(),
        })
      }
      const entry = map.get(id)
      entry.tracks.push(track)
      if (track.singer) entry.artistSet.add(track.singer)
      if (!entry.cover && track.picUrl) entry.cover = track.picUrl
      if ((track.mtime || 0) > entry.latestMtime) entry.latestMtime = track.mtime || 0
    }
  }
  return [...map.values()].map((g) => ({
    id: g.id,
    name: g.name,
    cover: g.cover,
    tracks: sortLibrarySongs(g.tracks, 'recent'),
    trackCount: g.tracks.length,
    artistCount: g.artistSet.size,
    latestMtime: g.latestMtime,
    theme: getGenreTheme(g.name),
  })).sort((a, b) => b.trackCount - a.trackCount || b.latestMtime - a.latestMtime)
}

export function findGenreById(tracks, id) {
  if (!id) return null
  const name = genreFromId(id)
  return groupGenres(tracks).find(g => g.id === id || g.name === name) || null
}

function syncStoredSnapshotsForTrack(track) {
  const snap = trackToSnapshot(track)
  if (!snap) return

  const patch = (list) => {
    let changed = false
    const next = list.map((item) => {
      if (item.key !== snap.key) return item
      changed = true
      return { ...item, ...snap }
    })
    return changed ? next : list
  }

  const nextFavs = patch(favorites.value)
  if (nextFavs !== favorites.value) {
    favorites.value = nextFavs
    persistFavorites()
  }

  const nextRecent = patch(recentPlays.value)
  if (nextRecent !== recentPlays.value) {
    recentPlays.value = nextRecent
    persistRecent()
  }

  let playlistsChanged = false
  const nextPlaylists = customPlaylists.value.map((pl) => {
    const normalized = normalizePlaylist(pl)
    if (!normalized.trackSnapshots?.[snap.key]) return pl
    playlistsChanged = true
    return {
      ...normalized,
      trackSnapshots: {
        ...normalized.trackSnapshots,
        [snap.key]: { ...normalized.trackSnapshots[snap.key], ...snap },
      },
    }
  })
  if (playlistsChanged) {
    customPlaylists.value = nextPlaylists
    persistPlaylists()
  }
}

/** 标签编辑保存后，同步更新音乐库中对应曲目的元数据与封面 */
export function updateLibraryTracksFromFiles(files) {
  if (!files?.length || !libraryTracks.value.length) return 0

  let updated = 0
  const next = [...libraryTracks.value]

  for (const f of files) {
    const filePath = f.filePath || f.localPath
    if (!filePath) continue

    const idx = next.findIndex(t => t.localPath === filePath || t.filePath === filePath)
    if (idx < 0) continue

    bumpLibraryCoverVersion(filePath)
    const existing = next[idx]
    const track = fileToLibraryTrack({
      ...existing,
      filePath,
      fileName: f.fileName || existing.fileName,
      title: f.title ?? existing.name,
      artist: f.artist ?? existing.singer,
      album: f.album ?? existing.album,
      year: f.year ?? existing.year,
      genre: f.genre ?? existing.genre,
      lyric: f.lyric ?? existing.lyric,
      comment: f.comment ?? existing.comment,
      pictureBase64: f.pictureBase64,
      pictureMime: f.pictureMime,
      picUrl: f.picUrl,
      hasPicture: f.hasPicture ?? existing.hasPicture,
      hasLyrics: f.hasLyrics ?? existing.hasLyrics,
      parsedTitle: f.parsedTitle,
      parsedArtist: f.parsedArtist,
      mtime: Math.max(existing.mtime || 0, Date.now()),
    })
    next[idx] = track
    syncStoredSnapshotsForTrack(track)
    updated++
  }

  if (updated) {
    libraryTracks.value = next.sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
  }
  return updated
}

/** 从磁盘重新读取指定文件的标签并更新音乐库（仅已存在的曲目） */
export async function refreshLibraryTracks(api, filePaths) {
  const { updated } = await ingestLibraryTracks(api, filePaths)
  return updated
}

function basenameFromPath(filePath) {
  const raw = String(filePath || '')
  const parts = raw.split(/[/\\]/)
  return parts[parts.length - 1] || raw
}

function buildTrackFromReadRow(row, existing) {
  const filePath = row.filePath
  if (!filePath) return null
  if (row.ok) {
    return fileToLibraryTrack({
      ...(existing || {}),
      filePath,
      ...row,
      mtime: Math.max(existing?.mtime || 0, Date.now()),
    })
  }
  return fileToLibraryTrack({
    ...(existing || {}),
    filePath,
    fileName: basenameFromPath(filePath),
    mtime: Math.max(existing?.mtime || 0, Date.now()),
  })
}

/** 增量合并：新增或更新音乐库中的本地曲目（热更新用） */
export async function ingestLibraryTracks(api, filePaths) {
  const paths = [...new Set((filePaths || []).filter(Boolean))]
  if (!paths.length) return { added: 0, updated: 0 }

  paths.forEach(bumpLibraryCoverVersion)

  const updates = new Map()
  const chunk = 20
  for (let i = 0; i < paths.length; i += chunk) {
    const batchPaths = paths.slice(i, i + chunk)
    const files = batchPaths.map(filePath => ({ filePath }))
    try {
      const batchRes = await api.library.scanBatch(files)
      for (const row of batchRes.data || []) {
        const filePath = row.filePath
        if (!filePath) continue
        const existing = libraryTracks.value.find(t => t.localPath === filePath || t.filePath === filePath)
        const track = buildTrackFromReadRow(row, existing)
        if (track) updates.set(filePath, track)
      }
    } catch {}
  }

  if (!updates.size) return { added: 0, updated: 0 }

  let added = 0
  let updated = 0
  const next = [...libraryTracks.value]
  for (const [filePath, track] of updates) {
    const idx = next.findIndex(t => t.localPath === filePath || t.filePath === filePath)
    if (idx < 0) {
      next.push(track)
      added++
      continue
    }
    next[idx] = track
    syncStoredSnapshotsForTrack(track)
    updated++
  }

  libraryTracks.value = sortTracksByMtime(next)
  libraryScanned.value = true
  return { added, updated }
}

export const libraryHotNotice = ref('')
let hotReloadApi = null
let pendingHotPaths = new Set()
let hotReloadTimer = null
let offLibraryChanged = null
let offLibraryRemoved = null
let offUserDataChanged = null
let offPlaylistsChanged = null
let offDownloadComplete = null

async function flushLibraryHotReload() {
  hotReloadTimer = null
  if (!hotReloadApi || !pendingHotPaths.size) return
  const paths = [...pendingHotPaths]
  pendingHotPaths.clear()
  try {
    const { added, updated } = await ingestLibraryTracks(hotReloadApi, paths)
    if (added > 0) {
      libraryHotNotice.value = added === 1 && updated === 0
        ? '音乐库已更新：新增 1 首歌曲'
        : `音乐库已更新：新增 ${added} 首${updated ? `，更新 ${updated} 首` : ''}`
      setTimeout(() => {
        if (libraryHotNotice.value.includes('音乐库已更新')) libraryHotNotice.value = ''
      }, 4200)
    }
  } catch {}
}

function queueLibraryHotReload(filePaths) {
  if (!filePaths?.length) return
  for (const p of filePaths) pendingHotPaths.add(p)
  if (hotReloadTimer) clearTimeout(hotReloadTimer)
  hotReloadTimer = setTimeout(flushLibraryHotReload, 450)
}

/** 订阅 WebSocket，在下载完成等场景自动增量刷新音乐库 */
export function initLibraryHotReload(api, { onWS } = {}) {
  hotReloadApi = api
  libraryApi = api
  offLibraryChanged?.()
  offLibraryRemoved?.()
  offUserDataChanged?.()
  offDownloadComplete?.()
  if (!onWS) return () => {}

  offLibraryChanged = onWS('library:changed', (payload) => {
    queueLibraryHotReload(payload?.filePaths)
  })
  offLibraryRemoved = onWS('library:removed', (payload) => {
    const removed = removeLibraryTracks(payload?.filePaths)
    if (removed > 0) {
      libraryHotNotice.value = removed === 1
        ? '音乐库已更新：移除 1 首歌曲'
        : `音乐库已更新：移除 ${removed} 首歌曲`
      setTimeout(() => {
        if (libraryHotNotice.value.includes('移除')) libraryHotNotice.value = ''
      }, 4200)
    }
  })
  offUserDataChanged = onWS('library:user-data-changed', () => {
    reloadLibraryUserData()
  })
  offPlaylistsChanged = onWS('library:playlists-changed', () => {
    reloadLibraryUserData()
  })
  offDownloadComplete = onWS('download:status', (payload) => {
    if (payload?.status === 'completed' && payload?.filePath) {
      queueLibraryHotReload([payload.filePath])
    }
  })

  return () => {
    offLibraryChanged?.()
    offLibraryRemoved?.()
    offUserDataChanged?.()
    offPlaylistsChanged?.()
    offDownloadComplete?.()
    offLibraryChanged = null
    offLibraryRemoved = null
    offUserDataChanged = null
    offPlaylistsChanged = null
    offDownloadComplete = null
    if (hotReloadTimer) clearTimeout(hotReloadTimer)
    hotReloadTimer = null
    pendingHotPaths.clear()
  }
}
