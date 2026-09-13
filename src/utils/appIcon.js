/** 站内 UI / 浏览器图标：黑底原版；桌面 PWA 暖色图标见 /pwa/ */
export const APP_ICON_URL = '/icon.png?v=legacy'

export function isAppIconUrl(url) {
  const s = String(url || '')
  return s === APP_ICON_URL || s.startsWith('/icon.png')
}
