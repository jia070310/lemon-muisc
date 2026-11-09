import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { getDB } from '../db.js'
import { broadcast } from '../ws.js'
import { requestSourceWithMeta, hasActiveSource } from '../sourceManager.js'
import { getStoredActiveSourceIds } from '../utils/activeSources.js'
import { writeMeta } from '../meta.js'
import { canWriteM4aExt } from '../utils/m4aTag.js'
import { joinArtists } from '../utils/artistTag.js'
import { buildMusicInfoFromTask } from '../utils/musicInfo.js'
import { buildEmbedLyrics } from '../utils/lyric.js'
import { getDownloadSavePath, isAllowedMediaPath, getMusicPathsForUser } from '../utils/filePaths.js'
import { getAppCacheSubdir } from '../utils/appPaths.js'
import { getMergedSettings } from '../utils/userSettings.js'
import { fetchTrackLyric, fetchTrackCover } from '../utils/trackMeta.js'
import { resolveDownloadEmbedMeta } from '../utils/downloadEmbedMeta.js'
import { isPlatformEnabled } from '../utils/enabledPlatforms.js'
import { AVAILABLE_SOURCES } from '../musicSdk.js'
import {
  getNextLowerQuality,
  isNoActiveSourceError,
  isRetryableDownloadError,
  downloadRetryDelayMs,
  qualityLabel,
  formatMissingQualityError,
  sleep,
} from '../utils/downloadQuality.js'
import {
  findNextCrossPlatformMatch,
  isCrossPlatformSupplementEnabled,
  listOnlinePlatforms,
  listPlatformsForSource,
} from '../utils/crossPlatformMatch.js'
import {
  parseDurationSeconds,
  probeFileDurationSeconds,
  probeRemoteAudioDurationSeconds,
  assertNotPreviewClip,
} from '../utils/audioDuration.js'
import {
  assertLosslessContentType,
  assertLosslessFile,
  isLosslessQuality,
} from '../utils/audioFormat.js'
import { buildMusicCdnHeaders } from '../utils/musicCdnHeaders.js'
import { formatUserError } from '../utils/userError.js'
import { buildSourceFallbackOffer } from '../utils/sourceFallback.js'
import { extractMusicUrl } from '../utils/sourceResult.js'
import { notifyLibraryChanged, notifyLibraryRemoved } from '../utils/libraryNotify.js'
import { scanBatchAndCache, removeCachePaths } from '../utils/libraryCache.js'
import { bumpLibraryIndexRevision } from '../utils/libraryIndexState.js'
import { resolveDownloadGroupDir, resolveDownloadGroupMode } from '../utils/downloadPath.js'
import { isPlaceholderName } from '../utils/filenameParse.js'
import {
  resolveExistFileMode,
  findExistingSameNameFiles,
  pickBestExistingFile,
  buildExistFileOffer,
  isSameAudioBaseName,
} from '../utils/downloadExist.js'
import { recordSourceHealthOutcome } from '../utils/sourceHealth.js'
import {
  startPlaylistDownloadScheduler,
  createPlaylistDownloadJob,
  listPlaylistDownloadJobs,
  getPlaylistDownloadJob,
  cancelPlaylistDownloadJob,
  continuePlaylistDownloadJob,
  pausePlaylistDownloadJob,
  findActiveJobForPlaylist,
} from '../utils/playlistDownloadJob.js'
import {
  isDownloadAllowedForUser,
  downloadForbiddenPayload,
} from '../utils/downloadPermission.js'

export const downloadRouter = Router()

/** 禁止未开放下载权限的普通用户发起/变更下载（允许查看列表） */
downloadRouter.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
  if (isDownloadAllowedForUser(req.user)) return next()
  return res.status(403).json(downloadForbiddenPayload())
})

const activeDownloads = new Map()
/** 用户对本批同名文件的默认处理：skip | overwrite */
const autoExistActionByUser = new Map()
/** 防抖：队列空闲后汇总同名待处理提醒 */
const existSummaryTimers = new Map()
const existSummaryNotifiedKeys = new Set()
/** 队列泵单飞：避免多次 processQueue 重入导致并发突破上限 */
let queuePumpRunning = false
let queuePumpQueued = false

export function getDownloadQueueStats() {
  try {
    const row = getDB().prepare(`
      SELECT COUNT(*) AS c FROM download_tasks WHERE status IN ('waiting', 'downloading', 'await_confirm', 'await_source', 'await_exist')
    `).get()
    return {
      running: activeDownloads.size,
      active: activeDownloads.size,
      pending: Number(row?.c) || 0,
    }
  } catch {
    return { running: activeDownloads.size, active: activeDownloads.size, pending: 0 }
  }
}

const SAME_QUALITY_ATTEMPTS = 3
const RETRY_DELAY_MS = 1200
const DOWNLOAD_ARTIFACT_EXTS = ['.mp3', '.flac', '.wav', '.ape', '.ogg', '.m4a', '.aac', '.wma', '.opus', '.dsf', '.dff']

function isAdmin(user) {
  return user?.role === 'admin'
}

function canAccessTask(user, task) {
  if (!task) return false
  if (isAdmin(user)) return true
  return !task.user_id || task.user_id === user.id
}

function getTaskForUser(user, taskId) {
  const row = getDB().prepare('SELECT * FROM download_tasks WHERE id = ?').get(taskId)
  if (!row || !canAccessTask(user, row)) return null
  return row
}

function listTasksQuery(user) {
  if (isAdmin(user)) {
    return getDB().prepare('SELECT * FROM download_tasks ORDER BY created_at DESC').all()
  }
  return getDB().prepare('SELECT * FROM download_tasks WHERE user_id = ? ORDER BY created_at DESC').all(user.id)
}

function dlBroadcast(type, data, explicitUserId = undefined) {
  let userId = explicitUserId
  if (userId === undefined) {
    if (data?.id) {
      const row = getDB().prepare('SELECT user_id FROM download_tasks WHERE id = ?').get(data.id)
      userId = row?.user_id || null
    } else {
      userId = null
    }
  }
  broadcast(type, data, userId)
}

downloadRouter.get('/list', (req, res) => {
  reconcileStaleDownloads()
  const rows = listTasksQuery(req.user)
  res.json(rows.map(r => ({ ...r, meta: JSON.parse(r.meta) })))
})

function getNoActiveSourcePayload() {
  let imported = 0
  try {
    imported = Number(getDB().prepare('SELECT COUNT(*) AS c FROM user_apis').get()?.c) || 0
  } catch {}
  const error = imported > 0
    ? '已导入音源但尚未激活，请先在设置中激活音源'
    : '请先在设置中导入并激活音源'
  return { error, code: 'NO_ACTIVE_SOURCE', imported }
}

/**
 * 将下载任务写入队列（供 /add 与歌单循序任务复用）
 * @returns {{ added: string[], skipped: number }}
 */
export function enqueueDownloadTasks(userId, tasks, { broadcastAdded = true } = {}) {
  if (!userId || !Array.isArray(tasks) || !tasks.length) return { added: [], skipped: 0 }

  const insert = getDB().prepare(`
    INSERT INTO download_tasks (id, name, singer, source, album, interval, quality, meta, status, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'waiting', ?)
  `)

  const activeKeys = loadActiveDownloadIdentityKeys(userId)
  const added = []
  let skipped = 0
  const tx = getDB().transaction(() => {
    for (const t of tasks) {
      const quality = t.quality || '320k'
      const key = buildDownloadIdentityKey(t, quality)
      if (key && activeKeys.has(key)) {
        skipped += 1
        continue
      }
      if (key) activeKeys.add(key)

      const id = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      let replacePath = String(t.replacePath || '').trim()
      if (replacePath && !isAllowedMediaPath(replacePath, { allowMissing: true, userId })) {
        replacePath = ''
      }
      const meta = JSON.stringify({
        songId: t.songId || t.id,
        hash: t.hash || '',
        songmid: t.songmid || '',
        copyrightId: t.copyrightId || '',
        albumAudioId: t.albumAudioId || '',
        duration: t.duration || '',
        musicId: t.musicId || '',
        rid: t.rid || '',
        dcTargetId: t.dcTargetId || '',
        albummid: t.albummid || t.albumMid || t.albumId || '',
        albumId: t.albumId || t.albumMid || t.albummid || '',
        albumMid: t.albumMid || t.albummid || t.albumId || '',
        strMediaMid: t.strMediaMid || '',
        img: t.img || t.picUrl || '',
        picUrl: t.picUrl || t.img || '',
        source: t.source,
        types: t.types || [],
        qualitys: t.qualitys || [],
        requestedQuality: t.preferredQuality || t.quality || '320k',
        preferredQuality: t.preferredQuality || t.quality || '320k',
        qualityPolicy: t.qualityPolicy || '',
        qualityFloor: t.qualityFloor || '',
        autoCascade: Boolean(t.autoCascade) || t.qualityPolicy === 'cascade',
        deferExistAsk: Boolean(t.deferExistAsk),
        batchId: t.batchId || '',
        listName: t.listName || '',
        albumArtist: t.albumArtist || t.singer || '',
        year: String(t.year || '').trim(),
        genre: String(t.genre || '').trim(),
        comment: String(t.comment || t.desc || t.description || '').trim(),
        desc: String(t.desc || t.comment || t.description || '').trim(),
        publishTime: String(t.publishTime || t.year || '').trim(),
        album: t.album || '',
        replacePath,
        forceOverwrite: Boolean(t.forceOverwrite || replacePath),
        keepOriginal: t.keepOriginal === true,
        sourceApiId: String(t.sourceApiId || '').trim(),
      })
      insert.run(id, t.name, t.singer || t.albumArtist || '', t.source || '', t.album || '', t.interval || '', quality, meta, userId)
      added.push(id)
    }
  })
  tx()

  if (broadcastAdded && added.length) {
    const placeholders = added.map(() => '?').join(',')
    const rows = getDB().prepare(
      `SELECT * FROM download_tasks WHERE id IN (${placeholders}) ORDER BY created_at DESC`,
    ).all(...added)
    broadcast('download:added', {
      tasks: rows.map((r) => ({
        ...r,
        meta: (() => {
          try { return JSON.parse(r.meta || '{}') } catch { return {} }
        })(),
      })),
      skipped,
    }, userId)
  }

  if (added.length) processQueue()
  return { added, skipped }
}

downloadRouter.post('/add', async (req, res) => {
  try {
    if (!hasActiveSource(getStoredActiveSourceIds(req.user?.id))) {
      return res.status(400).json(getNoActiveSourcePayload())
    }
    const { tasks } = req.body
    if (!Array.isArray(tasks) || !tasks.length) return res.status(400).json({ error: '没有下载任务' })
    if (tasks.length > 50) return res.status(400).json({ error: '单次最多添加 50 个下载任务' })

    const { added, skipped } = enqueueDownloadTasks(req.user.id, tasks)
    res.json({ ok: true, ids: added, skipped })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

downloadRouter.get('/playlist-jobs', (req, res) => {
  try {
    const status = String(req.query.status || '').trim() || undefined
    const jobs = listPlaylistDownloadJobs(req.user.id, { status })
    res.json({ jobs })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

downloadRouter.get('/playlist-jobs/active', (req, res) => {
  try {
    const playlistId = String(req.query.playlistId || '').trim()
    const job = playlistId
      ? findActiveJobForPlaylist(req.user.id, playlistId)
      : null
    res.json({ job })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

downloadRouter.post('/playlist-job', (req, res) => {
  try {
    if (!hasActiveSource(getStoredActiveSourceIds(req.user?.id))) {
      return res.status(400).json(getNoActiveSourcePayload())
    }
    const job = createPlaylistDownloadJob(req.user.id, req.body || {})
    res.json({ ok: true, job })
  } catch (e) {
    if (e?.code === 'JOB_EXISTS') {
      return res.status(409).json({ error: e.message, code: e.code, job: e.job })
    }
    res.status(400).json({ error: e.message || '创建失败' })
  }
})

downloadRouter.post('/playlist-job/:id/cancel', (req, res) => {
  try {
    const job = cancelPlaylistDownloadJob(req.user.id, req.params.id)
    if (!job) return res.status(404).json({ error: '任务不存在' })
    res.json({ ok: true, job })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

downloadRouter.post('/playlist-job/:id/pause', (req, res) => {
  try {
    const job = pausePlaylistDownloadJob(req.user.id, req.params.id)
    if (!job) return res.status(404).json({ error: '任务不存在' })
    res.json({ ok: true, job })
  } catch (e) {
    if (e?.code === 'JOB_NOT_ACTIVE') {
      return res.status(400).json({ error: e.message, code: e.code, job: e.job })
    }
    res.status(500).json({ error: e.message })
  }
})

downloadRouter.post('/playlist-job/:id/continue', (req, res) => {
  try {
    const result = continuePlaylistDownloadJob(req.user.id, req.params.id)
    if (!result?.job) return res.status(404).json({ error: '任务不存在' })
    res.json({
      ok: true,
      job: result.job,
      added: result.added,
      skipped: result.skipped,
      done: result.done,
    })
  } catch (e) {
    if (e?.code === 'JOB_NOT_ACTIVE' || e?.code === 'JOB_EMPTY') {
      return res.status(400).json({ error: e.message, code: e.code, job: e.job })
    }
    res.status(500).json({ error: e.message })
  }
})

downloadRouter.get('/playlist-job/:id', (req, res) => {
  try {
    const includePending = String(req.query.includePending || '') === '1'
      || String(req.query.includePending || '') === 'true'
    const job = getPlaylistDownloadJob(req.user.id, req.params.id, { includePending })
    if (!job) return res.status(404).json({ error: '任务不存在' })
    res.json({ job })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

downloadRouter.post('/pause/:id', (req, res) => {
  if (!getTaskForUser(req.user, req.params.id)) {
    return res.status(404).json({ error: '任务不存在' })
  }
  pauseTask(req.params.id)
  res.json({ ok: true })
})

downloadRouter.post('/resume/:id', (req, res) => {
  if (!getTaskForUser(req.user, req.params.id)) {
    return res.status(404).json({ error: '任务不存在' })
  }
  if (!resumeTask(req.params.id)) {
    return res.status(400).json({ error: '该任务当前状态无法继续或重试' })
  }
  res.json({ ok: true })
})

downloadRouter.post('/pause-all', (req, res) => {
  const ids = normalizeTaskIds(req.body?.ids)
  const count = pauseTasks(ids)
  res.json({ ok: true, count })
})

downloadRouter.post('/resume-all', (req, res) => {
  const ids = normalizeTaskIds(req.body?.ids)
  const count = resumeTasks(ids)
  res.json({ ok: true, count })
})

/** 用户确认：以降一档音质重新下载；确认后本批任务自动逐档下降，不再逐首询问 */
downloadRouter.post('/confirm-downgrade/:id', (req, res) => {
  try {
    const row = getTaskForUser(req.user, req.params.id)
    if (!row) return res.status(404).json({ error: '任务不存在' })
    const meta = parseTaskMeta(row)
    const offer = meta.downgradeOffer
    if (!offer?.toQuality) {
      return res.status(400).json({ error: '没有待确认的降质选项' })
    }
    enableAutoCascadeForUser(req.user.id)
    applyQualityDowngrade(row, offer.toQuality, { autoCascade: true, reason: offer.reason || '' })
    confirmPendingDowngradesForUser(req.user.id, { exceptId: row.id })
    processQueue()
    res.json({ ok: true, quality: offer.toQuality })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 用户拒绝降质：保留失败状态 */
downloadRouter.post('/reject-downgrade/:id', (req, res) => {
  try {
    const row = getTaskForUser(req.user, req.params.id)
    if (!row) return res.status(404).json({ error: '任务不存在' })
    let meta = {}
    try { meta = JSON.parse(row.meta || '{}') } catch { meta = {} }
    const reason = meta.downgradeOffer?.reason || formatUserError(row.error, '下载失败')
    delete meta.downgradeOffer
    getDB().prepare(`
      UPDATE download_tasks SET status = 'error', error = ?, meta = ? WHERE id = ?
    `).run(reason, JSON.stringify(meta), req.params.id)
    dlBroadcast('download:status', {
      id: req.params.id,
      status: 'error',
      error: reason,
      downgradeOffer: null,
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 同名文件已存在：仍下载当前音质（与本地其它格式并存，不删已有文件） */
downloadRouter.post('/confirm-exist/:id', (req, res) => {
  try {
    const row = getTaskForUser(req.user, req.params.id)
    if (!row) return res.status(404).json({ error: '任务不存在' })
    if (row.status !== 'await_exist') {
      return res.status(400).json({ error: '该任务没有待确认的同名文件' })
    }
    const applyToRest = Boolean(req.body?.applyToRest)
    if (applyToRest && req.user?.id) {
      autoExistActionByUser.set(req.user.id, 'overwrite')
    }
    confirmExistKeepAndDownload(row)
    if (applyToRest && req.user?.id) {
      confirmPendingExistForUser(req.user.id, { exceptId: row.id, action: 'overwrite' })
    }
    processQueue()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 同名文件已存在：跳过下载，沿用本地文件 */
downloadRouter.post('/skip-exist/:id', (req, res) => {
  try {
    const row = getTaskForUser(req.user, req.params.id)
    if (!row) return res.status(404).json({ error: '任务不存在' })
    if (row.status !== 'await_exist') {
      return res.status(400).json({ error: '该任务没有待确认的同名文件' })
    }
    const applyToRest = Boolean(req.body?.applyToRest)
    if (applyToRest && req.user?.id) {
      autoExistActionByUser.set(req.user.id, 'skip')
    }
    completeTaskWithExistingFile(row)
    if (applyToRest && req.user?.id) {
      confirmPendingExistForUser(req.user.id, { exceptId: row.id, action: 'skip' })
    }
    processQueue()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 用户确认：切换到指定音源继续下载 */
downloadRouter.post('/confirm-source/:id', (req, res) => {
  try {
    const row = getTaskForUser(req.user, req.params.id)
    if (!row) return res.status(404).json({ error: '任务不存在' })
    const sourceApiId = String(req.body?.sourceApiId || '').trim()
    if (!sourceApiId) return res.status(400).json({ error: '请选择要切换的音源' })

    let meta = {}
    try { meta = JSON.parse(row.meta || '{}') } catch { meta = {} }
    const offer = meta.sourceFallbackOffer
    if (!offer?.alternatives?.length) {
      return res.status(400).json({ error: '没有待确认的音源切换选项' })
    }
    if (!offer.alternatives.some((item) => item.id === sourceApiId)) {
      return res.status(400).json({ error: '所选音源不在可选列表中' })
    }

    meta.sourceApiId = sourceApiId
    meta.lastSourceSwitch = {
      fromId: offer.failedId,
      fromName: offer.failedName,
      toId: sourceApiId,
      toName: offer.alternatives.find((item) => item.id === sourceApiId)?.name || sourceApiId,
      at: new Date().toISOString(),
    }
    delete meta.sourceFallbackOffer

    cleanupTaskDownloadArtifacts(row, meta, taskSettings(row))
    clearTaskStoredFilePath(row.id)
    meta.forceRedownload = true
    getDB().prepare(`
      UPDATE download_tasks
      SET status = 'waiting', error = NULL, progress = 0, downloaded_size = 0, file_path = NULL, meta = ?
      WHERE id = ?
    `).run(JSON.stringify(meta), req.params.id)
    dlBroadcast('download:status', {
      id: req.params.id,
      status: 'waiting',
      error: '',
      sourceFallbackOffer: null,
    })
    processQueue()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 用户拒绝切换音源 */
downloadRouter.post('/reject-source/:id', (req, res) => {
  try {
    const row = getTaskForUser(req.user, req.params.id)
    if (!row) return res.status(404).json({ error: '任务不存在' })
    let meta = {}
    try { meta = JSON.parse(row.meta || '{}') } catch { meta = {} }
    delete meta.sourceFallbackOffer
    getDB().prepare(`
      UPDATE download_tasks SET status = 'error', error = ?, meta = ? WHERE id = ?
    `).run('已取消切换音源', JSON.stringify(meta), req.params.id)
    dlBroadcast('download:status', {
      id: req.params.id,
      status: 'error',
      error: '已取消切换音源',
      sourceFallbackOffer: null,
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

downloadRouter.delete('/:id', (req, res) => {
  try {
    if (!getTaskForUser(req.user, req.params.id)) {
      return res.status(404).json({ error: '任务不存在' })
    }
    removeDownloadTask(req.params.id, { deleteFile: true })
    res.json({ ok: true })
  } catch (e) {
    res.status(404).json({ error: e.message })
  }
})

/** 移出下载列表，不删除已下载文件 */
downloadRouter.post('/dismiss', (req, res) => {
  try {
    const ids = normalizeTaskIds(req.body?.ids)
    if (!ids?.length) return res.status(400).json({ error: '请选择要清理的任务' })
    const count = dismissDownloadTasks(ids)
    res.json({ ok: true, count })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 清空下载列表记录，不删除已下载文件 */
downloadRouter.post('/dismiss-all', (req, res) => {
  try {
    const rows = listTasksQuery(req.user)
    const ids = rows.map(r => r.id)
    const count = dismissDownloadTasks(ids)
    broadcast('download:cleared', { all: true }, req.user.id)
    res.json({ ok: true, count })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

downloadRouter.post('/clear-completed', (req, res) => {
  const rows = listTasksQuery(req.user).filter(r => r.status === 'completed')
  const count = dismissDownloadTasks(rows.map(r => r.id))
  broadcast('download:cleared', {}, req.user.id)
  res.json({ ok: true, count })
})

function normalizeTaskIds(ids) {
  if (!Array.isArray(ids) || !ids.length) return null
  return ids.map(id => String(id)).filter(Boolean)
}

function dismissDownloadTask(id) {
  return removeDownloadTask(id, { deleteFile: false })
}

function dismissDownloadTasks(ids) {
  let count = 0
  for (const id of ids) {
    try {
      removeDownloadTask(id, { deleteFile: false })
      count++
    } catch {}
  }
  return count
}

function removeDownloadTask(id, { deleteFile = false } = {}) {
  const taskId = String(id || '')
  if (!taskId) throw new Error('任务不存在')

  const dl = activeDownloads.get(taskId)
  if (dl?.abort) dl.abort.abort()
  activeDownloads.delete(taskId)

  const row = getDB().prepare('SELECT * FROM download_tasks WHERE id = ?').get(taskId)
  if (!row) throw new Error('任务不存在')

  if (deleteFile) {
    const settings = taskSettings(row)
    const meta = parseTaskMeta(row)
    cleanupTaskDownloadArtifacts(row, meta, settings)
  }
  getDB().prepare('DELETE FROM download_tasks WHERE id = ?').run(taskId)
  dlBroadcast('download:removed', { id: taskId })
  return true
}

function reconcileStaleDownloads() {
  // 进程重启后 activeDownloads 为空，库里仍标 downloading 会永远卡住
  const rows = getDB().prepare("SELECT * FROM download_tasks WHERE status = 'downloading'").all()
  for (const row of rows) {
    if (activeDownloads.has(row.id)) continue
    const partBytes = partFileSize(getTaskPartPath(row.id))
    const total = Number(row.total_size) || 0
    const downloaded = partBytes > 0 ? partBytes : (Number(row.downloaded_size) || 0)
    const progress = total > 0 ? Math.min(1, downloaded / total) : (Number(row.progress) || 0)
    getDB().prepare(`
      UPDATE download_tasks
      SET status = 'waiting', downloaded_size = ?, progress = ?, error = NULL
      WHERE id = ?
    `).run(downloaded, progress, row.id)
    const tip = partBytes > 0 ? '服务重启，等待断点续传…' : '服务重启，重新排队…'
    dlBroadcast('download:status', {
      id: row.id,
      status: 'waiting',
      progress,
      downloaded,
      total,
      tip,
      error: '',
    })
  }
}

function pauseTask(id) {
  const dl = activeDownloads.get(id)
  if (dl?.abort) dl.abort.abort()
  const row = getDB().prepare("SELECT id FROM download_tasks WHERE id = ? AND status IN ('waiting', 'downloading')").get(id)
  if (!row) return false
  getDB().prepare("UPDATE download_tasks SET status = 'paused' WHERE id = ?").run(id)
  dlBroadcast('download:status', { id, status: 'paused' })
  // 槽位在 downloadTask.finally 里释放；此处不删 activeDownloads，避免泵超额抢跑
  return true
}

function pauseTasks(ids = null) {
  const rows = ids?.length
    ? getDB().prepare(`SELECT id FROM download_tasks WHERE id IN (${ids.map(() => '?').join(',')}) AND status IN ('waiting', 'downloading')`).all(...ids)
    : getDB().prepare("SELECT id FROM download_tasks WHERE status IN ('waiting', 'downloading')").all()
  let count = 0
  for (const row of rows) {
    if (pauseTask(row.id)) count++
  }
  return count
}

function requeueTask(id, {
  allowedStatuses = ['paused', 'error', 'await_confirm', 'await_exist'],
  cleanupFiles = true,
  preserveProgress = false,
  pump = true,
} = {}) {
  const row = getDB().prepare('SELECT * FROM download_tasks WHERE id = ?').get(id)
  if (!row || !allowedStatuses.includes(row.status)) return false

  const forceRedownload = ['error', 'await_confirm', 'await_exist'].includes(row.status)
  // 手动继续 / 续传：保留 .part 与进度，不要当成失败重下
  const shouldCleanup = cleanupFiles && !preserveProgress
  const { meta } = prepareTaskForRetry(row, { cleanupFiles: shouldCleanup, forceRedownload: forceRedownload && !preserveProgress })
  if (row.status === 'await_exist') {
    meta.existFileConfirmed = true
    delete meta.existFileOffer
  }

  const partBytes = preserveProgress ? partFileSize(getTaskPartPath(id)) : 0
  const total = Number(row.total_size) || 0
  const downloaded = preserveProgress
    ? (partBytes > 0 ? partBytes : (Number(row.downloaded_size) || 0))
    : 0
  const progress = preserveProgress
    ? (total > 0 ? Math.min(1, downloaded / total) : (Number(row.progress) || 0))
    : 0

  getDB().prepare(`
    UPDATE download_tasks
    SET status = 'waiting', error = NULL, progress = ?, downloaded_size = ?, file_path = NULL, meta = ?
    WHERE id = ?
  `).run(progress, downloaded, JSON.stringify(meta), id)
  dlBroadcast('download:status', {
    id,
    status: 'waiting',
    error: '',
    progress,
    downloaded,
    total,
    tip: preserveProgress && downloaded > 0 ? '继续断点续传…' : '',
    downgradeOffer: null,
    existFileOffer: null,
  })
  if (pump) processQueue()
  return true
}

function confirmExistKeepAndDownload(row) {
  const meta = parseTaskMeta(row)
  delete meta.existFileOffer
  meta.existFileConfirmed = true
  meta.forceRedownload = true
  // 与本地其它格式并存：不删 flac/mp3 等同名异扩展名文件
  meta.keepOtherFormats = true
  // 只清本任务已跟踪的半成品 / 旧产物，不动目录里其它同名音频
  cleanupTaskDownloadArtifacts(row, meta, taskSettings(row), { onlyTracked: true })
  clearTaskStoredFilePath(row.id)
  getDB().prepare(`
    UPDATE download_tasks
    SET status = 'waiting', error = NULL, progress = 0, downloaded_size = 0, file_path = NULL, meta = ?
    WHERE id = ?
  `).run(JSON.stringify(meta), row.id)
  dlBroadcast('download:status', {
    id: row.id,
    status: 'waiting',
    error: '',
    progress: 0,
    existFileOffer: null,
  })
}

/** @deprecated 旧名，行为已改为并存下载 */
function confirmExistOverwrite(row) {
  confirmExistKeepAndDownload(row)
}

function completeTaskWithExistingFile(row) {
  const settings = taskSettings(row)
  const meta = parseTaskMeta(row)
  const offer = meta.existFileOffer
  const filePath = offer?.filePath || findExistingSameNameFiles(row, settings)[0] || ''
  delete meta.existFileOffer
  meta.existFileSkipped = true
  if (!filePath) {
    getDB().prepare(`
      UPDATE download_tasks SET status = 'error', error = ?, meta = ? WHERE id = ?
    `).run('未找到本地同名文件', JSON.stringify(meta), row.id)
    dlBroadcast('download:status', {
      id: row.id,
      status: 'error',
      error: '未找到本地同名文件',
      existFileOffer: null,
    })
    return
  }
  // 跳过：不占用「已完成」位、不顶到列表前；直接移出下载队列，本地文件不动
  cleanupTaskDownloadArtifacts(row, meta, settings, { exceptPath: filePath, onlyTracked: true })
  try {
    removeDownloadTask(row.id, { deleteFile: false })
  } catch {
    getDB().prepare('DELETE FROM download_tasks WHERE id = ?').run(row.id)
    dlBroadcast('download:removed', { id: row.id })
  }
}

function confirmPendingExistForUser(userId, { exceptId, action } = {}) {
  if (!userId || !action) return
  const rows = getDB().prepare(`
    SELECT * FROM download_tasks WHERE user_id = ? AND status = 'await_exist'
  `).all(userId)
  for (const row of rows) {
    if (row.id === exceptId) continue
    if (action === 'overwrite') confirmExistOverwrite(row)
    else if (action === 'skip') completeTaskWithExistingFile(row)
  }
}

function resumeTask(id) {
  return requeueTask(id, { cleanupFiles: false, preserveProgress: true })
}

function resumeTasks(ids = null) {
  const rows = ids?.length
    ? getDB().prepare(`SELECT id FROM download_tasks WHERE id IN (${ids.map(() => '?').join(',')}) AND status = 'paused'`).all(...ids)
    : getDB().prepare("SELECT id FROM download_tasks WHERE status = 'paused'").all()
  let count = 0
  for (const row of rows) {
    // 批量续传：只改状态，最后统一泵一次，避免每条都 processQueue 重入
    if (requeueTask(row.id, { cleanupFiles: false, preserveProgress: true, pump: false })) count++
  }
  if (count) processQueue()
  return count
}

export function initDownloadQueue() {
  reconcileStaleDownloads()
  processQueue()
  startPlaylistDownloadScheduler({ enqueueDownloadTasks })
}

function getSettings(userId = null) {
  if (userId) {
    try {
      return getMergedSettings(userId)
    } catch {}
  }
  const rows = getDB().prepare('SELECT key, value FROM settings').all()
  const s = {}
  for (const r of rows) s[r.key] = r.value
  return s
}

function taskSettings(task) {
  const s = getSettings(task?.user_id || null)
  s.__savePath = getDownloadSavePath(task?.user_id || null)
  return s
}

function taskSavePath(task) {
  return getDownloadSavePath(task?.user_id || null)
}

function parseTaskMeta(task) {
  try {
    return JSON.parse(task.meta || '{}')
  } catch {
    return {}
  }
}

/** 任务歌手：列字段优先，空则回落 meta.albumArtist */
function resolveTaskSinger(task, meta = null) {
  const m = meta || (task ? parseTaskMeta(task) : {})
  return String(task?.singer || m.albumArtist || '').trim()
}

function saveTaskMeta(taskId, meta) {
  getDB().prepare('UPDATE download_tasks SET meta = ? WHERE id = ?').run(JSON.stringify(meta), taskId)
}

/** 当前音源本档失败：记入 skip，后续同档尝试换其它激活音源 */
function skipCurrentDownloadSource(meta, taskId, platform, { preview = true } = {}) {
  if (!meta?.sourceApiId) return
  const userId = taskId
    ? (getDB().prepare('SELECT user_id FROM download_tasks WHERE id = ?').get(taskId)?.user_id || null)
    : null
  recordSourceHealthOutcome(meta.sourceApiId, preview, platform || '', userId)
  const skipped = new Set([...(meta.skipSourceIds || []), meta.sourceApiId].filter(Boolean))
  meta.skipSourceIds = [...skipped]
  if (taskId) saveTaskMeta(taskId, meta)
}

/** 本档失败后跳过当前音源，下一轮用其它激活音源 */
function skipFailedSource(meta, taskId, platform = '', { markPreview = true } = {}) {
  const sourceId = meta?.sourceApiId
  if (!sourceId) return false
  const userId = taskId
    ? (getDB().prepare('SELECT user_id FROM download_tasks WHERE id = ?').get(taskId)?.user_id || null)
    : null
  if (markPreview) recordSourceHealthOutcome(sourceId, true, platform, userId)
  const skipped = new Set([...(meta.skipSourceIds || []), sourceId].filter(Boolean))
  meta.skipSourceIds = [...skipped]
  if (taskId) saveTaskMeta(taskId, meta)
  return true
}

/** 记下已试过的平台，避免同档反复搜同一平台 */
function rememberTriedPlatform(meta, platform) {
  const plat = String(platform || '').trim()
  if (!plat) return
  const set = new Set([...(meta.skipPlatforms || []), plat].filter(Boolean))
  meta.skipPlatforms = [...set]
}

/**
 * 同音质跨平台补源：用搜到的同曲替换任务身份，清空本档音源 skip，继续下载
 * @returns {boolean} 是否已切换成功
 */
function applyCrossPlatformDownloadHit(task, meta, hit, quality) {
  if (!hit?.source) return false
  const from = String(meta.source || task.source || '').trim()
  const to = String(hit.source).trim()
  if (!to || to === from) return false

  rememberTriedPlatform(meta, from)
  meta.originalSource = meta.originalSource || from
  meta.source = to
  meta.songId = hit.songId || hit.songmid || hit.hash || hit.copyrightId || ''
  meta.hash = hit.hash || ''
  meta.songmid = hit.songmid || ''
  meta.strMediaMid = hit.strMediaMid || ''
  meta.copyrightId = hit.copyrightId || ''
  meta.albumAudioId = hit.albumAudioId || ''
  meta.albumId = hit.albumId || hit.albumMid || hit.albummid || ''
  meta.albumMid = hit.albumMid || hit.albummid || ''
  meta.albummid = hit.albummid || hit.albumMid || ''
  meta.musicId = hit.musicId || ''
  meta.rid = hit.rid || ''
  meta.dcTargetId = hit.dcTargetId || ''
  meta.picUrl = hit.picUrl || hit.img || meta.picUrl || ''
  meta.img = hit.img || hit.picUrl || meta.img || ''
  meta.types = Array.isArray(hit.types) ? hit.types : meta.types
  meta.qualitys = Array.isArray(hit.qualitys) ? hit.qualitys : meta.qualitys
  meta.duration = hit.duration ?? hit.interval ?? meta.duration
  // 跨平台仍锁定当前音源插件；仅在换音源时才放开
  if (!meta.lockedSourceApiId) {
    delete meta.sourceApiId
    delete meta.skipSourceIds
  } else {
    delete meta.sourceApiId
    meta.skipSourceIds = []
  }
  meta.lastPlatformSwitch = {
    from,
    to,
    quality,
    at: new Date().toISOString(),
    name: hit.name || task.name,
  }
  rememberTriedPlatform(meta, to)

  getDB().prepare(`
    UPDATE download_tasks SET source = ?, meta = ?, error = NULL WHERE id = ?
  `).run(to, JSON.stringify(meta), task.id)

  // 同步内存中的 task，供本轮继续下载
  task.source = to
  dlBroadcast('download:platform-switched', {
    id: task.id,
    name: task.name,
    from,
    to,
    quality,
  })
  dlBroadcast('download:status', {
    id: task.id,
    status: 'downloading',
    quality,
    source: to,
    error: '',
  })
  return true
}

async function tryCrossPlatformSameQuality(task, meta, quality, settings) {
  if (!isCrossPlatformSupplementEnabled(settings)) return false
  const from = String(meta.source || task.source || '').trim()
  rememberTriedPlatform(meta, from)
  const exclude = [...(meta.skipPlatforms || [])]
  const lockedId = String(meta.lockedSourceApiId || '').trim() || null
  // 锁源时只在该音源支持的平台里继续找，避免跳到其它脚本
  const hit = await findNextCrossPlatformMatch({
    name: task.name,
    singer: task.singer,
    userId: task.user_id,
    excludePlatforms: exclude,
    sourceId: lockedId,
  })
  if (!hit) {
    meta.crossPlatformExhausted = true
    saveTaskMeta(task.id, meta)
    return false
  }
  return applyCrossPlatformDownloadHit(task, meta, hit, quality)
}

/** 重试文案：校验失败不要说成「网络抖动」，否则用户以为断点续传坏了 */
function downloadRetryTip(attempt, lastError, partBytes = 0) {
  const n = `${attempt}/${SAME_QUALITY_ATTEMPTS}`
  const msg = String(lastError?.message || '')
  const code = lastError?.code || ''
  if (code === 'FAKE_LOSSLESS' || /假无损|不是有效 FLAC|不是 FLAC/i.test(msg)) {
    return `文件校验失败（假无损），换源重试（${n}）…`
  }
  if (code === 'PREVIEW_CLIP' || /试听片段|时长不完整/i.test(msg)) {
    return `检测到试听片段，换源重试（${n}）…`
  }
  if (/HTTP\s*40[134]|下载响应异常 HTTP 40/i.test(msg)) {
    return `链接失效，换链重试（${n}）…`
  }
  if (partBytes > 0) {
    return `网络中断，断点续传（${n}）…`
  }
  if (/ECONNRESET|ETIMEDOUT|timeout|timed out|socket hang up|请求超时/i.test(msg)) {
    return `网络抖动，重试中（${n}）…`
  }
  return `下载失败，重试中（${n}）…`
}

function shouldSkipSourceAfterError(error) {
  const message = error?.message || String(error || '')
  const code = error?.code || ''
  if (code === 'FAKE_LOSSLESS' || code === 'PREVIEW_CLIP') return true
  if (/假无损|试听片段|时长不完整|HTTP\s*40[134]|拒绝访问|下载响应异常/i.test(message)) return true
  return false
}

function applyQualityDowngrade(row, toQuality, { autoCascade = false, reason = '' } = {}) {
  const meta = parseTaskMeta(row)
  delete meta.downgradeOffer
  // 换音质后重新按激活音源顺序尝试，不锁死在上一档用过的音源 / 平台
  delete meta.sourceApiId
  delete meta.lockedSourceApiId
  delete meta.skipSourceIds
  delete meta.skipPlatforms
  delete meta.crossPlatformExhausted
  meta.autoCascade = autoCascade || Boolean(meta.autoCascade)
  meta.lastDowngrade = {
    from: row.quality,
    to: toQuality,
    at: new Date().toISOString(),
    reason: String(reason || '').slice(0, 300),
  }
  cleanupTaskDownloadArtifacts(row, meta, taskSettings(row))
  clearTaskStoredFilePath(row.id)
  meta.forceRedownload = true
  getDB().prepare(`
    UPDATE download_tasks
    SET quality = ?, meta = ?, status = 'waiting', error = NULL, progress = 0, downloaded_size = 0, file_path = NULL
    WHERE id = ?
  `).run(toQuality, JSON.stringify(meta), row.id)
  dlBroadcast('download:status', {
    id: row.id,
    status: 'waiting',
    quality: toQuality,
    error: '',
    downgradeOffer: null,
  })
}

function enableAutoCascadeForUser(userId) {
  if (!userId) return
  const rows = getDB().prepare(`
    SELECT * FROM download_tasks
    WHERE user_id = ? AND status IN ('waiting', 'downloading', 'await_confirm')
  `).all(userId)
  for (const row of rows) {
    const meta = parseTaskMeta(row)
    if (meta.autoCascade) continue
    meta.autoCascade = true
    saveTaskMeta(row.id, meta)
  }
}

function confirmPendingDowngradesForUser(userId, { exceptId } = {}) {
  if (!userId) return
  const rows = getDB().prepare(`
    SELECT * FROM download_tasks WHERE user_id = ? AND status = 'await_confirm'
  `).all(userId)
  for (const row of rows) {
    if (row.id === exceptId) continue
    const meta = parseTaskMeta(row)
    const toQuality = meta.downgradeOffer?.toQuality
    if (!toQuality) continue
    applyQualityDowngrade(row, toQuality, { autoCascade: true, reason: meta.downgradeOffer?.reason || '' })
  }
}

function getMaxDownloadSlots() {
  const raw = getSettings()['download.maxDownloadNum']
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return 3
  return Math.min(8, n)
}

/** 原子领取一条 waiting 任务，避免并发泵重复领到同一条 */
function claimNextWaitingTask() {
  const task = getDB().prepare(`
    SELECT * FROM download_tasks WHERE status = 'waiting' ORDER BY created_at ASC LIMIT 1
  `).get()
  if (!task) return null
  const result = getDB().prepare(`
    UPDATE download_tasks SET status = 'downloading' WHERE id = ? AND status = 'waiting'
  `).run(task.id)
  if (!result.changes) return null
  return task
}

function processQueue() {
  if (queuePumpRunning) {
    queuePumpQueued = true
    return
  }
  queuePumpRunning = true
  try {
    do {
      queuePumpQueued = false
      const maxDl = getMaxDownloadSlots()

      while (activeDownloads.size < maxDl) {
        const task = claimNextWaitingTask()
        if (!task) break

        // 先占槽并创建 abort，暂停可立刻取消；并发以 Map 大小为准
        const abort = new AbortController()
        activeDownloads.set(task.id, { abort })
        dlBroadcast('download:status', { id: task.id, status: 'downloading', quality: task.quality })

        Promise.resolve(downloadTask(task, taskSettings(task), abort)).finally(() => {
          activeDownloads.delete(task.id)
          if (task.user_id) scheduleExistSummary(task.user_id)
          processQueue()
        })
      }
    } while (queuePumpQueued)
  } finally {
    queuePumpRunning = false
    if (queuePumpQueued) {
      queuePumpQueued = false
      queueMicrotask(() => processQueue())
    }
  }
}

async function resolveDownloadUrl(source, quality, musicInfo, settings, meta = {}, userId = null) {
  if (!isPlatformEnabled(userId, source)) {
    const name = AVAILABLE_SOURCES[source]?.name || source
    throw new Error(`平台「${name}」已关闭，请在设置 → 音源管理中开启`)
  }
  // 锁定音源时：只打当前插件（换平台后再换其它插件）
  // 未锁定时：同平台按激活音源顺序全量尝试
  const lockedId = String(meta.lockedSourceApiId || '').trim() || null
  const result = await requestSourceWithMeta(source, 'musicUrl', {
    type: quality,
    quality,
    musicInfo,
  }, {
    fallbackMode: 'auto',
    preferredSourceId: lockedId || undefined,
    skipSourceIds: lockedId ? [] : (meta.skipSourceIds || []),
    allowedSourceIds: getStoredActiveSourceIds(userId),
    userId,
  })
  const url = extractMusicUrl(result.data)
  if (!url) throw new Error(`获取 ${qualityLabel(quality)} 音质下载链接失败，请尝试其他音质`)
  return { url, sourceInfo: result }
}

/** needle 的 read_timeout 是「整段 body 最长耗时」，不是空闲超时；母带大文件常远超 2 分钟 */
const DOWNLOAD_RESPONSE_TIMEOUT_MS = 90000
/** 无数据到达才算卡住；有进度的慢速大文件不中断 */
const DOWNLOAD_IDLE_TIMEOUT_MS = 3 * 60 * 1000

async function streamToFile(url, partPath, taskId, abort, quality = '', source = '') {
  const { default: needlePkg } = await import('needle')

  let existing = 0
  try {
    if (fs.existsSync(partPath)) existing = fs.statSync(partPath).size || 0
  } catch {
    existing = 0
  }

  if (existing > 0) {
    let knownTotal = 0
    try {
      knownTotal = Number(getDB().prepare('SELECT total_size FROM download_tasks WHERE id = ?').get(taskId)?.total_size) || 0
    } catch {}
    publishTaskProgress(taskId, {
      downloaded: existing,
      total: knownTotal,
      tip: '网络中断，正在断点续传…',
    })
  }

  const headers = buildMusicCdnHeaders(source, existing > 0 ? { Range: `bytes=${existing}-` } : {})
  const stream = needlePkg.get(url, {
    follow_max: 5,
    signal: abort.signal,
    open_timeout: 30000,
    response_timeout: DOWNLOAD_RESPONSE_TIMEOUT_MS,
    // 0 = 不限制总传输时长（避免母带下到一半被 read timeout 掐断后从头重下）
    read_timeout: 0,
    headers,
  })

  let writer = null
  let downloaded = existing
  let total = 0
  let settled = false

  const openWriter = (append) => {
    if (writer) {
      try { writer.destroy() } catch {}
      writer = null
    }
    if (!append) safeUnlink(partPath)
    writer = fs.createWriteStream(partPath, append ? { flags: 'a' } : undefined)
  }

  if (existing <= 0) openWriter(false)
  else openWriter(true)

  stream.on('header', (code, respHeaders) => {
    if (code && code >= 400) {
      stream.emit('err', new Error(`下载响应异常 HTTP ${code}`))
      return
    }
    try {
      assertLosslessContentType(respHeaders?.['content-type'], quality)
    } catch (e) {
      stream.emit('err', e)
      return
    }

    let tip = ''
    if (existing > 0 && code === 200) {
      // CDN 不支持 Range：丢弃半成品从头写
      existing = 0
      downloaded = 0
      openWriter(false)
      total = parseInt(respHeaders['content-length'], 10) || 0
      tip = '当前链接不支持续传，已重新下载'
    } else if (existing > 0 && code === 206) {
      const cr = String(respHeaders['content-range'] || '')
      const m = /\/(\d+)\s*$/.exec(cr)
      total = m ? parseInt(m[1], 10) || 0 : (existing + (parseInt(respHeaders['content-length'], 10) || 0))
      tip = '断点续传中…'
    } else {
      total = parseInt(respHeaders['content-length'], 10) || 0
    }
    publishTaskProgress(taskId, { downloaded, total, tip })
  })

  try {
    await new Promise((resolve, reject) => {
      let lastProgressAt = 0
      let lastDataAt = Date.now()
      let pendingProgress = null
      let progressTimer = null
      let idleTimer = null

      const finish = (err) => {
        if (settled) return
        settled = true
        if (progressTimer) {
          clearTimeout(progressTimer)
          progressTimer = null
        }
        if (idleTimer) {
          clearInterval(idleTimer)
          idleTimer = null
        }
        if (err) reject(err)
        else resolve()
      }

      const flushProgress = (force = false) => {
        if (!pendingProgress) return
        const now = Date.now()
        if (!force && now - lastProgressAt < 400) return
        const { downloaded: d, progress: p, total: t } = pendingProgress
        getDB().prepare('UPDATE download_tasks SET downloaded_size = ?, progress = ? WHERE id = ?')
          .run(d, p, taskId)
        dlBroadcast('download:progress', { id: taskId, progress: p, downloaded: d, total: t })
        lastProgressAt = now
        pendingProgress = null
      }

      const scheduleProgress = (nextDownloaded, nextTotal) => {
        const progress = nextTotal > 0 ? nextDownloaded / nextTotal : 0
        pendingProgress = { downloaded: nextDownloaded, progress, total: nextTotal }
        if (!progressTimer) {
          progressTimer = setTimeout(() => {
            progressTimer = null
            flushProgress(true)
          }, 400)
        }
      }

      idleTimer = setInterval(() => {
        if (Date.now() - lastDataAt >= DOWNLOAD_IDLE_TIMEOUT_MS) {
          const err = new Error('read timeout')
          err.code = 'ETIMEDOUT'
          try { stream.destroy(err) } catch {}
          finish(err)
        }
      }, 5000)

      stream.on('data', (chunk) => {
        lastDataAt = Date.now()
        downloaded += chunk.length
        try {
          if (writer && !writer.destroyed) writer.write(chunk)
        } catch (e) {
          finish(e)
          return
        }
        scheduleProgress(downloaded, total)
      })
      stream.on('done', (err) => {
        if (!err && pendingProgress) flushProgress(true)
        if (!writer || writer.destroyed) {
          if (err) finish(err)
          else finish()
          return
        }
        writer.end(() => {
          if (err) finish(err)
          else finish()
        })
      })
      stream.on('err', (err) => {
        try { writer?.destroy() } catch {}
        finish(err)
      })
      stream.on('timeout', () => {
        const err = new Error('read timeout')
        err.code = 'ETIMEDOUT'
        finish(err)
      })
    })
  } catch (e) {
    try { writer?.destroy() } catch {}
    // 可重试的网络错误保留 .part，下次同路径可 Range 续传
    if (!isRetryableDownloadError(e)) safeUnlink(partPath)
    throw e
  }
}

function markSourceFallbackOffer(task, meta, error) {
  const offer = buildSourceFallbackOffer(error)
  if (!offer) return false
  cleanupTaskDownloadArtifacts(task, meta, taskSettings(task), { onlyTracked: true })
  clearTaskStoredFilePath(task.id)
  meta.sourceFallbackOffer = {
    ...offer,
    at: new Date().toISOString(),
  }
  const tip = `音源「${offer.failedName}」取链失败，可切换到其他已激活音源`
  getDB().prepare(`
    UPDATE download_tasks SET status = 'await_source', error = ?, meta = ?, progress = 0 WHERE id = ?
  `).run(tip, JSON.stringify(meta), task.id)
  dlBroadcast('download:status', {
    id: task.id,
    status: 'await_source',
    error: tip,
    name: task.name,
    singer: task.singer,
    sourceFallbackOffer: meta.sourceFallbackOffer,
  })
  return true
}

function markAwaitConfirm(task, meta, fromQuality, toQuality, reason) {
  const friendlyReason = formatUserError(reason, '音源取链失败，请稍后重试')
  cleanupTaskDownloadArtifacts(task, meta, taskSettings(task), { onlyTracked: true })
  clearTaskStoredFilePath(task.id)
  meta.downloadArtifacts = []
  meta.downgradeOffer = {
    fromQuality,
    toQuality,
    fromLabel: qualityLabel(fromQuality),
    toLabel: qualityLabel(toQuality),
    reason: friendlyReason,
    reasonRaw: String(reason || '').slice(0, 300),
    at: new Date().toISOString(),
  }
  const tip = `${qualityLabel(fromQuality)} 多次失败（${friendlyReason}），可改用 ${qualityLabel(toQuality)}`
  getDB().prepare(`
    UPDATE download_tasks SET status = 'await_confirm', error = ?, meta = ?, progress = 0 WHERE id = ?
  `).run(tip, JSON.stringify(meta), task.id)
  dlBroadcast('download:status', {
    id: task.id,
    status: 'await_confirm',
    error: tip,
    quality: fromQuality,
    name: task.name,
    singer: task.singer,
    downgradeOffer: meta.downgradeOffer,
  })
}

async function markAwaitExist(task, meta, offer, { deferred = false } = {}) {
  meta.existFileOffer = offer
  if (deferred) meta.deferExistAsk = true
  // 批量场景汇总处理；勿写成「下载失败」以免与真正写盘失败混淆
  const tip = deferred
    ? `本地已有同名文件（${offer.localLabel}），当前要下 ${offer.requestedLabel}（待批量处理）`
    : `本地已有同名文件（${offer.localLabel}），可跳过或下载 ${offer.requestedLabel}`
  getDB().prepare(`
    UPDATE download_tasks SET status = 'await_exist', error = ?, meta = ?, progress = 0 WHERE id = ?
  `).run(tip, JSON.stringify(meta), task.id)
  dlBroadcast('download:status', {
    id: task.id,
    status: 'await_exist',
    error: tip,
    quality: task.quality,
    name: task.name,
    singer: task.singer,
    existFileOffer: offer,
    deferredExist: deferred,
  })
  if (deferred && task.user_id) {
    scheduleExistSummary(task.user_id)
  }
}

/**
 * 下载前检测同名文件。返回 true 表示已处理完毕（跳过/等待确认），调用方应直接 return。
 */
async function handleExistingSameNameFile(task, meta, settings) {
  // 专辑音质升级：指定覆盖原文件，跳过同名询问
  if (meta.replacePath || meta.forceOverwrite) {
    meta.forceRedownload = true
    meta.existFileConfirmed = true
    saveTaskMeta(task.id, meta)
    return false
  }
  if (meta.forceRedownload || meta.existFileConfirmed) return false

  const existingPaths = findExistingSameNameFiles(task, settings)
  if (!existingPaths.length) return false

  const mode = resolveExistFileMode(settings)
  const picked = await pickBestExistingFile(existingPaths)
  const offer = buildExistFileOffer({
    task,
    requestedQuality: task.quality || meta.preferredQuality || '320k',
    best: picked?.best,
    all: picked?.all || [],
  })

  const autoAction = task.user_id ? autoExistActionByUser.get(task.user_id) : ''
  const effectiveMode = autoAction || mode

  if (effectiveMode === 'overwrite') {
    meta.existFileConfirmed = true
    meta.forceRedownload = true
    // 设置里的「覆盖」或「仍下载」：与其它格式并存，只替换即将写入的目标扩展名
    meta.keepOtherFormats = true
    cleanupTaskDownloadArtifacts(task, meta, settings, { onlyTracked: true })
    clearTaskStoredFilePath(task.id)
    saveTaskMeta(task.id, meta)
    return false
  }

  if (effectiveMode === 'skip') {
    meta.existFileOffer = offer
    saveTaskMeta(task.id, meta)
    completeTaskWithExistingFile({ ...task, meta: JSON.stringify(meta) })
    return true
  }

  // ask：批量延后统一提醒；单曲立即询问
  const deferred = Boolean(meta.deferExistAsk)
  await markAwaitExist(task, meta, offer, { deferred })
  return true
}

function scheduleExistSummary(userId) {
  if (!userId) return
  const prev = existSummaryTimers.get(userId)
  if (prev) clearTimeout(prev)
  const timer = setTimeout(() => {
    existSummaryTimers.delete(userId)
    notifyExistSummaryIfIdle(userId)
  }, 900)
  timer.unref?.()
  existSummaryTimers.set(userId, timer)
}

function notifyExistSummaryIfIdle(userId) {
  if (!userId) return
  try {
    const active = getDB().prepare(`
      SELECT COUNT(*) AS c FROM download_tasks
      WHERE user_id = ? AND status IN ('waiting', 'downloading')
    `).get(userId)
    if (Number(active?.c) > 0) {
      scheduleExistSummary(userId)
      return
    }

    const rows = getDB().prepare(`
      SELECT * FROM download_tasks WHERE user_id = ? AND status = 'await_exist' ORDER BY created_at ASC
    `).all(userId)
    const pending = []
    for (const row of rows) {
      const meta = parseTaskMeta(row)
      if (!meta.existFileOffer?.filePath) continue
      if (!meta.deferExistAsk) continue
      pending.push({ row, meta })
    }
    if (!pending.length) return

    const key = `${userId}:${pending.map(p => p.row.id).join(',')}`
    if (existSummaryNotifiedKeys.has(key)) return
    existSummaryNotifiedKeys.add(key)
    // 限制集合大小，避免无限增长
    if (existSummaryNotifiedKeys.size > 200) {
      const first = existSummaryNotifiedKeys.values().next().value
      existSummaryNotifiedKeys.delete(first)
    }

    dlBroadcast('download:exist-summary', {
      count: pending.length,
      items: pending.slice(0, 30).map(({ row, meta }) => ({
        id: row.id,
        name: row.name,
        singer: row.singer,
        quality: row.quality,
        localLabel: meta.existFileOffer?.localLabel || '未知音质',
        requestedLabel: meta.existFileOffer?.requestedLabel || row.quality,
        fileName: meta.existFileOffer?.fileName || '',
      })),
    }, userId)
  } catch (e) {
    console.warn('[download] exist summary failed:', e.message)
  }
}

function markError(taskId, message, meta) {
  const friendly = formatUserError(message, '下载失败，请稍后重试')
  const row = getDB().prepare('SELECT * FROM download_tasks WHERE id = ?').get(taskId)
  const taskMeta = meta || parseTaskMeta(row)
  if (row) {
    // 仅清理本任务已记录的写入产物与 .part，不要扫目录删掉用户已有成品文件
    cleanupTaskDownloadArtifacts(row, taskMeta, taskSettings(row), { onlyTracked: true })
    clearTaskStoredFilePath(taskId)
  }
  taskMeta.downloadArtifacts = []
  saveTaskMeta(taskId, taskMeta)
  getDB().prepare("UPDATE download_tasks SET status = 'error', error = ?, file_path = NULL WHERE id = ?").run(friendly, taskId)
  dlBroadcast('download:status', { id: taskId, status: 'error', error: friendly, downgradeOffer: null, existFileOffer: null })
  if (row?.user_id) scheduleExistSummary(row.user_id)
}

function partPathFor(filePath) {
  return `${filePath}.part`
}

function lrcPathFor(audioPath) {
  return audioPath ? audioPath.replace(/\.[^.]+$/, '.lrc') : ''
}

function getDownloadStagingRoot() {
  const base = process.env.CONFIG_PATH || '/config'
  // 与其它磁盘缓存统一进 CONFIG_PATH/cache，旧版 config/download-staging 自动迁移
  return getAppCacheSubdir('download-staging', {
    legacyPaths: [path.join(base, 'download-staging')],
  })
}

function getDownloadStagingDir(taskId) {
  return path.join(getDownloadStagingRoot(), String(taskId || 'unknown'))
}

/** 固定半成品名，避免换文件名/扩展名后找不到 .part，续传失败看起来像「重新下载」 */
function getTaskPartPath(taskId) {
  return path.join(getDownloadStagingDir(taskId), 'download.part')
}

function partFileSize(partPath) {
  try {
    if (partPath && fs.existsSync(partPath)) return fs.statSync(partPath).size || 0
  } catch {}
  return 0
}

function publishTaskProgress(taskId, { downloaded = 0, total = 0, tip = '' } = {}) {
  const progress = total > 0 ? downloaded / total : 0
  try {
    if (total > 0) {
      getDB().prepare('UPDATE download_tasks SET downloaded_size = ?, progress = ?, total_size = ? WHERE id = ?')
        .run(downloaded, progress, total, taskId)
    } else {
      getDB().prepare('UPDATE download_tasks SET downloaded_size = ?, progress = ? WHERE id = ?')
        .run(downloaded, progress, taskId)
    }
  } catch {}
  dlBroadcast('download:progress', { id: taskId, progress, downloaded, total })
  if (tip) {
    dlBroadcast('download:status', {
      id: taskId,
      status: 'downloading',
      progress,
      downloaded,
      total,
      tip,
    })
  }
}

function cleanupStagingDir(taskId) {
  const dir = getDownloadStagingDir(taskId)
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {}
}

/** 本机落盘完成后再一次性发布到下载目录，减少网盘挂载上的 .part/改名/二次写入冲突 */
function publishStagedFile(stagedPath, destPath) {
  if (!stagedPath || !destPath) return
  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  safeUnlink(destPath)
  try {
    fs.renameSync(stagedPath, destPath)
    return
  } catch {}
  fs.copyFileSync(stagedPath, destPath)
  safeUnlink(stagedPath)
}

function publishStagedDownload(stagedPath, destPath) {
  publishStagedFile(stagedPath, destPath)
  const stagedLrc = lrcPathFor(stagedPath)
  if (stagedLrc && fs.existsSync(stagedLrc)) {
    publishStagedFile(stagedLrc, lrcPathFor(destPath))
  }
}

function buildDownloadIdentityKey(taskLike = {}, quality = '') {
  const source = String(taskLike.source || '').trim().toLowerCase()
  const q = String(quality || taskLike.quality || '320k').trim().toLowerCase()
  const id = String(
    taskLike.songId
    || taskLike.songmid
    || taskLike.hash
    || taskLike.copyrightId
    || taskLike.musicId
    || taskLike.rid
    || taskLike.dcTargetId
    || '',
  ).trim()
  if (id) return `${source}:${id}:${q}`
  const name = String(taskLike.name || '').trim().toLowerCase()
  const singer = String(taskLike.singer || '').trim().toLowerCase()
  if (!name && !singer) return ''
  return `${source}:${name}|${singer}:${q}`
}

function loadActiveDownloadIdentityKeys(userId) {
  const keys = new Set()
  if (!userId) return keys
  const rows = getDB().prepare(`
    SELECT name, singer, source, quality, meta FROM download_tasks
    WHERE user_id = ?
      AND status IN ('waiting', 'downloading', 'paused', 'await_confirm', 'await_source', 'await_exist')
  `).all(userId)
  for (const row of rows) {
    const meta = parseTaskMeta(row)
    const key = buildDownloadIdentityKey({
      name: row.name,
      singer: row.singer,
      source: meta.source || row.source,
      songId: meta.songId,
      songmid: meta.songmid,
      hash: meta.hash,
      copyrightId: meta.copyrightId,
      musicId: meta.musicId,
      rid: meta.rid,
      dcTargetId: meta.dcTargetId,
    }, row.quality)
    if (key) keys.add(key)
  }
  return keys
}

function safeUnlink(filePath) {
  if (!filePath) return
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {}
}

function cleanupDownloadPath(filePath) {
  if (!filePath) return
  safeUnlink(filePath)
  safeUnlink(partPathFor(filePath))
  safeUnlink(lrcPathFor(filePath))
}

function rememberDownloadArtifact(meta, filePath) {
  if (!filePath) return meta
  if (!Array.isArray(meta.downloadArtifacts)) meta.downloadArtifacts = []
  if (!meta.downloadArtifacts.includes(filePath)) meta.downloadArtifacts.push(filePath)
  return meta
}

function collectTaskArtifactPaths(task, meta, settings, { includeVariants = true } = {}) {
  const paths = new Set()
  if (task?.file_path) paths.add(task.file_path)
  if (Array.isArray(meta?.downloadArtifacts)) {
    for (const p of meta.downloadArtifacts) paths.add(p)
  }
  if (includeVariants && task && settings) {
    for (const ext of DOWNLOAD_ARTIFACT_EXTS) {
      paths.add(resolveTaskFilePath(task, settings, ext))
    }
  }
  return [...paths]
}

function cleanupTaskDownloadArtifacts(task, meta, settings, { exceptPath, onlyTracked = false } = {}) {
  const except = new Set([exceptPath].filter(Boolean))
  if (onlyTracked) {
    const tracked = new Set()
    if (task?.file_path) tracked.add(task.file_path)
    if (Array.isArray(meta?.downloadArtifacts)) {
      for (const p of meta.downloadArtifacts) tracked.add(p)
    }
    for (const filePath of tracked) {
      if (except.has(filePath)) continue
      cleanupDownloadPath(filePath)
    }
    // 仍清理同名 .part，避免残留半成品
    cleanupGroupDirPartFiles(task, settings, except)
  } else {
    for (const filePath of collectTaskArtifactPaths(task, meta, settings)) {
      if (except.has(filePath)) continue
      cleanupDownloadPath(filePath)
    }
    cleanupGroupDirArtifacts(task, settings, except)
  }
  if (meta?.downloadArtifacts) meta.downloadArtifacts = []
}

function cleanupGroupDirPartFiles(task, settings, except = new Set()) {
  const baseName = resolveTaskFileBaseName(task, settings)
  if (!baseName) return
  const groupDir = resolveDownloadGroupDir(taskSavePath(task), settings, task)
  if (!fs.existsSync(groupDir)) return
  let entries = []
  try {
    entries = fs.readdirSync(groupDir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.endsWith('.part')) continue
    const partBase = entry.slice(0, -'.part'.length).replace(/\.[^.]+$/, '')
    if (!isSameAudioBaseName(partBase || entry, baseName) && !entry.startsWith(`${baseName}.`)) continue
    const fullPath = path.join(groupDir, entry)
    if (except.has(fullPath)) continue
    safeUnlink(fullPath)
  }
}

function resolveTaskFileBaseName(task, settings) {
  const template = settings['download.fileName'] || '{name} - {singer}'
  const singer = resolveTaskSinger(task)
  return sanitize(template
    .replace(/\{name\}/g, task.name || 'Unknown')
    .replace(/\{singer\}/g, singer || 'Unknown')
    .replace(/\{album\}/g, task.album || ''))
}

function cleanupGroupDirArtifacts(task, settings, except = new Set()) {
  const baseName = resolveTaskFileBaseName(task, settings)
  if (!baseName) return
  const groupDir = resolveDownloadGroupDir(taskSavePath(task), settings, task)
  if (!fs.existsSync(groupDir)) return
  let entries = []
  try {
    entries = fs.readdirSync(groupDir)
  } catch {
    return
  }
  for (const entry of entries) {
    const ext = path.extname(entry)
    const nameOnly = ext ? entry.slice(0, -ext.length) : entry
    const isPart = entry.endsWith('.part')
    const partBase = isPart ? entry.slice(0, -'.part'.length).replace(/\.[^.]+$/, '') : ''
    const matched = isSameAudioBaseName(nameOnly, baseName)
      || (isPart && isSameAudioBaseName(partBase || nameOnly, baseName))
      || entry === baseName
      || entry.startsWith(`${baseName}.`)
    if (!matched) continue
    const fullPath = path.join(groupDir, entry)
    if (except.has(fullPath)) continue
    if (isPart) safeUnlink(fullPath)
    else cleanupDownloadPath(fullPath)
  }
}

function clearTaskStoredFilePath(taskId) {
  getDB().prepare('UPDATE download_tasks SET file_path = NULL WHERE id = ?').run(taskId)
}

function prepareTaskForRetry(taskRow, { cleanupFiles = true, forceRedownload = false } = {}) {
  const settings = taskSettings(taskRow)
  let meta = parseTaskMeta(taskRow)
  if (cleanupFiles) {
    cleanupTaskDownloadArtifacts(taskRow, meta, settings)
    clearTaskStoredFilePath(taskRow.id)
  }
  if (forceRedownload) meta.forceRedownload = true
  if (meta.downgradeOffer) delete meta.downgradeOffer
  if (meta.existFileOffer) delete meta.existFileOffer
  if (meta.sourceFallbackOffer) delete meta.sourceFallbackOffer
  // 重试原音质：清空本档已跳过的音源/平台，避免一直卡在「没有可用的音源」
  delete meta.skipSourceIds
  delete meta.skipPlatforms
  delete meta.crossPlatformExhausted
  delete meta.lockedSourceApiId
  delete meta.sourceApiId
  return { meta, settings }
}

/** 音质升级保留原文件时的归档子目录（位于下载目录下） */
const ORIGINAL_ARCHIVE_SUBDIR = 'lemon-originals'

/** 归档路径：<下载目录>/lemon-originals/<相对音乐库目录>/<原文件名>，重名时加序号 */
function resolveOriginalArchivePath(sourcePath, userId) {
  const downloadRoot = getDownloadSavePath(userId)
  if (!downloadRoot) throw new Error('未配置下载目录，无法保留原文件')
  let relDir = ''
  for (const root of getMusicPathsForUser(userId)) {
    if (!root) continue
    const rel = path.relative(root, path.dirname(sourcePath))
    if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
      relDir = rel || ''
      break
    }
  }
  const dir = path.join(downloadRoot, ORIGINAL_ARCHIVE_SUBDIR, relDir)
  fs.mkdirSync(dir, { recursive: true })
  const ext = path.extname(sourcePath)
  const base = path.basename(sourcePath, ext) || 'track'
  let target = path.join(dir, `${base}${ext}`)
  let seq = 1
  while (fs.existsSync(target)) {
    target = path.join(dir, `${base} (${seq})${ext}`)
    seq += 1
  }
  return target
}

/** 把原文件移动到归档目录；跨盘 rename 失败时退回复制 + 删除 */
function moveOriginalToArchive(sourcePath, userId) {
  const target = resolveOriginalArchivePath(sourcePath, userId)
  try {
    fs.renameSync(sourcePath, target)
  } catch {
    fs.copyFileSync(sourcePath, target)
    fs.unlinkSync(sourcePath)
  }
  return target
}

function resolveTaskFilePath(task, settings, ext) {
  const meta = typeof task.meta === 'string'
    ? (() => { try { return JSON.parse(task.meta || '{}') } catch { return {} } })()
    : (task.meta && typeof task.meta === 'object' ? task.meta : {})
  const replacePath = String(meta.replacePath || '').trim()
  if (replacePath) {
    const dir = path.dirname(replacePath)
    const base = path.basename(replacePath, path.extname(replacePath)) || 'track'
    const safeExt = String(ext || path.extname(replacePath) || '.mp3').replace(/^\.?/, '.')
    return path.join(dir, `${base}${safeExt}`)
  }
  const fileName = buildFileName(settings['download.fileName'] || '{name} - {singer}', task, ext)
  const savePath = taskSavePath(task)
  const groupDir = resolveDownloadGroupDir(savePath, settings, task)
  return path.join(groupDir, fileName)
}

/** 按专辑分组时，落盘前尽量用专辑详情补全真实专辑名 */
async function ensureTaskAlbumForGrouping(task, meta, settings) {
  const mode = resolveDownloadGroupMode(settings || {})
  if (mode !== 'album' && mode !== 'artist-album') return
  const current = String(task?.album || meta?.album || '').trim()
  if (current && !isPlaceholderName(current)) {
    if (!String(task.album || '').trim()) task.album = current
    return
  }
  try {
    const enriched = await resolveDownloadEmbedMeta(task, meta, { timeoutMs: 5000 })
    const album = String(enriched?.album || '').trim()
    if (!album || isPlaceholderName(album)) return
    task.album = album
    meta.album = album
    if (enriched.albumArtist && !String(task.albumArtist || '').trim()) {
      task.albumArtist = enriched.albumArtist
      meta.albumArtist = enriched.albumArtist
    }
    try {
      getDB().prepare('UPDATE download_tasks SET album = ? WHERE id = ?').run(album, task.id)
    } catch {}
    saveTaskMeta(task.id, meta)
  } catch {
    // 补全失败则不建「未知专辑」目录，落到歌手目录或下载根目录
  }
}

function finalizePartFile(partPath, filePath) {
  safeUnlink(filePath)
  if (!fs.existsSync(partPath)) throw new Error('下载文件不完整')
  fs.renameSync(partPath, filePath)
}

/** 多音源时：优先已锁定/记录的音源，否则优先声明了曲目平台的激活源，再其余 */
function orderDownloadSourceIds(activeIds, meta = {}, userId = null) {
  const ids = [...new Set((activeIds || []).map(String).filter(Boolean))]
  if (!ids.length) return [null]
  const prefer = String(meta.sourceApiId || meta.lockedSourceApiId || '').trim()
  if (prefer && ids.includes(prefer)) {
    return [prefer, ...ids.filter((id) => id !== prefer)]
  }
  const plat = String(meta.source || '').trim()
  if (plat && plat !== 'local') {
    const hit = ids.find((id) => {
      try {
        const declared = listPlatformsForSource(userId, id)
        return declared.includes(plat)
      } catch {
        return false
      }
    })
    if (hit) return [hit, ...ids.filter((id) => id !== hit)]
  }
  return ids
}

function snapshotTrackIdentity(task, meta) {
  return {
    source: String(meta.source || task.source || ''),
    songId: meta.songId || '',
    hash: meta.hash || '',
    songmid: meta.songmid || '',
    strMediaMid: meta.strMediaMid || '',
    copyrightId: meta.copyrightId || '',
    albumAudioId: meta.albumAudioId || '',
    albumId: meta.albumId || '',
    albumMid: meta.albumMid || '',
    albummid: meta.albummid || '',
    musicId: meta.musicId || '',
    rid: meta.rid || '',
    dcTargetId: meta.dcTargetId || '',
    types: meta.types,
    qualitys: meta.qualitys,
    picUrl: meta.picUrl || '',
    img: meta.img || '',
    duration: meta.duration,
  }
}

function restoreTrackIdentity(task, meta, snap) {
  if (!snap) return
  meta.source = snap.source
  task.source = snap.source
  meta.songId = snap.songId
  meta.hash = snap.hash
  meta.songmid = snap.songmid
  meta.strMediaMid = snap.strMediaMid
  meta.copyrightId = snap.copyrightId
  meta.albumAudioId = snap.albumAudioId
  meta.albumId = snap.albumId
  meta.albumMid = snap.albumMid
  meta.albummid = snap.albummid
  meta.musicId = snap.musicId
  meta.rid = snap.rid
  meta.dcTargetId = snap.dcTargetId
  meta.types = snap.types
  meta.qualitys = snap.qualitys
  meta.picUrl = snap.picUrl
  meta.img = snap.img
  meta.duration = snap.duration
}

async function downloadTask(task, settings, abortSignal = null) {
  const abort = abortSignal || new AbortController()
  activeDownloads.set(task.id, { abort })

  const meta = parseTaskMeta(task)
  if (!String(task.singer || '').trim() && meta.albumArtist) {
    task.singer = meta.albumArtist
  }
  if (!String(task.albumArtist || '').trim() && meta.albumArtist) {
    task.albumArtist = meta.albumArtist
  }
  if (!String(task.year || '').trim() && (meta.year || meta.publishTime)) {
    task.year = meta.year || meta.publishTime
  }
  if (!String(task.genre || '').trim() && meta.genre) {
    task.genre = meta.genre
  }
  if (!String(task.comment || '').trim() && (meta.comment || meta.desc || meta.description)) {
    task.comment = meta.comment || meta.desc || meta.description
  }
  if (!String(task.album || '').trim() && meta.album) {
    task.album = meta.album
  }
  // 占位专辑名当作空，避免分组落到「未知专辑」
  if (isPlaceholderName(task.album)) task.album = ''
  if (isPlaceholderName(meta.album)) meta.album = ''
  await ensureTaskAlbumForGrouping(task, meta, settings)
  const quality = task.quality || '320k'
  let lastError = null
  let lastAttemptPath = ''
  const allowCrossPlatform = isCrossPlatformSupplementEnabled(settings)
  const sourceOrder = orderDownloadSourceIds(getStoredActiveSourceIds(task.user_id), meta, task.user_id)
  const identitySnap = snapshotTrackIdentity(task, meta)

  try {
    // 取链前先按「主文件名」检测本地同名（扩展名不同也算），避免无效请求
    if (await handleExistingSameNameFile(task, meta, settings)) return

    // 顺序：当前音源穷尽各平台 → 再换下一个激活音源 → 再穷尽其平台
    for (let si = 0; si < sourceOrder.length; si++) {
      const lockedId = sourceOrder[si]
      if (lockedId) {
        meta.lockedSourceApiId = lockedId
      } else {
        delete meta.lockedSourceApiId
      }

      if (si > 0) {
        restoreTrackIdentity(task, meta, identitySnap)
        meta.skipPlatforms = []
        delete meta.crossPlatformExhausted
        delete meta.sourceApiId
        meta.skipSourceIds = []
        meta.lastSourcePluginSwitch = {
          toId: lockedId,
          at: new Date().toISOString(),
        }
        saveTaskMeta(task.id, meta)
        dlBroadcast('download:status', {
          id: task.id,
          status: 'downloading',
          quality,
          source: meta.source || task.source,
          tip: '正在切换音源继续查找…',
        })
      } else {
        saveTaskMeta(task.id, meta)
      }

      // 关闭跨平台时每个音源只试当前曲目平台；开启时穷尽该音源可用平台
      const platformCount = lockedId
        ? listPlatformsForSource(task.user_id, lockedId).length
        : listOnlinePlatforms(task.user_id).length
      const maxPlatformHops = allowCrossPlatform ? Math.max(1, platformCount || 5) : 1

      for (let hop = 0; hop < maxPlatformHops; hop++) {
        let source = meta.source || task.source
        let musicInfo = buildMusicInfoFromTask(task, meta)

        for (let attempt = 1; attempt <= SAME_QUALITY_ATTEMPTS; attempt++) {
          const latest = getDB().prepare('SELECT status FROM download_tasks WHERE id = ?').get(task.id)
          if (!latest || latest.status === 'paused') return

          let filePath = ''
          let partPath = ''
          let publishedDest = false
          try {
            if (attempt > 1 || hop > 0 || si > 0) {
              const partBytes = partFileSize(getTaskPartPath(task.id))
              const tip = downloadRetryTip(attempt, lastError, partBytes)
              let totalSize = 0
              try {
                totalSize = Number(getDB().prepare('SELECT total_size FROM download_tasks WHERE id = ?').get(task.id)?.total_size) || 0
              } catch {}
              // 校验失败会删掉半成品，进度归零是预期；有 .part 则保持进度续传
              publishTaskProgress(task.id, {
                downloaded: partBytes,
                total: partBytes > 0 ? totalSize : 0,
                tip,
              })
              dlBroadcast('download:status', {
                id: task.id,
                status: 'downloading',
                quality,
                source,
                retryAttempt: attempt,
                retryTotal: SAME_QUALITY_ATTEMPTS,
                tip,
                progress: partBytes > 0 && totalSize > 0 ? partBytes / totalSize : 0,
                error: '',
              })
              if (attempt > 1) await sleep(downloadRetryDelayMs(attempt - 1, lastError, RETRY_DELAY_MS))
            }

            const { url, sourceInfo } = await resolveDownloadUrl(source, quality, musicInfo, settings, meta, task.user_id)
            if (sourceInfo?.sourceId && sourceInfo.sourceId !== meta.sourceApiId) {
              meta.sourceApiId = sourceInfo.sourceId
              if (sourceInfo.switched) {
                meta.lastSourceSwitch = {
                  fromId: sourceInfo.fromSourceId,
                  fromName: sourceInfo.fromSourceName,
                  toId: sourceInfo.sourceId,
                  toName: sourceInfo.sourceName,
                  at: new Date().toISOString(),
                }
                saveTaskMeta(task.id, meta)
                dlBroadcast('download:source-switched', {
                  id: task.id,
                  name: task.name,
                  fromName: sourceInfo.fromSourceName,
                  toName: sourceInfo.sourceName,
                })
              }
            }

            const ext = guessExt(url, quality)
            filePath = resolveTaskFilePath(task, settings, ext)
            const stagingDir = getDownloadStagingDir(task.id)
            fs.mkdirSync(stagingDir, { recursive: true })
            const stagedPath = path.join(stagingDir, path.basename(filePath))
            // 固定 part 路径，同任务网络重试可续传；换音质则清掉旧半成品
            partPath = getTaskPartPath(task.id)
            if (meta.resumeQuality && meta.resumeQuality !== quality) {
              safeUnlink(partPath)
            }
            meta.resumeQuality = quality
            lastAttemptPath = filePath
            publishedDest = false
            saveTaskMeta(task.id, meta)

            fs.mkdirSync(path.dirname(filePath), { recursive: true })

            const forceRedownload = meta.forceRedownload === true
            const keepOtherFormats = meta.keepOtherFormats === true
            if (forceRedownload) {
              if (keepOtherFormats) {
                cleanupDownloadPath(filePath)
                cleanupGroupDirPartFiles(task, settings, new Set([filePath]))
              } else {
                cleanupTaskDownloadArtifacts(task, meta, settings)
              }
              delete meta.forceRedownload
              delete meta.keepOtherFormats
              saveTaskMeta(task.id, meta)
            }

            if (!forceRedownload && !meta.existFileConfirmed) {
              const sameNameAgain = findExistingSameNameFiles(task, settings)
              if (sameNameAgain.length) {
                if (await handleExistingSameNameFile(task, meta, settings)) return
              }
            }

            cleanupTaskDownloadArtifacts(task, meta, settings, { exceptPath: filePath, onlyTracked: true })

            const expectedSec = parseDurationSeconds(
              task.interval || meta.duration || meta.interval || musicInfo.interval || musicInfo.duration,
            )

            const remoteSec = await probeRemoteAudioDurationSeconds(url, { source, quality })
            const preErr = assertNotPreviewClip(remoteSec, expectedSec, { forDownload: true })
            if (preErr) {
              if (!meta.lockedSourceApiId) skipCurrentDownloadSource(meta, task.id, source)
              throw preErr
            }

            await streamToFile(url, partPath, task.id, abort, quality, source)
            finalizePartFile(partPath, stagedPath)

            {
              const actualSec = await probeFileDurationSeconds(stagedPath)
              const checkSec = actualSec > 0 ? actualSec : remoteSec
              const postErr = assertNotPreviewClip(checkSec, expectedSec, { forDownload: true })
              if (postErr) {
                cleanupDownloadPath(stagedPath)
                cleanupStagingDir(task.id)
                publishTaskProgress(task.id, {
                  downloaded: 0,
                  total: 0,
                  tip: '检测到试听片段，已拒绝保存，正在换源…',
                })
                if (!meta.lockedSourceApiId) skipCurrentDownloadSource(meta, task.id, source)
                throw postErr
              }
            }

            try {
              assertLosslessFile(stagedPath, quality)
            } catch (formatErr) {
              cleanupDownloadPath(stagedPath)
              cleanupStagingDir(task.id)
              // 下到 100% 后因假无损被拒：立刻提示，避免被当成「网络抖动又重下」
              publishTaskProgress(task.id, {
                downloaded: 0,
                total: 0,
                tip: formatErr?.code === 'FAKE_LOSSLESS'
                  ? '文件校验失败（假无损），已拒绝保存，正在换源…'
                  : '文件校验失败，正在换源…',
              })
              if (formatErr?.code === 'FAKE_LOSSLESS' && !meta.lockedSourceApiId) {
                skipCurrentDownloadSource(meta, task.id, source)
              }
              throw formatErr
            }

            const replacePath = String(meta.replacePath || '').trim()
            const keepOriginal = meta.keepOriginal === true
            // 保留原文件：必须在发布新文件前移走，避免同扩展名时被直接覆盖
            if (replacePath && keepOriginal && fs.existsSync(replacePath)) {
              moveOriginalToArchive(replacePath, task.user_id)
            }

            await writeMetaIfNeeded(task, meta, stagedPath, ext, settings)
            publishStagedDownload(stagedPath, filePath)
            publishedDest = true

            if (replacePath) {
              try {
                const oldResolved = path.resolve(replacePath)
                const newResolved = path.resolve(filePath)
                if (oldResolved !== newResolved) {
                  if (!keepOriginal) {
                    try { if (fs.existsSync(replacePath)) fs.unlinkSync(replacePath) } catch {}
                  }
                  try { removeCachePaths([replacePath]) } catch {}
                  try { notifyLibraryRemoved([replacePath], { reason: 'album-sync-upgrade' }) } catch {}
                } else {
                  try { removeCachePaths([replacePath]) } catch {}
                }
              } catch {}
              delete meta.replacePath
              delete meta.forceOverwrite
              delete meta.keepOriginal
            }

            if (meta.sourceApiId) recordSourceHealthOutcome(meta.sourceApiId, false, source, task.user_id)
            cleanupStagingDir(task.id)
            cleanupTaskDownloadArtifacts(task, meta, settings, { exceptPath: filePath, onlyTracked: true })
            rememberDownloadArtifact(meta, filePath)
            meta.downloadArtifacts = [filePath]
            delete meta.existFileConfirmed
            delete meta.lockedSourceApiId
            saveTaskMeta(task.id, meta)

            getDB().prepare("UPDATE download_tasks SET status = 'completed', file_path = ?, progress = 1, error = NULL WHERE id = ?")
              .run(filePath, task.id)
            dlBroadcast('download:status', { id: task.id, status: 'completed', progress: 1, filePath, quality, source, tip: '' })
            scanBatchAndCache([{ filePath }]).then((rows) => {
              if (rows?.length) bumpLibraryIndexRevision()
            }).catch(() => {})
            notifyLibraryChanged([filePath], { reason: 'download' })
            try {
              const { scheduleMoodAutoAnalyze } = await import('../utils/moodAnalyzeJob.js')
              scheduleMoodAutoAnalyze({ delayMs: 3000 })
            } catch {}
            return
          } catch (e) {
            const retryableEarly = isRetryableDownloadError(e)
            // 网络抖动保留 .part 以便续传；不可重试错误再清掉半成品
            if (!retryableEarly) cleanupDownloadPath(partPath)
            if (!retryableEarly) cleanupStagingDir(task.id)
            if (filePath && publishedDest) {
              cleanupDownloadPath(filePath)
              rememberDownloadArtifact(meta, filePath)
            }
            if (e.name === 'AbortError') return
            lastError = e
            const retryable = retryableEarly
            if (meta.lockedSourceApiId) {
              // 锁定音源：网络抖动可同源重试；假无损/试听等立刻换平台或下一音源
              console.warn(`[下载] ${task.name} ${quality}@${source} 音源锁定第 ${attempt}/${SAME_QUALITY_ATTEMPTS} 次失败: ${e.message}`)
              if (!retryable || shouldSkipSourceAfterError(e) || attempt >= SAME_QUALITY_ATTEMPTS) break
            } else {
              if (retryable && meta.sourceApiId) {
                const alreadySkipped = (meta.skipSourceIds || []).includes(meta.sourceApiId)
                if (!alreadySkipped) skipCurrentDownloadSource(meta, task.id, source)
              }
              console.warn(`[下载] ${task.name} ${quality}@${source} 第 ${attempt}/${SAME_QUALITY_ATTEMPTS} 次失败: ${e.message}`)
              if (!retryable || attempt >= SAME_QUALITY_ATTEMPTS) break
            }
          }
        }

        // 当前音源下本平台失败：先跨平台同档，再换下一个音源
        if (isNoActiveSourceError(lastError)) break
        try {
          dlBroadcast('download:status', {
            id: task.id,
            status: 'downloading',
            quality,
            error: '',
            tip: '正在跨平台补源…',
          })
          const switched = await tryCrossPlatformSameQuality(task, meta, quality, settings)
          if (switched) {
            lastError = null
            continue
          }
        } catch (e) {
          console.warn(`[下载] ${task.name} 跨平台补源失败: ${e.message}`)
        }
        break
      }

      // 当前音源插件已试完各平台
      if (lockedId) {
        skipFailedSource(meta, task.id, meta.source || task.source, {
          markPreview: lastError?.code === 'PREVIEW_CLIP' || /试听/i.test(String(lastError?.message || '')),
        })
      }
      if (isNoActiveSourceError(lastError) && si === sourceOrder.length - 1) break
    }

    // 失败收尾：不要按路径名删除音乐库里已有成品（仅清本任务跟踪产物与 .part）
    cleanupTaskDownloadArtifacts(task, meta, settings, { onlyTracked: true })
    clearTaskStoredFilePath(task.id)
    cleanupStagingDir(task.id)
    delete meta.lockedSourceApiId
    const reason = lastError?.message || '下载失败'
    if (isNoActiveSourceError(lastError) || isNoActiveSourceError(reason)) {
      markError(task.id, reason, meta)
      return
    }
    // 各音源/平台均为试听片段：不再降档，直接失败提示
    if (lastError?.code === 'PREVIEW_CLIP' || /试听时长|仅提供约.*试听片段|仅支持试听约|时长不完整/i.test(reason)) {
      markError(task.id, reason, meta)
      return
    }

    const preferred = meta.preferredQuality || meta.requestedQuality || quality
    const policy = meta.qualityPolicy || (meta.autoCascade ? 'cascade' : '')
    const floor = policy === 'floor' ? (meta.qualityFloor || preferred) : ''
    const available = [
      ...(Array.isArray(meta.qualitys) ? meta.qualitys : []),
      ...(Array.isArray(meta.types) ? meta.types.map(t => t?.type || t).filter(Boolean) : []),
    ]

    const nextQuality = getNextLowerQuality(
      quality,
      available,
      policy === 'floor' ? floor : '',
    )

    // 「不降档」：不自动改档，但弹出确认是否降到下一档（避免重试死循环）
    if (policy === 'none') {
      if (nextQuality) {
        const msg = lastError?.code === 'FAKE_LOSSLESS'
          ? (lastError.message || formatMissingQualityError(preferred, '', reason))
          : formatMissingQualityError(preferred, '', reason)
        markAwaitConfirm(task, meta, quality, nextQuality, msg)
        return
      }
      markError(task.id, formatMissingQualityError(preferred, '', reason), meta)
      return
    }

    if (nextQuality) {
      const latestMeta = parseTaskMeta(getDB().prepare('SELECT meta FROM download_tasks WHERE id = ?').get(task.id) || {})
      const shouldCascade = policy === 'cascade'
        || policy === 'floor'
        || meta.autoCascade
        || latestMeta.autoCascade
      if (shouldCascade) {
        applyQualityDowngrade({ ...task, quality }, nextQuality, {
          autoCascade: policy !== 'floor',
          reason,
        })
        return
      }
      markAwaitConfirm(task, meta, quality, nextQuality, reason)
      return
    }

    if (policy === 'floor' || policy === 'cascade') {
      markError(task.id, formatMissingQualityError(preferred, floor, reason), meta)
      return
    }
    markError(task.id, reason, meta)
  } catch (e) {
    if (e.name === 'AbortError') return
    markError(task.id, e.message || '下载失败', meta)
  }
}

async function writeMetaIfNeeded(task, meta, filePath, ext, settings) {
  const on = (key) => settings[key] === 'true' || settings[key] === true
  const wantEmbedPic = on('download.isEmbedPic')
  const wantEmbedLyric = on('download.isEmbedLyric')
  const wantLrcFile = on('download.isDownloadLrc')
  const canEmbed = ['.mp3', '.flac', '.wav', '.ape'].includes(ext) || canWriteM4aExt(ext)
  const artist = joinArtists(task.singer || meta.albumArtist || '')
  const albumHint = task.album || meta.album || ''
  // 有歌名/歌手时始终写入基础标签，避免文件名落成 Unknown 且内置标签空白
  const wantBasicTags = canEmbed && Boolean(task.name || artist || albumHint)

  if (!wantBasicTags && !wantEmbedPic && !wantEmbedLyric && !wantLrcFile) {
    return
  }

  const source = meta.source || task.source
  const musicInfo = buildMusicInfoFromTask(task, meta)

  let picBuf = null
  if (wantEmbedPic && canEmbed) {
    try {
      picBuf = await fetchTrackCover({
        source,
        musicInfo,
        meta,
        task,
        asBuffer: true,
        useOtherSource: true,
        userId: task.user_id,
      })
    } catch (e) {
      console.warn('获取封面失败:', task.name, e.message)
    }
  }

  let lrcResult = null
  if (wantEmbedLyric || wantLrcFile) {
    try {
      lrcResult = await fetchTrackLyric({
        source,
        songId: meta.songmid || meta.hash || meta.songId || meta.copyrightId
          || musicInfo.songmid || musicInfo.hash || musicInfo.songId,
        musicInfo,
        meta,
        task,
        settings,
        useOtherSource: true,
        userId: task.user_id,
      })
    } catch (e) {
      console.warn('获取歌词失败:', task.name, e.message)
    }
  }

  if (wantBasicTags || (canEmbed && (wantEmbedPic || wantEmbedLyric))) {
    let albumArtist = joinArtists(task.albumArtist || meta.albumArtist || task.singer || '')
    let album = albumHint
    let year = ''
    let genre = ''
    let comment = ''
    try {
      const enriched = await resolveDownloadEmbedMeta(task, meta)
      albumArtist = enriched.albumArtist || albumArtist
      album = enriched.album || album
      year = enriched.year || ''
      genre = enriched.genre || ''
      comment = enriched.comment || ''
      if (year && !String(task.year || '').trim()) task.year = year
      if (genre && !String(task.genre || '').trim()) task.genre = genre
      if (comment && !String(task.comment || '').trim()) task.comment = comment
      if (album && !String(task.album || '').trim()) task.album = album
      if (albumArtist && !String(task.albumArtist || '').trim()) task.albumArtist = albumArtist
    } catch (e) {
      console.warn('补全专辑标签失败:', task.name, e.message)
    }

    const metaData = {
      title: task.name || '',
      artist,
      albumArtist,
      album,
    }
    if (year) metaData.year = year
    if (genre) metaData.genre = genre
    if (comment) metaData.comment = comment
    if (wantEmbedPic && picBuf) metaData.pic = picBuf
    if (wantEmbedLyric && lrcResult?.lyric) {
      metaData.lyric = buildEmbedLyrics(lrcResult, settings)
    }
    try {
      // 不在此写 .lrc：是否落盘歌词文件只看 download.isDownloadLrc
      await writeMeta(filePath, ext, metaData, { writeExternalLrc: false })
    } catch (e) {
      console.error('写入内嵌标签失败:', task.name, e.message)
    }
  }

  // 开启「下载歌词文件」时，在下载目录写入同名 .lrc（与音频格式无关）
  if (wantLrcFile && lrcResult?.lyric) {
    try {
      await saveLrcFile(filePath, lrcResult, settings)
    } catch (e) {
      console.error('保存歌词文件失败:', task.name, e.message)
    }
  }
}

async function saveLrcFile(filePath, lrcResult, settings) {
  const on = (key) => settings[key] === 'true' || settings[key] === true
  const lrcPath = filePath.replace(/\.[^.]+$/, '.lrc')

  let content = lrcResult.lyric || ''
  // 与内嵌逻辑一致：按「下载翻译/罗马音」开关合并进 .lrc
  if (on('download.isDownloadTLrc') || on('download.isDownloadRLrc')) {
    content = buildEmbedLyrics(lrcResult, {
      ...settings,
      'download.isEmbedLyricT': on('download.isDownloadTLrc') ? 'true' : 'false',
      'download.isEmbedLyricR': on('download.isDownloadRLrc') ? 'true' : 'false',
    }) || content
  }

  if (!content) return

  const encoding = settings['download.lrcFormat'] === 'gbk' ? 'gbk' : 'utf-8'
  if (encoding === 'gbk') {
    const iconv = await import('iconv-lite')
    fs.writeFileSync(lrcPath, iconv.default.encode(content, 'gbk'))
  } else {
    fs.writeFileSync(lrcPath, content, 'utf-8')
  }
}

function guessExt(url, quality) {
  if (isLosslessQuality(quality)) return '.flac'
  if (url.includes('.flac') || quality?.includes('flac')) return '.flac'
  if (url.includes('.wav')) return '.wav'
  if (url.includes('.ape')) return '.ape'
  if (url.includes('.ogg')) return '.ogg'
  return '.mp3'
}

function buildFileName(template, task, ext) {
  return resolveTaskFileBaseName(task, { 'download.fileName': template }) + ext
}

function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'untitled'
}
