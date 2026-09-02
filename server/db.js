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
  db.pragma('busy_timeout = 5000')

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
      updated_at INTEGER DEFAULT (unixepoch()),
      user_id TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS library_index (
      file_path TEXT PRIMARY KEY,
      mtime REAL NOT NULL DEFAULT 0,
      size INTEGER NOT NULL DEFAULT 0,
      meta_json TEXT NOT NULL DEFAULT '{}',
      scanned_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_library_index_mtime ON library_index(mtime DESC);

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT DEFAULT '',
      role TEXT DEFAULT 'user',
      fnos_uid INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `)

  migrateSchema(db)

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
    'download.savePathGroupBy': 'none',
    'source.active': '[]',
    'source.fault': '',
    'player.coverStyle': 'disc',
    'player.visualizer': 'true',
    'ui.theme': 'dark',
    'file.paths': '[]',
    'music.paths': '[]',
    'tag.dirs': '[]',
    'tag.matchSource': 'kg',
    'mail.enabled': 'false',
    'mail.smtp.host': '',
    'mail.smtp.port': '465',
    'mail.smtp.secure': 'true',
    'mail.smtp.user': '',
    'mail.smtp.pass': '',
    'mail.from': '',
    'mail.appUrl': '',
  }

  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  for (const [k, v] of Object.entries(defaultSettings)) {
    insert.run(k, v)
  }

  return db
}

function migrateSchema(db) {
  const downloadCols = db.prepare('PRAGMA table_info(download_tasks)').all()
  if (!downloadCols.some(c => c.name === 'user_id')) {
    db.exec("ALTER TABLE download_tasks ADD COLUMN user_id TEXT DEFAULT ''")
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_download_tasks_user ON download_tasks(user_id)')

  const userCols = db.prepare('PRAGMA table_info(users)').all()
  if (!userCols.some(c => c.name === 'email')) {
    db.exec("ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''")
  }
  if (!userCols.some(c => c.name === 'email_verified')) {
    db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0')
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, type);
  `)
}
