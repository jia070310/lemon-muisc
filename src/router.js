import { nextTick } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import {
  getToken,
  initAuth,
  isSessionValid,
  currentUser,
  canUseDownload,
} from './utils/auth.js'
import { finishRouteLoading, getRouteLoadingToken, startRouteLoading } from './stores/navigation.js'
import Login from './views/Login.vue'

const routes = [
  { path: '/login', name: 'Login', component: Login, meta: { public: true } },
  { path: '/change-account', name: 'ChangeDefaultAccount', component: () => import('./views/ChangeDefaultAccount.vue') },
  { path: '/', redirect: '/library' },
  { path: '/search', name: 'Search', component: () => import('./views/Search.vue') },
  { path: '/discover', name: 'Discover', component: () => import('./views/Discover.vue') },
  { path: '/discover/playlists', name: 'DiscoverPlaylists', component: () => import('./views/DiscoverPlaylists.vue') },
  { path: '/discover/new-songs', name: 'DiscoverNewSongs', component: () => import('./views/DiscoverNewSongs.vue') },
  { path: '/discover/new-albums', name: 'DiscoverNewAlbums', component: () => import('./views/DiscoverNewAlbums.vue') },
  { path: '/discover/ranks', name: 'DiscoverRanks', component: () => import('./views/DiscoverRanks.vue') },
  { path: '/library', name: 'Library', component: () => import('./views/Library.vue') },
  { path: '/library/search', name: 'LibrarySearch', component: () => import('./views/LibrarySearch.vue') },
  { path: '/library/playlists', name: 'LibraryPlaylists', component: () => import('./views/LibraryPlaylists.vue') },
  { path: '/library/album', name: 'LibraryAlbum', component: () => import('./views/LibraryAlbum.vue') },
  { path: '/library/albums', name: 'LibraryAlbums', component: () => import('./views/LibraryAlbums.vue') },
  { path: '/library/genres', name: 'LibraryGenres', component: () => import('./views/LibraryGenres.vue') },
  { path: '/library/genre', name: 'LibraryGenre', component: () => import('./views/LibraryGenre.vue') },
  { path: '/library/artists', name: 'LibraryArtists', component: () => import('./views/LibraryArtists.vue') },
  { path: '/library/artist', name: 'LibraryArtist', component: () => import('./views/LibraryArtist.vue') },
  { path: '/library/mood', name: 'LibraryMood', component: () => import('./views/LibraryMood.vue') },
  { path: '/podcasts', name: 'Podcasts', component: () => import('./views/Podcasts.vue') },
  { path: '/podcasts/favorites', name: 'PodcastFavorites', component: () => import('./views/PodcastFavorites.vue') },
  { path: '/podcasts/:id', name: 'PodcastFeed', component: () => import('./views/PodcastFeed.vue') },
  { path: '/download', name: 'Download', component: () => import('./views/Download.vue') },
  { path: '/file-manager', name: 'FileManager', component: () => import('./views/FileManager.vue') },
  { path: '/tag', redirect: { path: '/file-manager', query: { tab: 'tag' } } },
  { path: '/tag/track', name: 'TagEditTrack', component: () => import('./views/TagEditTrack.vue') },
  { path: '/settings', name: 'Settings', component: () => import('./views/Settings.vue') },
  { path: '/settings/source-probe', name: 'SourceProbe', component: () => import('./views/SourceProbe.vue') },
  { path: '/about', name: 'About', component: () => import('./views/About.vue') },
  { path: '/auth-callback', name: 'AuthCallback', component: () => import('./views/AuthCallback.vue'), meta: { public: true } },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

let authInitPromise = null

function ensureAuthInit() {
  if (!authInitPromise) authInitPromise = initAuth()
  return authInitPromise
}

router.beforeEach(async (to, from) => {
  if (to.path !== from.path) startRouteLoading(to)
  await ensureAuthInit()

  if (to.meta.public) {
    finishRouteLoading()
    if (isSessionValid.value && to.name === 'Login') {
      if (currentUser.value?.mustChangePassword) {
        return { name: 'ChangeDefaultAccount', query: to.query }
      }
      return '/library'
    }
    return true
  }

  if (!getToken() && !isSessionValid.value) {
    finishRouteLoading()
    return { name: 'Login', query: { redirect: to.fullPath } }
  }

  if (currentUser.value?.mustChangePassword && to.name !== 'ChangeDefaultAccount') {
    finishRouteLoading()
    return { name: 'ChangeDefaultAccount', query: { redirect: to.fullPath } }
  }

  if (to.name === 'ChangeDefaultAccount' && !currentUser.value?.mustChangePassword) {
    finishRouteLoading()
    return '/library'
  }

  if (to.path !== from.path) startRouteLoading(to)
  return true
})

router.afterEach((to, from) => {
  if (to.meta.public) {
    finishRouteLoading()
    return
  }
  // 仅 query 变化时不要清掉正在切 tab 的骨架，否则会闪回上一页
  if (to.path === from.path) return
  const token = getRouteLoadingToken()
  nextTick(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => finishRouteLoading(token))
    })
  })
})

router.onError(() => {
  finishRouteLoading(getRouteLoadingToken())
})
