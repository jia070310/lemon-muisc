import { ref, computed } from 'vue'
import { findLocalMatchForTrack, isLocalPlaylistTrack } from '../utils/trackMatch.js'
import { withStreamAuth } from '../utils/streamAuth.js'
import { currentUser } from '../utils/auth.js'

const FAVORITES_KEY_BASE = 'lemon-library-favorites'
const RECENT_KEY_BASE = 'lemon-library-recent'
const PLAYLISTS_KEY_BASE = 'lemon-library-playlists'
const USER_DATA_REV_KEY_BASE = 'lemon-library-user-data-rev'
const LEGACY_MIGRATED_KEY = 'lemon-library-legacy-migrated-user'
const RECENT_LIMIT = 200
const SESSION_TRACKS_KEY = 'lemon-library-tracks-v1'
const SESSION_TRACKS_LIMIT = 8000
const coverVersions = new Map()

let activeUserId = ''

function storageKey(base) {
  return activeUserId ? `${base}:${activeUserId}` : base
}

function favoritesKey() { return storageKey(FAVORITES_KEY_BASE) }
function recentKey() { return storageKey(RECENT_KEY_BASE) }
function playlistsKey() { return storageKey(PLAYLISTS_KEY_BASE) }
function userDataRevKey() { return storageKey(USER_DATA_REV_KEY_BASE) }

export const libraryTracks = ref([])
export const libraryLoading = ref(false)
export const libraryMetaLoading = ref(false)
export const libraryScanned = ref(false)
export const libraryLoadProgress = ref('')
export const libraryScanPhase = ref('')
export const libraryScanCurrent = ref(0)
export const libraryScanTotal = ref(0)
/** 音乐库歌曲网格列数：2 | 3 | 4 */
export const librarySongColumns = ref(2)

export const LIBRARY_SONG_COLUMNS_KEY = 'ui.librarySongColumns'

export function normalizeLibrarySongColumns(value) {
  const n = Number(value)
  if (n === 3 || n === 4) return n
  return 2
}

export function setLibrarySongColumns(value) {
  librarySongColumns.value = normalizeLibrarySongColumns(value)
  return librarySongColumns.value
}

export async function loadLibrarySongColumns(apiClient) {
  try {
    const settings = await apiClient.settings.get()
    setLibrarySongColumns(settings?.[LIBRARY_SONG_COLUMNS_KEY])
  } catch {
    setLibrarySongColumns(2)
  }
  return librarySongColumns.value
}

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

function applyServerScanProgress(scan = {}) {
  if (!scan?.phase) return
  const phase = scan.phase === 'tags' || scan.phase === 'sync' ? scan.phase : (scan.running ? 'tags' : '')
  if (!phase) return
  setScanProgress(phase, {
    current: scan.current || 0,
    total: scan.total || 0,
    text: scan.text || (scan.phase === 'tags' && scan.total
      ? `读取标签 ${scan.current || 0}/${scan.total}`
      : ''),
  })
  libraryMetaLoading.value = Boolean(scan.running)
}

async function reloadTracksFromCache(api) {
  if (!api?.library?.tracks) return
  try {
    const cachedRes = await api.library.tracks()
    const cachedList = cachedRes.data || []
    if (cachedList.length) {
      libraryTracks.value = sortTracksByMtime(cachedList.map(fileToLibraryTrack))
      saveSessionTracks(libraryTracks.value)
    }
  } catch {}
}

async function finishBackgroundScan(api) {
  libraryMetaLoading.value = false
  resetScanProgress()
  await reloadTracksFromCache(api)
  syncAllImportedPlaylists()
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

function readLocalRevision() {
  return Number(readJson(userDataRevKey(), 0)) || 0
}

function writeLocalRevision(rev) {
  writeJson(userDataRevKey(), Number(rev) || 0)
}

function bumpLocalRevision() {
  const rev = Date.now()
  writeLocalRevision(rev)
  return rev
}

function maxPlaylistStamp(playlists = []) {
  return Math.max(0, ...playlists.map((p) => p.lastSyncedAt || p.createdAt || 0))
}

function playlistIdsSignature(playlists = []) {
  return playlists.map((p) => p.id).sort().join(',')
}

function pickNewerPlaylists(local, server) {
  if (!hasItems(local) && hasItems(server)) return server
  if (hasItems(local) && !hasItems(server)) return local
  if (!hasItems(local) && !hasItems(server)) return []

  const localIds = new Set(local.map((p) => p.id))
  const serverIds = new Set(server.map((p) => p.id))
  const deletedOnLocal = [...serverIds].some((id) => !localIds.has(id))
  const addedOnLocal = [...localIds].some((id) => !serverIds.has(id))

  if (deletedOnLocal && !addedOnLocal) return local
  if (addedOnLocal && !deletedOnLocal) return local

  return maxPlaylistStamp(local) >= maxPlaylistStamp(server) ? local : server
}

function applyLocalUserData({ playlists, favorites: favs, recentPlays: recent, revision } = {}) {
  if (Array.isArray(playlists)) {
    customPlaylists.value = playlists.map(normalizePlaylist)
    writeJson(playlistsKey(), customPlaylists.value)
  }
  if (Array.isArray(favs)) {
    favorites.value = favs
    writeJson(favoritesKey(), favs)
  }
  if (Array.isArray(recent)) {
    recentPlays.value = recent
    writeJson(recentKey(), recent)
  }
  if (revision !== undefined) writeLocalRevision(revision)
}

async function saveUserDataToServer() {
  if (!libraryApi) return false
  const revision = bumpLocalRevision()
  try {
    await libraryApi.library.userData.save({
      playlists: customPlaylists.value,
      favorites: favorites.value,
      recentPlays: recentPlays.value,
      revision,
    })
    return true
  } catch {
    return false
  }
}

function persistUserDataNow() {
  if (userDataPersistTimer) {
    clearTimeout(userDataPersistTimer)
    userDataPersistTimer = null
  }
  if (!libraryApi || !userDataSyncReady) {
    pendingUserDataPersist = true
    return Promise.resolve(false)
  }
  if (skipNextUserDataPersist) {
    skipNextUserDataPersist = false
    return Promise.resolve(false)
  }
  return saveUserDataToServer()
}

function persistPlaylists() {
  writeJson(playlistsKey(), customPlaylists.value)
  scheduleUserDataPersist()
}

function persistFavorites() {
  writeJson(favoritesKey(), favorites.value)
  scheduleUserDataPersist()
}

function persistRecent() {
  writeJson(recentKey(), recentPlays.value)
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

function applyRemoteUserData({ playlists, favorites: favs, recentPlays: recent, revision } = {}) {
  skipNextUserDataPersist = true
  if (Array.isArray(playlists)) {
    customPlaylists.value = playlists.map(normalizePlaylist)
    writeJson(playlistsKey(), customPlaylists.value)
  }
  if (Array.isArray(favs)) {
    favorites.value = favs
    writeJson(favoritesKey(), favs)
  }
  if (Array.isArray(recent)) {
    recentPlays.value = recent
    writeJson(recentKey(), recent)
  }
  if (revision !== undefined) writeLocalRevision(revision)
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
  userDataPersistTimer = setTimeout(() => {
    userDataPersistTimer = null
    void saveUserDataToServer()
  }, 450)
}

function flushPendingUserDataPersist() {
  if (!pendingUserDataPersist) return
  pendingUserDataPersist = false
  scheduleUserDataPersist()
}

function clearInMemoryUserData() {
  customPlaylists.value = []
  favorites.value = []
  recentPlays.value = []
  playlistPickTarget.value = null
}

function migrateLegacyLocalUserData(userId) {
  if (!userId) return
  try {
    if (localStorage.getItem(LEGACY_MIGRATED_KEY)) return
    const hasScoped = hasItems(readJson(`${PLAYLISTS_KEY_BASE}:${userId}`, []))
      || hasItems(readJson(`${FAVORITES_KEY_BASE}:${userId}`, []))
      || hasItems(readJson(`${RECENT_KEY_BASE}:${userId}`, []))
    if (hasScoped) {
      localStorage.setItem(LEGACY_MIGRATED_KEY, userId)
      return
    }
    const legacyPl = readJson(PLAYLISTS_KEY_BASE, [])
    const legacyFav = readJson(FAVORITES_KEY_BASE, [])
    const legacyRecent = readJson(RECENT_KEY_BASE, [])
    const legacyRev = Number(readJson(USER_DATA_REV_KEY_BASE, 0)) || 0
    if (!hasItems(legacyPl) && !hasItems(legacyFav) && !hasItems(legacyRecent)) {
      localStorage.setItem(LEGACY_MIGRATED_KEY, userId)
      return
    }
    writeJson(`${PLAYLISTS_KEY_BASE}:${userId}`, legacyPl)
    writeJson(`${FAVORITES_KEY_BASE}:${userId}`, legacyFav)
    writeJson(`${RECENT_KEY_BASE}:${userId}`, legacyRecent)
    writeJson(`${USER_DATA_REV_KEY_BASE}:${userId}`, legacyRev)
    localStorage.removeItem(PLAYLISTS_KEY_BASE)
    localStorage.removeItem(FAVORITES_KEY_BASE)
    localStorage.removeItem(RECENT_KEY_BASE)
    localStorage.removeItem(USER_DATA_REV_KEY_BASE)
    localStorage.setItem(LEGACY_MIGRATED_KEY, userId)
  } catch {}
}

/** 退出登录时清空内存中的个人数据，避免泄漏到下一用户 */
export function resetLibraryUserData() {
  userDataSyncReady = false
  skipNextUserDataPersist = true
  pendingUserDataPersist = false
  if (userDataPersistTimer) {
    clearTimeout(userDataPersistTimer)
    userDataPersistTimer = null
  }
  activeUserId = ''
  clearInMemoryUserData()
}

/** 从服务端加载当前用户的歌单、收藏、最近播放（按用户隔离） */
export async function initLibraryUserData(api, user = null) {
  libraryApi = api
  userDataSyncReady = false
  const nextUser = user || currentUser.value
  const nextId = String(nextUser?.id || '')
  if (!nextId) {
    resetLibraryUserData()
    return
  }

  if (activeUserId && activeUserId !== nextId) {
    clearInMemoryUserData()
  }
  activeUserId = nextId
  migrateLegacyLocalUserData(nextId)

  try {
    const res = await api.library.userData.get()
    const data = res.data || {}
    const serverPl = (data.playlists || []).map(normalizePlaylist)
    const serverFav = data.favorites || []
    const serverRecent = data.recentPlays || []
    const serverRev = Number(data.revision) || 0

    const localPl = readJson(playlistsKey(), []).map(normalizePlaylist)
    const localFav = readJson(favoritesKey(), [])
    const localRecent = readJson(recentKey(), [])
    const localRev = readLocalRevision()

    let needUpload = false

    if (localRev > serverRev) {
      applyLocalUserData({
        playlists: localPl,
        favorites: localFav,
        recentPlays: localRecent,
        revision: localRev,
      })
      needUpload = true
    } else if (serverRev > localRev) {
      applyRemoteUserData({
        playlists: serverPl,
        favorites: serverFav,
        recentPlays: serverRecent,
        revision: serverRev,
      })
    } else if (serverRev > 0 || hasItems(serverPl) || hasItems(serverFav) || hasItems(serverRecent)) {
      // 优先服务端（该用户权威数据），避免串用其他账号的浏览器缓存
      applyRemoteUserData({
        playlists: serverPl,
        favorites: serverFav,
        recentPlays: serverRecent,
        revision: serverRev || localRev,
      })
    } else {
      // 服务端为空：仅使用「本用户」本地缓存做首次迁移上传
      applyLocalUserData({
        playlists: localPl,
        favorites: localFav,
        recentPlays: localRecent,
        revision: localRev || (hasItems(localPl) || hasItems(localFav) || hasItems(localRecent) ? Date.now() : 0),
      })
      needUpload = hasItems(localPl) || hasItems(localFav) || hasItems(localRecent)
    }

    if (needUpload) {
      skipNextUserDataPersist = true
      await saveUserDataToServer()
    }
  } catch {
    customPlaylists.value = readJson(playlistsKey(), []).map(normalizePlaylist)
    favorites.value = readJson(favoritesKey(), [])
    recentPlays.value = readJson(recentKey(), [])
  }
  try {
    const settingsRes = await api.settings.get()
    const days = settingsRes?.[PLAYLIST_REMOTE_SYNC_DAYS_KEY]
    if (days != null) setPlaylistRemoteSyncDays(days)
  } catch {}
  finally {
    userDataSyncReady = true
    flushPendingUserDataPersist()
    void maybeAutoSyncImportedPlaylists(api)
  }
}

export async function reloadLibraryUserData() {
  if (!libraryApi) return
  try {
    const res = await libraryApi.library.userData.get()
    const data = res.data || {}
    const serverRev = Number(data.revision) || 0
    const localRev = readLocalRevision()
    if (localRev > serverRev) {
      await saveUserDataToServer()
      return
    }
    applyRemoteUserData(data)
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
    playlistType: pl.playlistType === 'imported' ? 'imported' : 'custom',
    importSource: pl.importSource || '',
    importUrl: pl.importUrl || '',
    lastSyncedAt: pl.lastSyncedAt || 0,
    lastRemoteSyncedAt: pl.lastRemoteSyncedAt || 0,
    remoteAutoSync: pl.remoteAutoSync !== false,
  }
}

export function isImportedPlaylist(playlist) {
  return playlist?.playlistType === 'imported' || Boolean(playlist?.importUrl)
}

export function getLibraryTrackKey(track) {
  if (!track) return ''
  if (track.key) return track.key
  if (track.localPath) return `local:${track.localPath}`
  const id = track.songId ?? track.songmid ?? track.hash ?? track.copyrightId ?? track.id
  const source = track.source || ''
  return id ? `${source}:${id}` : ''
}

export const favorites = ref([])
export const recentPlays = ref([])
export const customPlaylists = ref([])

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
  const source = sourceOverride || snapshot.source || (snapshot.localPath || snapshot.filePath ? 'local' : '')
  const localPath = snapshot.localPath || snapshot.filePath || ''
  return {
    id: snapshot.songId || snapshot.songmid || snapshot.hash || snapshot.copyrightId || snapshot.key,
    key: snapshot.key || (localPath ? `local:${localPath}` : ''),
    songId: snapshot.songId,
    songmid: snapshot.songmid,
    hash: snapshot.hash,
    copyrightId: snapshot.copyrightId,
    albumAudioId: snapshot.albumAudioId,
    name: snapshot.name,
    singer: snapshot.singer,
    album: snapshot.album,
    localPath,
    filePath: localPath,
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
  const base = v ? `/api/tag/cover?${q}&v=${v}` : `/api/tag/cover?${q}`
  return withStreamAuth(base)
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
    if (map.has(k)) {
      const track = enrichLocalCover(map.get(k))
      return { ...track, isLocal: true }
    }
    const snap = snapshots[k]
    if (!snap) return null
    const track = enrichLocalCover({
      ...snap,
      key: k,
      singer: snap.singer || '未知艺术家',
      album: snap.album || '未知专辑',
    })
    return { ...track, isLocal: isLocalPlaylistTrack(track) }
  }).filter(Boolean)
}

export function countPlaylistTrackOrigins(tracks = []) {
  let local = 0
  let online = 0
  for (const track of tracks) {
    if (track?.isLocal) local += 1
    else online += 1
  }
  return { local, online, total: tracks.length }
}

export function buildPlaylistCards(allTracks, { limit } = {}) {
  const recentAdded = [...allTracks]
    .sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
    .map((t) => ({ ...enrichLocalCover(t), isLocal: true }))
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

export function createPlaylist(name, {
  coverUrl = '',
  coverMode = 'auto',
  playlistType = 'custom',
  importSource = '',
  importUrl = '',
  lastSyncedAt = 0,
} = {}) {
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
    playlistType,
    importSource,
    importUrl,
    lastSyncedAt,
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
  void persistUserDataNow()
  if (playlistPickTarget.value?.id === id) {
    playlistPickTarget.value = null
  }
  return true
}

export function addTracksToPlaylist(playlistId, tracks, sourceOverride, options = {}) {
  const idx = customPlaylists.value.findIndex(p => p.id === playlistId)
  if (idx < 0) return { added: 0, playlist: null }
  const pl = normalizePlaylist(customPlaylists.value[idx])
  const keys = [...pl.trackKeys]
  const snapshots = { ...pl.trackSnapshots }
  const prepend = options.position === 'start'
  const incoming = []
  let added = 0
  for (const track of tracks) {
    const snap = trackToSnapshot(track, sourceOverride)
    if (!snap || keys.includes(snap.key) || incoming.includes(snap.key)) continue
    incoming.push(snap.key)
    if (!snap.localPath || !libraryTracks.value.some(t => getLibraryTrackKey(t) === snap.key)) {
      snapshots[snap.key] = snap
    }
    added++
  }
  const nextKeys = prepend ? [...incoming, ...keys] : [...keys, ...incoming]
  const next = updatePlaylist(playlistId, { trackKeys: nextKeys, trackSnapshots: snapshots })
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

async function fetchPlatformPlaylistTracks(api, input, source, onProgress) {
  if (source === 'kg') {
    onProgress?.('正在加载歌单（首屏）…')
    const partialRes = await api.playlist.fetch(input, source, { partial: true })
    const partialData = partialRes.data || {}
    let list = partialData.list || []
    let info = partialData.info || null
    if (partialData.hasMore) {
      onProgress?.('正在加载完整歌单…')
      const fullRes = await api.playlist.fetch(input, source)
      const fullData = fullRes.data || {}
      list = fullData.list || list
      info = fullData.info || info
    }
    return { list, info, total: partialData.total || list.length }
  }
  onProgress?.('正在解析歌单…')
  const res = await api.playlist.fetch(input, source)
  const data = res.data || {}
  return {
    list: data.list || [],
    info: data.info || null,
    total: data.total || (data.list || []).length,
  }
}

export function syncPlaylistLocalTracks(playlistId) {
  const pl = getCustomPlaylist(playlistId)
  if (!pl) return { matched: 0, playlist: null }
  const keys = [...(pl.trackKeys || [])]
  const snapshots = { ...(pl.trackSnapshots || {}) }
  const library = libraryTracks.value
  const newKeys = []
  const seen = new Set()
  let matched = 0

  for (const k of keys) {
    if (k.startsWith('local:')) {
      if (!seen.has(k)) {
        newKeys.push(k)
        seen.add(k)
      }
      continue
    }

    const snap = snapshots[k] || {}
    const onlineTrack = {
      ...snap,
      key: k,
      name: snap.name,
      singer: snap.singer,
      source: snap.source,
    }
    const local = findLocalMatchForTrack(onlineTrack, library)
    if (local) {
      const localKey = getLibraryTrackKey(local)
      delete snapshots[k]
      if (!seen.has(localKey)) {
        newKeys.push(localKey)
        seen.add(localKey)
      }
      matched += 1
      continue
    }

    if (!seen.has(k)) {
      newKeys.push(k)
      seen.add(k)
    }
  }

  const next = updatePlaylist(playlistId, {
    trackKeys: newKeys,
    trackSnapshots: snapshots,
    lastSyncedAt: Date.now(),
  })
  return { matched, playlist: next }
}

export function syncAllImportedPlaylists() {
  let totalMatched = 0
  for (const pl of customPlaylists.value) {
    if (!isImportedPlaylist(pl)) continue
    const { matched } = syncPlaylistLocalTracks(pl.id)
    totalMatched += matched
  }
  return totalMatched
}

export const PLAYLIST_REMOTE_SYNC_DAYS_KEY = 'playlist.remoteSyncDays'
export const playlistRemoteSyncRunning = ref(false)

export function getPlaylistRemoteSyncDays() {
  const raw = Number(localStorage.getItem(PLAYLIST_REMOTE_SYNC_DAYS_KEY))
  if (!Number.isFinite(raw) || raw < 0) return 0
  return Math.floor(raw)
}

export function setPlaylistRemoteSyncDays(days) {
  const value = Math.max(0, Math.floor(Number(days) || 0))
  localStorage.setItem(PLAYLIST_REMOTE_SYNC_DAYS_KEY, String(value))
  return value
}

export async function refreshImportedPlaylistFromNetwork(api, playlistId, { onProgress } = {}) {
  const pl = getCustomPlaylist(playlistId)
  if (!pl || !isImportedPlaylist(pl)) throw new Error('不是网络导入歌单')
  if (!pl.importUrl || !pl.importSource) throw new Error('歌单缺少导入链接信息')

  const { list, info } = await fetchPlatformPlaylistTracks(api, pl.importUrl, pl.importSource, onProgress)
  const existingKeys = new Set(pl.trackKeys || [])
  const newTracks = []
  for (const track of list) {
    const snap = trackToSnapshot(track, pl.importSource)
    if (!snap || existingKeys.has(snap.key)) continue
    newTracks.push(track)
    existingKeys.add(snap.key)
  }

  const patch = { lastRemoteSyncedAt: Date.now() }
  const coverUrl = info?.img || info?.picUrl || ''
  if (coverUrl && pl.coverMode !== 'custom') {
    patch.coverUrl = coverUrl
    patch.coverMode = 'custom'
  }
  updatePlaylist(playlistId, patch)

  let added = 0
  if (newTracks.length) {
    // 网络更新：新增歌曲插到歌单最前（保持平台列表中的相对顺序）
    const res = addTracksToPlaylist(playlistId, newTracks, pl.importSource, { position: 'start' })
    added = res.added
  }

  const { matched, playlist } = syncPlaylistLocalTracks(playlistId)
  return { added, total: list.length, matched, playlist }
}

export async function maybeAutoSyncImportedPlaylists(api) {
  const days = getPlaylistRemoteSyncDays()
  if (!days || !api || playlistRemoteSyncRunning.value) return { synced: 0, added: 0 }

  const intervalMs = days * 24 * 60 * 60 * 1000
  const now = Date.now()
  const due = customPlaylists.value.filter((pl) => {
    if (!isImportedPlaylist(pl)) return false
    if (pl.remoteAutoSync === false) return false
    if (!pl.importUrl || !pl.importSource) return false
    const last = pl.lastRemoteSyncedAt || pl.lastSyncedAt || pl.createdAt || 0
    return now - last >= intervalMs
  })
  if (!due.length) return { synced: 0, added: 0 }

  playlistRemoteSyncRunning.value = true
  let synced = 0
  let totalAdded = 0
  const updatedNames = []
  try {
    for (const pl of due) {
      try {
        const { added } = await refreshImportedPlaylistFromNetwork(api, pl.id)
        synced += 1
        if (added > 0) {
          totalAdded += added
          updatedNames.push(pl.name)
        }
      } catch {}
    }
    if (totalAdded > 0) {
      const label = updatedNames.length === 1
        ? `网络歌单「${updatedNames[0]}」新增 ${totalAdded} 首`
        : `网络歌单已更新，共新增 ${totalAdded} 首`
      showLibraryHotNotice(label)
    }
  } finally {
    playlistRemoteSyncRunning.value = false
  }
  return { synced, added: totalAdded }
}

export async function importPlaylistFromUrl(api, { url, source, name = '', onProgress } = {}) {
  const input = String(url || '').trim()
  if (!input) throw new Error('请输入歌单链接')
  if (!source) throw new Error('请选择音乐平台')

  const { list, info } = await fetchPlatformPlaylistTracks(api, input, source, onProgress)
  if (!list.length) throw new Error('歌单为空或解析失败')

  const playlistName = String(name || info?.name || '导入的歌单').trim()
  const coverUrl = info?.img || info?.picUrl || ''
  const pl = createPlaylist(playlistName, {
    coverUrl,
    coverMode: coverUrl ? 'custom' : 'auto',
    playlistType: 'imported',
    importSource: source,
    importUrl: input,
    lastSyncedAt: Date.now(),
    lastRemoteSyncedAt: Date.now(),
  })
  if (!pl) throw new Error('创建歌单失败')

  onProgress?.(`正在写入 ${list.length} 首歌曲…`)
  addTracksToPlaylist(pl.id, list, source)
  const { matched, playlist } = syncPlaylistLocalTracks(pl.id)
  return {
    playlist,
    total: list.length,
    added: list.length,
    localMatched: matched,
    onlineCount: list.length - matched,
  }
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
    if (map.has(k)) {
      const track = enrichLocalCover(map.get(k))
      return { ...track, isLocal: true }
    }
    const snap = snapMap.get(k)
    if (!snap) return null
    const track = enrichLocalCover({
      ...snap,
      key: k,
      singer: snap.singer || '未知艺术家',
      album: snap.album || '未知专辑',
    })
    return { ...track, isLocal: isLocalPlaylistTrack(track) }
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
    isLocal: true,
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
export async function scanLibrary(api, { force = false, dirs = null, scanAll = false, onError, onComplete } = {}) {
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
    let serverScanActive = false

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

      if (!force) {
        try {
          const statusRes = await api.library.scanStatus()
          if (statusRes.scan?.running) {
            serverScanActive = true
            applyServerScanProgress(statusRes.scan)
            await reloadTracksFromCache(api)
            libraryScanned.value = true
            libraryLoading.value = false
            libraryMetaLoading.value = true
            maybeShowBackgroundScanInitHint()
            const result = {
              totalTracks: libraryTracks.value.length,
              scannedTags: statusRes.scan.current || 0,
              hadPending: true,
              resumed: true,
            }
            onComplete?.(result, { force })
            return result
          }
        } catch {}
      }

      setScanProgress('sync', { text: '比对文件，启动后台扫描' })
      const startRes = await api.library.scanStart(force, { dirs, scanAll })
      const { cached = [], pending = [], removed = [] } = startRes.data || {}
      const scan = startRes.scan || {}
      pendingCount = pending.length
      tagScanned = scan.scanned || 0

      const keysBeforeSync = new Set(
        libraryTracks.value.map(t => t.filePath || t.localPath).filter(Boolean),
      )

      if (removed.length) removeLibraryTracks(removed)

      if (cached.length) {
        mergeLibraryTracks(cached.map(fileToLibraryTrack))
      }

      if (pending.length) {
        mergeLibraryTracks(pending.map(f => fileToLibraryTrack(f)))
      } else if (!libraryTracks.value.length && !cached.length) {
        libraryTracks.value = []
      }

      let addedFromSync = 0
      for (const f of pending) {
        const fp = f.filePath
        if (fp && !keysBeforeSync.has(fp)) addedFromSync++
      }
      const showedBgScanInitHint = scan.running
        ? maybeShowBackgroundScanInitHint()
        : false

      if (addedFromSync > 0 && !showedBgScanInitHint) {
        showLibraryHotNotice(
          addedFromSync === 1
            ? '音乐库已更新：新增 1 首歌曲'
            : `音乐库已更新：新增 ${addedFromSync} 首歌曲`,
          8000,
        )
      }

      libraryScanned.value = true
      libraryLoading.value = false

      if (scan.running) {
        serverScanActive = true
        libraryMetaLoading.value = true
        applyServerScanProgress(scan)
      } else {
        applyServerScanProgress(scan)
        await reloadTracksFromCache(api)
      }

      if (!showedCache && !cached.length && !pending.length && !libraryTracks.value.length) {
        libraryTracks.value = []
      }

      const result = {
        totalTracks: libraryTracks.value.length,
        scannedTags: tagScanned,
        hadPending: pendingCount > 0,
      }
      saveSessionTracks(libraryTracks.value)
      if (!serverScanActive) syncAllImportedPlaylists()
      if (!serverScanActive) onComplete?.(result, { force })
      return result
    } catch (e) {
      onError?.(e.message || '加载音乐库失败')
      throw e
    } finally {
      libraryLoading.value = false
      if (!serverScanActive) {
        libraryMetaLoading.value = false
        resetScanProgress()
      }
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
const BG_SCAN_INIT_HINT_KEY = 'lemon-library-bg-scan-init-hint-seen'

/** 首次后台扫描时提示：关闭页面不影响扫描任务（每浏览器仅一次） */
function maybeShowBackgroundScanInitHint() {
  try {
    if (localStorage.getItem(BG_SCAN_INIT_HINT_KEY)) return false
    localStorage.setItem(BG_SCAN_INIT_HINT_KEY, '1')
  } catch {
    return false
  }
  showLibraryHotNotice(
    '已开启后台自动扫描音乐库，关闭网页或 App 不会影响扫描任务，歌曲会陆续出现在音乐库中。',
    30000,
  )
  return true
}

let hotReloadApi = null
let pendingHotPaths = new Set()
let hotReloadTimer = null
let libraryHotNoticeTimer = null
let offLibraryChanged = null
let offLibraryRemoved = null
let offUserDataChanged = null
let offPlaylistsChanged = null
let offDownloadComplete = null
let offScanProgress = null
let offScanComplete = null

function showLibraryHotNotice(text, ttl = 4500) {
  libraryHotNotice.value = text
  if (libraryHotNoticeTimer) clearTimeout(libraryHotNoticeTimer)
  libraryHotNoticeTimer = setTimeout(() => {
    if (libraryHotNotice.value === text) libraryHotNotice.value = ''
    libraryHotNoticeTimer = null
  }, ttl)
}

export function clearLibraryHotNotice() {
  if (libraryHotNoticeTimer) {
    clearTimeout(libraryHotNoticeTimer)
    libraryHotNoticeTimer = null
  }
  libraryHotNotice.value = ''
}

async function flushLibraryHotReload() {
  hotReloadTimer = null
  if (!hotReloadApi || !pendingHotPaths.size) return
  const paths = [...pendingHotPaths]
  pendingHotPaths.clear()
  try {
    const { added, updated } = await ingestLibraryTracks(hotReloadApi, paths)
    if (added > 0) {
      showLibraryHotNotice(
        added === 1 && updated === 0
          ? '音乐库已更新：新增 1 首歌曲'
          : `音乐库已更新：新增 ${added} 首${updated ? `，更新 ${updated} 首` : ''}`,
        8000,
      )
    } else if (updated > 0 && paths.length === 1) {
      showLibraryHotNotice('音乐库已更新：歌曲信息已刷新', 5000)
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
  offScanProgress?.()
  offScanComplete?.()
  if (!onWS) return () => {}

  offLibraryChanged = onWS('library:changed', (payload) => {
    queueLibraryHotReload(payload?.filePaths)
  })
  offLibraryRemoved = onWS('library:removed', (payload) => {
    const removed = removeLibraryTracks(payload?.filePaths)
    if (removed > 0) {
      showLibraryHotNotice(
        removed === 1
          ? '音乐库已更新：移除 1 首歌曲'
          : `音乐库已更新：移除 ${removed} 首歌曲`,
      )
    }
  })
  offScanProgress = onWS('library:scan-progress', (payload) => {
    applyServerScanProgress(payload)
  })
  offScanComplete = onWS('library:scan-complete', async (payload) => {
    if (!hotReloadApi) return
    await finishBackgroundScan(hotReloadApi)
    const hadPending = Boolean(payload?.hadPending)
    const scanned = Number(payload?.scannedTags) || 0
    const current = libraryHotNotice.value
    if (current.includes('新增')) {
      if (hadPending && scanned > 0) {
        showLibraryHotNotice(`${current.replace(/[。…]*$/, '')}，标签读取完成`, 6000)
      }
      return
    }
    if (!hadPending) return
    if (scanned > 0) {
      showLibraryHotNotice(`音乐库扫描完成：已处理 ${scanned} 首歌曲`, 6000)
    } else {
      showLibraryHotNotice('音乐库后台扫描已完成', 5000)
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
    offScanProgress?.()
    offScanComplete?.()
    offLibraryChanged = null
    offLibraryRemoved = null
    offUserDataChanged = null
    offPlaylistsChanged = null
    offDownloadComplete = null
    offScanProgress = null
    offScanComplete = null
    if (hotReloadTimer) clearTimeout(hotReloadTimer)
    hotReloadTimer = null
    pendingHotPaths.clear()
  }
}
