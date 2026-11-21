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

function hasDesktopPointerCapability() {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia('(any-pointer: fine)').matches) return true
    if (window.matchMedia('(any-hover: hover)').matches) return true
  } catch {}
  return false
}

/** 触摸为主的手机/平板（不依赖视口宽度） */
export function isTouchMobileDevice() {
  if (typeof window === 'undefined') return false
  if (navigator.userAgentData?.mobile === true) return true
  if (MOBILE_UA_RE.test(getUa())) return true
  try {
    // 有鼠标/触控板时不要因触控屏把 PC 判成手机
    if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
      return !hasDesktopPointerCapability()
    }
  } catch {}
  return false
}

/** 窄屏或触摸移动设备，用于移动端 UI 分支 */
export function isMobileUiContext(maxWidth = 860) {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia(`(max-width: ${maxWidth}px)`).matches) return true
  } catch {}
  return isTouchMobileDevice()
}

/**
 * 弱网 / 流量环境（蜂窝、省流、2g/3g）。
 * 用于拉长开播等待、压低试听音质，减轻手机流量下卡死与连跳。
 */
export function isConstrainedNetwork() {
  if (typeof navigator === 'undefined') return false
  try {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    if (!c) return false
    if (c.saveData) return true
    const type = String(c.type || '').toLowerCase()
    if (type === 'cellular') return true
    const eff = String(c.effectiveType || '').toLowerCase()
    if (eff === 'slow-2g' || eff === '2g' || eff === '3g') return true
  } catch {}
  return false
}

/** 判断主机名是否为常见局域网 / 本机地址（用于 NAS 内网访问） */
export function isLikelyLanHost(hostname) {
  const h = String(hostname || '').trim().toLowerCase()
  if (!h || h === 'localhost') return true
  if (h.endsWith('.local')) return true
  if (h === '[::1]' || h === '::1') return true
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  if (a === 10) return true
  if (a === 127) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

/** 当前页面是否通过局域网地址打开（与服务器同网段访问 NAS 时直出本地文件） */
export function isLikelyLanAccess() {
  if (typeof window === 'undefined') return false
  return isLikelyLanHost(window.location.hostname)
}
