import { getDB } from '../db.js'
import path from 'path'
import { getMusicPaths, mapToContainerPath, isUnderConfiguredMusicDir, isPathUnderMusicDirs } from './filePaths.js'

const AUTO_SCAN_MODE_KEY = 'library.scan.autoMode'
const AUTO_SCAN_DIRS_KEY = 'library.scan.autoDirs'
const WATCH_ENABLED_KEY = 'library.scan.watchEnabled'
const WATCH_INTERVAL_KEY = 'library.scan.watchIntervalSec'

const DEFAULT_WATCH_INTERVAL_SEC = 120
const MIN_WATCH_INTERVAL_SEC = 30
const MAX_WATCH_INTERVAL_SEC = 3600

function getSetting(key) {
  const row = getDB().prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row?.value
}

function setSetting(key, value) {
  getDB().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

export function getLibraryAutoScanMode() {
  return getSetting(AUTO_SCAN_MODE_KEY) === 'selected' ? 'selected' : 'all'
}

export function getLibraryWatchEnabled() {
  const raw = getSetting(WATCH_ENABLED_KEY)
  if (raw == null || raw === '') return true
  return raw === '1' || raw === 'true'
}

export function getLibraryWatchIntervalSec() {
  const n = Number(getSetting(WATCH_INTERVAL_KEY))
  if (!Number.isFinite(n)) return DEFAULT_WATCH_INTERVAL_SEC
  return Math.min(MAX_WATCH_INTERVAL_SEC, Math.max(MIN_WATCH_INTERVAL_SEC, Math.round(n)))
}

export function getLibraryWatchIntervalMs() {
  return getLibraryWatchIntervalSec() * 1000
}

export function getLibraryAutoScanDirs() {
  const all = getMusicPaths().filter(Boolean)
  if (getLibraryAutoScanMode() !== 'selected') return all
  try {
    const raw = JSON.parse(getSetting(AUTO_SCAN_DIRS_KEY) || '[]')
    if (!Array.isArray(raw) || !raw.length) return all
    const picked = raw
      .map((p) => mapToContainerPath(String(p || '').trim()))
      .filter((p) => p && isUnderConfiguredMusicDir(p))
    return picked.length ? [...new Set(picked)] : all
  } catch {
    return all
  }
}

export function getLibraryScanSettings() {
  const all = getMusicPaths().filter(Boolean)
  let autoDirs = []
  try {
    const raw = JSON.parse(getSetting(AUTO_SCAN_DIRS_KEY) || '[]')
    autoDirs = Array.isArray(raw) ? raw : []
  } catch {}
  return {
    autoMode: getLibraryAutoScanMode(),
    autoDirs: autoDirs
      .map((p) => mapToContainerPath(String(p || '').trim()))
      .filter((p) => p && isUnderConfiguredMusicDir(p)),
    musicPaths: all,
    watchEnabled: getLibraryWatchEnabled(),
    watchIntervalSec: getLibraryWatchIntervalSec(),
  }
}

export function setLibraryScanSettings({ autoMode, autoDirs, watchEnabled, watchIntervalSec } = {}) {
  if (autoMode === 'all' || autoMode === 'selected') {
    setSetting(AUTO_SCAN_MODE_KEY, autoMode)
  }
  if (autoDirs !== undefined) {
    const valid = (autoDirs || [])
      .map((p) => mapToContainerPath(String(p || '').trim()))
      .filter((p) => p && isUnderConfiguredMusicDir(p))
    setSetting(AUTO_SCAN_DIRS_KEY, JSON.stringify([...new Set(valid)]))
  }
  if (watchEnabled !== undefined) {
    setSetting(WATCH_ENABLED_KEY, watchEnabled ? '1' : '0')
  }
  if (watchIntervalSec !== undefined && watchIntervalSec !== null && watchIntervalSec !== '') {
    const n = Number(watchIntervalSec)
    if (Number.isFinite(n)) {
      const sec = Math.min(MAX_WATCH_INTERVAL_SEC, Math.max(MIN_WATCH_INTERVAL_SEC, Math.round(n)))
      setSetting(WATCH_INTERVAL_KEY, String(sec))
    }
  }
  return getLibraryScanSettings()
}

export function onMusicPathRemoved(removedPath) {
  const p = mapToContainerPath(String(removedPath || '').trim())
  const settings = getLibraryScanSettings()
  const next = settings.autoDirs.filter((d) => {
    const mapped = mapToContainerPath(d)
    if (mapped === p || mapped === removedPath) return false
    return !isPathUnderMusicDirs(d, [p])
  })
  if (next.length === settings.autoDirs.length) return
  setLibraryScanSettings({ autoDirs: next })
}

export function onMusicPathUpdated(oldPath, newPath) {
  const from = mapToContainerPath(String(oldPath || '').trim())
  const to = mapToContainerPath(String(newPath || '').trim())
  const settings = getLibraryScanSettings()
  let changed = false
  const next = settings.autoDirs.map((d) => {
    const remapped = remapPathUnderRoot(d, from, to)
    if (remapped !== d) changed = true
    return remapped
  })
  if (changed) setLibraryScanSettings({ autoDirs: next })
}

function remapPathUnderRoot(dirPath, oldRoot, newRoot) {
  const from = path.resolve(mapToContainerPath(oldRoot) || oldRoot)
  const to = path.resolve(mapToContainerPath(newRoot) || newRoot)
  const d = path.resolve(mapToContainerPath(dirPath) || dirPath)
  if (d === from) return to
  const prefix = from + path.sep
  if (d.startsWith(prefix)) return path.join(to, d.slice(prefix.length))
  return dirPath
}

/** 解析本次要扫描的目录：未指定时用自动扫描配置；支持音乐库根目录下的子文件夹 */
export function resolveScanDirs(requestedDirs) {
  const allRoots = getMusicPaths().filter(Boolean)
  if (!requestedDirs) return getLibraryAutoScanDirs()
  if (!Array.isArray(requestedDirs) || !requestedDirs.length) {
    return getLibraryAutoScanDirs()
  }
  const picked = []
  for (const req of requestedDirs) {
    const r = mapToContainerPath(String(req || '').trim())
    if (!r || !isUnderConfiguredMusicDir(r)) continue
    picked.push(r)
  }
  return [...new Set(picked)]
}

export function isPartialScan(dirs) {
  const allRoots = getMusicPaths().filter(Boolean)
  const scan = (dirs || []).filter(Boolean)
  if (!allRoots.length || !scan.length) return false
  if (scan.length !== allRoots.length) return true
  const set = new Set(scan)
  return !allRoots.every((d) => set.has(d))
}
