import { randomBytes } from 'crypto'
import { getDB } from '../db.js'

const TTL = {
  email_verify: 24 * 60 * 60,
  password_reset: 60 * 60,
}

export function createAuthToken(userId, type) {
  const db = getDB()
  const token = randomBytes(32).toString('hex')
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + (TTL[type] || 3600)

  db.prepare('DELETE FROM auth_tokens WHERE user_id = ? AND type = ?').run(userId, type)
  db.prepare(`
    INSERT INTO auth_tokens (id, user_id, type, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(token, userId, type, expiresAt, now)

  return token
}

export function consumeAuthToken(token, type) {
  const db = getDB()
  if (!token) return null

  const row = db.prepare(`
    SELECT id, user_id, type, expires_at FROM auth_tokens WHERE id = ? AND type = ?
  `).get(token, type)

  if (!row) return null
  if (row.expires_at <= Math.floor(Date.now() / 1000)) {
    db.prepare('DELETE FROM auth_tokens WHERE id = ?').run(token)
    return null
  }

  db.prepare('DELETE FROM auth_tokens WHERE id = ?').run(token)
  return { userId: row.user_id, type: row.type }
}

export function peekAuthToken(token, type) {
  const db = getDB()
  const row = db.prepare(`
    SELECT id, user_id, type, expires_at FROM auth_tokens WHERE id = ? AND type = ?
  `).get(token, type)
  if (!row || row.expires_at <= Math.floor(Date.now() / 1000)) return null
  return { userId: row.user_id, type: row.type }
}
