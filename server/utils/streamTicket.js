import { createHmac, timingSafeEqual, randomBytes } from 'crypto'
import path from 'path'
import { getDB } from '../db.js'

const DEFAULT_TTL_SEC = 2 * 60 * 60
const SETTINGS_KEY = 'stream_ticket_secret'

/** DB 未就绪时使用进程内固定密钥，避免签发与校验不一致 */
let memorySecret = ''

function b64url(buf) {
  return Buffer.from(buf).toString('base64url')
}

function fromB64url(str) {
  return Buffer.from(String(str || ''), 'base64url')
}

function getOrCreateSecret() {
  if (process.env.LEMON_STREAM_SECRET) {
    return String(process.env.LEMON_STREAM_SECRET)
  }
  const db = getDB()
  if (!db) {
    if (!memorySecret) memorySecret = randomBytes(32).toString('hex')
    return memorySecret
  }
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(SETTINGS_KEY)
    if (row?.value) return String(row.value)
    const secret = memorySecret || randomBytes(32).toString('hex')
    memorySecret = secret
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run(SETTINGS_KEY, secret)
    return secret
  } catch {
    if (!memorySecret) memorySecret = randomBytes(32).toString('hex')
    return memorySecret
  }
}

/**
 * 签发短时效媒体票（HMAC）。payload 含 userId、可选 path / scope、exp。
 * @param {{ userId: string, role?: string, path?: string, scope?: string, ttlSec?: number }} opts
 */
export function createStreamTicket(opts = {}) {
  const userId = String(opts.userId || '').trim()
  if (!userId) return ''
  const ttl = Math.max(60, Number(opts.ttlSec) || DEFAULT_TTL_SEC)
  const exp = Math.floor(Date.now() / 1000) + ttl
  const body = {
    uid: userId,
    role: opts.role || 'user',
    path: opts.path ? String(opts.path) : undefined,
    scope: opts.scope || undefined,
    exp,
  }
  const payload = b64url(JSON.stringify(body))
  const sig = createHmac('sha256', getOrCreateSecret()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

/**
 * @returns {{ userId: string, role: string, path?: string, scope?: string, exp: number } | null}
 */
export function verifyStreamTicket(ticket) {
  const raw = String(ticket || '').trim()
  if (!raw || !raw.includes('.')) return null
  const [payload, sig] = raw.split('.')
  if (!payload || !sig) return null
  try {
    const expect = createHmac('sha256', getOrCreateSecret()).update(payload).digest('base64url')
    const a = Buffer.from(sig)
    const b = Buffer.from(expect)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const body = JSON.parse(fromB64url(payload).toString('utf8'))
    const exp = Number(body.exp) || 0
    if (exp < Math.floor(Date.now() / 1000)) return null
    const userId = String(body.uid || '').trim()
    if (!userId) return null
    return {
      userId,
      role: body.role || 'user',
      path: body.path || undefined,
      scope: body.scope || undefined,
      exp,
    }
  } catch {
    return null
  }
}

/** 从流式 URL 提取 path / scope，用于签发票 */
export function ticketClaimsFromStreamUrl(url) {
  try {
    const u = new URL(url, 'http://local.invalid')
    const pathname = u.pathname || ''
    if (pathname.includes('/play/proxy') || pathname.endsWith('/proxy')) {
      return { scope: 'proxy' }
    }
    if (pathname.includes('/tag/cover') || pathname.includes('/cover-img')) {
      const p = u.searchParams.get('path') || u.searchParams.get('file') || ''
      return p ? { path: p, scope: 'cover' } : { scope: 'cover' }
    }
    const p = u.searchParams.get('path') || ''
    if (p) return { path: p, scope: 'local' }
    return { scope: 'stream' }
  } catch {
    return { scope: 'stream' }
  }
}

/**
 * 校验票据是否允许访问当前请求。
 */
export function ticketAllowsRequest(claims, req) {
  if (!claims) return false
  const scope = claims.scope || ''
  const url = String(req.originalUrl || req.url || '')
  const reqPath = String(req.query?.path || req.query?.file || '').trim()

  if (scope === 'proxy') {
    return url.includes('/play/proxy')
  }
  if (scope === 'cover') {
    return url.includes('/cover') || url.includes('/tag/cover')
  }
  if (claims.path && reqPath) {
    try {
      return path.resolve(claims.path) === path.resolve(reqPath)
    } catch {
      return String(claims.path) === reqPath
    }
  }
  if (scope === 'local' || scope === 'stream') {
    return Boolean(reqPath) || scope === 'stream'
  }
  return true
}
