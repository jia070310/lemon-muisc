import { getDB } from '../db.js'
import { broadcast } from '../ws.js'
import { hasActiveSource } from '../sourceManager.js'
import { getStoredActiveSourceIds } from './activeSources.js'

const TICK_MS = 60_000
const MAX_JOB_TASKS = 2000
const ALLOWED_BATCH = new Set([50, 100, 200, 300, 500, 1000])
const ALLOWED_INTERVAL_HOURS = new Set([1, 3, 6, 12, 24, 48])

/** @type {{ enqueueDownloadTasks: (userId: string, tasks: object[]) => { added: string[], skipped: number } } | null} */
let deps = null
let timer = null

function nowSec() {
  return Math.floor(Date.now() / 1000)
}

function clampBatchSize(n) {
  const v = Math.round(Number(n) || 50)
  if (ALLOWED_BATCH.has(v)) return v
  return 50
}

function clampIntervalHours(n) {
  const v = Number(n)
  if (ALLOWED_INTERVAL_HOURS.has(v)) return v
  return 24
}

function parseTasksJson(raw) {
  try {
    const list = JSON.parse(raw || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function rowToJob(row) {
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    playlistId: row.playlist_id || '',
    playlistName: row.playlist_name || '',
    batchSize: row.batch_size,
    intervalHours: row.interval_hours,
    cursor: row.cursor,
    total: row.total,
    status: row.status,
    nextRunAt: row.next_run_at,
    saveListFolder: Boolean(row.save_list_folder),
    preferredQuality: row.preferred_quality || '',
    strategy: row.strategy || 'cascade',
    floorQuality: row.floor_quality || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function emitJob(userId, type, job) {
  broadcast(type, job, userId)
}

export function ensurePlaylistDownloadJobsTable(db = getDB()) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS playlist_download_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      playlist_id TEXT DEFAULT '',
      playlist_name TEXT DEFAULT '',
      batch_size INTEGER NOT NULL DEFAULT 10,
      interval_hours REAL NOT NULL DEFAULT 24,
      cursor INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      next_run_at INTEGER NOT NULL DEFAULT 0,
      save_list_folder INTEGER NOT NULL DEFAULT 0,
      preferred_quality TEXT DEFAULT '',
      strategy TEXT DEFAULT 'cascade',
      floor_quality TEXT DEFAULT '',
      tasks_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_playlist_dl_jobs_user ON playlist_download_jobs(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_playlist_dl_jobs_next ON playlist_download_jobs(status, next_run_at);
  `)
}

export function startPlaylistDownloadScheduler(bindings) {
  deps = bindings || deps
  if (timer) return
  tickPlaylistDownloadJobs().catch(() => {})
  timer = setInterval(() => {
    tickPlaylistDownloadJobs().catch(() => {})
  }, TICK_MS)
  if (typeof timer.unref === 'function') timer.unref()
}

export function stopPlaylistDownloadScheduler() {
  if (timer) clearInterval(timer)
  timer = null
}

export function listPlaylistDownloadJobs(userId, { status } = {}) {
  ensurePlaylistDownloadJobsTable()
  if (!userId) return []
  let rows
  if (status) {
    rows = getDB().prepare(`
      SELECT * FROM playlist_download_jobs
      WHERE user_id = ? AND status = ?
      ORDER BY created_at DESC
    `).all(userId, status)
  } else {
    rows = getDB().prepare(`
      SELECT * FROM playlist_download_jobs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(userId)
  }
  return rows.map(rowToJob)
}

export function getPlaylistDownloadJob(userId, jobId) {
  ensurePlaylistDownloadJobsTable()
  const row = getDB().prepare('SELECT * FROM playlist_download_jobs WHERE id = ?').get(jobId)
  if (!row || row.user_id !== userId) return null
  return rowToJob(row)
}

export function findActiveJobForPlaylist(userId, playlistId) {
  if (!userId || !playlistId) return null
  ensurePlaylistDownloadJobsTable()
  const row = getDB().prepare(`
    SELECT * FROM playlist_download_jobs
    WHERE user_id = ? AND playlist_id = ? AND status = 'active'
    ORDER BY created_at DESC LIMIT 1
  `).get(userId, playlistId)
  return rowToJob(row)
}

/**
 * 创建循序歌单下载任务，并立即入队首批
 */
export function createPlaylistDownloadJob(userId, payload = {}) {
  if (!userId) throw new Error('未登录')
  if (!deps?.enqueueDownloadTasks) throw new Error('下载队列未就绪')

  ensurePlaylistDownloadJobsTable()

  const tasks = Array.isArray(payload.tasks) ? payload.tasks : []
  if (!tasks.length) throw new Error('没有可下载的歌曲')
  if (tasks.length > MAX_JOB_TASKS) throw new Error(`单次最多 ${MAX_JOB_TASKS} 首`)

  const playlistId = String(payload.playlistId || '').trim()
  const playlistName = String(payload.playlistName || '歌单').trim() || '歌单'
  const batchSize = clampBatchSize(payload.batchSize)
  const intervalHours = clampIntervalHours(payload.intervalHours)
  const saveListFolder = Boolean(payload.saveListFolder)
  const preferredQuality = String(payload.preferredQuality || '').trim()
  const strategy = String(payload.strategy || 'cascade').trim() || 'cascade'
  const floorQuality = String(payload.floorQuality || '').trim()

  if (playlistId) {
    const existing = findActiveJobForPlaylist(userId, playlistId)
    if (existing) {
      const err = new Error('该歌单已有进行中的循序下载任务')
      err.code = 'JOB_EXISTS'
      err.job = existing
      throw err
    }
  }

  const stamped = tasks.map((t) => {
    const next = { ...t }
    if (saveListFolder) next.listName = playlistName
    return next
  })

  const id = `pldl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const ts = nowSec()
  // 先写入未来时间，避免创建后立刻被调度器再跑一批
  const nextRunPlaceholder = ts + Math.max(1, Math.round(intervalHours * 3600))

  getDB().prepare(`
    INSERT INTO playlist_download_jobs (
      id, user_id, playlist_id, playlist_name, batch_size, interval_hours,
      cursor, total, status, next_run_at, save_list_folder,
      preferred_quality, strategy, floor_quality, tasks_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    playlistId,
    playlistName,
    batchSize,
    intervalHours,
    stamped.length,
    nextRunPlaceholder,
    saveListFolder ? 1 : 0,
    preferredQuality,
    strategy,
    floorQuality,
    JSON.stringify(stamped),
    ts,
    ts,
  )

  const result = runJobBatch(id)
  return result.job
}

export function cancelPlaylistDownloadJob(userId, jobId) {
  ensurePlaylistDownloadJobsTable()
  const row = getDB().prepare('SELECT * FROM playlist_download_jobs WHERE id = ?').get(jobId)
  if (!row || row.user_id !== userId) return null
  if (row.status !== 'active' && row.status !== 'paused') {
    return rowToJob(row)
  }
  const ts = nowSec()
  getDB().prepare(`
    UPDATE playlist_download_jobs
    SET status = 'cancelled', updated_at = ?
    WHERE id = ?
  `).run(ts, jobId)
  const job = getPlaylistDownloadJob(userId, jobId)
  emitJob(userId, 'playlist-download:cancelled', job)
  return job
}

function runJobBatch(jobId) {
  if (!deps?.enqueueDownloadTasks) {
    return { job: null, added: 0, skipped: 0, done: false }
  }

  const row = getDB().prepare('SELECT * FROM playlist_download_jobs WHERE id = ?').get(jobId)
  if (!row || row.status !== 'active') {
    return { job: rowToJob(row), added: 0, skipped: 0, done: false }
  }

  if (!hasActiveSource(getStoredActiveSourceIds(row.user_id))) {
    const ts = nowSec()
    // 无音源时推迟一小时再试，避免空转
    getDB().prepare(`
      UPDATE playlist_download_jobs SET next_run_at = ?, updated_at = ? WHERE id = ?
    `).run(ts + 3600, ts, jobId)
    const job = rowToJob(getDB().prepare('SELECT * FROM playlist_download_jobs WHERE id = ?').get(jobId))
    emitJob(row.user_id, 'playlist-download:progress', job)
    return { job, added: 0, skipped: 0, done: false }
  }

  const tasks = parseTasksJson(row.tasks_json)
  const cursor = Number(row.cursor) || 0
  const batchSize = clampBatchSize(row.batch_size)
  const slice = tasks.slice(cursor, cursor + batchSize)

  let added = 0
  let skipped = 0
  if (slice.length) {
    const result = deps.enqueueDownloadTasks(row.user_id, slice)
    added = result?.added?.length || 0
    skipped = result?.skipped || 0
  }

  const nextCursor = Math.min(cursor + slice.length, tasks.length)
  const done = nextCursor >= tasks.length
  const ts = nowSec()
  const intervalSec = Math.max(1, Math.round(Number(row.interval_hours) * 3600))
  const nextRun = done ? ts : ts + intervalSec

  getDB().prepare(`
    UPDATE playlist_download_jobs
    SET cursor = ?, status = ?, next_run_at = ?, updated_at = ?
    WHERE id = ?
  `).run(nextCursor, done ? 'done' : 'active', nextRun, ts, jobId)

  const job = rowToJob(getDB().prepare('SELECT * FROM playlist_download_jobs WHERE id = ?').get(jobId))
  emitJob(row.user_id, done ? 'playlist-download:done' : 'playlist-download:progress', {
    ...job,
    lastAdded: added,
    lastSkipped: skipped,
  })
  return { job, added, skipped, done }
}

export async function tickPlaylistDownloadJobs() {
  ensurePlaylistDownloadJobsTable()
  if (!deps?.enqueueDownloadTasks) return

  const ts = nowSec()
  const due = getDB().prepare(`
    SELECT id FROM playlist_download_jobs
    WHERE status = 'active' AND next_run_at <= ?
    ORDER BY next_run_at ASC
    LIMIT 20
  `).all(ts)

  for (const { id } of due) {
    try {
      runJobBatch(id)
    } catch (e) {
      console.error('[playlist-download] batch failed:', e?.message || e)
    }
  }
}
