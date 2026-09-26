import {
  createStreamTicket,
  ticketClaimsFromStreamUrl,
} from './streamTicket.js'

const STREAM_PREFIXES = ['/api/play/', '/api/tag/cover', '/api/v1/play/', '/api/v1/tag/cover']

export function needsStreamToken(url) {
  if (!url) return false
  return STREAM_PREFIXES.some((prefix) => String(url).includes(prefix))
}

function appendQueryParam(url, key, value) {
  if (!url || !value) return url
  const re = new RegExp(`[?&]${key}=`)
  if (re.test(String(url))) return url
  const sep = String(url).includes('?') ? '&' : '?'
  return `${url}${sep}${key}=${encodeURIComponent(value)}`
}

/**
 * 优先追加短时效 ticket；无 userId 时回退 session token（兼容旧客户端）。
 * @param {string} url
 * @param {string|{ sessionToken?: string, userId?: string, role?: string, ttlSec?: number }} tokenOrOpts
 */
export function appendStreamToken(url, tokenOrOpts) {
  if (!url || !needsStreamToken(url)) return url

  const opts = typeof tokenOrOpts === 'string'
    ? { sessionToken: tokenOrOpts }
    : (tokenOrOpts || {})

  const userId = opts.userId
  if (userId) {
    const claims = ticketClaimsFromStreamUrl(url)
    const ticket = createStreamTicket({
      userId,
      role: opts.role,
      path: claims.path,
      scope: claims.scope,
      ttlSec: opts.ttlSec,
    })
    if (ticket) return appendQueryParam(url, 'ticket', ticket)
  }

  if (opts.sessionToken) {
    return appendQueryParam(url, 'token', opts.sessionToken)
  }
  return url
}
