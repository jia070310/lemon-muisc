import { getSession } from '../utils/auth.js'
import { getAuthCookieToken, setAuthCookie, clearAuthCookie } from '../utils/authCookie.js'
import { verifyStreamTicket, ticketAllowsRequest } from '../utils/streamTicket.js'

function extractToken(req) {
  const header = req.headers.authorization || ''
  if (header.startsWith('Bearer ')) {
    const bearer = header.slice(7).trim()
    if (bearer) return bearer
  }
  if (typeof req.query?.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim()
  }
  return getAuthCookieToken(req)
}

function extractTicket(req) {
  if (typeof req.query?.ticket === 'string' && req.query.ticket.trim()) {
    return req.query.ticket.trim()
  }
  const header = req.headers['x-stream-ticket']
  if (typeof header === 'string' && header.trim()) return header.trim()
  return ''
}

function refreshAuthCookie(res, token, session) {
  if (!res || !token || !session?.expiresAt) return
  const maxAge = Math.max(0, session.expiresAt - Math.floor(Date.now() / 1000))
  setAuthCookie(res, token, maxAge)
}

function tryAuthWithTicket(req, res) {
  const ticket = extractTicket(req)
  if (!ticket) return false
  const claims = verifyStreamTicket(ticket)
  if (!claims) {
    return res.status(401).json({ error: '媒体票无效或已过期', code: 'STREAM_TICKET_INVALID' })
  }
  if (!ticketAllowsRequest(claims, req)) {
    return res.status(403).json({ error: '媒体票与请求资源不匹配', code: 'STREAM_TICKET_MISMATCH' })
  }
  req.streamTicket = claims
  req.user = {
    id: claims.userId,
    role: claims.role || 'user',
  }
  req.authToken = null
  return true
}

export function requireAuth(req, res, next) {
  const ticketHandled = tryAuthWithTicket(req, res)
  if (ticketHandled === true) return next()
  if (ticketHandled) return // already sent error response

  const token = extractToken(req)
  const session = getSession(token)
  if (!session) {
    clearAuthCookie(res)
    return res.status(401).json({ error: '未登录或登录已过期', code: 'UNAUTHORIZED' })
  }
  req.authToken = token
  req.user = session.user
  refreshAuthCookie(res, token, session)
  next()
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限', code: 'FORBIDDEN' })
  }
  next()
}

export function optionalAuth(req, res, next) {
  const ticket = extractTicket(req)
  if (ticket) {
    const claims = verifyStreamTicket(ticket)
    if (claims && ticketAllowsRequest(claims, req)) {
      req.streamTicket = claims
      req.user = { id: claims.userId, role: claims.role || 'user' }
      return next()
    }
  }
  const token = extractToken(req)
  const session = getSession(token)
  if (session) {
    req.authToken = token
    req.user = session.user
    refreshAuthCookie(res, token, session)
  }
  next()
}

export { extractToken, extractTicket }
