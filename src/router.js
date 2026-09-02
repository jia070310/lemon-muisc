import { createRouter, createWebHistory } from 'vue-router'
import {
  getToken,
  initAuth,
  isAuthReady,
  isSessionValid,
  needsSetup,
} from './utils/auth.js'

const routes = [
  { path: '/login', name: 'Login', component: () => import('./views/Login.vue'), meta: { public: true } },
  { path: '/setup', name: 'Setup', component: () => import('./views/Login.vue'), meta: { public: true } },
  { path: '/reset-password', name: 'ResetPassword', component: () => import('./views/ResetPassword.vue'), meta: { public: true } },
  { path: '/verify-email', name: 'VerifyEmail', component: () => import('./views/VerifyEmail.vue'), meta: { public: true } },
  { path: '/', redirect: '/search' },
  { path: '/search', name: 'Search', component: () => import('./views/Search.vue') },
  { path: '/discover', name: 'Discover', component: () => import('./views/Discover.vue') },
  { path: '/library', name: 'Library', component: () => import('./views/Library.vue') },
  { path: '/library/playlists', name: 'LibraryPlaylists', component: () => import('./views/LibraryPlaylists.vue') },
  { path: '/library/album', name: 'LibraryAlbum', component: () => import('./views/LibraryAlbum.vue') },
  { path: '/library/albums', name: 'LibraryAlbums', component: () => import('./views/LibraryAlbums.vue') },
  { path: '/library/genres', name: 'LibraryGenres', component: () => import('./views/LibraryGenres.vue') },
  { path: '/library/genre', name: 'LibraryGenre', component: () => import('./views/LibraryGenre.vue') },
  { path: '/download', name: 'Download', component: () => import('./views/Download.vue') },
  { path: '/tag', name: 'Tag', component: () => import('./views/TagEditor.vue') },
  { path: '/tag/track', name: 'TagEditTrack', component: () => import('./views/TagEditTrack.vue') },
  { path: '/settings', name: 'Settings', component: () => import('./views/Settings.vue') },
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

router.beforeEach(async (to) => {
  await ensureAuthInit()

  if (to.meta.public) {
    if (needsSetup.value) {
      if (to.name === 'Login') {
        return { name: 'Setup', query: to.query }
      }
      if (to.name !== 'Setup') {
        return { name: 'Setup' }
      }
    }
    if (!needsSetup.value && isSessionValid.value && (to.name === 'Login' || to.name === 'Setup')) {
      return '/search'
    }
    return true
  }

  if (!isAuthReady.value) return true

  if (needsSetup.value) {
    return { name: 'Setup', query: { redirect: to.fullPath } }
  }

  if (!getToken()) {
    return { name: 'Login', query: { redirect: to.fullPath } }
  }

  return true
})
