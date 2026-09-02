import { Router } from 'express'
import {
  createSession,
  createUser,
  deleteSession,
  deleteUser,
  findUserByUsername,
  findUserByEmail,
  getSession,
  getUserCount,
  listUsers,
  migrateAuthData,
  toPublicUser,
  updateUserPassword,
  updateUserProfile,
  updateUserByAdmin,
  verifyPassword,
  setUserEmail,
  markEmailVerified,
  findUserById,
  deleteUserSessions,
} from '../utils/auth.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'
import { createAuthToken, consumeAuthToken } from '../utils/authTokens.js'
import {
  isMailConfigured,
  sendVerificationEmail,
  sendPasswordResetEmail,
  testMailConnection,
  mailConfigToSettings,
  normalizeMailConfig,
} from '../utils/mail.js'
import { setGlobalSettings } from '../utils/userSettings.js'
import { writeSetupHint, writeLocalCredentials } from '../utils/setupHint.js'

function assertSetupPhase() {
  if (getUserCount() > 0) {
    const err = new Error('系统已初始化')
    err.status = 400
    throw err
  }
}

function applySetupMail(mail) {
  if (!mail?.host) return false
  const entries = mailConfigToSettings({ ...mail, enabled: mail.enabled !== false })
  if (!Object.keys(entries).length) return false
  setGlobalSettings(entries)
  return true
}

export const authRouter = Router()

const loginAttempts = new Map()
const forgotAttempts = new Map()
const LOGIN_WINDOW_MS = 60_000
const LOGIN_MAX_ATTEMPTS = 8
const FORGOT_WINDOW_MS = 15 * 60_000
const FORGOT_MAX_ATTEMPTS = 5

const GENERIC_RESET_MSG = '若该账号已绑定并验证邮箱，重置链接已发送，请查收邮件（含垃圾箱）'

function getClientKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown'
}

function checkLoginRateLimit(req) {
  const key = getClientKey(req)
  const now = Date.now()
  const record = loginAttempts.get(key)
  if (!record || now - record.start > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { start: now, count: 0 })
    return true
  }
  if (record.count >= LOGIN_MAX_ATTEMPTS) return false
  return true
}

function recordLoginAttempt(req, success) {
  const key = getClientKey(req)
  if (success) {
    loginAttempts.delete(key)
    return
  }
  const now = Date.now()
  const record = loginAttempts.get(key)
  if (!record || now - record.start > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { start: now, count: 1 })
    return
  }
  record.count += 1
}

function checkForgotRateLimit(req) {
  const key = getClientKey(req)
  const now = Date.now()
  const record = forgotAttempts.get(key)
  if (!record || now - record.start > FORGOT_WINDOW_MS) {
    forgotAttempts.set(key, { start: now, count: 0 })
    return true
  }
  return record.count < FORGOT_MAX_ATTEMPTS
}

function recordForgotAttempt(req) {
  const key = getClientKey(req)
  const now = Date.now()
  const record = forgotAttempts.get(key)
  if (!record || now - record.start > FORGOT_WINDOW_MS) {
    forgotAttempts.set(key, { start: now, count: 1 })
    return
  }
  record.count += 1
}

async function trySendVerification(req, user) {
  if (!user?.email || !isMailConfigured()) return false
  const token = createAuthToken(user.id, 'email_verify')
  await sendVerificationEmail(req, user, token)
  return true
}

authRouter.get('/status', (_req, res) => {
  res.json({
    setupRequired: getUserCount() === 0,
    authenticated: false,
    mailConfigured: isMailConfigured(),
  })
})

authRouter.post('/setup/test-mail', async (req, res) => {
  try {
    assertSetupPhase()
    const { mail, to } = req.body || {}
    const testTo = String(to || '').trim()
    if (!testTo) return res.status(400).json({ error: '请填写测试收件邮箱' })
    const cfg = normalizeMailConfig({ ...mail, enabled: true })
    await testMailConnection(testTo, cfg)
    res.json({ ok: true, message: '测试邮件已发送，请查收' })
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message })
  }
})

authRouter.post('/setup', async (req, res) => {
  try {
    assertSetupPhase()
    const { username, password, displayName, email, mail, recoveryMode = 'mail' } = req.body || {}
    const useMailRecovery = recoveryMode !== 'local'
    const mailSaved = useMailRecovery ? applySetupMail(mail) : false

    const user = createUser({
      username: username || 'admin',
      password,
      displayName: displayName || username || '管理员',
      role: 'admin',
      email: useMailRecovery ? email : '',
    })
    migrateAuthData(user.id)

    let verificationSent = false
    if (useMailRecovery) {
      try {
        verificationSent = await trySendVerification(req, user)
      } catch (e) {
        console.warn('[邮件] 初始化验证邮件发送失败:', e.message)
      }
    }

    const configPath = req.app?.locals?.configPath
    const credentialsFile = !useMailRecovery
      ? writeLocalCredentials(configPath, {
        username: user.username,
        password,
        displayName: user.display_name || user.username,
      })
      : null
    const hintFile = writeSetupHint(configPath, {
      username: user.username,
      email: user.email || '',
      mailConfigured: isMailConfigured(),
      verificationSent,
      recoveryMode: useMailRecovery ? 'mail' : 'local',
      credentialsFile,
    })

    const hintParts = []
    if (credentialsFile) hintParts.push(`账号已保存至：${credentialsFile}`)
    if (hintFile) hintParts.push(`初始化说明已保存至：${hintFile}`)

    const session = createSession(user.id, true)
    res.json({
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      user: toPublicUser(user),
      verificationSent,
      mailConfigured: isMailConfigured(),
      mailSaved,
      recoveryMode: useMailRecovery ? 'mail' : 'local',
      credentialsFile,
      hintFile,
      hintMessage: hintParts.join('\n'),
    })
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message })
  }
})

authRouter.post('/login', (req, res) => {
  try {
    if (!checkLoginRateLimit(req)) {
      return res.status(429).json({ error: '登录尝试过于频繁，请稍后再试' })
    }

    const { username, password, remember = true } = req.body || {}
    const user = findUserByUsername(username)
    if (!user || !verifyPassword(password, user.password_hash)) {
      recordLoginAttempt(req, false)
      return res.status(401).json({ error: '用户名或密码错误' })
    }

    recordLoginAttempt(req, true)
    const session = createSession(user.id, Boolean(remember))
    res.json({
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      user: toPublicUser(user),
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

authRouter.post('/logout', requireAuth, (req, res) => {
  deleteSession(req.authToken)
  res.json({ ok: true })
})

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

authRouter.patch('/profile', requireAuth, (req, res) => {
  try {
    const user = updateUserProfile(req.user.id, { displayName: req.body?.displayName })
    res.json({ ok: true, user: toPublicUser(user) })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

authRouter.post('/change-password', requireAuth, (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {}
    const user = findUserByUsername(req.user.username)
    if (!verifyPassword(oldPassword, user.password_hash)) {
      return res.status(400).json({ error: '原密码不正确' })
    }
    updateUserPassword(user.id, newPassword)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

authRouter.get('/users', requireAuth, requireAdmin, (_req, res) => {
  res.json({ users: listUsers() })
})

authRouter.post('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password, displayName, role, email } = req.body || {}
    const user = createUser({
      username,
      password,
      displayName,
      email,
      role: role === 'admin' ? 'admin' : 'user',
    })
    let verificationSent = false
    if (email) {
      try {
        verificationSent = await trySendVerification(req, user)
      } catch (e) {
        console.warn('[邮件] 用户验证邮件发送失败:', e.message)
      }
    }
    res.json({ ok: true, user: toPublicUser(user), verificationSent })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

authRouter.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: '不能删除当前登录账号' })
    }
    deleteUser(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

authRouter.post('/users/:id/reset-password', requireAuth, requireAdmin, (req, res) => {
  try {
    const { password } = req.body || {}
    updateUserPassword(req.params.id, password)
    deleteUserSessions(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

authRouter.patch('/users/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const user = updateUserByAdmin(req.params.id, {
      displayName: req.body?.displayName,
      email: req.body?.email,
      role: req.body?.role,
    })
    res.json({ ok: true, user: toPublicUser(user) })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

/** 忘记密码：通过已验证邮箱发送重置链接 */
authRouter.post('/forgot-password', async (req, res) => {
  try {
    if (!checkForgotRateLimit(req)) {
      return res.status(429).json({ error: '请求过于频繁，请稍后再试' })
    }
    recordForgotAttempt(req)

    if (!isMailConfigured()) {
      return res.status(400).json({
        error: '邮件服务未配置，请联系管理员或使用 NAS 命令行重置密码',
        code: 'MAIL_NOT_CONFIGURED',
      })
    }

    const account = String(req.body?.account || req.body?.email || req.body?.username || '').trim()
    if (!account) {
      return res.status(400).json({ error: '请输入用户名或邮箱' })
    }

    const user = findUserByEmail(account) || findUserByUsername(account)
    if (user?.email && user.email_verified) {
      const token = createAuthToken(user.id, 'password_reset')
      await sendPasswordResetEmail(req, user, token)
    }

    res.json({ ok: true, message: GENERIC_RESET_MSG })
  } catch (e) {
    console.error('[邮件] 找回密码失败:', e.message)
    res.json({ ok: true, message: GENERIC_RESET_MSG })
  }
})

/** 通过邮件令牌重置密码 */
authRouter.post('/reset-password', (req, res) => {
  try {
    const { token, password } = req.body || {}
    const consumed = consumeAuthToken(token, 'password_reset')
    if (!consumed) return res.status(400).json({ error: '链接无效或已过期，请重新申请' })
    updateUserPassword(consumed.userId, password)
    deleteUserSessions(consumed.userId)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

/** 验证邮箱 */
authRouter.post('/verify-email', (req, res) => {
  try {
    const token = req.body?.token || req.query?.token
    const consumed = consumeAuthToken(token, 'email_verify')
    if (!consumed) return res.status(400).json({ error: '验证链接无效或已过期' })
    markEmailVerified(consumed.userId)
    res.json({ ok: true, user: toPublicUser(findUserById(consumed.userId)) })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

/** 登录用户重新发送验证邮件 */
authRouter.post('/resend-verification', requireAuth, async (req, res) => {
  try {
    if (!isMailConfigured()) {
      return res.status(400).json({ error: '邮件服务未配置，请管理员在设置中配置 SMTP' })
    }
    const user = findUserById(req.user.id)
    if (!user?.email) return res.status(400).json({ error: '请先绑定邮箱' })
    if (user.email_verified) return res.json({ ok: true, message: '邮箱已验证' })
    await trySendVerification(req, user)
    res.json({ ok: true, message: '验证邮件已发送' })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

/** 登录用户绑定/修改邮箱 */
authRouter.post('/bind-email', requireAuth, async (req, res) => {
  try {
    const { email } = req.body || {}
    const user = setUserEmail(req.user.id, email)
    let verificationSent = false
    if (isMailConfigured()) {
      verificationSent = await trySendVerification(req, user)
    }
    res.json({
      ok: true,
      user: toPublicUser(user),
      verificationSent,
      message: verificationSent ? '验证邮件已发送' : '邮箱已保存，请管理员配置 SMTP 后发送验证邮件',
    })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

/** 测试 SMTP（管理员） */
authRouter.post('/mail/test', requireAuth, requireAdmin, async (req, res) => {
  try {
    const to = String(req.body?.to || '').trim()
    if (!to) return res.status(400).json({ error: '请填写收件邮箱' })
    await testMailConnection(to)
    res.json({ ok: true, message: '测试邮件已发送' })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

export function validateWsToken(token) {
  return getSession(token)
}
