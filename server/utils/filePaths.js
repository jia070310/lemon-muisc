import fs from 'fs'
import { getDB } from '../db.js'

const FILE_PATHS_KEY = 'file.paths'
const DOWNLOAD_PATH_KEY = 'download.savePath'
const TAG_DIRS_KEY = 'tag.dirs'

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

export function getFilePaths() {
  try {
    const paths = JSON.parse(getSetting(FILE_PATHS_KEY) || '[]')
    return Array.isArray(paths) ? paths.filter(Boolean) : []
  } catch {
    return []
  }
}

function syncTagDirs(paths) {
  setSetting(TAG_DIRS_KEY, JSON.stringify(paths))
}

export function setFilePaths(paths) {
  const unique = [...new Set(paths.map(p => p.trim()).filter(Boolean))]
  setSetting(FILE_PATHS_KEY, JSON.stringify(unique))
  syncTagDirs(unique)
  return unique
}

export function getDownloadSavePath() {
  const paths = getFilePaths()
  const saved = getSetting(DOWNLOAD_PATH_KEY)
  if (saved && paths.includes(saved)) return saved
  if (paths.length) {
    setSetting(DOWNLOAD_PATH_KEY, paths[0])
    return paths[0]
  }
  return process.env.DOWNLOAD_PATH || '/data'
}

export function setDownloadSavePath(dirPath) {
  const p = dirPath.trim()
  const paths = getFilePaths()
  if (!paths.includes(p)) throw new Error('路径不在文件路径列表中，请先在设置里添加')
  setSetting(DOWNLOAD_PATH_KEY, p)
  return p
}

export function migrateFilePaths(defaultDataPath = '/data') {
  let paths = getFilePaths()
  if (!paths.length) {
    const savePath = getSetting(DOWNLOAD_PATH_KEY) || defaultDataPath
    let tagDirs = []
    try {
      tagDirs = JSON.parse(getSetting(TAG_DIRS_KEY) || '[]')
    } catch {}
    paths = [...new Set([savePath, ...tagDirs, defaultDataPath].filter(Boolean))]
    setFilePaths(paths)
  }

  const saved = getSetting(DOWNLOAD_PATH_KEY)
  if (!saved || !paths.includes(saved)) {
    setSetting(DOWNLOAD_PATH_KEY, paths[0])
  }
  syncTagDirs(paths)
}

export function addFilePath(dirPath, { fromPicker = false } = {}) {
  const p = dirPath.trim()
  if (!p) throw new Error('请提供路径')
  if (!fromPicker && !fs.existsSync(p)) throw new Error('目录不存在')
  if (fromPicker && !fs.existsSync(p) && !isAuthorizedPath(p)) {
    throw new Error('目录不可用，请确认已在飞牛中授权该路径')
  }
  const paths = getFilePaths()
  if (paths.includes(p)) throw new Error('路径已存在')
  paths.push(p)
  setFilePaths(paths)
  if (paths.length === 1) setSetting(DOWNLOAD_PATH_KEY, p)
  return paths
}

export function updateFilePath(oldPath, newPath, { fromPicker = false } = {}) {
  const from = oldPath.trim()
  const to = newPath.trim()
  if (!from || !to) throw new Error('请提供原路径和新路径')
  if (!fromPicker && !fs.existsSync(to)) throw new Error('新目录不存在')
  if (fromPicker && !fs.existsSync(to) && !isAuthorizedPath(to)) {
    throw new Error('目录不可用，请确认已在飞牛中授权该路径')
  }

  const paths = getFilePaths()
  const idx = paths.indexOf(from)
  if (idx === -1) throw new Error('原路径不存在')
  if (from !== to && paths.includes(to)) throw new Error('新路径已存在')

  paths[idx] = to
  setFilePaths(paths)

  if (getSetting(DOWNLOAD_PATH_KEY) === from) {
    setSetting(DOWNLOAD_PATH_KEY, to)
  }
  return paths
}

export function removeFilePath(dirPath) {
  const p = dirPath.trim()
  const paths = getFilePaths()
  if (!paths.includes(p)) throw new Error('路径不存在')
  if (paths.length <= 1) throw new Error('至少保留一个文件路径')

  const next = paths.filter(x => x !== p)
  setFilePaths(next)

  if (getSetting(DOWNLOAD_PATH_KEY) === p) {
    setSetting(DOWNLOAD_PATH_KEY, next[0])
  }
  return next
}

function getAuthorizedPathsFromEnv() {
  const raw = process.env.TRIM_DATA_ACCESSIBLE_PATHS || ''
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter(Boolean)
  } catch {}
  return raw.split(':').map(s => s.trim()).filter(Boolean)
}

function isAuthorizedPath(dirPath) {
  if (fs.existsSync(dirPath)) return true
  const authorized = getAuthorizedPathsFromEnv()
  return authorized.some(root => dirPath === root || dirPath.startsWith(`${root}/`))
}
