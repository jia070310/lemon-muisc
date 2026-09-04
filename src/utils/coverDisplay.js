import { withStreamAuth } from './streamAuth.js'
import { isAppIconUrl } from './appIcon.js'

/** 把外链封面转成同源代理，避免音源 CDN 按 Referer 防盗链导致播放器裂图 */
export function toPlayableCoverUrl(url) {
  const raw = String(url || '').trim()
  if (!raw || isAppIconUrl(raw)) return raw
  if (/^(data:|blob:)/i.test(raw)) return raw
  if (raw.includes('/api/play/cover-img') || raw.startsWith('/api/tag/cover')) {
    return withStreamAuth(raw)
  }
  if (/^https?:\/\//i.test(raw)) {
    return withStreamAuth(`/api/play/cover-img?url=${encodeURIComponent(raw)}`)
  }
  return raw
}
