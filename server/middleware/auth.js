import { getSession } from '../utils/auth.js'
import { getAuthCookieToken, setAuthCookie, clearAuthCookie } from '../utils/authCookie.js'

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

function refreshAuthCookie(res, token, session) {
  if (!res || !token || !session?.expiresAt) return
  const maxAge = Math.max(0, session.expiresAt - Math.floor(Date.now() / 1000))
  setAuthCookie(res, token, maxAge)
}

export function requireAuth(req, res, next) {
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
  const token = extractToken(req)
  const session = getSession(token)
  if (session) {
    req.authToken = token
    req.user = session.user
    refreshAuthCookie(res, token, session)
  }
  next()
}

export { extractToken }
