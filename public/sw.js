/* 柠檬音乐：仅缓存前端壳，不缓存 /api、/ws 与音频流 */
const CACHE = 'lemon-shell-v1.2.16.8-harmony'

const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.png',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/pwa/icon-192.png',
  '/pwa/icon-512.png',
  '/pwa/icon-maskable-512.png',
]

function sameOrigin(url) {
  return url.origin === self.location.origin
}

function shouldBypass(url) {
  const p = url.pathname
  return (
    p.startsWith('/api') ||
    p.startsWith('/ws') ||
    p === '/sw.js'
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  let url
  try {
    url = new URL(req.url)
  } catch {
    return
  }
  if (!sameOrigin(url) || shouldBypass(url)) return

  // SPA 文档：网络优先，失败回退壳
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => {})
          }
          return res
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  // 构建产物：缓存优先，后台刷新
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetching = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
            }
            return res
          })
          .catch(() => cached)
        return cached || fetching
      }),
    )
    return
  }

  // 图标 / manifest 等：网络优先
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
        }
        return res
      })
      .catch(() => caches.match(req)),
  )
})
