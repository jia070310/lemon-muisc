/* 柠檬音乐：仅缓存前端壳，不缓存 /api、/ws 与音频流
 * 多域名各自独立注册 SW；导航与 assets 均网络优先，避免旧壳引用已失效的 hash 资源导致白屏。
 */
const CACHE = 'lemon-shell-v1.2.17.3'

const PRECACHE = [
  '/manifest.webmanifest',
  '/icon.png',
  '/favicon.png',
  '/favicon.ico',
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

  // SPA 文档：始终网络优先，不把 HTML 写入长期缓存（多域名/升级后旧壳最易白屏）
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match('/index.html').then((cached) => cached || Response.error()),
      ),
    )
    return
  }

  // 构建产物：网络优先，失败再回退缓存（避免一直用旧 hash 文件）
  if (url.pathname.startsWith('/assets/')) {
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
