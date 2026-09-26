import { Router } from 'express'
import { isAllowedMediaPath, getMusicPathsForUser } from '../utils/filePaths.js'
import { hasActiveSource } from '../sourceManager.js'
import { getStoredActiveSourceIds } from '../utils/activeSources.js'
import {
  scanLossyLibraryTracks,
  matchQualityUpgradeTracks,
  buildUpgradeDownloadTasks,
  getUpgradeTargetSourceSupport,
  QUALITY_UPGRADE_PLAYLIST_ID,
} from '../utils/libraryQualityUpgrade.js'
import {
  createPlaylistDownloadJob,
  findActiveJobForPlaylist,
  cancelPlaylistDownloadJob,
} from '../utils/playlistDownloadJob.js'

export const qualityUpgradeRouter = Router()

function noSourcePayload() {
  return {
    error: '请先在设置中激活至少一个音源',
    code: 'NO_ACTIVE_SOURCE',
  }
}

/**
 * GET /api/library/quality-upgrade/options
 * 格式筛选项 + 目标音质在激活音源中的声明支持
 */
qualityUpgradeRouter.get('/options', (req, res) => {
  try {
    const data = getUpgradeTargetSourceSupport(req.user?.id)
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ error: e.message || '读取失败' })
  }
})

/**
 * POST /api/library/quality-upgrade/scan
 * 本地扫描有损文件（不访问在线接口）
 */
qualityUpgradeRouter.post('/scan', (req, res) => {
  try {
    const userId = req.user?.id
    const preferredQuality = String(req.body?.preferredQuality || 'flac').trim() || 'flac'
    const formatFilter = String(req.body?.formatFilter || 'all').trim() || 'all'
    const limit = Number(req.body?.limit) || 2000
    const data = scanLossyLibraryTracks(userId, { preferredQuality, formatFilter, limit })
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ error: e.message || '扫描失败' })
  }
})

/**
 * POST /api/library/quality-upgrade/match
 * 将本地曲目匹配到可升级的在线条目（分块调用，避免一次压垮音源）
 */
qualityUpgradeRouter.post('/match', async (req, res) => {
  try {
    const userId = req.user?.id
    if (!hasActiveSource(getStoredActiveSourceIds(userId))) {
      return res.status(400).json(noSourcePayload())
    }

    const preferredQuality = String(req.body?.preferredQuality || 'flac').trim() || 'flac'
    const exactQuality = req.body?.exactQuality !== false
    const rawTracks = Array.isArray(req.body?.tracks) ? req.body.tracks : []
    if (!rawTracks.length) return res.status(400).json({ error: '没有待匹配曲目' })
    if (rawTracks.length > 40) return res.status(400).json({ error: '单次最多匹配 40 首' })

    const tracks = []
    for (const t of rawTracks) {
      const filePath = String(t?.filePath || '').trim()
      if (!filePath || !isAllowedMediaPath(filePath, { userId })) continue
      tracks.push({
        filePath,
        title: String(t?.title || t?.name || '').trim(),
        artist: String(t?.artist || t?.singer || '').trim(),
        localQuality: String(t?.localQuality || '').trim(),
        localLabel: String(t?.localLabel || '').trim(),
      })
    }
    if (!tracks.length) return res.status(400).json({ error: '没有有效的本地文件路径' })

    const result = await matchQualityUpgradeTracks({
      tracks,
      preferredQuality,
      userId,
      concurrency: 2,
      exactQuality,
    })
    res.json({ ok: true, data: result })
  } catch (e) {
    if (e?.code === 'NO_ACTIVE_SOURCE') {
      return res.status(400).json(noSourcePayload())
    }
    res.status(500).json({ error: e.message || '匹配失败' })
  }
})

/**
 * POST /api/library/quality-upgrade/start
 * 用已匹配结果创建循序下载任务（覆盖原文件）
 */
qualityUpgradeRouter.post('/start', (req, res) => {
  try {
    const userId = req.user?.id
    if (!hasActiveSource(getStoredActiveSourceIds(userId))) {
      return res.status(400).json(noSourcePayload())
    }

    const preferredQuality = String(req.body?.preferredQuality || 'flac').trim() || 'flac'
    const strategy = String(req.body?.strategy || 'none').trim() || 'none'
    const floorQuality = String(req.body?.floorQuality || '').trim()
    const batchSize = req.body?.batchSize
    const intervalHours = req.body?.intervalHours
    const matched = Array.isArray(req.body?.matched) ? req.body.matched : []
    if (!matched.length) return res.status(400).json({ error: '没有可升级的匹配结果' })
    if (matched.length > 2000) return res.status(400).json({ error: '单次最多 2000 首' })

    const safeMatched = []
    for (const row of matched) {
      const filePath = String(row?.filePath || '').trim()
      if (!filePath || !isAllowedMediaPath(filePath, { allowMissing: true, userId })) continue
      if (!row?.onlineItem && !(row?.songId || row?.id)) continue
      safeMatched.push({ ...row, filePath })
    }
    if (!safeMatched.length) return res.status(400).json({ error: '匹配结果无效或路径不在音乐库内' })

    const existing = findActiveJobForPlaylist(userId, QUALITY_UPGRADE_PLAYLIST_ID)
    if (existing) {
      return res.status(409).json({
        error: '已有进行中的音质升级循序任务，请先取消或等待完成',
        code: 'JOB_EXISTS',
        job: existing,
      })
    }

    const tasks = buildUpgradeDownloadTasks(safeMatched, {
      preferredQuality,
      strategy,
      floorQuality,
    })
    if (!tasks.length) return res.status(400).json({ error: '未能生成下载任务' })

    const job = createPlaylistDownloadJob(userId, {
      playlistId: QUALITY_UPGRADE_PLAYLIST_ID,
      playlistName: '音质升级',
      batchSize,
      intervalHours,
      saveListFolder: false,
      preferredQuality,
      strategy,
      floorQuality,
      tasks,
    })

    res.json({
      ok: true,
      job,
      matchedCount: tasks.length,
      dirs: getMusicPathsForUser(userId)?.length || 0,
    })
  } catch (e) {
    if (e?.code === 'JOB_EXISTS') {
      return res.status(409).json({ error: e.message, code: e.code, job: e.job })
    }
    res.status(400).json({ error: e.message || '创建失败' })
  }
})

qualityUpgradeRouter.get('/active-job', (req, res) => {
  try {
    const job = findActiveJobForPlaylist(req.user.id, QUALITY_UPGRADE_PLAYLIST_ID)
    res.json({ job })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

qualityUpgradeRouter.post('/cancel', (req, res) => {
  try {
    const job = findActiveJobForPlaylist(req.user.id, QUALITY_UPGRADE_PLAYLIST_ID)
    if (!job) return res.json({ ok: true, job: null })
    const cancelled = cancelPlaylistDownloadJob(req.user.id, job.id)
    res.json({ ok: true, job: cancelled })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
