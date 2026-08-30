import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/search' },
  { path: '/search', name: 'Search', component: () => import('./views/Search.vue') },
  { path: '/discover', name: 'Discover', component: () => import('./views/Discover.vue') },
  { path: '/library', name: 'Library', component: () => import('./views/Library.vue') },
  { path: '/library/playlists', name: 'LibraryPlaylists', component: () => import('./views/LibraryPlaylists.vue') },
  { path: '/library/album', name: 'LibraryAlbum', component: () => import('./views/LibraryAlbum.vue') },
  { path: '/download', name: 'Download', component: () => import('./views/Download.vue') },
  { path: '/tag', name: 'Tag', component: () => import('./views/TagEditor.vue') },
  { path: '/settings', name: 'Settings', component: () => import('./views/Settings.vue') },
  { path: '/about', name: 'About', component: () => import('./views/About.vue') },
  { path: '/auth-callback', name: 'AuthCallback', component: () => import('./views/AuthCallback.vue') },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
