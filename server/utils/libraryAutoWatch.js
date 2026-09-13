/**
 * 后台监测音乐库目录：定时增量比对磁盘（mtime/size），
 * 发现外部新增/修改/删除后启动既有扫描任务并经 WebSocket 热更新前端。
 * 适合 NAS/网盘拷入等「非应用下载」场景；网络盘上比 fs.watch 更可靠。
 */
import {
  getLibraryAutoScanDirs,
  getLibraryWatchEnabled,
  getLibraryWatchIntervalMs,
  isPartialScan,
} from './libraryScanSettings.js'
import { syncLibraryIndex } from './libraryCache.js'
import { getLibraryScanStatus, startLibraryScanJob } from './libraryScanJob.js'
import { notifyLibraryRemoved } from './libraryNotify.js'

let timer = null
let tickInFlight = false
let started = false

async function tick() {
  if (tickInFlight) return
  if (!getLibraryWatchEnabled()) return
  if (getLibraryScanStatus().running) return

  const dirs = getLibraryAutoScanDirs().filter(Boolean)
  if (!dirs.length) return

  tickInFlight = true
  try {
    const syncResult = syncLibraryIndex(dirs, { partial: isPartialScan(dirs) })
    const pending = syncResult.pending?.length || 0
    const removed = syncResult.removed?.length || 0
    if (!pending && !removed) return

    if (removed) notifyLibraryRemoved(syncResult.removed)
    startLibraryScanJob({ syncResult, dirs })
  } catch (e) {
    console.warn('[library-watch] 检测失败:', e?.message || e)
  } finally {
    tickInFlight = false
  }
}

function clearTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/** 按当前设置重启定时器（保存设置后调用） */
export function restartLibraryAutoWatch() {
  clearTimer()
  if (!getLibraryWatchEnabled()) return
  const ms = getLibraryWatchIntervalMs()
  timer = setInterval(() => {
    tick().catch(() => {})
  }, ms)
  if (typeof timer.unref === 'function') timer.unref()
}

export function startLibraryAutoWatch() {
  if (started) {
    restartLibraryAutoWatch()
    return
  }
  started = true
  restartLibraryAutoWatch()
  // 启动稍后做一次，避免与启动时其它 IO 挤在一起
  setTimeout(() => {
    tick().catch(() => {})
  }, 8000).unref?.()
}

export function stopLibraryAutoWatch() {
  started = false
  clearTimer()
}
