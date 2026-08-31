import fs from 'fs'
import path from 'path'
import { getDB } from '../db.js'
import { getMusicPaths, isConfiguredMusicDir } from './filePaths.js'
import { listAudioFiles } from './audioScan.js'
import { parseFilename } from './filenameParse.js'
import { readMetaLite } from '../meta.js'
import { mapWithConcurrency } from './asyncPool.js'

let tableReady = false

export function ensureLibraryCacheTable() {
  if (tableReady) return
  const db = getDB()
  if (!db) return
  db.exec(`
    CREATE TABLE IF NOT EXISTS library_index (
      file_path TEXT PRIMARY KEY,
      mtime REAL NOT NULL DEFAULT 0,
      size INTEGER NOT NULL DEFAULT 0,
      meta_json TEXT NOT NULL DEFAULT '{}',
      scanned_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_library_index_mtime ON library_index(mtime DESC);
  `)
  tableReady = true
}

function normalizePathKey(filePath) {
  return path.resolve(String(filePath || ''))
}

function buildStubEntry(filePath) {
  const fileName = path.basename(filePath)
  const parsed = parseFilename(fileName)
  let mtime = 0
  let size = 0
  try {
    const st = fs.statSync(filePath)
    mtime = st.mtimeMs || 0
    size = st.size || 0
  } catch {}
  return {
    filePath,
    fileName,
    mtime,
    size,
    parsedTitle: parsed.title,
    parsedArtist: parsed.artist,
    title: parsed.title,
    artist: parsed.artist,
    album: '',
    year: '',
    genre: '',
    comment: '',
    hasPicture: false,
    hasLyrics: false,
    lyric: '',
    pictureBase64: '',
  }
}

function rowToFile(row) {
  try {
    const meta = sanitizeCacheMeta(JSON.parse(row.meta_json || '{}'))
    return {
      filePath: row.file_path,
      mtime: row.mtime,
      size: row.size,
      ...meta,
    }
  } catch {
    return buildStubEntry(row.file_path)
  }
}

const CACHE_LIST_FIELDS = [
  'fileName', 'parsedTitle', 'parsedArtist', 'title', 'artist', 'album',
  'year', 'genre', 'comment', 'format', 'duration', 'track',
  'hasPicture', 'hasLyrics',
]

function sanitizeCacheMeta(meta) {
  if (!meta || typeof meta !== 'object') return {}
  const next = { ...meta }
  delete next.pictureBase64
  delete next.pictureMime
  delete next.pic
  delete next.lyric
  delete next.ok
  delete next.error
  return next
}

function rowToSlimFile(row) {
  let meta = {}
  try {
    meta = sanitizeCacheMeta(JSON.parse(row.meta_json || '{}'))
  } catch {}
  const filePath = row.file_path
  const fileName = meta.fileName || path.basename(filePath)
  const parsed = parseFilename(fileName)
  const out = {
    filePath,
    mtime: row.mtime,
    size: row.size,
    fileName,
    parsedTitle: meta.parsedTitle || parsed.title,
    parsedArtist: meta.parsedArtist || parsed.artist,
  }
  for (const key of CACHE_LIST_FIELDS) {
    if (meta[key] != null && meta[key] !== '') out[key] = meta[key]
  }
  return out
}

function buildDirSqlFilter(dirs) {
  const musicDirs = (dirs || []).filter(Boolean)
  if (!musicDirs.length) return null
  const clauses = []
  const params = []
  for (const dir of musicDirs) {
    const base = normalizePathKey(dir)
    clauses.push('(file_path = ? OR file_path LIKE ?)')
    params.push(base, base + path.sep + '%')
  }
  return {
    where: clauses.join(' OR '),
    params,
  }
}

export function getAllCachedTracks() {
  ensureLibraryCacheTable()
  const db = getDB()
  if (!db) return []
  const dirs = getMusicPaths().filter(Boolean)
  if (!dirs.length) return []

  const filter = buildDirSqlFilter(dirs)
  const rows = filter
    ? db.prepare(`SELECT file_path, mtime, size, meta_json FROM library_index WHERE ${filter.where} ORDER BY mtime DESC`).all(...filter.params)
    : db.prepare('SELECT file_path, mtime, size, meta_json FROM library_index ORDER BY mtime DESC').all()

  return rows.map(rowToSlimFile)
}

export function buildDiskIndex(dirs) {
  const map = new Map()
  for (const dir of dirs) {
    if (!isConfiguredMusicDir(dir)) continue
    if (!fs.existsSync(dir)) continue
    const paths = listAudioFiles(dir)
    for (const fp of paths) {
      const key = normalizePathKey(fp)
      try {
        const st = fs.statSync(fp)
        const fileName = path.basename(fp)
        const parsed = parseFilename(fileName)
        map.set(key, {
          filePath: fp,
          fileName,
          mtime: st.mtimeMs || 0,
          size: st.size || 0,
          parsedTitle: parsed.title,
          parsedArtist: parsed.artist,
        })
      } catch {}
    }
  }
  return map
}

export function syncLibraryIndex(dirs) {
  ensureLibraryCacheTable()
  const db = getDB()
  const musicDirs = (dirs?.length ? dirs : getMusicPaths()).filter(Boolean)
  const disk = buildDiskIndex(musicDirs)

  const cachedRows = db.prepare('SELECT file_path, mtime, size, meta_json FROM library_index').all()
  const cachedMap = new Map(cachedRows.map(r => [normalizePathKey(r.file_path), r]))

  const cached = []
  const pending = []
  const removed = []

  for (const [, diskEntry] of disk) {
    const key = normalizePathKey(diskEntry.filePath)
    const row = cachedMap.get(key)
    if (row && row.mtime === diskEntry.mtime && row.size === diskEntry.size) {
      cached.push(rowToFile(row))
      cachedMap.delete(key)
    } else {
      pending.push({
        ...buildStubEntry(diskEntry.filePath),
        mtime: diskEntry.mtime,
        size: diskEntry.size,
      })
    }
  }

  for (const [, row] of cachedMap) {
    removed.push(row.file_path)
  }

  if (removed.length) {
    const stmt = db.prepare('DELETE FROM library_index WHERE file_path = ?')
    const delMany = db.transaction((paths) => {
      for (const p of paths) stmt.run(p)
    })
    delMany(removed)
  }

  return { cached, pending, removed, total: disk.size }
}

export function upsertCacheEntry(filePath, mtime, size, meta) {
  ensureLibraryCacheTable()
  const db = getDB()
  const { filePath: _fp, mtime: _mt, size: _sz, ok: _ok, error: _err, ...rest } = meta || {}
  const metaJson = JSON.stringify(sanitizeCacheMeta(rest))
  db.prepare(`
    INSERT INTO library_index (file_path, mtime, size, meta_json, scanned_at)
    VALUES (?, ?, ?, ?, unixepoch())
    ON CONFLICT(file_path) DO UPDATE SET
      mtime = excluded.mtime,
      size = excluded.size,
      meta_json = excluded.meta_json,
      scanned_at = excluded.scanned_at
  `).run(filePath, mtime || 0, size || 0, metaJson)
}

export function removeCachePaths(paths) {
  ensureLibraryCacheTable()
  const db = getDB()
  const list = [...new Set((paths || []).filter(Boolean))]
  if (!list.length) return 0
  const stmt = db.prepare('DELETE FROM library_index WHERE file_path = ?')
  const delMany = db.transaction((ps) => {
    let n = 0
    for (const p of ps) {
      n += stmt.run(p).changes
    }
    return n
  })
  return delMany(list)
}

export async function scanBatchAndCache(files) {
  ensureLibraryCacheTable()
  const entries = (files || []).filter(f => f?.filePath)
  if (!entries.length) return []

  return mapWithConcurrency(entries, 4, async (entry) => {
    const fp = entry.filePath
    if (!fp || !fs.existsSync(fp)) {
      return { filePath: fp, ok: false, error: '文件不存在' }
    }

    let mtime = entry.mtime || 0
    let size = entry.size || 0
    try {
      const st = fs.statSync(fp)
      mtime = st.mtimeMs || mtime
      size = st.size || size
    } catch {}

    let lastErr = null
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const meta = await readMetaLite(fp)
        const fileName = path.basename(fp)
        const parsed = parseFilename(fileName)
        const file = {
          filePath: fp,
          fileName,
          mtime,
          size,
          ok: true,
          parsedTitle: parsed.title,
          parsedArtist: parsed.artist,
          ...meta,
        }
        const { filePath: _, mtime: __, size: ___, ok: ____, ...metaOnly } = file
        upsertCacheEntry(fp, mtime, size, metaOnly)
        return file
      } catch (e) {
        lastErr = e
        if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 120))
      }
    }

    const stub = buildStubEntry(fp)
    stub.mtime = mtime
    stub.size = size
    stub.ok = false
    stub.error = lastErr?.message || '读取失败'
    const { filePath: _, mtime: __, size: ___, ok: ____, error: _____, ...metaOnly } = stub
    upsertCacheEntry(fp, mtime, size, metaOnly)
    return stub
  })
}
