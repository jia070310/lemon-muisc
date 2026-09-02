const STREAM_PREFIXES = ['/api/play/', '/api/tag/cover']

export function needsStreamToken(url) {
  if (!url) return false
  return STREAM_PREFIXES.some((prefix) => String(url).includes(prefix))
}

export function appendStreamToken(url, token) {
  if (!url || !token || !needsStreamToken(url)) return url
  try {
    const u = new URL(url, 'http://localhost')
    if (u.searchParams.has('token')) return url
    u.searchParams.set('token', token)
    return `${u.pathname}${u.search}`
  } catch {
    const sep = String(url).includes('?') ? '&' : '?'
    return `${url}${sep}token=${encodeURIComponent(token)}`
  }
}
