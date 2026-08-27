import fs from 'fs'
import path from 'path'
import { getDB } from '../db.js'
import { probeDir } from './audioScan.js'

const FILE_PATHS_KEY = 'file.paths'
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

export function setFilePaths(paths) {
  const unique = dedupePaths(paths.map(p => p.trim()).filter(Boolean))
  setSetting(FILE_PATHS_KEY, JSON.stringify(unique))
  syncTagDirs(unique)
  return unique
}

export function getDownloadSavePath() {
  const paths = getFilePaths()
  const saved = getSetting(DOWNLOAD_PATH_KEY)
  if (saved && paths.includes(saved)) return saved
  const nativeDownloads = process.env.DOWNLOADS_HOST_PATH || ''
  if (nativeDownloads && paths.includes(nativeDownloads)) {
    setSetting(DOWNLOAD_PATH_KEY, nativeDownloads)
    return nativeDownloads
  }
  if (paths.includes(DEFAULT_DOWNLOAD_DIR)) {
    setSetting(DOWNLOAD_PATH_KEY, DEFAULT_DOWNLOAD_DIR)
    return DEFAULT_DOWNLOAD_DIR
  }
  if (paths.length) {
    setSetting(DOWNLOAD_PATH_KEY, paths[0])
    return paths[0]
  }
  return process.env.DOWNLOAD_PATH || DEFAULT_MUSIC_DIR
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
    ...getFilePaths(),
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

  let paths = getFilePaths()
  if (!paths.length) {
    const savePath = getSetting(DOWNLOAD_PATH_KEY) || musicRoot
    let tagDirs = []
    try {
      tagDirs = JSON.parse(getSetting(TAG_DIRS_KEY) || '[]')
    } catch {}
    paths = dedupePaths([savePath, ...tagDirs, musicRoot].map(mapToContainerPath).filter(Boolean))
    setFilePaths(paths)
  } else {
    // 再跑一遍去重（同一物理目录的 /music 与本机路径）
    paths = dedupePaths(paths.map(mapToContainerPath))
    setFilePaths(paths)
  }

  // Docker：自动补齐存在的 /music /downloads；原生：只补齐真实存在的本机默认目录
  const defaultCandidates = isNativeHostMode()
    ? [musicRoot, process.env.DOWNLOADS_HOST_PATH].filter(Boolean)
    : [DEFAULT_MUSIC_DIR, DEFAULT_DOWNLOAD_DIR]

  const appendDefaults = defaultCandidates.filter((p) => {
    if (!p || paths.includes(p)) return false
    if (!fs.existsSync(p)) return false
    const real = resolveReal(p)
    return !paths.some(existing => resolveReal(existing) === real)
  })
  if (appendDefaults.length) {
    paths = dedupePaths([...paths, ...appendDefaults])
    setFilePaths(paths)
  }

  const saved = getSetting(DOWNLOAD_PATH_KEY)
  if (!saved || !paths.includes(saved)) {
    const preferred = paths.find(p => p === process.env.DOWNLOADS_HOST_PATH)
      || paths.find(p => p === DEFAULT_DOWNLOAD_DIR)
      || paths[0]
    if (preferred) setSetting(DOWNLOAD_PATH_KEY, preferred)
  }
  syncTagDirs(getFilePaths())
}

export function addFilePath(dirPath, { fromPicker = false } = {}) {
  const raw = dirPath.trim()
  const p = mapToContainerPath(raw)
  if (!p) throw new Error('请提供路径')
  if (!fromPicker && !fs.existsSync(p)) {
    const musicRoot = getDefaultMusicPath()
    throw new Error(
      isNativeHostMode()
        ? `目录不存在：${p}。请填写 NAS 绝对路径，例如 ${musicRoot || '/vol1/1000/Music'}。`
        : `目录不存在：${p}。请填写 NAS 绝对路径，例如 ${musicRoot || '/vol1/1000/Music'}。`
    )
  }
  if (fromPicker && !fs.existsSync(p) && !isAuthorizedPath(p) && !isAuthorizedPath(raw)) {
    const musicRoot = getDefaultMusicPath()
    throw new Error(`目录不可用：${p}。请确认飞牛已授权该路径。`)
  }
  const paths = getFilePaths()
  const real = resolveReal(p)
  if (paths.some(x => resolveReal(x) === real)) throw new Error('路径已存在（与已添加目录指向同一位置）')
  paths.push(p)
  setFilePaths(paths)
  if (paths.length === 1) setSetting(DOWNLOAD_PATH_KEY, p)
  return getFilePaths()
}

export function updateFilePath(oldPath, newPath, { fromPicker = false } = {}) {
  const from = mapToContainerPath(oldPath.trim())
  const rawTo = newPath.trim()
  const to = mapToContainerPath(rawTo)
  if (!from || !to) throw new Error('请提供原路径和新路径')
  if (!fromPicker && !fs.existsSync(to)) {
    throw new Error(`新目录不存在：${to}`)
  }
  if (fromPicker && !fs.existsSync(to) && !isAuthorizedPath(to) && !isAuthorizedPath(rawTo)) {
    throw new Error(`目录不可用：${to}。请确认飞牛已授权该路径。`)
  }

  const paths = getFilePaths()
  const idx = paths.indexOf(from)
  if (idx === -1) throw new Error('原路径不存在')
  const realTo = resolveReal(to)
  if (from !== to && paths.some((x, i) => i !== idx && resolveReal(x) === realTo)) {
    throw new Error('新路径已存在（与已添加目录指向同一位置）')
  }

  paths[idx] = to
  setFilePaths(paths)

  if (getSetting(DOWNLOAD_PATH_KEY) === from) {
    setSetting(DOWNLOAD_PATH_KEY, to)
  }
  return getFilePaths()
}

export function removeFilePath(dirPath) {
  const p = mapToContainerPath(dirPath.trim())
  const paths = getFilePaths()
  if (!paths.includes(p) && !paths.includes(dirPath.trim())) throw new Error('路径不存在')
  if (paths.length <= 1) throw new Error('至少保留一个文件路径')

  const target = paths.includes(p) ? p : dirPath.trim()
  const next = paths.filter(x => x !== target)
  setFilePaths(next)

  if (getSetting(DOWNLOAD_PATH_KEY) === target) {
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
