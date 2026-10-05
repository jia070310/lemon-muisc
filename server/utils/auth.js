import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { getDB } from '../db.js'

export const DEFAULT_ADMIN_USERNAME = 'admin123'
export const DEFAULT_ADMIN_PASSWORD = 'admin123'
const SESSION_TTL_DEFAULT = 24 * 60 * 60
const SESSION_TTL_REMEMBER = 30 * 24 * 60 * 60

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password, stored) {
  if (!password || !stored) return false
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  try {
    const hashBuf = Buffer.from(hash, 'hex')
    const test = scryptSync(password, salt, 64)
    return timingSafeEqual(hashBuf, test)
  } catch {
    return false
  }
}

export function getUserCount() {
  const db = getDB()
  if (!db) return 0
  const row = db.prepare('SELECT COUNT(*) AS c FROM users').get()
  return row?.c || 0
}

export function hasPendingDefaultAdmin() {
  const db = getDB()
  if (!db) return false
  return Boolean(db.prepare('SELECT 1 FROM users WHERE must_change_password = 1 LIMIT 1').get())
}

export function findUserByUsername(username) {
  const db = getDB()
  if (!db || !username) return null
  return db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim())
}

export function findUserById(id) {
  const db = getDB()
  if (!db || !id) return null
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id)
}

export function toPublicUser(user) {
  if (!user) return null
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name || user.username,
    role: user.role || 'user',
    email: user.email || '',
    emailVerified: Boolean(user.email_verified),
    fnosUid: user.fnos_uid ?? null,
    createdAt: user.created_at,
    mustChangePassword: Boolean(Number(user.must_change_password)),
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function findUserByEmail(email) {
  const db = getDB()
  const normalized = normalizeEmail(email)
  if (!normalized) return null
  return db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(normalized)
}

export function createUser({ username, password, displayName = '', role = 'user', fnosUid = null, email = '', mustChangePassword = false }) {
  const db = getDB()
  const name = String(username || '').trim()
  if (!name || name.length < 2) throw new Error('用户名至少 2 个字符')
  if (!password || password.length < 6) throw new Error('密码至少 6 个字符')
  if (findUserByUsername(name)) throw new Error('用户名已存在')

  const normalizedEmail = normalizeEmail(email)
  if (normalizedEmail) {
    if (!isValidEmail(normalizedEmail)) throw new Error('邮箱格式不正确')
    if (findUserByEmail(normalizedEmail)) throw new Error('该邮箱已被使用')
  }

  const id = `user_${randomBytes(12).toString('hex')}`
  const now = Math.floor(Date.now() / 1000)
  db.prepare(`
    INSERT INTO users (id, username, password_hash, display_name, role, fnos_uid, email, email_verified, must_change_password, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(
    id,
    name,
    hashPassword(password),
    String(displayName || name).trim(),
    role === 'admin' ? 'admin' : 'user',
    fnosUid,
    normalizedEmail,
    mustChangePassword ? 1 : 0,
    now,
    now,
  )
  return findUserById(id)
}

export function setUserEmail(userId, email) {
  const normalized = normalizeEmail(email)
  if (!normalized) throw new Error('请填写邮箱')
  if (!isValidEmail(normalized)) throw new Error('邮箱格式不正确')
  const existing = findUserByEmail(normalized)
  if (existing && existing.id !== userId) throw new Error('该邮箱已被使用')
  const db = getDB()
  db.prepare('UPDATE users SET email = ?, email_verified = 0, updated_at = ? WHERE id = ?')
    .run(normalized, Math.floor(Date.now() / 1000), userId)
  return findUserById(userId)
}

export function markEmailVerified(userId) {
  const db = getDB()
  db.prepare('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?')
    .run(Math.floor(Date.now() / 1000), userId)
}

export function createSession(userId, remember = true) {
  const db = getDB()
  const token = randomBytes(32).toString('hex')
  const rememberFlag = remember ? 1 : 0
  const ttl = rememberFlag ? SESSION_TTL_REMEMBER : SESSION_TTL_DEFAULT
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + ttl
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now)
  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, created_at, remember)
    VALUES (?, ?, ?, ?, ?)
  `).run(token, userId, expiresAt, now, rememberFlag)
  return { token, expiresAt, remember: Boolean(rememberFlag), ttl }
}

function sessionTtlForRow(row) {
  if (row.remember != null) {
    return Number(row.remember) ? SESSION_TTL_REMEMBER : SESSION_TTL_DEFAULT
  }
  const created = row.created_at || row.expires_at - SESSION_TTL_DEFAULT
  const originalTtl = Math.max(0, row.expires_at - created)
  return originalTtl > SESSION_TTL_DEFAULT ? SESSION_TTL_REMEMBER : SESSION_TTL_DEFAULT
}

function slideSessionExpiry(row) {
  const db = getDB()
  if (!db) return row.expires_at
  const now = Math.floor(Date.now() / 1000)
  const ttl = sessionTtlForRow(row)
  // 活跃时滑动续期，每小时最多写一次库
  if (row.expires_at >= now + ttl - 3600) return row.expires_at
  const newExpires = now + ttl
  db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(newExpires, row.id)
  row.expires_at = newExpires
  return newExpires
}

export function getSession(token) {
  const db = getDB()
  if (!token) return null
  const row = db.prepare(`
    SELECT s.id, s.user_id, s.expires_at, s.created_at, s.remember,
           u.username, u.display_name, u.role, u.email, u.email_verified, u.fnos_uid, u.created_at AS user_created_at, u.must_change_password
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
  `).get(token)
  if (!row) return null
  const now = Math.floor(Date.now() / 1000)
  if (row.expires_at <= now) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(token)
    return null
  }
  const expiresAt = slideSessionExpiry(row)
  return {
    token: row.id,
    expiresAt,
    remember: Boolean(row.remember ?? (sessionTtlForRow(row) === SESSION_TTL_REMEMBER)),
    user: toPublicUser({
      id: row.user_id,
      username: row.username,
      display_name: row.display_name,
      role: row.role,
      email: row.email,
      email_verified: row.email_verified,
      fnos_uid: row.fnos_uid,
      created_at: row.user_created_at,
      must_change_password: row.must_change_password,
    }),
  }
}

export function deleteSession(token) {
  const db = getDB()
  if (!db || !token) return
  db.prepare('DELETE FROM sessions WHERE id = ?').run(token)
}

export function deleteUserSessions(userId) {
  const db = getDB()
  if (!db || !userId) return
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
}

export function listUsers() {
  const db = getDB()
  if (!db) return []
  return db.prepare('SELECT id, username, display_name, role, email, email_verified, fnos_uid, created_at, updated_at FROM users ORDER BY created_at ASC')
    .all()
    .map(toPublicUser)
}

export function updateUserPassword(userId, newPassword) {
  if (!newPassword || newPassword.length < 6) throw new Error('密码至少 6 个字符')
  const db = getDB()
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(hashPassword(newPassword), Math.floor(Date.now() / 1000), userId)
}

function normalizeUsername(username) {
  const name = String(username || '').trim()
  if (!name || name.length < 2) throw new Error('用户名至少 2 个字符')
  if (name.length > 32) throw new Error('用户名最多 32 个字符')
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5-]+$/.test(name)) throw new Error('用户名仅支持字母、数字、下划线和中文')
  return name
}

export function updateUserProfile(userId, { displayName, username } = {}) {
  const db = getDB()
  if (!db || !userId) throw new Error('用户不存在')
  const user = findUserById(userId)
  if (!user) throw new Error('用户不存在')

  if (username !== undefined) {
    const name = normalizeUsername(username)
    const taken = findUserByUsername(name)
    if (taken && taken.id !== userId) throw new Error('用户名已存在')
    db.prepare('UPDATE users SET username = ?, updated_at = ? WHERE id = ?')
      .run(name, Math.floor(Date.now() / 1000), userId)
  }

  if (displayName !== undefined) {
    const name = String(displayName ?? '').trim()
    if (!name) throw new Error('显示名称不能为空')
    db.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?')
      .run(name, Math.floor(Date.now() / 1000), userId)
  }
  return findUserById(userId)
}

export function completeDefaultAdminCredentials(userId, { username, password, displayName } = {}) {
  const user = findUserById(userId)
  if (!user) throw new Error('用户不存在')
  if (!Number(user.must_change_password)) throw new Error('当前账号无需此操作')
  if (!password || password.length < 6) throw new Error('密码至少 6 个字符')
  if (password === DEFAULT_ADMIN_PASSWORD) throw new Error('请设置新密码，不要继续使用默认密码')

  const name = normalizeUsername(username || user.username)
  if (name === DEFAULT_ADMIN_USERNAME) throw new Error('请修改默认用户名')
  const shown = String(displayName || name).trim()
  updateUserProfile(userId, { username: name, displayName: shown })
  updateUserPassword(userId, password)
  const db = getDB()
  db.prepare('UPDATE users SET must_change_password = 0, updated_at = ? WHERE id = ?')
    .run(Math.floor(Date.now() / 1000), userId)
  return findUserById(userId)
}

export function ensureDefaultAdmin() {
  if (getUserCount() > 0) return null
  const user = createUser({
    username: DEFAULT_ADMIN_USERNAME,
    password: DEFAULT_ADMIN_PASSWORD,
    displayName: '管理员',
    role: 'admin',
    mustChangePassword: true,
  })
  console.log(`[auth] 已创建默认管理员 ${DEFAULT_ADMIN_USERNAME}，请登录后立即修改账号和密码`)
  return user
}

export function updateUserByAdmin(userId, { displayName, email, role } = {}) {
  const db = getDB()
  const user = findUserById(userId)
  if (!user) throw new Error('用户不存在')

  if (displayName !== undefined) {
    const name = String(displayName || '').trim()
    if (!name) throw new Error('显示名称不能为空')
    db.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?')
      .run(name, Math.floor(Date.now() / 1000), userId)
  }

  if (email !== undefined) {
    const raw = String(email || '').trim()
    if (!raw) {
      db.prepare('UPDATE users SET email = ?, email_verified = 0, updated_at = ? WHERE id = ?')
        .run('', Math.floor(Date.now() / 1000), userId)
    } else {
      setUserEmail(userId, raw)
    }
  }

  if (role !== undefined) {
    const nextRole = role === 'admin' ? 'admin' : 'user'
    if (user.role === 'admin' && nextRole !== 'admin') {
      const adminCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get()?.c || 0
      if (adminCount <= 1) throw new Error('不能修改为普通用户，已经没有其他管理员账号')
    }
    db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?')
      .run(nextRole, Math.floor(Date.now() / 1000), userId)
  }

  return findUserById(userId)
}

export function deleteUser(userId) {
  const db = getDB()
  const user = findUserById(userId)
  if (!user) throw new Error('用户不存在')
  if (user.role === 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get()?.c || 0
    if (adminCount <= 1) throw new Error('不能删除最后一个管理员')
  }
  deleteUserSessions(userId)
  db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(userId)
  db.prepare("UPDATE download_tasks SET user_id = '' WHERE user_id = ?").run(userId)
  db.prepare('DELETE FROM users WHERE id = ?').run(userId)
}

export function migrateAuthData(adminUserId) {
  const db = getDB()
  const migrated = db.prepare("SELECT value FROM settings WHERE key = 'auth.migrated'").get()
  if (migrated?.value === 'true') return

  const libraryKeys = [
    'library.customPlaylists',
    'library.favorites',
    'library.favoriteAlbums',
    'library.favoriteArtists',
    'library.recentPlays',
    'library.userDataRevision',
    'ui.theme',
    'player.coverStyle',
    'player.visualizer',
  ]

  const upsertUserSetting = db.prepare(`
    INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
  `)

  for (const key of libraryKeys) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    if (row?.value != null) {
      upsertUserSetting.run(adminUserId, key, row.value)
    }
  }

  db.prepare("UPDATE download_tasks SET user_id = ? WHERE user_id IS NULL OR user_id = ''").run(adminUserId)

  db.prepare(`
    INSERT INTO settings (key, value) VALUES ('auth.migrated', 'true')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run()
}
