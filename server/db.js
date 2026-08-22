import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

let db

export function getDB() {
  return db
}

export function initDB(configPath) {
  fs.mkdirSync(configPath, { recursive: true })
  db = new Database(path.join(configPath, 'lx-music.db'))
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_apis (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      script TEXT NOT NULL,
      author TEXT DEFAULT '',
      version TEXT DEFAULT '',
      homepage TEXT DEFAULT '',
      sources TEXT DEFAULT '{}',
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS download_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      singer TEXT DEFAULT '',
      source TEXT DEFAULT '',
      album TEXT DEFAULT '',
      interval TEXT DEFAULT '',
      quality TEXT DEFAULT '',
      url TEXT DEFAULT '',
      file_path TEXT DEFAULT '',
      status TEXT DEFAULT 'waiting',
      progress REAL DEFAULT 0,
      total_size INTEGER DEFAULT 0,
      downloaded_size INTEGER DEFAULT 0,
      meta TEXT DEFAULT '{}',
      error TEXT DEFAULT '',
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
  `)

  const defaultSettings = {
    'download.savePath': '/downloads',
    'download.fileName': '{name} - {singer}',
    'download.maxDownloadNum': '3',
    'download.skipExistFile': 'true',
    'download.isEmbedPic': 'true',
    'download.isEmbedLyric': 'false',
    'download.isEmbedLyricT': 'false',
    'download.isEmbedLyricR': 'false',
    'download.isDownloadLrc': 'false',
    'download.isDownloadTLrc': 'false',
    'download.isDownloadRLrc': 'false',
    'download.lrcFormat': 'utf8',
    'download.isUseOtherSource': 'true',
    'download.isSavePathGroupByListName': 'false',
    'source.active': '',
    'player.coverStyle': 'disc',
    'ui.theme': 'dark',
    'file.paths': '[]',
    'tag.dirs': '[]',
    'tag.matchSource': 'kg',
  }

  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  for (const [k, v] of Object.entries(defaultSettings)) {
    insert.run(k, v)
  }

  return db
}
