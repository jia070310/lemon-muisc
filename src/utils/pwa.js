/**
 * PWA：注册 Service Worker，并暴露「添加到桌面」状态。
 * 兼容 Chromium / Safari / 鸿蒙浏览器（后者常无 beforeinstallprompt）。
 */
import { isHarmonyOsDevice, isHarmonyOsNext, isIosLikeDevice } from './device.js'

let deferredInstallPrompt = null
const listeners = new Set()

function matchDisplayMode(query) {
  try {
    return window.matchMedia(query).matches
  } catch {
    return false
  }
}

/** 是否已从主屏幕 / 独立窗口启动 */
export function isPwaStandalone() {
  if (typeof window === 'undefined') return false
  if (matchDisplayMode('(display-mode: standalone)')) return true
  if (matchDisplayMode('(display-mode: fullscreen)')) return true
  if (matchDisplayMode('(display-mode: minimal-ui)')) return true
  // iOS Safari
  if (window.navigator.standalone === true) return true
  // 部分 WebView / 鸿蒙容器会带自定义参数
  try {
    const q = new URLSearchParams(window.location.search)
    if (q.get('source') === 'pwa' || q.get('utm_source') === 'homescreen') return true
  } catch {}
  return false
}

export function getPwaInstallState() {
  const standalone = isPwaStandalone()
  const harmony = isHarmonyOsDevice()
  const harmonyNext = isHarmonyOsNext()
  const iosLike = isIosLikeDevice()
  const secure = Boolean(window.isSecureContext)
  const hasSw = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
  const hasPrompt = Boolean(deferredInstallPrompt)

  let installHint = ''
  if (standalone) {
    installHint = ''
  } else if (!secure) {
    installHint = '当前非 HTTPS（或非 localhost），多数浏览器无法安装 PWA。请用 https:// 访问 NAS。'
  } else if (hasPrompt) {
    installHint = '可点击下方按钮安装到桌面。'
  } else if (harmonyNext) {
    installHint = '鸿蒙 NEXT 系统浏览器对 PWA 支持有限：请用浏览器菜单「添加到桌面 / 添加到主屏幕」。添加到桌面后仍可能保留地址栏，属系统限制。'
  } else if (harmony) {
    installHint = '鸿蒙浏览器：打开右上角「⋮」或「菜单」→「添加到桌面 / 添加到主屏幕」。若无安装按钮属正常。'
  } else if (iosLike) {
    installHint = 'iPhone / iPad：Safari 底部分享 →「添加到主屏幕」。'
  } else {
    installHint = '若未出现安装按钮：用 Chrome / Edge 地址栏安装图标，或浏览器菜单「安装应用 / 添加到主屏幕」。'
  }

  return {
    standalone,
    canInstall: hasPrompt && !standalone,
    /** 虽无系统弹窗，但仍可引导用户手动添加 */
    canGuideInstall: !standalone && secure,
    isSecureContext: secure,
    hasServiceWorker: hasSw,
    isHarmony: harmony,
    isHarmonyNext: harmonyNext,
    isIosLike: iosLike,
    installHint,
    protocol: window.location.protocol,
  }
}

function notify() {
  const state = getPwaInstallState()
  for (const fn of listeners) {
    try { fn(state) } catch { /* ignore */ }
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
    // 必须 preventDefault，否则部分浏览器会立刻丢掉事件且不再触发
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
  try {
    window.matchMedia('(display-mode: fullscreen)').addEventListener('change', notify)
  } catch { /* ignore */ }
  // 页面可见时再扫一遍（从桌面返回 / 菜单操作后）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') notify()
  })
}

/** 仅生产环境注册，避免开发态缓存干扰 */
export function registerServiceWorker() {
  bindInstallEvents()
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  const start = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        // 鸿蒙 / 部分 WebKit：进入页面时主动检查更新
        try { reg.update() } catch {}
      })
      .catch(() => {})
  }

  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })
}
