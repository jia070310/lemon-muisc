/** PWA：注册 Service Worker，并暴露「添加到桌面」状态 */

let deferredInstallPrompt = null
const listeners = new Set()

function notify() {
  const state = getPwaInstallState()
  for (const fn of listeners) {
    try { fn(state) } catch { /* ignore */ }
  }
}

export function getPwaInstallState() {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  return {
    standalone,
    canInstall: Boolean(deferredInstallPrompt) && !standalone,
    isSecureContext: window.isSecureContext,
    protocol: window.location.protocol,
  }
}

export function onPwaInstallState(fn) {
  if (typeof fn !== 'function') return () => {}
  listeners.add(fn)
  fn(getPwaInstallState())
  return () => listeners.delete(fn)
}

export async function promptPwaInstall() {
  if (!deferredInstallPrompt) return { ok: false, reason: 'unavailable' }
  const ev = deferredInstallPrompt
  deferredInstallPrompt = null
  notify()
  try {
    await ev.prompt()
    const choice = await ev.userChoice
    return { ok: choice?.outcome === 'accepted', reason: choice?.outcome || 'dismissed' }
  } catch {
    return { ok: false, reason: 'error' }
  }
}

function bindInstallEvents() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredInstallPrompt = e
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null
    notify()
  })
  try {
    window.matchMedia('(display-mode: standalone)').addEventListener('change', notify)
  } catch { /* older Safari */ }
}

/** 仅生产环境注册，避免开发态缓存干扰 */
export function registerServiceWorker() {
  bindInstallEvents()
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  const start = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
  }

  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })
}
