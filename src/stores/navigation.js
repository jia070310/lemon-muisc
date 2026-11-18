import { ref } from 'vue'

export const isRouteLoading = ref(false)
export const pendingRoutePage = ref('default')

/** 防止骨架一直不关（触控预加载后未真正跳转、导航中断等） */
let safetyTimer = null
let finishTimer = null
let loadingToken = 0
let loadingStartedAt = 0
const ROUTE_LOADING_SAFETY_MS = 3500
/** 挡住点穿到新页「返回」的残留点击 */
const ROUTE_LOADING_MIN_MS = 220

export function getRouteLoadingToken() {
  return loadingToken
}

const ROUTE_PAGE_MAP = {
  Search: 'search',
  Discover: 'discover',
  DiscoverPlaylists: 'discover',
  DiscoverNewSongs: 'discover',
  DiscoverNewAlbums: 'discover',
  DiscoverRanks: 'discover',
  Library: 'library',
  LibrarySearch: 'library',
  LibraryPlaylists: 'library',
  LibraryAlbum: 'library',
  LibraryAlbums: 'library',
  LibraryGenres: 'library',
  LibraryGenre: 'library',
  LibraryArtists: 'library',
  LibraryArtist: 'library',
  LibraryMood: 'library',
  Podcasts: 'podcasts',
  PodcastFeed: 'podcasts',
  Download: 'download',
  FileManager: 'file-manager',
  TagEditTrack: 'tag',
  Settings: 'settings',
  SourceProbe: 'settings',
  About: 'about',
}

const PATH_PAGE_MAP = {
  '/search': 'search',
  '/discover': 'discover',
  '/library': 'library',
  '/podcasts': 'podcasts',
  '/download': 'download',
  '/file-manager': 'file-manager',
  '/tag': 'file-manager',
  '/settings': 'settings',
  '/settings/source-probe': 'settings',
  '/about': 'about',
}

const prefetchers = {
  '/search': () => import('../views/Search.vue'),
  '/discover': () => import('../views/Discover.vue'),
  '/library': () => import('../views/Library.vue'),
  '/library/mood': () => import('../views/LibraryMood.vue'),
  '/podcasts': () => import('../views/Podcasts.vue'),
  '/download': () => import('../views/Download.vue'),
  '/file-manager': () => import('../views/FileManager.vue'),
  '/tag': () => import('../views/FileManager.vue'),
  '/settings': () => import('../views/Settings.vue'),
  '/settings/source-probe': () => import('../views/SourceProbe.vue'),
  '/about': () => import('../views/About.vue'),
}

const prefetched = new Set()

function resolvePage(to) {
  if (typeof to === 'string') {
    const path = to.split('?')[0]
    if (PATH_PAGE_MAP[path]) return PATH_PAGE_MAP[path]
    if (path.startsWith('/discover')) return 'discover'
    if (path.startsWith('/library')) return 'library'
    if (path.startsWith('/podcasts')) return 'podcasts'
    if (path.startsWith('/tag')) return 'tag'
    if (path.startsWith('/file-manager')) return 'file-manager'
    if (path.startsWith('/settings')) return 'settings'
    return 'default'
  }
  return ROUTE_PAGE_MAP[to.name] || 'default'
}

function clearLoadingTimers() {
  if (safetyTimer) {
    clearTimeout(safetyTimer)
    safetyTimer = null
  }
  if (finishTimer) {
    clearTimeout(finishTimer)
    finishTimer = null
  }
}

function hideRouteLoading() {
  clearLoadingTimers()
  isRouteLoading.value = false
}

export function startRouteLoading(to) {
  pendingRoutePage.value = resolvePage(to)
  isRouteLoading.value = true
  loadingToken += 1
  const token = loadingToken
  loadingStartedAt = Date.now()
  clearLoadingTimers()
  safetyTimer = setTimeout(() => {
    if (token !== loadingToken) return
    hideRouteLoading()
  }, ROUTE_LOADING_SAFETY_MS)
  return token
}

export function finishRouteLoading(token) {
  if (token != null && token !== loadingToken) return
  const remain = Math.max(0, ROUTE_LOADING_MIN_MS - (Date.now() - loadingStartedAt))
  if (remain <= 0) {
    hideRouteLoading()
    return
  }
  if (finishTimer) clearTimeout(finishTimer)
  finishTimer = setTimeout(() => {
    if (token != null && token !== loadingToken) return
    hideRouteLoading()
  }, remain)
}

export function prefetchRoute(path) {
  const normalized = path.split('?')[0]
  const loader = prefetchers[normalized]
  if (!loader || prefetched.has(normalized)) return
  prefetched.add(normalized)
  loader().catch(() => prefetched.delete(normalized))
}

export const MAIN_TAB_NAMES = ['Search', 'Discover', 'Library', 'LibraryMood', 'Podcasts', 'PodcastFeed', 'Download', 'FileManager', 'Settings', 'About']
