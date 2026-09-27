/** 站内 UI / 浏览器图标；桌面 PWA 图标见 /pwa/ */
export const APP_ICON_URL = '/icon.png?v=orange-hp-2'

export function isAppIconUrl(url) {
  const s = String(url || '')
  return s === APP_ICON_URL || s.startsWith('/icon.png')
}
