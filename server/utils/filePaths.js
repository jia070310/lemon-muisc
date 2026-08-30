import fs from 'fs'
import path from 'path'
import { getDB } from '../db.js'
import { probeDir } from './audioScan.js'

const FILE_PATHS_KEY = 'file.paths'
const MUSIC_PATHS_KEY = 'music.paths'
const DOWNLOAD_PATH_KEY = 'download.savePath'
const TAG_DIRS_KEY = 'tag.dirs'
const DEFAULT_DOWNLOAD_DIR = '/downloads'
const DEFAULT_MUSIC_DIR = '/music'

function getConfigRoot() {
  return process.env.CONFIG_PATH || '/config'
}

function getMountsFile() {
  return path.join(getConfigRoot(), 'mounts.json')
}

/** 原生 FPK：DOWNLOAD_PATH 指向本机目录，不再使用容器内 /music 挂载 */
export function isNativeHostMode() {
  if (process.env.LEMON_NATIVE === '1') return true
  if (fs.existsSync('/.dockerenv')) return false

  const dl = (process.env.DOWNLOAD_PATH || '').trim()
  if (!dl) return false
  // 明确是本机卷路径
  if (dl.startsWith('/vol') || dl.startsWith('/share') || dl.includes('@appdata')) return true
  // Docker 风格默认值
  if (dl === DEFAULT_MUSIC_DIR || dl === DEFAULT_DOWNLOAD_DIR) return false
  // 本机路径存在，且 /music 并非真实挂载目录
  try {
    if (fs.existsSync(dl) && fs.statSync(dl).isDirectory()) {
      if (!fs.existsSync(DEFAULT_MUSIC_DIR)) return true
      // /music 存在但是 DOWNLOAD_PATH 指向别处 → 原生
      if (path.resolve(dl) !== path.resolve(DEFAULT_MUSIC_DIR)) return true
    }
  } catch {}
  return false
}

function inferMountsFromProc() {
  const result = {}
  try {
    for (const line of fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\n')) {
      const sep = line.indexOf(' - ')
      if (sep === -1) continue
      const mountPoint = line.slice(0, sep).trim().split(/\s+/).pop()
      if (mountPoint !== DEFAULT_MUSIC_DIR && mountPoint !== DEFAULT_DOWNLOAD_DIR) continue
      const after = line.slice(sep + 3).trim().split(/\s+/)
      if (after[0] !== 'bind' || !after[1]) continue
      const key = mountPoint === DEFAULT_MUSIC_DIR ? 'music' : 'downloads'
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

  const musicHost = process.env.MUSIC_HOST_PATH || ''
  const downloadsHost = process.env.DOWNLOADS_HOST_PATH || ''
  const downloadPath = process.env.DOWNLOAD_PATH || ''

  if (isNativeHostMode()) {
    // 原生：展示用「本机路径」，不再伪造 /music 容器映射
    mounts = mounts || {}
    const music = musicHost || (downloadPath && downloadPath !== DEFAULT_DOWNLOAD_DIR ? downloadPath : '')
    const downloads = downloadsHost || ''
    if (music) mounts.music = { host: music, container: music }
    if (downloads) mounts.downloads = { host: downloads, container: downloads }
    return mounts.music || mounts.downloads ? mounts : null
  }

  if (musicHost || downloadsHost) {
    mounts = mounts || {}
    if (musicHost && !mounts.music) mounts.music = { host: musicHost, container: DEFAULT_MUSIC_DIR }
    if (downloadsHost && !mounts.downloads) mounts.downloads = { host: downloadsHost, container: DEFAULT_DOWNLOAD_DIR }
  }

  const inferred = inferMountsFromProc()
  if (inferred) {
    mounts = mounts || {}
    if (!mounts.music && inferred.music) mounts.music = inferred.music
    if (!mounts.downloads && inferred.downloads) mounts.downloads = inferred.downloads
  }

  return mounts && (mounts.music || mounts.downloads) ? mounts : null
}

function resolveReal(p) {
  try {
    return fs.realpathSync(p)
  } catch {
    try {
      return path.resolve(p)
    } catch {
      return p
    }
  }
}

/** 规范化应用内路径：Docker 下转到 /music；原生下转到本机路径并去重别名 */
export function mapToContainerPath(inputPath) {
  const p = (inputPath || '').trim()
  if (!p) return p
  const mounts = loadMountMap()

  if (isNativeHostMode()) {
    // /music、/downloads → 本机真实目录
    if (mounts?.music?.host) {
      if (p === DEFAULT_MUSIC_DIR || p === mounts.music.container) return mounts.music.host
      if (p.startsWith(`${DEFAULT_MUSIC_DIR}/`)) {
        return mounts.music.host.replace(/\/+$/, '') + p.slice(DEFAULT_MUSIC_DIR.length)
      }
    }
    if (mounts?.downloads?.host) {
      if (p === DEFAULT_DOWNLOAD_DIR || p === mounts.downloads.container) return mounts.downloads.host
      if (p.startsWith(`${DEFAULT_DOWNLOAD_DIR}/`)) {
        return mounts.downloads.host.replace(/\/+$/, '') + p.slice(DEFAULT_DOWNLOAD_DIR.length)
      }
    }
    const dl = (process.env.DOWNLOAD_PATH || '').trim()
    if (dl && (p === DEFAULT_MUSIC_DIR || p.startsWith(`${DEFAULT_MUSIC_DIR}/`))) {
      return p === DEFAULT_MUSIC_DIR ? dl : dl.replace(/\/+$/, '') + p.slice(DEFAULT_MUSIC_DIR.length)
    }
    return p
  }

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
    native: isNativeHostMode(),
  }
}

function getDefaultMusicPath() {
  return process.env.DOWNLOAD_PATH || (isNativeHostMode() ? '' : DEFAULT_MUSIC_DIR) || DEFAULT_MUSIC_DIR
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

function readLegacyFilePaths() {
  try {
    const paths = JSON.parse(getSetting(FILE_PATHS_KEY) || '[]')
    return Array.isArray(paths) ? paths.filter(Boolean) : []
  } catch {
    return []
  }
}

/** 音乐库扫描目录（可多个） */
export function getMusicPaths() {
  try {
    const paths = JSON.parse(getSetting(MUSIC_PATHS_KEY) || '[]')
    if (Array.isArray(paths) && paths.length) return paths.filter(Boolean)
  } catch {}
  return readLegacyFilePaths()
}

/** @deprecated 请使用 getMusicPaths；保留兼容旧调用 */
export function getFilePaths() {
  return getMusicPaths()
}

function syncLegacyFilePathsUnion() {
  const music = getMusicPaths()
  const dl = getSetting(DOWNLOAD_PATH_KEY)
  const union = dedupePaths(dl ? [...music, dl] : [...music])
  setSetting(FILE_PATHS_KEY, JSON.stringify(union))
}

function syncTagDirs(paths) {
  setSetting(TAG_DIRS_KEY, JSON.stringify(paths))
}

function setMusicPaths(paths) {
  const unique = dedupePaths(paths.map(p => p.trim()).filter(Boolean))
  setSetting(MUSIC_PATHS_KEY, JSON.stringify(unique))
  syncTagDirs(unique)
  syncLegacyFilePathsUnion()
  return unique
}

export function setFilePaths(paths) {
  return setMusicPaths(paths)
}

function dedupePaths(paths) {
  const out = []
  const seen = new Set()
  for (const raw of paths) {
    const p = (raw || '').trim()
    if (!p) continue
    const key = resolveReal(p)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

function validateDirectoryPath(dirPath, { fromPicker = false } = {}) {
  const raw = (dirPath || '').trim()
  const p = mapToContainerPath(raw)
  if (!p) throw new Error('请提供路径')
  if (!fromPicker && !fs.existsSync(p)) {
    const musicRoot = getDefaultMusicPath()
    throw new Error(`目录不存在：${p}。请填写 NAS 绝对路径，例如 ${musicRoot || '/vol1/1000/Music'}。`)
  }
  if (fromPicker && !fs.existsSync(p) && !isAuthorizedPath(p) && !isAuthorizedPath(raw)) {
    throw new Error(`目录不可用：${p}。请确认飞牛已授权该路径。`)
  }
  return p
}

export function getDownloadSavePath() {
  const saved = getSetting(DOWNLOAD_PATH_KEY)
  if (saved) return mapToContainerPath(saved) || saved
  const nativeDownloads = process.env.DOWNLOADS_HOST_PATH || ''
  if (nativeDownloads) {
    const mapped = mapToContainerPath(nativeDownloads)
    setSetting(DOWNLOAD_PATH_KEY, mapped)
    return mapped
  }
  if (!isNativeHostMode() && fs.existsSync(DEFAULT_DOWNLOAD_DIR)) {
    setSetting(DOWNLOAD_PATH_KEY, DEFAULT_DOWNLOAD_DIR)
    return DEFAULT_DOWNLOAD_DIR
  }
  const fallback = process.env.DOWNLOAD_PATH || DEFAULT_DOWNLOAD_DIR
  if (fallback) setSetting(DOWNLOAD_PATH_KEY, mapToContainerPath(fallback) || fallback)
  return mapToContainerPath(fallback) || fallback
}

/** 判断路径是否位于已配置的音乐库/下载目录内（防任意文件读取） */
export function isAllowedMediaPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return false
  let resolved
  try {
    resolved = path.resolve(filePath)
  } catch {
    return false
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return false

  const roots = new Set([
    ...getMusicPaths(),
    getDownloadSavePath(),
    process.env.DOWNLOAD_PATH,
    process.env.MUSIC_HOST_PATH,
    process.env.DOWNLOADS_HOST_PATH,
    process.env.MUSIC_PATH,
    ...(isNativeHostMode() ? [] : [DEFAULT_MUSIC_DIR, DEFAULT_DOWNLOAD_DIR]),
  ].filter(Boolean).map(p => {
    try { return path.resolve(p) } catch { return null }
  }).filter(Boolean))

  for (const root of roots) {
    if (resolved === root) return true
    const prefix = root.endsWith(path.sep) ? root : root + path.sep
    if (resolved.startsWith(prefix)) return true
  }
  return false
}

export function setDownloadSavePath(dirPath, { fromPicker = false } = {}) {
  const p = validateDirectoryPath(dirPath, { fromPicker })
  setSetting(DOWNLOAD_PATH_KEY, p)
  syncLegacyFilePathsUnion()
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
  const migrated = dedupePaths(paths.map(mapPath).filter(Boolean))
  if (JSON.stringify(migrated) !== JSON.stringify(paths)) {
    setFilePaths(migrated)
  }

  const saved = getSetting(DOWNLOAD_PATH_KEY)
  if (saved) {
    const mapped = mapPath(saved)
    if (mapped !== saved) setSetting(DOWNLOAD_PATH_KEY, mapped)
  }
}

function migratePathsForRuntime() {
  let paths = getFilePaths()
  const mapped = dedupePaths(paths.map(mapToContainerPath).filter(Boolean))
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

export function migrateFilePaths(defaultMusicPath = DEFAULT_MUSIC_DIR) {
  const musicRoot = getDefaultMusicPath() || defaultMusicPath
  migrateLegacyContainerPath(musicRoot)
  migratePathsForRuntime()

  // 从旧版 file.paths 迁移到 music.paths
  let musicStored = []
  try {
    musicStored = JSON.parse(getSetting(MUSIC_PATHS_KEY) || '[]')
  } catch {}
  if (!Array.isArray(musicStored) || !musicStored.length) {
    const legacy = readLegacyFilePaths()
    let tagDirs = []
    try {
      tagDirs = JSON.parse(getSetting(TAG_DIRS_KEY) || '[]')
    } catch {}
    const seed = legacy.length
      ? legacy
      : dedupePaths([getSetting(DOWNLOAD_PATH_KEY), ...tagDirs, musicRoot].filter(Boolean))
    musicStored = dedupePaths(seed.map(mapToContainerPath).filter(Boolean))
    if (musicStored.length) setMusicPaths(musicStored)
  }

  let musicPaths = dedupePaths(getMusicPaths().map(mapToContainerPath).filter(Boolean))
  if (musicPaths.length) setMusicPaths(musicPaths)
  else musicPaths = getMusicPaths()

  const musicDefaults = isNativeHostMode()
    ? [musicRoot].filter(Boolean)
    : [DEFAULT_MUSIC_DIR]
  const musicAppend = musicDefaults.filter((p) => {
    if (!p || !fs.existsSync(p)) return false
    const real = resolveReal(p)
    return !musicPaths.some(existing => resolveReal(existing) === real)
  })
  if (musicAppend.length) {
    musicPaths = setMusicPaths([...musicPaths, ...musicAppend])
  }

  let downloadPath = getSetting(DOWNLOAD_PATH_KEY)
  if (downloadPath) downloadPath = mapToContainerPath(downloadPath)
  const downloadDefaults = isNativeHostMode()
    ? [process.env.DOWNLOADS_HOST_PATH].filter(Boolean)
    : [DEFAULT_DOWNLOAD_DIR]
  if (!downloadPath) {
    const candidate = downloadDefaults.find(p => p && fs.existsSync(p))
      || musicPaths.find(p => p === process.env.DOWNLOADS_HOST_PATH)
      || musicPaths.find(p => p === DEFAULT_DOWNLOAD_DIR)
    if (candidate) downloadPath = mapToContainerPath(candidate)
  }
  if (downloadPath) {
    setSetting(DOWNLOAD_PATH_KEY, downloadPath)
  } else {
    getDownloadSavePath()
  }
  syncLegacyFilePathsUnion()
}

export function addMusicPath(dirPath, { fromPicker = false } = {}) {
  const p = validateDirectoryPath(dirPath, { fromPicker })
  const paths = getMusicPaths()
  const real = resolveReal(p)
  if (paths.some(x => resolveReal(x) === real)) {
    throw new Error('路径已存在（与已添加目录指向同一位置）')
  }
  paths.push(p)
  return setMusicPaths(paths)
}

/** @deprecated 使用 addMusicPath */
export function addFilePath(dirPath, options = {}) {
  return addMusicPath(dirPath, options)
}

export function updateMusicPath(oldPath, newPath, { fromPicker = false } = {}) {
  const from = mapToContainerPath(oldPath.trim())
  const to = validateDirectoryPath(newPath, { fromPicker })
  if (!from || !to) throw new Error('请提供原路径和新路径')

  const paths = getMusicPaths()
  const idx = paths.indexOf(from)
  if (idx === -1) throw new Error('原路径不存在')
  const realTo = resolveReal(to)
  if (from !== to && paths.some((x, i) => i !== idx && resolveReal(x) === realTo)) {
    throw new Error('新路径已存在（与已添加目录指向同一位置）')
  }

  paths[idx] = to
  return setMusicPaths(paths)
}

/** @deprecated 使用 updateMusicPath */
export function updateFilePath(oldPath, newPath, options = {}) {
  return updateMusicPath(oldPath, newPath, options)
}

export function removeMusicPath(dirPath) {
  const p = mapToContainerPath(dirPath.trim())
  const paths = getMusicPaths()
  if (!paths.includes(p) && !paths.includes(dirPath.trim())) throw new Error('路径不存在')

  const target = paths.includes(p) ? p : dirPath.trim()
  return setMusicPaths(paths.filter(x => x !== target))
}

/** @deprecated 使用 removeMusicPath */
export function removeFilePath(dirPath) {
  return removeMusicPath(dirPath)
}

export function isConfiguredMusicDir(dirPath) {
  const p = mapToContainerPath((dirPath || '').trim())
  if (!p) return false
  const real = resolveReal(p)
  return getMusicPaths().some(x => resolveReal(x) === real || x === p)
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
  const paths = getMusicPaths()
  const readablePaths = paths.filter((p) => fs.existsSync(p))
  const native = isNativeHostMode()
  const musicPath = native
    ? (process.env.MUSIC_HOST_PATH || process.env.DOWNLOAD_PATH || '')
    : DEFAULT_MUSIC_DIR
  const downloadsPath = native
    ? (process.env.DOWNLOADS_HOST_PATH || '')
    : DEFAULT_DOWNLOAD_DIR
  const musicProbe = musicPath && fs.existsSync(musicPath) ? probeDir(musicPath) : null
  const downloadsProbe = downloadsPath && fs.existsSync(downloadsPath) ? probeDir(downloadsPath) : null
  return {
    needsPathConfig: !userConfigured,
    userPathsConfigured: userConfigured,
    musicMounted: Boolean(musicProbe?.exists),
    downloadsMounted: Boolean(downloadsProbe?.exists),
    filePathsConfigured: readablePaths.length > 0,
    readablePaths,
    mountInfo: getMountInfo(),
    isContainer: !native && Boolean(process.env.CONFIG_PATH),
    native,
    musicProbe,
    downloadsProbe,
    mountLooksEmpty: Boolean(
      musicProbe?.readable && musicProbe.entryCount === 0 && getMountInfo()?.music?.host
    ),
  }
}
