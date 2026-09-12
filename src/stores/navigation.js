import { ref } from 'vue'

export const isRouteLoading = ref(false)
export const pendingRoutePage = ref('default')

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
  Download: 'download',
  FileManager: 'file-manager',
  TagEditTrack: 'tag',
  Settings: 'settings',
  About: 'about',
}

const PATH_PAGE_MAP = {
  '/search': 'search',
  '/discover': 'discover',
  '/library': 'library',
  '/download': 'download',
  '/file-manager': 'file-manager',
  '/tag': 'file-manager',
  '/settings': 'settings',
  '/about': 'about',
}

const prefetchers = {
  '/search': () => import('../views/Search.vue'),
  '/discover': () => import('../views/Discover.vue'),
  '/library': () => import('../views/Library.vue'),
  '/download': () => import('../views/Download.vue'),
  '/file-manager': () => import('../views/FileManager.vue'),
  '/tag': () => import('../views/FileManager.vue'),
  '/settings': () => import('../views/Settings.vue'),
  '/about': () => import('../views/About.vue'),
}

const prefetched = new Set()

function resolvePage(to) {
  if (typeof to === 'string') {
    const path = to.split('?')[0]
    if (PATH_PAGE_MAP[path]) return PATH_PAGE_MAP[path]
    if (path.startsWith('/discover')) return 'discover'
    if (path.startsWith('/library')) return 'library'
    if (path.startsWith('/tag')) return 'tag'
    if (path.startsWith('/file-manager')) return 'file-manager'
    return 'default'
  }
  return ROUTE_PAGE_MAP[to.name] || 'default'
}

export function startRouteLoading(to) {
  pendingRoutePage.value = resolvePage(to)
  isRouteLoading.value = true
}

export function finishRouteLoading() {
  isRouteLoading.value = false
}

export function prefetchRoute(path) {
  const normalized = path.split('?')[0]
  const loader = prefetchers[normalized]
  if (!loader || prefetched.has(normalized)) return
  prefetched.add(normalized)
  loader().catch(() => prefetched.delete(normalized))
}

export const MAIN_TAB_NAMES = ['Search', 'Discover', 'Library', 'Download', 'FileManager', 'Settings', 'About']
