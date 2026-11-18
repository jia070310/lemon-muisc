import { withStreamAuth } from './streamAuth.js'
import { isAppIconUrl } from './appIcon.js'

/**
 * 把外链封面转成同源代理，避免音源 CDN 按 Referer 防盗链导致播放器裂图。
 * @param {string} url
 * @param {{ size?: number }} [opts] size：列表缩略图边长（如 240），写入 w= 供服务端选较小 CDN 图并分缓存键
 */
function absolutizeRemoteCover(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('//')) return `https:${raw}`
  // 咪咕歌单歌曲封面常为 /data/oss/... 相对路径
  if (raw.startsWith('/data/oss/') || raw.startsWith('/product/')) {
    return `https://d.musicapp.migu.cn${raw}`
  }
  if (/^(?:data\/oss|product)\//i.test(raw)) {
    return `https://d.musicapp.migu.cn/${raw}`
  }
  return raw
}

export function toPlayableCoverUrl(url, opts = {}) {
  let raw = String(url || '').trim()
  if (!raw || isAppIconUrl(raw)) return raw
  if (/^(data:|blob:)/i.test(raw)) return raw
  raw = absolutizeRemoteCover(raw)
  const size = Number(opts.size) > 0 ? Math.min(500, Math.round(Number(opts.size))) : 0

  const withSize = (u) => {
    if (!size) return u
    if (/[?&]w=\d+/i.test(u)) return u
    const sep = u.includes('?') ? '&' : '?'
    return `${u}${sep}w=${size}`
  }

  if (
    raw.includes('/api/play/cover-img')
    || raw.startsWith('/api/tag/cover')
    || /\/api\/(?:v1\/)?podcasts\/[^/?#]+\/cover/i.test(raw)
  ) {
    return withStreamAuth(withSize(raw))
  }
  if (/^https?:\/\//i.test(raw)) {
    return withStreamAuth(withSize(`/api/play/cover-img?url=${encodeURIComponent(raw)}`))
  }
  return raw
}
