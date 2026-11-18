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
import {
  getFfmpegRuntimeStatus,
  setFfmpegFeatureEnabled,
} from '../utils/apePlay.js'
import {
  getFfmpegSetupSnapshot,
  getFfmpegInstallStatus,
  runFfmpegInstallWizard,
} from '../utils/ffmpegInstall.js'
import { ENABLED_PLATFORMS_KEY, parseSourcePlatformMap, syncPreviewAutoCloseOverrides } from '../utils/enabledPlatforms.js'

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
  const ignored = []
  const skippedSensitive = []

  for (const [key, value] of Object.entries(body)) {
    if (SENSITIVE_KEYS.has(key) && (!value || value === '********')) {
      skippedSensitive.push(key)
      continue
    }

    if (isGlobalSettingKey(key)) {
      if (req.user.role !== 'admin') {
        denied.push(key)
        continue
      }
      globalEntries[key] = value
    } else if (isUserSettingKey(key)) {
      userEntries[key] = value
    } else {
      // 非白名单且非 app.* 的 key 丢弃并回传，避免第三方误以为已保存
      ignored.push(key)
    }
  }

  if (denied.length) {
    return res.status(403).json({
      error: '以下设置需要管理员权限',
      keys: denied,
      code: 'FORBIDDEN',
      ignored,
    })
  }

  if (Object.keys(globalEntries).length) setGlobalSettings(globalEntries)
  if (Object.keys(userEntries).length) setUserSettings(req.user.id, userEntries)
  if (Object.prototype.hasOwnProperty.call(userEntries, ENABLED_PLATFORMS_KEY)) {
    syncPreviewAutoCloseOverrides(req.user.id, parseSourcePlatformMap(userEntries[ENABLED_PLATFORMS_KEY]))
  }

  const accepted = [...Object.keys(globalEntries), ...Object.keys(userEntries)]
  res.json({
    ok: true,
    accepted,
    ignored,
    ...(skippedSensitive.length ? { skippedSensitive } : {}),
    ...(ignored.length
      ? { warning: `有 ${ignored.length} 个 key 不在白名单内，未写入（客户端自定义请使用 app.* 前缀）` }
      : {}),
  })
})

/** 管理员读取纯全局设置 */
settingsRouter.get('/global', requireAdmin, (_req, res) => {
  res.json(getGlobalSettings())
})

/** ffmpeg 状态：是否已安装、是否已启用、安装进度 */
settingsRouter.get('/ffmpeg', async (_req, res) => {
  try {
    const status = await getFfmpegSetupSnapshot()
    res.json({ ok: true, ...status })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 重新检测系统 / 便携 ffmpeg */
settingsRouter.post('/ffmpeg/detect', async (_req, res) => {
  try {
    const status = await getFfmpegRuntimeStatus({ refresh: true })
    const setup = await getFfmpegSetupSnapshot()
    res.json({ ok: true, ...setup, ...status, install: getFfmpegInstallStatus() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 一键安装并启用（检测 → 必要时下载便携版 → 启用） */
settingsRouter.post('/ffmpeg/install', requireAdmin, async (_req, res) => {
  try {
    // 异步跑向导，立刻返回当前进度；前端轮询 /ffmpeg
    runFfmpegInstallWizard().catch(() => {})
    res.json({ ok: true, ...await getFfmpegSetupSnapshot(), install: getFfmpegInstallStatus() })
  } catch (e) {
    res.status(400).json({ error: e.message, install: getFfmpegInstallStatus() })
  }
})

settingsRouter.get('/ffmpeg/install-status', requireAdmin, (_req, res) => {
  res.json({ ok: true, install: getFfmpegInstallStatus() })
})

/** 启用：仅当已检测到 ffmpeg */
settingsRouter.post('/ffmpeg/enable', requireAdmin, async (_req, res) => {
  try {
    const status = await setFfmpegFeatureEnabled(true)
    res.json({ ok: true, ...status })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

/** 停用 APE / 情绪分析对 ffmpeg 的使用 */
settingsRouter.post('/ffmpeg/disable', requireAdmin, async (_req, res) => {
  try {
    const status = await setFfmpegFeatureEnabled(false)
    res.json({ ok: true, ...status })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})
