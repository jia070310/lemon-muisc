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
    // 用 %20 重写，避免空格变成 +
    const qs = []
    u.searchParams.forEach((value, key) => {
      qs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    })
    return `${u.pathname}${qs.length ? `?${qs.join('&')}` : ''}`
  } catch {
    return String(url).replace(/([?&])token=[^&]*&?/g, '$1').replace(/[?&]$/, '')
  }
}

/** 为 audio/img 等无法带 Header 的媒体请求附加登录 token（不重编码 path） */
export function withStreamAuth(url) {
  if (!url || !needsStreamAuth(url)) return url
  const token = getToken()
  if (!token) return url
  if (/[?&]token=/.test(String(url))) {
    // 已有 token：若与当前一致则原样返回，避免 URLSearchParams 把空格改成 +
    try {
      const u = new URL(url, window.location.origin)
      if (u.searchParams.get('token') === token) return String(url)
    } catch {
      return url
    }
  }
  const sep = String(url).includes('?') ? '&' : '?'
  return `${url}${sep}token=${encodeURIComponent(token)}`
}
