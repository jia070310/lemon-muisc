import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { getDB } from '../db.js'
import { broadcast } from '../ws.js'
import { requestSourceWithMeta, hasActiveSource } from '../sourceManager.js'
import { getStoredActiveSourceIds } from '../utils/activeSources.js'
import { writeMeta } from '../meta.js'
import { buildMusicInfoFromTask } from '../utils/musicInfo.js'
import { buildEmbedLyrics } from '../utils/lyric.js'
import { getDownloadSavePath } from '../utils/filePaths.js'
import { getMergedSettings } from '../utils/userSettings.js'
import { fetchTrackLyric, fetchTrackCover } from '../utils/trackMeta.js'
import {
  getNextLowerQuality,
  isNoActiveSourceError,
  isRetryableDownloadError,
  qualityLabel,
  formatMissingQualityError,
  sleep,
} from '../utils/downloadQuality.js'
import {
  parseDurationSeconds,
  probeFileDurationSeconds,
  probeRemoteAudioDurationSeconds,
  assertNotPreviewClip,
} from '../utils/audioDuration.js'
import { formatUserError } from '../utils/userError.js'
import { buildSourceFallbackOffer } from '../utils/sourceFallback.js'
import { extractMusicUrl } from '../utils/sourceResult.js'
import { notifyLibraryChanged } from '../utils/libraryNotify.js'
import { scanBatchAndCache } from '../utils/libraryCache.js'
import { resolveDownloadGroupDir } from '../utils/downloadPath.js'
import {
  resolveExistFileMode,
  findExistingSameNameFiles,
  pickBestExistingFile,
  buildExistFileOffer,
  isSameAudioBaseName,
} from '../utils/downloadExist.js'

export const downloadRouter = Router()

const activeDownloads = new Map()
let runningCount = 0
/** 用户对本批同名文件的默认处理：skip | overwrite */
const autoExistActionByUser = new Map()
/** 防抖：队列空闲后汇总同名待处理提醒 */
const existSummaryTimers = new Map()
const existSummaryNotifiedKeys = new Set()

export function getDownloadQueueStats() {
  try {
    const row = getDB().prepare(`
      SELECT COUNT(*) AS c FROM download_tasks WHERE status IN ('waiting', 'downloading', 'await_confirm', 'await_source', 'await_exist')
    `).get()
    return {
      running: runningCount,
      active: activeDownloads.size,
      pending: Number(row?.c) || 0,
    }
  } catch {
    return { running: runningCount, active: activeDownloads.size, pending: 0 }
  }
}

const SAME_QUALITY_ATTEMPTS = 3
const RETRY_DELAY_MS = 1200
const DOWNLOAD_ARTIFACT_EXTS = ['.mp3', '.flac', '.wav', '.ape', '.ogg', '.m4a', '.aac', '.wma', '.opus']

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

downloadRouter.post('/add', async (req, res) => {
  try {
    if (!hasActiveSource(getStoredActiveSourceIds(req.user?.id))) {
      return res.status(400).json(getNoActiveSourcePayload())
    }
    const { tasks } = req.body
    if (!Array.isArray(tasks) || !tasks.length) return res.status(400).json({ error: '没有下载任务' })
    if (tasks.length > 50) return res.status(400).json({ error: '单次最多添加 50 个下载任务' })

    const insert = getDB().prepare(`
      INSERT INTO download_tasks (id, name, singer, source, album, interval, quality, meta, status, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'waiting', ?)
    `)

    const activeKeys = loadActiveDownloadIdentityKeys(req.user.id)
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
        })
        insert.run(id, t.name, t.singer || '', t.source || '', t.album || '', t.interval || '', quality, meta, req.user.id)
        added.push(id)
      }
    })
    tx()

    processQueue()
    res.json({ ok: true, ids: added, skipped })
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

/** 同名文件已存在：仍下载当前音质（覆盖本地同名文件） */
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
    confirmExistOverwrite(row)
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
  const rows = getDB().prepare("SELECT id FROM download_tasks WHERE status = 'downloading'").all()
  for (const row of rows) {
    if (activeDownloads.has(row.id)) continue
    getDB().prepare("UPDATE download_tasks SET status = 'paused' WHERE id = ?").run(row.id)
    dlBroadcast('download:status', { id: row.id, status: 'paused' })
  }
}

function pauseTask(id) {
  const dl = activeDownloads.get(id)
  if (dl?.abort) dl.abort.abort()
  const row = getDB().prepare("SELECT id FROM download_tasks WHERE id = ? AND status IN ('waiting', 'downloading')").get(id)
  if (!row) return false
  getDB().prepare("UPDATE download_tasks SET status = 'paused' WHERE id = ?").run(id)
  dlBroadcast('download:status', { id, status: 'paused' })
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

function requeueTask(id, { allowedStatuses = ['paused', 'error', 'await_confirm', 'await_exist'], cleanupFiles = true } = {}) {
  const row = getDB().prepare('SELECT * FROM download_tasks WHERE id = ?').get(id)
  if (!row || !allowedStatuses.includes(row.status)) return false

  const forceRedownload = ['error', 'await_confirm', 'await_exist'].includes(row.status)
  const { meta } = prepareTaskForRetry(row, { cleanupFiles, forceRedownload })
  if (row.status === 'await_exist') {
    meta.existFileConfirmed = true
    delete meta.existFileOffer
  }

  getDB().prepare(`
    UPDATE download_tasks
    SET status = 'waiting', error = NULL, progress = 0, downloaded_size = 0, file_path = NULL, meta = ?
    WHERE id = ?
  `).run(JSON.stringify(meta), id)
  dlBroadcast('download:status', {
    id,
    status: 'waiting',
    error: '',
    progress: 0,
    downgradeOffer: null,
    existFileOffer: null,
  })
  processQueue()
  return true
}

function confirmExistOverwrite(row) {
  const meta = parseTaskMeta(row)
  delete meta.existFileOffer
  meta.existFileConfirmed = true
  meta.forceRedownload = true
  cleanupTaskDownloadArtifacts(row, meta, taskSettings(row))
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
  cleanupTaskDownloadArtifacts(row, meta, settings, { exceptPath: filePath })
  getDB().prepare(`
    UPDATE download_tasks SET status = 'completed', file_path = ?, progress = 1, error = NULL, meta = ? WHERE id = ?
  `).run(filePath, JSON.stringify(meta), row.id)
  dlBroadcast('download:status', {
    id: row.id,
    status: 'completed',
    progress: 1,
    filePath,
    quality: row.quality,
    existFileOffer: null,
    skippedExist: true,
  })
  scanBatchAndCache([{ filePath }]).catch(() => {})
  notifyLibraryChanged([filePath], { reason: 'download-skip-exist' })
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
  return requeueTask(id)
}

function resumeTasks(ids = null) {
  const rows = ids?.length
    ? getDB().prepare(`SELECT id FROM download_tasks WHERE id IN (${ids.map(() => '?').join(',')}) AND status = 'paused'`).all(...ids)
    : getDB().prepare("SELECT id FROM download_tasks WHERE status = 'paused'").all()
  let count = 0
  for (const row of rows) {
    if (resumeTask(row.id)) count++
  }
  return count
}

export function initDownloadQueue() {
  reconcileStaleDownloads()
  processQueue()
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

function saveTaskMeta(taskId, meta) {
  getDB().prepare('UPDATE download_tasks SET meta = ? WHERE id = ?').run(JSON.stringify(meta), taskId)
}

function applyQualityDowngrade(row, toQuality, { autoCascade = false, reason = '' } = {}) {
  const meta = parseTaskMeta(row)
  delete meta.downgradeOffer
  // 换音质后重新按激活音源顺序尝试，不锁死在上一档用过的音源
  delete meta.sourceApiId
  delete meta.skipSourceIds
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

async function processQueue() {
  const globalSettings = getSettings()
  const maxDl = parseInt(globalSettings['download.maxDownloadNum']) || 3

  while (runningCount < maxDl) {
    const task = getDB().prepare("SELECT * FROM download_tasks WHERE status = 'waiting' ORDER BY created_at ASC LIMIT 1").get()
    if (!task) break

    runningCount++
    getDB().prepare("UPDATE download_tasks SET status = 'downloading' WHERE id = ?").run(task.id)
    dlBroadcast('download:status', { id: task.id, status: 'downloading', quality: task.quality })

    downloadTask(task, taskSettings(task)).finally(() => {
      runningCount--
      activeDownloads.delete(task.id)
      if (task.user_id) scheduleExistSummary(task.user_id)
      processQueue()
    })
  }
}

async function resolveDownloadUrl(source, quality, musicInfo, settings, meta = {}, userId = null) {
  // 下载：每一档音质都按该用户激活音源顺序全量尝试，再交给降档策略
  const result = await requestSourceWithMeta(source, 'musicUrl', {
    type: quality,
    quality,
    musicInfo,
  }, {
    fallbackMode: 'auto',
    skipSourceIds: meta.skipSourceIds || [],
    allowedSourceIds: getStoredActiveSourceIds(userId),
  })
  const url = extractMusicUrl(result.data)
  if (!url) throw new Error(`获取 ${qualityLabel(quality)} 音质下载链接失败，请尝试其他音质`)
  return { url, sourceInfo: result }
}

async function streamToFile(url, partPath, taskId, abort) {
  const { default: needlePkg } = await import('needle')
  const stream = needlePkg.get(url, {
    follow_max: 5,
    signal: abort.signal,
    response_timeout: 60000,
    read_timeout: 120000,
  })
  safeUnlink(partPath)
  const writer = fs.createWriteStream(partPath)
  let downloaded = 0
  let total = 0

  stream.on('header', (code, headers) => {
    if (code && code >= 400) {
      stream.emit('err', new Error(`下载响应异常 HTTP ${code}`))
      return
    }
    total = parseInt(headers['content-length']) || 0
    getDB().prepare('UPDATE download_tasks SET total_size = ? WHERE id = ?').run(total, taskId)
  })

  try {
    await new Promise((resolve, reject) => {
      let lastProgressAt = 0
      let pendingProgress = null
      let progressTimer = null

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

      const scheduleProgress = (downloaded, total) => {
        const progress = total > 0 ? downloaded / total : 0
        pendingProgress = { downloaded, progress, total }
        if (!progressTimer) {
          progressTimer = setTimeout(() => {
            progressTimer = null
            flushProgress(true)
          }, 400)
        }
      }

      stream.on('data', (chunk) => {
        downloaded += chunk.length
        writer.write(chunk)
        scheduleProgress(downloaded, total)
      })
      stream.on('done', (err) => {
        if (progressTimer) {
          clearTimeout(progressTimer)
          progressTimer = null
        }
        if (!err && pendingProgress) flushProgress(true)
        writer.end()
        if (err) reject(err)
        else resolve()
      })
      stream.on('err', (err) => {
        try { writer.destroy() } catch {}
        reject(err)
      })
    })
  } catch (e) {
    try { writer.destroy() } catch {}
    safeUnlink(partPath)
    throw e
  }
}

function markSourceFallbackOffer(task, meta, error) {
  const offer = buildSourceFallbackOffer(error)
  if (!offer) return false
  cleanupTaskDownloadArtifacts(task, meta, taskSettings(task))
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
  cleanupTaskDownloadArtifacts(task, meta, taskSettings(task))
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
  // 批量场景显示为失败文案；单曲仍提示可处理
  const tip = deferred
    ? `下载失败：本地已有同名文件（${offer.localLabel}），当前要下 ${offer.requestedLabel}`
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
    cleanupTaskDownloadArtifacts(task, meta, settings)
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
    cleanupTaskDownloadArtifacts(row, taskMeta, taskSettings(row))
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
  return path.join(process.env.CONFIG_PATH || '/config', 'download-staging')
}

function getDownloadStagingDir(taskId) {
  return path.join(getDownloadStagingRoot(), String(taskId || 'unknown'))
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

function cleanupTaskDownloadArtifacts(task, meta, settings, { exceptPath } = {}) {
  const except = new Set([exceptPath].filter(Boolean))
  for (const filePath of collectTaskArtifactPaths(task, meta, settings)) {
    if (except.has(filePath)) continue
    cleanupDownloadPath(filePath)
  }
  cleanupGroupDirArtifacts(task, settings, except)
  if (meta?.downloadArtifacts) meta.downloadArtifacts = []
}

function resolveTaskFileBaseName(task, settings) {
  const template = settings['download.fileName'] || '{name} - {singer}'
  return sanitize(template
    .replace(/\{name\}/g, task.name || 'Unknown')
    .replace(/\{singer\}/g, task.singer || 'Unknown')
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
  return { meta, settings }
}

function resolveTaskFilePath(task, settings, ext) {
  const fileName = buildFileName(settings['download.fileName'] || '{name} - {singer}', task, ext)
  const savePath = taskSavePath(task)
  const groupDir = resolveDownloadGroupDir(savePath, settings, task)
  return path.join(groupDir, fileName)
}

function finalizePartFile(partPath, filePath) {
  safeUnlink(filePath)
  if (!fs.existsSync(partPath)) throw new Error('下载文件不完整')
  fs.renameSync(partPath, filePath)
}

async function downloadTask(task, settings) {
  const abort = new AbortController()
  activeDownloads.set(task.id, { abort })

  const meta = parseTaskMeta(task)
  const source = meta.source || task.source
  const quality = task.quality || '320k'
  const musicInfo = buildMusicInfoFromTask(task, meta)
  let lastError = null
  let lastAttemptPath = ''

  try {
    // 取链前先按「主文件名」检测本地同名（扩展名不同也算），避免无效请求
    if (await handleExistingSameNameFile(task, meta, settings)) return

    for (let attempt = 1; attempt <= SAME_QUALITY_ATTEMPTS; attempt++) {
      // 任务可能已被暂停
      const latest = getDB().prepare('SELECT status FROM download_tasks WHERE id = ?').get(task.id)
      if (!latest || latest.status === 'paused') return

      let filePath = ''
      let partPath = ''
      try {
        if (attempt > 1) {
          dlBroadcast('download:status', {
            id: task.id,
            status: 'downloading',
            quality,
            retryAttempt: attempt,
            retryTotal: SAME_QUALITY_ATTEMPTS,
          })
          await sleep(RETRY_DELAY_MS * (attempt - 1))
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
        partPath = partPathFor(stagedPath)
        lastAttemptPath = filePath
        rememberDownloadArtifact(meta, filePath)
        saveTaskMeta(task.id, meta)

        fs.mkdirSync(path.dirname(filePath), { recursive: true })

        const forceRedownload = meta.forceRedownload === true
        if (forceRedownload) {
          cleanupTaskDownloadArtifacts(task, meta, settings)
          delete meta.forceRedownload
          saveTaskMeta(task.id, meta)
        }

        // 取链后再次按目标路径兜底（极少：同名但不同目录策略变更等）
        if (!forceRedownload && !meta.existFileConfirmed) {
          const sameNameAgain = findExistingSameNameFiles(task, settings)
          if (sameNameAgain.length) {
            if (await handleExistingSameNameFile(task, meta, settings)) return
          }
        }

        cleanupTaskDownloadArtifacts(task, meta, settings, { exceptPath: filePath })

        const expectedSec = parseDurationSeconds(
          task.interval || meta.duration || meta.interval || musicInfo.interval || musicInfo.duration,
        )

        // 落盘前：用音源音频自带的总时长判断（试听源常直接标成 10～30 秒）
        const remoteSec = await probeRemoteAudioDurationSeconds(url)
        const preErr = assertNotPreviewClip(remoteSec, expectedSec, { forDownload: true })
        if (preErr) {
          if (meta.sourceApiId) {
            const skipped = new Set([...(meta.skipSourceIds || []), meta.sourceApiId].filter(Boolean))
            meta.skipSourceIds = [...skipped]
            saveTaskMeta(task.id, meta)
          }
          throw preErr
        }

        // 先在应用配置目录内写完（含标签），再一次性发布到下载目录，降低夸克等网盘挂载产生 name(1) 的概率
        await streamToFile(url, partPath, task.id, abort)
        finalizePartFile(partPath, stagedPath)

        // 远程探测失败时，落盘后再校验一次（兜底）
        if (!(remoteSec > 0)) {
          const actualSec = await probeFileDurationSeconds(stagedPath)
          const postErr = assertNotPreviewClip(actualSec, expectedSec, { forDownload: true })
          if (postErr) {
            cleanupDownloadPath(stagedPath)
            cleanupStagingDir(task.id)
            if (meta.sourceApiId) {
              const skipped = new Set([...(meta.skipSourceIds || []), meta.sourceApiId].filter(Boolean))
              meta.skipSourceIds = [...skipped]
              saveTaskMeta(task.id, meta)
            }
            throw postErr
          }
        }

        await writeMetaIfNeeded(task, meta, stagedPath, ext, settings)
        publishStagedDownload(stagedPath, filePath)
        cleanupStagingDir(task.id)
        cleanupTaskDownloadArtifacts(task, meta, settings, { exceptPath: filePath })
        rememberDownloadArtifact(meta, filePath)
        meta.downloadArtifacts = [filePath]
        delete meta.existFileConfirmed
        saveTaskMeta(task.id, meta)

        getDB().prepare("UPDATE download_tasks SET status = 'completed', file_path = ?, progress = 1, error = NULL WHERE id = ?")
          .run(filePath, task.id)
        dlBroadcast('download:status', { id: task.id, status: 'completed', progress: 1, filePath, quality })
        scanBatchAndCache([{ filePath }]).catch(() => {})
        notifyLibraryChanged([filePath], { reason: 'download' })
        return
      } catch (e) {
        cleanupDownloadPath(partPath)
        cleanupStagingDir(task.id)
        if (filePath) {
          cleanupDownloadPath(filePath)
          rememberDownloadArtifact(meta, filePath)
        }
        if (e.name === 'AbortError') return
        lastError = e
        const retryable = isRetryableDownloadError(e)
        console.warn(`[下载] ${task.name} ${quality} 第 ${attempt}/${SAME_QUALITY_ATTEMPTS} 次失败: ${e.message}`)
        if (!retryable || attempt >= SAME_QUALITY_ATTEMPTS) break
      }
    }

    if (lastAttemptPath) {
      cleanupDownloadPath(lastAttemptPath)
      clearTaskStoredFilePath(task.id)
    }
    cleanupStagingDir(task.id)
    const reason = lastError?.message || '下载失败'
    if (isNoActiveSourceError(lastError) || isNoActiveSourceError(reason)) {
      markError(task.id, reason, meta)
      return
    }
    // 各音源均为试听片段：不再降档，直接失败提示
    if (lastError?.code === 'PREVIEW_CLIP' || /仅提供约.*试听片段|时长不完整/i.test(reason)) {
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

    if (policy === 'none') {
      markError(task.id, formatMissingQualityError(preferred, '', reason), meta)
      return
    }

    const nextQuality = getNextLowerQuality(
      quality,
      available,
      policy === 'floor' ? floor : '',
    )

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

  // 未开启任何封面/歌词相关选项则跳过
  if (!wantEmbedPic && !wantEmbedLyric && !wantLrcFile) {
    return
  }

  const source = meta.source || task.source
  const musicInfo = buildMusicInfoFromTask(task, meta)
  const canEmbed = ['.mp3', '.flac'].includes(ext)

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

  // 仅在开启内嵌且格式支持时写入音频内置标签
  if (canEmbed && (wantEmbedPic || wantEmbedLyric)) {
    const metaData = {
      title: task.name || '',
      artist: (task.singer || '').replace(/\//g, ';'),
      album: task.album || '',
    }
    if (wantEmbedPic && picBuf) metaData.pic = picBuf
    if (wantEmbedLyric && lrcResult?.lyric) {
      metaData.lyric = buildEmbedLyrics(lrcResult, settings)
    }
    try {
      await writeMeta(filePath, ext, metaData)
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
