/**
 * 后台监测音乐库目录（参考 Navidrome：定时比对，有变化才导入并热更新前端）。
 * - 先用「目录/文件名列表签名」快速判断，无变化则跳过全量 sync（不对每个音频 stat）
 * - 周期性强制全量比对，兜底 NAS 不刷新父目录 mtime 等边界情况
 * - 仅在 pending/removed 时启动扫标签任务并通知前端
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
import { markLibraryIndexDirty } from './libraryIndexState.js'
import { computeLibraryListingFingerprint } from './libraryDirFingerprint.js'

let timer = null
let tickInFlight = false
let started = false
/** @type {string} */
let lastListingFp = ''
let ticksSinceFullSync = 0

/** 每 N 次监测强制全量 sync 一次（默认间隔 5min 时约 1 小时） */
const FORCE_FULL_EVERY_TICKS = 12

async function tick({ forceFull = false } = {}) {
  if (tickInFlight) return
  if (!getLibraryWatchEnabled()) return
  if (getLibraryScanStatus().running) return

  const dirs = getLibraryAutoScanDirs().filter(Boolean)
  if (!dirs.length) return

  tickInFlight = true
  try {
    ticksSinceFullSync += 1

    // 冷启动：只建签名，不立刻对每个音频 stat（避免「一开机盘狂转」）
    if (!lastListingFp && !forceFull) {
      try {
        lastListingFp = computeLibraryListingFingerprint(dirs)
      } catch (e) {
        console.warn('[library-watch] 初始签名失败:', e?.message || e)
      }
      return
    }

    const needFull = forceFull || ticksSinceFullSync >= FORCE_FULL_EVERY_TICKS

    if (!needFull) {
      let fp = ''
      try {
        fp = computeLibraryListingFingerprint(dirs)
      } catch (e) {
        console.warn('[library-watch] 签名失败，回退全量比对:', e?.message || e)
      }
      if (fp && fp === lastListingFp) {
        return
      }
      if (fp) lastListingFp = fp
    }

    const syncResult = syncLibraryIndex(dirs, { partial: isPartialScan(dirs) })
    ticksSinceFullSync = 0
    try {
      lastListingFp = computeLibraryListingFingerprint(dirs)
    } catch {
      /* keep previous */
    }

    const pending = syncResult.pending?.length || 0
    const removed = syncResult.removed?.length || 0
    if (!pending && !removed) return

    markLibraryIndexDirty()
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
  // 首次比对再延后，让页面先可交互；优先轻量签名，无变化则不砸盘
  setTimeout(() => {
    tick({ forceFull: false }).catch(() => {})
  }, 60000).unref?.()
}

export function stopLibraryAutoWatch() {
  started = false
  clearTimer()
}

/** 测试/手动：清空签名缓存，下次监测会重新比对 */
export function resetLibraryWatchFingerprint() {
  lastListingFp = ''
  ticksSinceFullSync = FORCE_FULL_EVERY_TICKS
}
