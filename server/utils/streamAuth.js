const STREAM_PREFIXES = ['/api/play/', '/api/tag/cover']

export function needsStreamToken(url) {
  if (!url) return false
  return STREAM_PREFIXES.some((prefix) => String(url).includes(prefix))
}

/**
 * 仅追加 token，不整段经 URLSearchParams 重编码。
 * 否则 path 里的空格会变成 +，部分环境下本地文件路径对不上。
 */
export function appendStreamToken(url, token) {
  if (!url || !token || !needsStreamToken(url)) return url
  if (/[?&]token=/.test(String(url))) return url
  const sep = String(url).includes('?') ? '&' : '?'
  return `${url}${sep}token=${encodeURIComponent(token)}`
}
