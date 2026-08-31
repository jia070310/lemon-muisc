import { getDB } from '../db.js'

const KEYS = {
  playlists: 'library.customPlaylists',
  favorites: 'library.favorites',
  recentPlays: 'library.recentPlays',
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
  }
}

export function setLibraryUserData({ playlists, favorites, recentPlays } = {}) {
  if (playlists !== undefined) writeArray(KEYS.playlists, playlists)
  if (favorites !== undefined) writeArray(KEYS.favorites, favorites)
  if (recentPlays !== undefined) writeArray(KEYS.recentPlays, recentPlays)
}

/** @deprecated 使用 getLibraryUserData */
export function getCustomPlaylists() {
  return readArray(KEYS.playlists)
}

/** @deprecated 使用 setLibraryUserData */
export function setCustomPlaylists(playlists) {
  writeArray(KEYS.playlists, playlists)
}
