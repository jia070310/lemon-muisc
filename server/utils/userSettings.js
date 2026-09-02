import { getDB } from '../db.js'

/** 全局设置（管理员管理，所有用户共享） */
export const GLOBAL_SETTING_KEYS = new Set([
  'download.savePath',
  'download.fileName',
  'download.maxDownloadNum',
  'download.skipExistFile',
  'download.isEmbedPic',
  'download.isEmbedLyric',
  'download.isEmbedLyricT',
  'download.isEmbedLyricR',
  'download.isDownloadLrc',
  'download.isDownloadTLrc',
  'download.isDownloadRLrc',
  'download.lrcFormat',
  'download.isUseOtherSource',
  'download.isSavePathGroupByListName',
  'download.savePathGroupBy',
  'source.active',
  'source.fault',
  'source.fallbackMode',
  'file.paths',
  'music.paths',
  'tag.dirs',
  'tag.matchSource',
  'auth.migrated',
  'mail.enabled',
  'mail.smtp.host',
  'mail.smtp.port',
  'mail.smtp.secure',
  'mail.smtp.user',
  'mail.smtp.pass',
  'mail.from',
  'mail.appUrl',
])

/** 用户个人设置 */
export const USER_SETTING_KEYS = new Set([
  'library.customPlaylists',
  'library.favorites',
  'library.recentPlays',
  'library.userDataRevision',
  'ui.theme',
  'player.coverStyle',
  'player.visualizer',
  'playlist.remoteSyncDays',
])

export function isGlobalSettingKey(key) {
  return GLOBAL_SETTING_KEYS.has(key)
}

export function isUserSettingKey(key) {
  return USER_SETTING_KEYS.has(key)
}

export function getGlobalSettings() {
  const db = getDB()
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const settings = {}
  for (const row of rows) settings[row.key] = row.value
  return settings
}

export function getUserSettings(userId) {
  const db = getDB()
  if (!userId) return {}
  const rows = db.prepare('SELECT key, value FROM user_settings WHERE user_id = ?').all(userId)
  const settings = {}
  for (const row of rows) settings[row.key] = row.value
  return settings
}

export function getMergedSettings(userId) {
  return { ...getGlobalSettings(), ...getUserSettings(userId) }
}

export function setGlobalSettings(entries) {
  const db = getDB()
  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `)
  const tx = db.transaction((items) => {
    for (const [key, value] of items) upsert.run(key, String(value))
  })
  tx(Object.entries(entries))
}

export function setUserSettings(userId, entries) {
  const db = getDB()
  if (!userId) return
  const upsert = db.prepare(`
    INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
  `)
  const tx = db.transaction((items) => {
    for (const [key, value] of items) upsert.run(userId, key, String(value))
  })
  tx(Object.entries(entries))
}
