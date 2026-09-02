import nodemailer from 'nodemailer'
import { getGlobalSettings } from './userSettings.js'

export function isMailConfigured() {
  const s = getGlobalSettings()
  return s['mail.enabled'] === 'true'
    && Boolean(s['mail.smtp.host'])
    && Boolean(s['mail.from'])
}

export function getMailConfig() {
  const s = getGlobalSettings()
  return normalizeMailConfig(s)
}

export function normalizeMailConfig(raw = {}) {
  const s = raw['mail.smtp.host'] !== undefined ? {
    'mail.enabled': raw.enabled ?? raw['mail.enabled'],
    'mail.smtp.host': raw.host ?? raw['mail.smtp.host'],
    'mail.smtp.port': raw.port ?? raw['mail.smtp.port'],
    'mail.smtp.secure': raw.secure ?? raw['mail.smtp.secure'],
    'mail.smtp.user': raw.user ?? raw['mail.smtp.user'],
    'mail.smtp.pass': raw.pass ?? raw['mail.smtp.pass'],
    'mail.from': raw.from ?? raw['mail.from'],
    'mail.appUrl': raw.appUrl ?? raw['mail.appUrl'],
  } : raw

  return {
    enabled: s['mail.enabled'] === 'true' || s['mail.enabled'] === true,
    host: s['mail.smtp.host'] || '',
    port: Number(s['mail.smtp.port']) || 465,
    secure: s['mail.smtp.secure'] !== 'false' && s['mail.smtp.secure'] !== false,
    user: s['mail.smtp.user'] || '',
    pass: s['mail.smtp.pass'] || '',
    from: s['mail.from'] || '',
    appUrl: s['mail.appUrl'] || '',
  }
}

export function mailConfigToSettings(cfg = {}) {
  const normalized = normalizeMailConfig(cfg)
  if (!normalized.host) return {}
  return {
    'mail.enabled': normalized.enabled ? 'true' : 'false',
    'mail.smtp.host': normalized.host,
    'mail.smtp.port': String(normalized.port || 465),
    'mail.smtp.secure': normalized.secure ? 'true' : 'false',
    'mail.smtp.user': normalized.user || '',
    'mail.smtp.pass': normalized.pass || '',
    'mail.from': normalized.from || '',
    'mail.appUrl': normalized.appUrl || '',
  }
}

function createTransportFromConfig(cfg) {
  if (!cfg.host) throw new Error('请填写 SMTP 服务器')
  if (!cfg.from) throw new Error('请填写发件人地址')
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  })
}

export async function sendMail({ to, subject, text, html }, cfg = null) {
  const mailCfg = cfg || getMailConfig()
  if (!mailCfg.enabled && !cfg) {
    throw new Error('邮件服务未配置，请管理员在设置中配置 SMTP')
  }
  const transport = createTransportFromConfig(mailCfg)
  await transport.sendMail({
    from: mailCfg.from,
    to,
    subject,
    text,
    html: html || text,
  })
}

export function resolveAppBaseUrl(req) {
  const cfg = getMailConfig()
  if (cfg.appUrl) return cfg.appUrl.replace(/\/$/, '')

  const origin = req?.headers?.origin
  if (origin && /^https?:\/\//i.test(origin)) return origin.replace(/\/$/, '')

  const proto = req?.headers?.['x-forwarded-proto'] || req?.protocol || 'http'
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host
  if (host) return `${proto}://${host}`.replace(/\/$/, '')

  return 'http://localhost:7983'
}

export async function sendVerificationEmail(req, user, token) {
  const base = resolveAppBaseUrl(req)
  const url = `${base}/verify-email?token=${encodeURIComponent(token)}`
  await sendMail({
    to: user.email,
    subject: '柠檬音乐 · 验证邮箱',
    text: `你好 ${user.display_name || user.username}，\n\n请点击以下链接验证邮箱（24 小时内有效）：\n${url}\n\n如非本人操作请忽略此邮件。`,
    html: `<p>你好 <strong>${user.display_name || user.username}</strong>，</p><p>请点击下方按钮验证邮箱（24 小时内有效）：</p><p><a href="${url}">${url}</a></p><p>如非本人操作请忽略此邮件。</p>`,
  })
}

export async function sendPasswordResetEmail(req, user, token) {
  const base = resolveAppBaseUrl(req)
  const url = `${base}/reset-password?token=${encodeURIComponent(token)}`
  await sendMail({
    to: user.email,
    subject: '柠檬音乐 · 重置密码',
    text: `你好 ${user.display_name || user.username}，\n\n收到重置密码请求。请点击链接设置新密码（1 小时内有效）：\n${url}\n\n如非本人操作请忽略此邮件。`,
    html: `<p>你好 <strong>${user.display_name || user.username}</strong>，</p><p>收到重置密码请求。请点击链接设置新密码（1 小时内有效）：</p><p><a href="${url}">${url}</a></p><p>如非本人操作请忽略此邮件。</p>`,
  })
}

export async function testMailConnection(to, cfg = null) {
  await sendMail({
    to,
    subject: '柠檬音乐 · 邮件配置测试',
    text: '这是一封测试邮件。若你能收到，说明 SMTP 配置正确。',
  }, cfg)
}
