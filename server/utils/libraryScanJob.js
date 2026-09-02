import { getMusicPaths } from './filePaths.js'
import {
  getLibraryAutoScanDirs,
  isPartialScan,
} from './libraryScanSettings.js'
import {
  syncLibraryIndex,
  scanBatchAndCache,
  getAllCachedTracks,
} from './libraryCache.js'
import {
  notifyLibraryRemoved,
  notifyLibraryChanged,
  notifyLibraryScanProgress,
  notifyLibraryScanComplete,
} from './libraryNotify.js'

const BATCH_SIZE = 20

/** @type {{ running: boolean, phase: string, current: number, total: number, scanned: number, error: string, startedAt: number, finishedAt: number }} */
let scanState = {
  running: false,
  phase: 'idle',
  current: 0,
  total: 0,
  scanned: 0,
  error: '',
  startedAt: 0,
  finishedAt: 0,
}

let jobPromise = null
let abortRequested = false

export function getLibraryScanStatus() {
  return { ...scanState }
}

function emitProgress(extra = {}) {
  notifyLibraryScanProgress({
    phase: scanState.phase,
    current: scanState.current,
    total: scanState.total,
    scanned: scanState.scanned,
    running: scanState.running,
    error: scanState.error || '',
    ...extra,
  })
}

async function runScanJob(precomputed, scanDirs) {
  try {
    const dirs = (scanDirs?.length ? scanDirs : getLibraryAutoScanDirs()).filter(Boolean)
    if (!dirs.length) {
      scanState.phase = 'done'
      scanState.running = false
      scanState.finishedAt = Date.now()
      emitProgress()
      notifyLibraryScanComplete({ totalTracks: 0, scannedTags: 0, hadPending: false })
      return
    }

    scanState.phase = 'sync'
    scanState.current = 0
    scanState.total = 0
    scanState.scanned = 0
    scanState.error = ''
    emitProgress({ text: '比对文件' })

    const syncResult = precomputed || syncLibraryIndex(dirs, { partial: isPartialScan(dirs) })
    if (!precomputed && syncResult.removed?.length) {
      notifyLibraryRemoved(syncResult.removed)
    }

    const pending = syncResult.pending || []
    scanState.phase = 'tags'
    scanState.total = pending.length
    scanState.current = 0
    scanState.scanned = 0
    emitProgress({ text: pending.length ? `读取标签 0/${pending.length}` : '扫描完成' })

    if (!pending.length || abortRequested) {
      scanState.phase = 'done'
      scanState.running = false
      scanState.finishedAt = Date.now()
      emitProgress()
      notifyLibraryScanComplete({
        totalTracks: getAllCachedTracks().length,
        scannedTags: 0,
        hadPending: false,
      })
      return
    }

    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      if (abortRequested) break
      const batch = pending.slice(i, i + BATCH_SIZE)
      const scanned = await scanBatchAndCache(batch)
      const done = Math.min(i + batch.length, pending.length)
      scanState.current = done
      scanState.scanned = done
      emitProgress({ text: `读取标签 ${done}/${pending.length}` })
      const paths = scanned.map((row) => row.filePath).filter(Boolean)
      if (paths.length) {
        notifyLibraryChanged(paths, { reason: 'scan-batch' })
      }
      await new Promise((resolve) => setImmediate(resolve))
    }

    scanState.phase = abortRequested ? 'idle' : 'done'
    scanState.running = false
    scanState.finishedAt = Date.now()
    emitProgress()
    notifyLibraryScanComplete({
      totalTracks: getAllCachedTracks().length,
      scannedTags: scanState.scanned,
      hadPending: pending.length > 0,
    })
  } catch (e) {
    scanState.phase = 'error'
    scanState.error = e.message || '扫描失败'
    scanState.running = false
    scanState.finishedAt = Date.now()
    emitProgress()
  }
}

/** 启动服务端后台扫描（页面关闭后仍会继续） */
export function startLibraryScanJob({ force = false, syncResult = null, dirs = null } = {}) {
  if (scanState.running) {
    if (!force) return getLibraryScanStatus()
    abortRequested = true
  }

  const scanDirs = dirs?.length ? dirs : null
  abortRequested = false
  scanState = {
    running: true,
    phase: 'sync',
    current: 0,
    total: 0,
    scanned: 0,
    error: '',
    startedAt: Date.now(),
    finishedAt: 0,
    dirs: scanDirs || getLibraryAutoScanDirs(),
  }

  jobPromise = runScanJob(syncResult, scanState.dirs).finally(() => {
    jobPromise = null
    abortRequested = false
  })

  return getLibraryScanStatus()
}

export function waitForLibraryScanJob() {
  return jobPromise || Promise.resolve()
}
