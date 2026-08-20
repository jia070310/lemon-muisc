import fs from 'fs'
import path from 'path'
import { getDB } from '../db.js'

const FILE_PATHS_KEY = 'file.paths'
const DOWNLOAD_PATH_KEY = 'download.savePath'
const TAG_DIRS_KEY = 'tag.dirs'
const DEFAULT_DOWNLOAD_DIR = '/downloads'

function getConfigRoot() {
  return process.env.CONFIG_PATH || '/config'
}

function getMountsFile() {
  return path.join(getConfigRoot(), 'mounts.json')
}

function inferMountsFromProc() {
  const result = {}
  try {
    for (const line of fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\n')) {
      const sep = line.indexOf(' - ')
      if (sep === -1) continue
      const mountPoint = line.slice(0, sep).trim().split(/\s+/).pop()
      if (mountPoint !== '/music' && mountPoint !== '/downloads') continue
      const after = line.slice(sep + 3).trim().split(/\s+/)
      if (after[0] !== 'bind' || !after[1]) continue
      const key = mountPoint === '/music' ? 'music' : 'downloads'
      result[key] = { host: after[1], container: mountPoint }
    }
  } catch {}
  return Object.keys(result).length ? result : null
}

function loadMountMap() {
  let mounts = null
  try {
    mounts = JSON.parse(fs.readFileSync(getMountsFile(), 'utf8'))
  } catch {}

  const musicHost = process.env.MUSIC_HOST_PATH
  const downloadsHost = process.env.DOWNLOADS_HOST_PATH
  if (musicHost || downloadsHost) {
    mounts = mounts || {}
    if (musicHost && !mounts.music) mounts.music = { host: musicHost, container: '/music' }
    if (downloadsHost && !mounts.downloads) mounts.downloads = { host: downloadsHost, container: '/downloads' }
  }

  const inferred = inferMountsFromProc()
  if (inferred) {
    mounts = mounts || {}
    if (!mounts.music && inferred.music) mounts.music = inferred.music
    if (!mounts.downloads && inferred.downloads) mounts.downloads = inferred.downloads
  }

  return mounts && (mounts.music || mounts.downloads) ? mounts : null
}

/** 将飞牛文件选择器返回的 NAS 路径映射为容器内挂载点 */
export function mapToContainerPath(inputPath) {
  const p = (inputPath || '').trim()
  if (!p) return p
  const mounts = loadMountMap()
  if (!mounts) return p

  for (const key of ['music', 'downloads']) {
    const entry = mounts[key]
    if (!entry?.host || !entry?.container) continue
    const host = entry.host.replace(/\/+$/, '') || entry.host
    if (p === entry.host || p === host) return entry.container
    const prefix = p.startsWith(entry.host + '/') ? entry.host : (p.startsWith(host + '/') ? host : null)
    if (prefix) return entry.container + p.slice(prefix.length)
  }
  return p
}

export function getMountInfo() {
  const mounts = loadMountMap()
  if (!mounts) return null
  return {
    music: mounts.music || null,
    downloads: mounts.downloads || null,
  }
}

function getDefaultMusicPath() {
  // Docker/FPK 模式下，容器内默认音乐目录通常由 DOWNLOAD_PATH 决定
  return process.env.DOWNLOAD_PATH || '/music'
}

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
  if (paths.includes(DEFAULT_DOWNLOAD_DIR)) {
    setSetting(DOWNLOAD_PATH_KEY, DEFAULT_DOWNLOAD_DIR)
    return DEFAULT_DOWNLOAD_DIR
  }
  if (paths.length) {
    setSetting(DOWNLOAD_PATH_KEY, paths[0])
    return paths[0]
  }
  return process.env.DOWNLOAD_PATH || '/music'
}

export function setDownloadSavePath(dirPath) {
  const p = mapToContainerPath(dirPath.trim())
  const paths = getFilePaths()
  if (!paths.includes(p)) throw new Error('路径不在文件路径列表中，请先在设置里添加')
  setSetting(DOWNLOAD_PATH_KEY, p)
  return p
}

function migrateLegacyContainerPath(defaultMusicPath) {
  const legacy = '/data'
  if (legacy === defaultMusicPath) return

  const mapPath = (p) => {
    if (p === legacy) return defaultMusicPath
    if (p.startsWith(`${legacy}/`)) return defaultMusicPath + p.slice(legacy.length)
    return p
  }

  let paths = getFilePaths()
  const migrated = [...new Set(paths.map(mapPath).filter(Boolean))]
  if (JSON.stringify(migrated) !== JSON.stringify(paths)) {
    setFilePaths(migrated)
    paths = migrated
  }

  const saved = getSetting(DOWNLOAD_PATH_KEY)
  if (saved) {
    const mapped = mapPath(saved)
    if (mapped !== saved) setSetting(DOWNLOAD_PATH_KEY, mapped)
  }
}

function migrateHostPathsToContainer() {
  let paths = getFilePaths()
  const mapped = [...new Set(paths.map(mapToContainerPath).filter(Boolean))]
  if (JSON.stringify(mapped) !== JSON.stringify(paths)) {
    setFilePaths(mapped)
    paths = mapped
  }
  const saved = getSetting(DOWNLOAD_PATH_KEY)
  if (saved) {
    const next = mapToContainerPath(saved)
    if (next !== saved) setSetting(DOWNLOAD_PATH_KEY, next)
  }
}

export function migrateFilePaths(defaultMusicPath = '/music') {
  migrateLegacyContainerPath(defaultMusicPath)
  migrateHostPathsToContainer()
  let paths = getFilePaths()
  if (!paths.length) {
    const savePath = getSetting(DOWNLOAD_PATH_KEY) || defaultMusicPath
    let tagDirs = []
    try {
      tagDirs = JSON.parse(getSetting(TAG_DIRS_KEY) || '[]')
    } catch {}
    paths = [...new Set([savePath, ...tagDirs, defaultMusicPath].filter(Boolean))]
    setFilePaths(paths)
  }

  const defaultCandidates = [defaultMusicPath, DEFAULT_DOWNLOAD_DIR]
  const appendDefaults = defaultCandidates.filter((p) => {
    if (!p || paths.includes(p)) return false
    // 仅在容器内确实存在该目录时自动补齐，避免本机开发出现无效路径
    return fs.existsSync(p)
  })
  if (appendDefaults.length) {
    paths = [...paths, ...appendDefaults]
    setFilePaths(paths)
  }

  const saved = getSetting(DOWNLOAD_PATH_KEY)
  if (!saved || !paths.includes(saved)) {
    const preferred = paths.includes(DEFAULT_DOWNLOAD_DIR) ? DEFAULT_DOWNLOAD_DIR : paths[0]
    setSetting(DOWNLOAD_PATH_KEY, preferred)
  }
  syncTagDirs(paths)
}

export function addFilePath(dirPath, { fromPicker = false } = {}) {
  const raw = dirPath.trim()
  const p = mapToContainerPath(raw)
  if (!p) throw new Error('请提供路径')
  if (!fromPicker && !fs.existsSync(p)) {
    const musicRoot = getDefaultMusicPath()
    throw new Error(`目录不存在：${p}。Docker/FPK 环境下只能添加“容器内可见”的路径。建议添加 ${musicRoot} 或其子目录。`)
  }
  if (fromPicker && !fs.existsSync(p) && !isAuthorizedPath(p) && !isAuthorizedPath(raw)) {
    const musicRoot = getDefaultMusicPath()
    throw new Error(`目录不可用：${p}。请确认飞牛已授权该路径，并且该目录在容器内可见。默认音乐目录为 ${musicRoot}（如 /music），建议添加 ${musicRoot} 或其子目录。`)
  }
  const paths = getFilePaths()
  if (paths.includes(p)) throw new Error('路径已存在')
  paths.push(p)
  setFilePaths(paths)
  if (paths.length === 1) setSetting(DOWNLOAD_PATH_KEY, p)
  return paths
}

export function updateFilePath(oldPath, newPath, { fromPicker = false } = {}) {
  const from = mapToContainerPath(oldPath.trim())
  const rawTo = newPath.trim()
  const to = mapToContainerPath(rawTo)
  if (!from || !to) throw new Error('请提供原路径和新路径')
  if (!fromPicker && !fs.existsSync(to)) {
    const musicRoot = getDefaultMusicPath()
    throw new Error(`新目录不存在：${to}。Docker/FPK 环境下只能添加“容器内可见”的路径。建议添加 ${musicRoot} 或其子目录。`)
  }
  if (fromPicker && !fs.existsSync(to) && !isAuthorizedPath(to) && !isAuthorizedPath(rawTo)) {
    const musicRoot = getDefaultMusicPath()
    throw new Error(`目录不可用：${to}。请确认飞牛已授权该路径，并且该目录在容器内可见。默认音乐目录为 ${musicRoot}（如 /music），建议添加 ${musicRoot} 或其子目录。`)
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

/** 首次使用：尚未在飞牛应用设置中保存 NAS 数据目录 */
export function getSetupStatus() {
  const configRoot = getConfigRoot()
  const userConfigured = fs.existsSync(path.join(configRoot, '.user-paths-configured'))
  const paths = getFilePaths()
  const readablePaths = paths.filter((p) => fs.existsSync(p))
  return {
    needsPathConfig: !userConfigured,
    userPathsConfigured: userConfigured,
    musicMounted: fs.existsSync('/music'),
    downloadsMounted: fs.existsSync('/downloads'),
    filePathsConfigured: readablePaths.length > 0,
    readablePaths,
    mountInfo: getMountInfo(),
    isContainer: Boolean(process.env.CONFIG_PATH),
  }
}
