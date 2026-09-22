const MOBILE_UA_RE = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini|HarmonyOS|OpenHarmony/i
const IOS_UA_RE = /iPhone|iPad|iPod/i
const HARMONY_UA_RE = /HarmonyOS|OpenHarmony/i

function getUa() {
  if (typeof navigator === 'undefined') return ''
  return String(navigator.userAgent || '')
}

/** iOS / iPadOS 浏览器（Safari/Chrome 等均无元素全屏 API） */
export function isIosLikeDevice() {
  if (typeof navigator === 'undefined') return false
  if (IOS_UA_RE.test(getUa())) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/**
 * 鸿蒙系（含旧版 Android 内核与 HarmonyOS NEXT）。
 * NEXT 常见特征：UA 含 HarmonyOS/OpenHarmony，且通常不含 Android。
 */
export function isHarmonyOsDevice() {
  return HARMONY_UA_RE.test(getUa())
}

/** 纯血鸿蒙 NEXT（非 Android 兼容层） */
export function isHarmonyOsNext() {
  const ua = getUa()
  if (!HARMONY_UA_RE.test(ua)) return false
  // 旧鸿蒙多带 Android；NEXT 一般不带
  if (/Android/i.test(ua)) return false
  return true
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
  return MOBILE_UA_RE.test(getUa())
}

/** 窄屏或触摸移动设备，用于移动端 UI 分支 */
export function isMobileUiContext(maxWidth = 860) {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia(`(max-width: ${maxWidth}px)`).matches) return true
  } catch {}
  return isTouchMobileDevice()
}
