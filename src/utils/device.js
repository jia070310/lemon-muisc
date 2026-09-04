const MOBILE_UA_RE = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini|HarmonyOS|OpenHarmony/i
const IOS_UA_RE = /iPhone|iPad|iPod/i

/** iOS / iPadOS 浏览器（Safari/Chrome 等均无元素全屏 API） */
export function isIosLikeDevice() {
  if (typeof navigator === 'undefined') return false
  if (IOS_UA_RE.test(navigator.userAgent || '')) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/** 是否支持对任意元素调用全屏 API（iOS Safari 不支持） */
export function supportsElementFullscreen() {
  if (typeof document === 'undefined') return false
  const el = document.documentElement
  return Boolean(
    document.fullscreenEnabled
    || document.webkitFullscreenEnabled
    || el.requestFullscreen
    || el.webkitRequestFullscreen,
  )
}

/** 触摸为主的手机/平板（不依赖视口宽度） */
export function isTouchMobileDevice() {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) return true
  } catch {}
  if (navigator.userAgentData?.mobile) return true
  return MOBILE_UA_RE.test(navigator.userAgent || '')
}

/** 窄屏或触摸移动设备，用于移动端 UI 分支 */
export function isMobileUiContext(maxWidth = 860) {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia(`(max-width: ${maxWidth}px)`).matches) return true
  } catch {}
  return isTouchMobileDevice()
}
