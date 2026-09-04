export const APP_ICON_URL = '/icon.png'

export function isAppIconUrl(url) {
  return String(url || '').endsWith('/icon.png') || String(url || '') === APP_ICON_URL
}
