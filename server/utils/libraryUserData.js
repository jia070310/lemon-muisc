import { getDB } from '../db.js'

const KEYS = {
  playlists: 'library.customPlaylists',
  favorites: 'library.favorites',
  recentPlays: 'library.recentPlays',
  revision: 'library.userDataRevision',
}

function readNumber(key) {
  const db = getDB()
  if (!db) return 0
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    return Number(row?.value) || 0
  } catch {
    return 0
  }
}

function writeNumber(key, value) {
  const db = getDB()
  if (!db) return
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(Number(value) || 0))
}

function readArray(key) {
  const db = getDB()
  if (!db) return []
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    const parsed = JSON.parse(row?.value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeArray(key, list) {
  const db = getDB()
  if (!db) return
  const json = JSON.stringify(Array.isArray(list) ? list : [])
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, json)
}

export function getLibraryUserData() {
  return {
    playlists: readArray(KEYS.playlists),
    favorites: readArray(KEYS.favorites),
    recentPlays: readArray(KEYS.recentPlays),
    revision: readNumber(KEYS.revision),
  }
}

export function setLibraryUserData({ playlists, favorites, recentPlays, revision } = {}) {
  if (playlists !== undefined) writeArray(KEYS.playlists, playlists)
  if (favorites !== undefined) writeArray(KEYS.favorites, favorites)
  if (recentPlays !== undefined) writeArray(KEYS.recentPlays, recentPlays)
  if (revision !== undefined) writeNumber(KEYS.revision, revision)
}

/** @deprecated 使用 getLibraryUserData */
export function getCustomPlaylists() {
  return readArray(KEYS.playlists)
}

/** @deprecated 使用 setLibraryUserData */
export function setCustomPlaylists(playlists) {
  writeArray(KEYS.playlists, playlists)
}
