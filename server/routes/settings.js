import { Router } from 'express'
import {
  getMergedSettings,
  getGlobalSettings,
  isGlobalSettingKey,
  isUserSettingKey,
  setGlobalSettings,
  setUserSettings,
} from '../utils/userSettings.js'
import { requireAdmin } from '../middleware/auth.js'

export const settingsRouter = Router()

const SENSITIVE_KEYS = new Set(['mail.smtp.pass'])

function sanitizeSettings(settings) {
  const out = { ...settings }
  if (out['mail.smtp.pass']) out['mail.smtp.pass'] = '********'
  return out
}

settingsRouter.get('/', (req, res) => {
  const settings = sanitizeSettings(getMergedSettings(req.user.id))
  res.json({
    ...settings,
    _meta: {
      role: req.user.role,
      isAdmin: req.user.role === 'admin',
      mailConfigured: settings['mail.enabled'] === 'true' && Boolean(settings['mail.smtp.host']) && Boolean(settings['mail.from']),
    },
  })
})

settingsRouter.put('/', (req, res) => {
  const body = { ...req.body }
  delete body._meta

  const globalEntries = {}
  const userEntries = {}
  const denied = []

  for (const [key, value] of Object.entries(body)) {
    if (SENSITIVE_KEYS.has(key) && (!value || value === '********')) continue

    if (isGlobalSettingKey(key)) {
      if (req.user.role !== 'admin') {
        denied.push(key)
        continue
      }
      globalEntries[key] = value
    } else if (isUserSettingKey(key)) {
      userEntries[key] = value
    }
  }

  if (denied.length) {
    return res.status(403).json({
      error: '以下设置需要管理员权限',
      keys: denied,
      code: 'FORBIDDEN',
    })
  }

  if (Object.keys(globalEntries).length) setGlobalSettings(globalEntries)
  if (Object.keys(userEntries).length) setUserSettings(req.user.id, userEntries)

  res.json({ ok: true })
})

/** 管理员读取纯全局设置 */
settingsRouter.get('/global', requireAdmin, (_req, res) => {
  res.json(getGlobalSettings())
})
