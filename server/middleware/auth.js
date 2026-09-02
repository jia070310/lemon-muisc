import { getSession } from '../utils/auth.js'

function extractToken(req) {
  const header = req.headers.authorization || ''
  if (header.startsWith('Bearer ')) return header.slice(7).trim()
  if (typeof req.query?.token === 'string') return req.query.token
  return ''
}

export function requireAuth(req, res, next) {
  const token = extractToken(req)
  const session = getSession(token)
  if (!session) {
    return res.status(401).json({ error: '未登录或登录已过期', code: 'UNAUTHORIZED' })
  }
  req.authToken = token
  req.user = session.user
  next()
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限', code: 'FORBIDDEN' })
  }
  next()
}

export function optionalAuth(req, _res, next) {
  const token = extractToken(req)
  const session = getSession(token)
  if (session) {
    req.authToken = token
    req.user = session.user
  }
  next()
}

export { extractToken }
