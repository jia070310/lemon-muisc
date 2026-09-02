import { getToken } from './auth.js'

const STREAM_PREFIXES = ['/api/play/', '/api/tag/cover']

export function needsStreamAuth(url) {
  if (!url) return false
  return STREAM_PREFIXES.some((prefix) => String(url).includes(prefix))
}

export function stripStreamAuth(url) {
  if (!url || !needsStreamAuth(url)) return url
  try {
    const u = new URL(url, window.location.origin)
    u.searchParams.delete('token')
    const qs = u.searchParams.toString()
    return `${u.pathname}${qs ? `?${qs}` : ''}`
  } catch {
    return String(url).replace(/([?&])token=[^&]*&?/g, '$1').replace(/[?&]$/, '')
  }
}

/** 为 audio/img 等无法带 Header 的媒体请求附加登录 token */
export function withStreamAuth(url) {
  if (!url || !needsStreamAuth(url)) return url
  const token = getToken()
  if (!token) return url
  try {
    const u = new URL(url, window.location.origin)
    if (u.searchParams.get('token') === token) {
      return `${u.pathname}${u.search}`
    }
    u.searchParams.set('token', token)
    return `${u.pathname}${u.search}`
  } catch {
    if (String(url).includes('token=')) return url
    const sep = String(url).includes('?') ? '&' : '?'
    return `${url}${sep}token=${encodeURIComponent(token)}`
  }
}
