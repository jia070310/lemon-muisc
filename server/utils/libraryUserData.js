import { getDB } from '../db.js'

const KEYS = {
  playlists: 'library.customPlaylists',
  favorites: 'library.favorites',
  recentPlays: 'library.recentPlays',
  revision: 'library.userDataRevision',
}

function readNumber(userId, key) {
  const db = getDB()
  if (!db || !userId) return 0
  try {
    const row = db.prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ?').get(userId, key)
    return Number(row?.value) || 0
  } catch {
    return 0
  }
}

function writeNumber(userId, key, value) {
  const db = getDB()
  if (!db || !userId) return
  db.prepare(`
    INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
  `).run(userId, key, String(Number(value) || 0))
}

function readArray(userId, key) {
  const db = getDB()
  if (!db || !userId) return []
  try {
    const row = db.prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ?').get(userId, key)
    const parsed = JSON.parse(row?.value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeArray(userId, key, list) {
  const db = getDB()
  if (!db || !userId) return
  const json = JSON.stringify(Array.isArray(list) ? list : [])
  db.prepare(`
    INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
  `).run(userId, key, json)
}

export function getLibraryUserData(userId) {
  return {
    playlists: readArray(userId, KEYS.playlists),
    favorites: readArray(userId, KEYS.favorites),
    recentPlays: readArray(userId, KEYS.recentPlays),
    revision: readNumber(userId, KEYS.revision),
  }
}

export function setLibraryUserData(userId, { playlists, favorites, recentPlays, revision } = {}) {
  if (playlists !== undefined) writeArray(userId, KEYS.playlists, playlists)
  if (favorites !== undefined) writeArray(userId, KEYS.favorites, favorites)
  if (recentPlays !== undefined) writeArray(userId, KEYS.recentPlays, recentPlays)
  if (revision !== undefined) writeNumber(userId, KEYS.revision, revision)
}

/** @deprecated 使用 getLibraryUserData */
export function getCustomPlaylists(userId) {
  return readArray(userId, KEYS.playlists)
}

/** @deprecated 使用 setLibraryUserData */
export function setCustomPlaylists(userId, playlists) {
  writeArray(userId, KEYS.playlists, playlists)
}
