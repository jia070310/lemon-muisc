/**
 * 自动把音源 / 歌单 / 收藏等用户数据备份到下载目录。
 *
 * 触发条件：
 * 1) 检测到 GitHub 有新版本（latest > current）且尚未备份过该版本；
 * 2) 新版本窗口内用户数据（音源/歌单/收藏等）有变化 → 追加完整快照；
 * 3) 没有新版本时，用户数据新增或变更也直接备份（不再依赖版本检查）。
 *
 * 备份文件最多保留 MAX_AUTO_BACKUP_FILES 份，超出时删除最早的。
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import needle from 'needle'
import { getDB } from '../db.js'
import { listUsers } from './auth.js'
import { getLibraryUserData } from './libraryUserData.js'
import { getUserSettings, setGlobalSettings, USER_SETTING_KEYS } from './userSettings.js'
import { getSharedDownloadSavePath } from './filePaths.js'
import { compareVersion, getAppVersion } from './version.js'
import { ensurePodcastTables, listFeeds } from './podcastStore.js'

const REPO = 'jia070310/lemon-muisc'
const STAMP_KEY = 'backup.autoForLatestVersion'
const FINGERPRINT_KEY = 'backup.autoContentFingerprint'
const BACKUP_SUBDIR = 'lemon-backups'
/** 自动备份最多保留份数，超出后删除最早的文件 */
export const MAX_AUTO_BACKUP_FILES = 20

/** 与设置页「导出备份」一致的用户设置键 */
export const EXPORTABLE_USER_KEYS = [
  'ui.theme',
  'ui.librarySongColumns',
  'ui.lyricColorPreset',
  'ui.lyricTextColor',
  'ui.lyricHighlightColor',
  'player.coverStyle',
  'player.visualizer',
  'playlist.remoteSyncDays',
  'download.usePersonalSavePath',
  'source.active',
  'source.enabledPlatforms',
  'source.autoClosedPlatforms',
  'source.previewAutoCloseSkip',
].filter((k) => USER_SETTING_KEYS.has(k))

function readSetting(key) {
  const db = getDB()
  if (!db) return ''
  try {
    return String(db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value || '')
  } catch {
    return ''
  }
}

function readStamp() {
  return readSetting(STAMP_KEY)
}

function readSavedFingerprint() {
  return readSetting(FINGERPRINT_KEY)
}

function writeBackupMeta(latestVersion, fingerprint) {
  setGlobalSettings({
    [STAMP_KEY]: String(latestVersion || ''),
    [FINGERPRINT_KEY]: String(fingerprint || ''),
  })
}

/** 仅更新指纹，不动待升级版本标记 */
function writeFingerprint(fingerprint) {
  setGlobalSettings({ [FINGERPRINT_KEY]: String(fingerprint || '') })
}

function pickUserSettings(userId) {
  const all = getUserSettings(userId)
  const settings = {}
  for (const key of EXPORTABLE_USER_KEYS) {
    if (all[key] != null) settings[key] = all[key]
  }
  return settings
}

function listSourceScripts() {
  const db = getDB()
  if (!db) return []
  try {
    const rows = db.prepare(`
      SELECT id, name, description, author, version, homepage, script, sources, updated_at
      FROM user_apis ORDER BY created_at ASC
    `).all()
    return rows.map((row) => {
      let sources = {}
      try {
        sources = JSON.parse(row.sources || '{}') || {}
      } catch {
        sources = {}
      }
      return {
        id: row.id,
        name: row.name,
        description: row.description || '',
        author: row.author || '',
        version: row.version || '',
        homepage: row.homepage || '',
        script: row.script || '',
        sources,
        updatedAt: row.updated_at || 0,
      }
    })
  } catch {
    return []
  }
}

function listUserPodcastFeeds(userId) {
  try {
    ensurePodcastTables()
    return listFeeds(userId).map((f) => ({
      id: f.id,
      url: f.url,
      title: f.title,
      author: f.author,
      imageUrl: f.imageUrl,
      siteUrl: f.siteUrl,
    }))
  } catch {
    return []
  }
}

/**
 * 用户数据内容指纹：音源增删改、歌单/收藏/播客/相关设置变化都会变。
 * 不包含播放历史（recentPlays/playStats）与 revision，避免听歌产生的同步频繁触发备份。
 * 不依赖完整 payload 序列化，避免 exportedAt 等噪声。
 */
export function computeUserDataFingerprint() {
  const sources = listSourceScripts().map((s) => ({
    id: s.id,
    name: s.name,
    version: s.version,
    updatedAt: s.updatedAt,
    scriptLen: (s.script || '').length,
    scriptHash: crypto.createHash('sha1').update(s.script || '').digest('hex').slice(0, 12),
  }))

  const users = listUsers().map((u) => {
    const userData = getLibraryUserData(u.id)
    const settings = pickUserSettings(u.id)
    const feeds = listUserPodcastFeeds(u.id)
    return {
      id: u.id,
      playlists: userData.playlists || [],
      favorites: userData.favorites || [],
      favoriteAlbums: userData.favoriteAlbums || [],
      favoriteArtists: userData.favoriteArtists || [],
      settings,
      podcastFeeds: feeds.map((f) => ({ id: f.id, url: f.url })),
    }
  })

  const raw = JSON.stringify({ sources, users })
  return crypto.createHash('sha1').update(raw).digest('hex')
}

/** 构建单用户导出（设置页手动备份） */
export function buildUserBackupPayload(user, { includeSources = false } = {}) {
  const userData = getLibraryUserData(user.id)
  const payload = {
    app: 'lemon-music',
    type: 'user-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    username: user.username,
    data: {
      playlists: userData.playlists || [],
      favorites: userData.favorites || [],
      favoriteAlbums: userData.favoriteAlbums || [],
      favoriteArtists: userData.favoriteArtists || [],
      recentPlays: userData.recentPlays || [],
      playStats: userData.playStats || [],
      settings: pickUserSettings(user.id),
      podcastFeeds: listUserPodcastFeeds(user.id),
    },
  }
  if (includeSources) {
    payload.data.sources = listSourceScripts().map(({ updatedAt, ...rest }) => rest)
  }
  return payload
}

/** 全站自动升级备份（含全部用户 + 音源脚本） */
export function buildAutoBackupPayload({ currentVersion, latestVersion, reason = 'version' } = {}) {
  const users = listUsers().map((u) => {
    const userData = getLibraryUserData(u.id)
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName || u.display_name || '',
      role: u.role,
      playlists: userData.playlists || [],
      favorites: userData.favorites || [],
      favoriteAlbums: userData.favoriteAlbums || [],
      favoriteArtists: userData.favoriteArtists || [],
      recentPlays: userData.recentPlays || [],
      playStats: userData.playStats || [],
      settings: pickUserSettings(u.id),
      podcastFeeds: listUserPodcastFeeds(u.id),
    }
  })

  return {
    app: 'lemon-music',
    type: 'auto-upgrade-backup',
    version: 2,
    exportedAt: new Date().toISOString(),
    currentVersion: String(currentVersion || getAppVersion()),
    latestVersion: String(latestVersion || ''),
    reason: reason === 'content-changed' ? 'content-changed' : 'version',
    data: {
      sources: listSourceScripts().map(({ updatedAt, ...rest }) => rest),
      users,
    },
  }
}

/**
 * 从备份恢复音源脚本（全局 user_apis）。
 * 保留备份中的原 id，使 source.active 等设置引用不失效；
 * merge 跳过已存在的同 id 行，replace 用备份内容覆盖。
 */
export function restoreSourceScripts(sources, { mode = 'replace' } = {}) {
  const result = { added: 0, updated: 0, skipped: 0 }
  if (!Array.isArray(sources) || !sources.length) return result
  const db = getDB()
  if (!db) return result
  const getById = db.prepare('SELECT id FROM user_apis WHERE id = ?')
  const insert = db.prepare(`
    INSERT INTO user_apis (id, name, description, script, author, version, homepage, sources, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
  `)
  const update = db.prepare(`
    UPDATE user_apis
    SET name = ?, description = ?, script = ?, author = ?, version = ?, homepage = ?, sources = ?, updated_at = unixepoch()
    WHERE id = ?
  `)
  const tx = db.transaction((list) => {
    for (const s of list) {
      const script = String(s?.script || '')
      if (!script.trim()) {
        result.skipped += 1
        continue
      }
      const fields = [
        String(s?.name || ''),
        String(s?.description || ''),
        script,
        String(s?.author || ''),
        String(s?.version || ''),
        String(s?.homepage || ''),
        typeof s?.sources === 'string' ? s.sources : JSON.stringify(s?.sources || {}),
      ]
      const id = String(s?.id || '')
      const exists = id ? getById.get(id) : null
      if (exists) {
        if (mode === 'merge') {
          result.skipped += 1
          continue
        }
        update.run(...fields, id)
        result.updated += 1
      } else {
        const newId = id || `user_api_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        insert.run(newId, ...fields)
        result.added += 1
      }
    }
  })
  tx(sources)
  return result
}

/** 从备份恢复播客订阅：按 user_id + url 去重，仅写入元数据，不联网拉取 */
export function restorePodcastFeeds(userId, feeds) {
  const result = { added: 0, skipped: 0 }
  if (!Array.isArray(feeds) || !feeds.length) return result
  const db = getDB()
  if (!db) return result
  ensurePodcastTables()
  const exists = db.prepare('SELECT 1 FROM podcast_feeds WHERE user_id = ? AND url = ?')
  const insert = db.prepare(`
    INSERT INTO podcast_feeds (id, user_id, url, title, author, description, image_url, site_url, last_error, last_fetched_at)
    VALUES (?, ?, ?, ?, ?, '', ?, ?, '', 0)
  `)
  const tx = db.transaction((list) => {
    for (const f of list) {
      const url = String(f?.url || '').trim()
      if (!/^https?:\/\//i.test(url) || exists.get(userId, url)) {
        result.skipped += 1
        continue
      }
      insert.run(
        crypto.randomUUID(),
        userId,
        url,
        String(f?.title || ''),
        String(f?.author || ''),
        String(f?.imageUrl || ''),
        String(f?.siteUrl || ''),
      )
      result.added += 1
    }
  })
  tx(feeds)
  return result
}

/**
 * @returns {{ should: boolean, reason: string }}
 * reason: no-update | already-backed-up | version | content-changed
 */
export function getAutoBackupDecision(currentVersion, latestVersion, fingerprint = null) {
  if (!latestVersion) return { should: false, reason: 'no-update' }
  if (compareVersion(latestVersion, currentVersion) <= 0) {
    return { should: false, reason: 'no-update' }
  }
  const fp = fingerprint ?? computeUserDataFingerprint()
  const stamped = readStamp() === String(latestVersion)
  if (!stamped) return { should: true, reason: 'version' }
  if (fp !== readSavedFingerprint()) return { should: true, reason: 'content-changed' }
  return { should: false, reason: 'already-backed-up' }
}

export function shouldAutoBackup(currentVersion, latestVersion) {
  return getAutoBackupDecision(currentVersion, latestVersion).should
}

function safeFilePart(v) {
  return String(v || 'unknown').replace(/[^\w.-]+/g, '_').slice(0, 32)
}

/** 仅保留最新的 max 份自动备份，删除最早的文件 */
export function pruneAutoBackupFiles(dir, max = MAX_AUTO_BACKUP_FILES) {
  try {
    const names = fs.readdirSync(dir)
      .filter((name) => /^lemon-music-backup-.*\.json$/i.test(name))
    if (names.length <= max) return 0
    const entries = names.map((name) => {
      const filePath = path.join(dir, name)
      let mtimeMs = 0
      try {
        mtimeMs = fs.statSync(filePath).mtimeMs
      } catch {}
      return { name, filePath, mtimeMs }
    })
    entries.sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name))
    const overflow = entries.length - max
    let removed = 0
    for (let i = 0; i < overflow; i += 1) {
      try {
        fs.unlinkSync(entries[i].filePath)
        removed += 1
      } catch {}
    }
    return removed
  } catch {
    return 0
  }
}

/**
 * 写入下载目录下 lemon-backups/
 * @returns {{ filePath: string, fileName: string, dir: string, pruned: number }}
 */
export function writeAutoBackupFile(payload, downloadRoot) {
  const root = String(downloadRoot || '').trim()
  if (!root) throw new Error('下载目录未配置')
  const dir = path.join(root, BACKUP_SUBDIR)
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 23)
  const isContent = payload.reason === 'content-changed'
  const tag = isContent ? 'upd' : 'ver'
  const current = safeFilePart(payload.currentVersion)
  const latest = safeFilePart(payload.latestVersion)
  const versionPart = latest && latest !== current ? `${current}-to-${latest}` : current
  const fileName = `lemon-music-backup-${versionPart}-${tag}-${stamp}.json`
  const filePath = path.join(dir, fileName)
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  const pruned = pruneAutoBackupFiles(dir)
  return { filePath, fileName, dir, pruned }
}

/**
 * 若有新版本，且（未备份过该版本 或 用户数据相对上次备份有变化），则写入下载目录。
 */
export function maybeAutoBackupOnUpdate({ currentVersion, latestVersion, downloadRoot } = {}) {
  const current = String(currentVersion || getAppVersion())
  const latest = String(latestVersion || '')
  const fingerprint = computeUserDataFingerprint()
  const decision = getAutoBackupDecision(current, latest, fingerprint)
  if (!decision.should) {
    return { ok: false, skipped: true, reason: decision.reason }
  }
  const root = downloadRoot || getSharedDownloadSavePath()
  if (!root) {
    return { ok: false, skipped: true, reason: 'no-download-path' }
  }
  const payload = buildAutoBackupPayload({
    currentVersion: current,
    latestVersion: latest,
    reason: decision.reason,
  })
  const written = writeAutoBackupFile(payload, root)
  writeBackupMeta(latest, fingerprint)
  const tip = decision.reason === 'content-changed'
    ? `新版本窗口内用户数据有变更，已追加备份 → ${written.filePath}`
    : `检测到新版本 ${latest}（当前 ${current}），已备份 → ${written.filePath}`
  console.log(`[backup] ${tip}`)
  return {
    ok: true,
    skipped: false,
    reason: decision.reason,
    currentVersion: current,
    latestVersion: latest,
    fingerprint,
    ...written,
    sourceCount: payload.data.sources?.length || 0,
    userCount: payload.data.users?.length || 0,
  }
}

export async function fetchLatestVersionTag() {
  const resp = await needle('get', `https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'lemon-music-nas',
    },
    timeout: 12000,
    parse_response: true,
  })
  if (resp.statusCode === 200 && resp.body?.tag_name) {
    return String(resp.body.tag_name).replace(/^v/i, '')
  }
  const tags = await needle('get', `https://api.github.com/repos/${REPO}/tags?per_page=1`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'lemon-music-nas',
    },
    timeout: 12000,
    parse_response: true,
  })
  if (tags.statusCode === 200 && Array.isArray(tags.body) && tags.body[0]?.name) {
    return String(tags.body[0].name).replace(/^v/i, '')
  }
  return null
}

/** 启动 / 定时：拉 GitHub 最新版，有更新则备份 */
export async function runAutoBackupVersionCheck() {
  try {
    const currentVersion = getAppVersion()
    const latestVersion = await fetchLatestVersionTag()
    if (!latestVersion) {
      return { ok: false, skipped: true, reason: 'latest-unknown' }
    }
    return maybeAutoBackupOnUpdate({ currentVersion, latestVersion })
  } catch (e) {
    console.warn('[backup] 自动备份版本检查失败:', e?.message || e)
    return { ok: false, skipped: true, reason: e?.message || 'check-failed' }
  }
}

/**
 * 用户数据变更后调用：
 * - 若存在待升级版本（stamp > current），沿用版本窗口逻辑，数据有变化则追加快照；
 * - 没有待升级版本时，只要内容指纹有变化就直接备份（源/歌单/收藏等新增或变更）。
 * 防抖，避免批量导入连写多次。
 */
let _userDataBackupTimer = null
export function scheduleAutoBackupAfterUserDataChange(delayMs = 2500) {
  if (_userDataBackupTimer) clearTimeout(_userDataBackupTimer)
  _userDataBackupTimer = setTimeout(() => {
    _userDataBackupTimer = null
    try {
      maybeAutoBackupAfterUserDataChange()
    } catch (e) {
      console.warn('[backup] 用户数据变更后备份失败:', e?.message || e)
    }
  }, delayMs)
  _userDataBackupTimer.unref?.()
}

export function maybeAutoBackupAfterUserDataChange({ downloadRoot } = {}) {
  const current = getAppVersion()
  const latest = readStamp()
  if (latest && compareVersion(latest, current) > 0) {
    return maybeAutoBackupOnUpdate({ currentVersion: current, latestVersion: latest, downloadRoot })
  }

  const fingerprint = computeUserDataFingerprint()
  if (fingerprint === readSavedFingerprint()) {
    return { ok: false, skipped: true, reason: 'already-backed-up' }
  }
  const root = downloadRoot || getSharedDownloadSavePath()
  if (!root) {
    return { ok: false, skipped: true, reason: 'no-download-path' }
  }
  const payload = buildAutoBackupPayload({
    currentVersion: current,
    latestVersion: current,
    reason: 'content-changed',
  })
  const written = writeAutoBackupFile(payload, root)
  writeFingerprint(fingerprint)
  console.log(`[backup] 用户数据有新增/变更（当前版本 ${current}），已自动备份 → ${written.filePath}`)
  return {
    ok: true,
    skipped: false,
    reason: 'content-changed',
    currentVersion: current,
    latestVersion: current,
    fingerprint,
    ...written,
    sourceCount: payload.data.sources?.length || 0,
    userCount: payload.data.users?.length || 0,
  }
}

/** 供测试重置 stamp + fingerprint */
export function _resetAutoBackupStampForTests() {
  const db = getDB()
  if (!db) return
  try {
    db.prepare('DELETE FROM settings WHERE key = ?').run(STAMP_KEY)
    db.prepare('DELETE FROM settings WHERE key = ?').run(FINGERPRINT_KEY)
  } catch {}
}

export { STAMP_KEY, FINGERPRINT_KEY, BACKUP_SUBDIR }
