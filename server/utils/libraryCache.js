import fs from 'fs'
import path from 'path'
import { getDB } from '../db.js'
import { getMusicPaths, isUnderConfiguredMusicDir, isPathUnderMusicDirs } from './filePaths.js'
import { listAudioFiles } from './audioScan.js'
import { parseFilename } from './filenameParse.js'
import { readMetaLite } from '../meta.js'
import { mapWithConcurrency } from './asyncPool.js'
import { splitArtists } from './artistTag.js'

let tableReady = false
let columnsReady = false

const VARIOUS_ARTISTS_NAME = '群星 (Various Artists)'

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
  ensureSearchColumns(db)
  tableReady = true
}

function ensureSearchColumns(db) {
  const cols = db.prepare('PRAGMA table_info(library_index)').all().map((c) => c.name)
  const add = (name, ddl) => {
    if (!cols.includes(name)) {
      db.exec(`ALTER TABLE library_index ADD COLUMN ${ddl}`)
      cols.push(name)
    }
  }
  add('title', "title TEXT NOT NULL DEFAULT ''")
  add('artist', "artist TEXT NOT NULL DEFAULT ''")
  add('album_artist', "album_artist TEXT NOT NULL DEFAULT ''")
  add('album', "album TEXT NOT NULL DEFAULT ''")
  add('year', "year TEXT NOT NULL DEFAULT ''")
  add('genre', "genre TEXT NOT NULL DEFAULT ''")
  add('duration', 'duration REAL NOT NULL DEFAULT 0')
  add('format', "format TEXT NOT NULL DEFAULT ''")
  add('track_no', "track_no TEXT NOT NULL DEFAULT ''")
  add('has_picture', 'has_picture INTEGER NOT NULL DEFAULT 0')
  add('has_lyrics', 'has_lyrics INTEGER NOT NULL DEFAULT 0')
  // SensMe 风格情绪地图（本地音频分析）
  add('mood_valence', 'mood_valence REAL')
  add('mood_arousal', 'mood_arousal REAL')
  add('mood_bpm', 'mood_bpm REAL NOT NULL DEFAULT 0')
  add('mood_status', "mood_status TEXT NOT NULL DEFAULT ''")
  add('mood_version', 'mood_version INTEGER NOT NULL DEFAULT 0')
  add('mood_analyzed_at', 'mood_analyzed_at INTEGER NOT NULL DEFAULT 0')
  add('mood_file_mtime', 'mood_file_mtime REAL NOT NULL DEFAULT 0')
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_library_title ON library_index(title COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_library_artist ON library_index(artist COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_library_album ON library_index(album COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_library_genre ON library_index(genre COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_library_album_artist ON library_index(album_artist COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_library_mood_status ON library_index(mood_status);
    CREATE INDEX IF NOT EXISTS idx_library_mood_xy ON library_index(mood_valence, mood_arousal);
  `)
  if (columnsReady) return
  // 从 meta_json 回填可查询列（只填仍为空的行，避免反复全表写）
  try {
    db.exec(`
      UPDATE library_index SET
        title = COALESCE(NULLIF(json_extract(meta_json, '$.title'), ''), NULLIF(json_extract(meta_json, '$.parsedTitle'), ''), title),
        artist = COALESCE(NULLIF(json_extract(meta_json, '$.artist'), ''), NULLIF(json_extract(meta_json, '$.parsedArtist'), ''), artist),
        album_artist = COALESCE(NULLIF(json_extract(meta_json, '$.albumArtist'), ''), album_artist),
        album = COALESCE(NULLIF(json_extract(meta_json, '$.album'), ''), album),
        year = COALESCE(NULLIF(json_extract(meta_json, '$.year'), ''), year),
        genre = COALESCE(NULLIF(json_extract(meta_json, '$.genre'), ''), genre),
        duration = COALESCE(json_extract(meta_json, '$.duration'), duration),
        format = COALESCE(NULLIF(json_extract(meta_json, '$.format'), ''), format),
        track_no = COALESCE(NULLIF(CAST(json_extract(meta_json, '$.track') AS TEXT), ''), track_no),
        has_picture = CASE
          WHEN json_extract(meta_json, '$.hasPicture') IN (1, '1', 'true', 'TRUE') THEN 1
          ELSE has_picture
        END,
        has_lyrics = CASE
          WHEN json_extract(meta_json, '$.hasLyrics') IN (1, '1', 'true', 'TRUE') THEN 1
          ELSE has_lyrics
        END
      WHERE (title = '' AND artist = '' AND album = '')
        AND meta_json IS NOT NULL
        AND meta_json != '{}'
        AND meta_json != ''
    `)
  } catch { /* 旧 SQLite 无 json_extract 时跳过，靠后续 upsert 写入 */ }
  columnsReady = true
}

function extractSearchFields(meta = {}, filePath = '') {
  const fileName = meta.fileName || (filePath ? path.basename(filePath) : '')
  const parsed = fileName ? parseFilename(fileName) : { title: '', artist: '' }
  const title = String(meta.title || meta.parsedTitle || parsed.title || fileName || '').trim()
  const artist = String(meta.artist || meta.parsedArtist || parsed.artist || '').trim()
  const albumArtist = String(meta.albumArtist || '').trim()
  const album = String(meta.album || '').trim()
  const year = String(meta.year || '').trim()
  const genre = String(meta.genre || '').trim()
  const duration = Number(meta.duration) || 0
  const format = String(meta.format || '').trim()
  const trackNo = String(meta.track ?? meta.trackNo ?? '').trim()
  const hasPicture = meta.hasPicture ? 1 : 0
  const hasLyrics = meta.hasLyrics || meta.lyric ? 1 : 0
  return { title, artist, albumArtist, album, year, genre, duration, format, trackNo, hasPicture, hasLyrics }
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
    albumArtist: '',
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
  'fileName', 'parsedTitle', 'parsedArtist', 'title', 'artist', 'albumArtist', 'album',
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
    if (!isUnderConfiguredMusicDir(dir)) continue
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

export function syncLibraryIndex(dirs, { partial = false } = {}) {
  ensureLibraryCacheTable()
  const db = getDB()
  const musicDirs = (dirs?.length ? dirs : getMusicPaths()).filter(Boolean)
  const disk = buildDiskIndex(musicDirs)

  const filter = partial ? buildDirSqlFilter(musicDirs) : null
  const cachedRows = filter
    ? db.prepare(`SELECT file_path, mtime, size, meta_json FROM library_index WHERE ${filter.where}`).all(...filter.params)
    : db.prepare('SELECT file_path, mtime, size, meta_json FROM library_index').all()
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
    if (!partial || isPathUnderMusicDirs(row.file_path, musicDirs)) {
      removed.push(row.file_path)
    }
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
  const key = normalizePathKey(filePath)
  const { filePath: _fp, mtime: _mt, size: _sz, ok: _ok, error: _err, ...rest } = meta || {}
  const clean = sanitizeCacheMeta(rest)
  const metaJson = JSON.stringify(clean)
  const fields = extractSearchFields(clean, key)
  db.prepare(`
    INSERT INTO library_index (
      file_path, mtime, size, meta_json, scanned_at,
      title, artist, album_artist, album, year, genre, duration, format, track_no, has_picture, has_lyrics
    )
    VALUES (?, ?, ?, ?, unixepoch(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path) DO UPDATE SET
      mtime = excluded.mtime,
      size = excluded.size,
      meta_json = excluded.meta_json,
      scanned_at = excluded.scanned_at,
      title = excluded.title,
      artist = excluded.artist,
      album_artist = excluded.album_artist,
      album = excluded.album,
      year = excluded.year,
      genre = excluded.genre,
      duration = excluded.duration,
      format = excluded.format,
      track_no = excluded.track_no,
      has_picture = excluded.has_picture,
      has_lyrics = excluded.has_lyrics
  `).run(
    key,
    mtime || 0,
    size || 0,
    metaJson,
    fields.title,
    fields.artist,
    fields.albumArtist,
    fields.album,
    fields.year,
    fields.genre,
    fields.duration,
    fields.format,
    fields.trackNo,
    fields.hasPicture,
    fields.hasLyrics,
  )
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

function isDiskEntryFresh(row, filePath) {
  if (!row) return false
  try {
    const st = fs.statSync(filePath)
    const diskMtime = st.mtimeMs || 0
    const diskSize = st.size || 0
    return Math.abs((row.mtime || 0) - diskMtime) < 2 && row.size === diskSize
  } catch {
    return false
  }
}

/** 旧版曾误清空「专辑名=标题」的标签，需强制重扫 */
function needsAlbumCacheRefresh(cached) {
  if (!cached?.title) return false
  if (cached.album) return false
  return true
}

export function getCacheEntry(filePath) {
  ensureLibraryCacheTable()
  const db = getDB()
  if (!db || !filePath) return null
  const key = normalizePathKey(filePath)
  const row = db.prepare('SELECT file_path, mtime, size, meta_json FROM library_index WHERE file_path = ?').get(key)
  if (!row) return null
  return rowToFile(row)
}

/** 用 SQLite 缓存补全文件列表（标签编辑 / 快速扫描） */
export function enrichFilesFromCache(files) {
  return (files || []).map((file) => {
    const fp = file?.filePath
    if (!fp) return file
    const cached = getCacheEntry(fp)
    if (!cached || !isDiskEntryFresh(cached, fp) || needsAlbumCacheRefresh(cached)) return file
    return {
      ...file,
      ...cached,
      filePath: fp,
      fileName: file.fileName || cached.fileName || path.basename(fp),
    }
  })
}

/** 优先读缓存，未命中再扫描并写入 library_index（音乐库与标签编辑共用） */
export async function readBatchFromCacheOrScan(filePaths) {
  const list = [...new Set((filePaths || []).map(String).filter(Boolean))]
  if (!list.length) return []

  const hits = []
  const pending = []

  for (const fp of list) {
    const cached = getCacheEntry(fp)
    if (cached && isDiskEntryFresh(cached, fp) && !needsAlbumCacheRefresh(cached)) {
      hits.push({ ...cached, filePath: fp, ok: true })
      continue
    }
    let mtime = 0
    let size = 0
    try {
      const st = fs.statSync(fp)
      mtime = st.mtimeMs || 0
      size = st.size || 0
    } catch {}
    pending.push({ filePath: fp, mtime, size })
  }

  const scanned = pending.length ? await scanBatchAndCache(pending) : []
  const order = new Map(list.map((fp, idx) => [normalizePathKey(fp), idx]))
  return [...hits, ...scanned].sort((a, b) => {
    const ia = order.get(normalizePathKey(a.filePath)) ?? 0
    const ib = order.get(normalizePathKey(b.filePath)) ?? 0
    return ia - ib
  })
}

/** 若缓存与磁盘 mtime/size 一致则返回缓存条目 */
export function getFreshCacheEntry(filePath) {
  const entry = getCacheEntry(filePath)
  if (!entry || !isDiskEntryFresh(entry, filePath)) return null
  return entry
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function escapeLike(text) {
  return String(text || '').replace(/([%_\\])/g, '\\$1')
}

function tracksOrderSql(sort) {
  switch (String(sort || 'mtime')) {
    case 'title':
      return 'title COLLATE NOCASE ASC, file_path ASC'
    case 'artist':
      return 'artist COLLATE NOCASE ASC, title COLLATE NOCASE ASC'
    case 'album':
      return 'album COLLATE NOCASE ASC, track_no ASC, title COLLATE NOCASE ASC'
    case 'mtime':
    case 'recent':
    default:
      return 'mtime DESC, file_path ASC'
  }
}

function rowToQueryFile(row) {
  const fileName = path.basename(row.file_path || '')
  return {
    filePath: row.file_path,
    mtime: row.mtime,
    size: row.size,
    fileName,
    title: row.title || '',
    artist: row.artist || '',
    albumArtist: row.album_artist || '',
    album: row.album || '',
    year: row.year || '',
    genre: row.genre || '',
    duration: row.duration || 0,
    format: row.format || '',
    track: row.track_no || '',
    hasPicture: Boolean(row.has_picture),
    hasLyrics: Boolean(row.has_lyrics),
    parsedTitle: row.title || '',
    parsedArtist: row.artist || '',
  }
}

/**
 * 分页曲目查询（不返回全库）
 * @returns {{ items: object[], total: number, page: number, limit: number }}
 */
export function queryCachedTracks(opts = {}) {
  ensureLibraryCacheTable()
  const db = getDB()
  if (!db) return { items: [], total: 0, page: 1, limit: 50 }

  const page = clampInt(opts.page, 1, 1, 1_000_000)
  const limit = clampInt(opts.limit, 50, 1, 200)
  const offset = (page - 1) * limit

  const dirs = getMusicPaths().filter(Boolean)
  const clauses = []
  const params = []
  const filter = buildDirSqlFilter(dirs)
  if (!filter) return { items: [], total: 0, page, limit }
  clauses.push(`(${filter.where})`)
  params.push(...filter.params)

  const keyword = String(opts.q || '').trim()
  if (keyword) {
    const like = `%${escapeLike(keyword)}%`
    clauses.push(`(
      title LIKE ? ESCAPE '\\' OR artist LIKE ? ESCAPE '\\' OR album LIKE ? ESCAPE '\\'
      OR album_artist LIKE ? ESCAPE '\\' OR genre LIKE ? ESCAPE '\\' OR file_path LIKE ? ESCAPE '\\'
    )`)
    params.push(like, like, like, like, like, like)
  }

  const artist = String(opts.artist || '').trim()
  if (artist) {
    pushArtistMatchFilter(clauses, params, artist)
  }

  const album = String(opts.album || '').trim()
  if (album) {
    clauses.push('album = ? COLLATE NOCASE')
    params.push(album)
  }
  const albumArtist = String(opts.albumArtist || '').trim()
  if (albumArtist) {
    clauses.push('(NULLIF(album_artist, "") = ? COLLATE NOCASE OR (album_artist = "" AND artist = ? COLLATE NOCASE))')
    params.push(albumArtist, albumArtist)
  }
  const genre = String(opts.genre || '').trim()
  if (genre) {
    const like = `%${escapeLike(genre)}%`
    clauses.push("(genre = ? COLLATE NOCASE OR genre LIKE ? ESCAPE '\\')")
    params.push(genre, like)
  }

  const where = clauses.join(' AND ')
  const order = tracksOrderSql(opts.sort)
  const total = db.prepare(`SELECT COUNT(*) AS n FROM library_index WHERE ${where}`).get(...params)?.n || 0
  const rows = db.prepare(`
    SELECT file_path, mtime, size, title, artist, album_artist, album, year, genre,
           duration, format, track_no, has_picture, has_lyrics
    FROM library_index
    WHERE ${where}
    ORDER BY ${order}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset)

  return {
    items: rows.map(rowToQueryFile),
    total,
    page,
    limit,
  }
}

/** 按路径批量取曲目（歌单 / 收藏解析，限制数量） */
export function queryTracksByPaths(paths, { limit = 500 } = {}) {
  ensureLibraryCacheTable()
  const db = getDB()
  if (!db) return []
  const list = [...new Set((paths || []).map((p) => normalizePathKey(p)).filter(Boolean))].slice(0, clampInt(limit, 500, 1, 2000))
  if (!list.length) return []
  const placeholders = list.map(() => '?').join(',')
  const rows = db.prepare(`
    SELECT file_path, mtime, size, title, artist, album_artist, album, year, genre,
           duration, format, track_no, has_picture, has_lyrics
    FROM library_index
    WHERE file_path IN (${placeholders})
  `).all(...list)
  const map = new Map(rows.map((r) => [normalizePathKey(r.file_path), rowToQueryFile(r)]))
  return list.map((p) => map.get(p)).filter(Boolean)
}

function artistNamesForIndex(artistRaw) {
  const names = splitArtists(artistRaw || '').filter((n) => n && n !== '未知艺术家')
  if (!names.length) return []
  if (names.length === 1) return names
  return [...names, VARIOUS_ARTISTS_NAME]
}

function artistToId(name) {
  return encodeURIComponent(String(name || ''))
}

/** SQL：判定多歌手署名（与 splitArtists 分隔符大致对齐） */
const MULTI_ARTIST_SQL = `(
  instr(artist, ' / ') > 0 OR instr(artist, '/') > 0
  OR instr(artist, ';') > 0 OR instr(artist, '|') > 0
  OR instr(artist, '_') > 0
  OR instr(artist, '、') > 0 OR instr(artist, '，') > 0 OR instr(artist, ',') > 0
  OR instr(artist, '&') > 0 OR instr(artist, '＆') > 0 OR instr(artist, '×') > 0
  OR instr(artist, '和') > 0 OR instr(artist, '与') > 0
  OR instr(lower(artist), ' feat') > 0 OR instr(lower(artist), ' ft') > 0
  OR instr(lower(artist), ' featuring') > 0
)`

/** 单歌手：精确匹配，或作为多歌手串中的一员 */
function pushArtistMatchFilter(clauses, params, artist) {
  const name = String(artist || '').trim()
  if (!name) return
  if (name === VARIOUS_ARTISTS_NAME) {
    clauses.push(MULTI_ARTIST_SQL)
    return
  }
  const esc = escapeLike(name)
  clauses.push(`(
    artist = ? COLLATE NOCASE
    OR album_artist = ? COLLATE NOCASE
    OR artist LIKE ? ESCAPE '\\'
    OR artist LIKE ? ESCAPE '\\'
    OR artist LIKE ? ESCAPE '\\'
    OR artist LIKE ? ESCAPE '\\'
    OR artist LIKE ? ESCAPE '\\'
    OR artist LIKE ? ESCAPE '\\'
    OR artist LIKE ? ESCAPE '\\'
    OR artist LIKE ? ESCAPE '\\'
    OR artist LIKE ? ESCAPE '\\'
    OR artist LIKE ? ESCAPE '\\'
    OR artist LIKE ? ESCAPE '\\'
    OR artist LIKE ? ESCAPE '\\'
    OR artist LIKE ? ESCAPE '\\'
    OR artist LIKE ? ESCAPE '\\'
    OR artist LIKE ? ESCAPE '\\'
    OR artist LIKE ? ESCAPE '\\'
    OR artist LIKE ? ESCAPE '\\'
    OR artist LIKE ? ESCAPE '\\'
  )`)
  params.push(
    name,
    name,
    // A / B
    `${esc} / %`,
    `% / ${esc}`,
    `% / ${esc} / %`,
    // A_B
    `${esc}\\_%`,
    `%\\_${esc}`,
    `%\\_${esc}\\_%`,
    // A和B / A与B
    `${esc}和%`,
    `%和${esc}`,
    `%和${esc}和%`,
    `${esc}与%`,
    `%与${esc}`,
    `%与${esc}与%`,
    // 、 ， ,
    `${esc}、%`,
    `%、${esc}`,
    `${esc}，%`,
    `%，${esc}`,
    `${esc},%`,
    `%,${esc}`,
  )
}

/**
 * 歌手聚合（服务端）；多歌手归「群星」，同时每位歌手下独立出现
 */
export function queryArtists(opts = {}) {
  ensureLibraryCacheTable()
  const db = getDB()
  const page = clampInt(opts.page, 1, 1, 1_000_000)
  const limit = clampInt(opts.limit, 48, 1, 200)
  if (!db) return { items: [], total: 0, page, limit }

  const dirs = getMusicPaths().filter(Boolean)
  const filter = buildDirSqlFilter(dirs)
  if (!filter) return { items: [], total: 0, page, limit }

  const rows = db.prepare(`
    SELECT file_path, artist, album, mtime, has_picture
    FROM library_index
    WHERE ${filter.where}
  `).all(...filter.params)

  const map = new Map()
  const q = String(opts.q || '').trim().toLowerCase()
  for (const row of rows) {
    const names = artistNamesForIndex(row.artist)
    for (const name of names) {
      if (q && !name.toLowerCase().includes(q)) continue
      const id = artistToId(name)
      if (!map.has(id)) {
        map.set(id, {
          id,
          name,
          trackCount: 0,
          albumSet: new Set(),
          latestMtime: 0,
          coverPath: '',
        })
      }
      const entry = map.get(id)
      entry.trackCount += 1
      if (row.album) entry.albumSet.add(row.album)
      if ((row.mtime || 0) > entry.latestMtime) entry.latestMtime = row.mtime || 0
      if (!entry.coverPath && row.has_picture) entry.coverPath = row.file_path
    }
  }

  let items = [...map.values()].map((a) => ({
    id: a.id,
    name: a.name,
    trackCount: a.trackCount,
    albumCount: a.albumSet.size,
    latestMtime: a.latestMtime,
    coverPath: a.coverPath,
  }))

  const sort = String(opts.sort || 'count')
  items.sort((a, b) => {
    if (a.name === VARIOUS_ARTISTS_NAME && b.name !== VARIOUS_ARTISTS_NAME) return -1
    if (b.name === VARIOUS_ARTISTS_NAME && a.name !== VARIOUS_ARTISTS_NAME) return 1
    if (sort === 'name') return a.name.localeCompare(b.name, 'zh-CN')
    if (sort === 'recent') return (b.latestMtime || 0) - (a.latestMtime || 0)
    return b.trackCount - a.trackCount || (b.latestMtime || 0) - (a.latestMtime || 0)
  })

  const total = items.length
  const start = (page - 1) * limit
  items = items.slice(start, start + limit)
  return { items, total, page, limit }
}

/**
 * 专辑聚合（服务端）
 */
export function queryAlbums(opts = {}) {
  ensureLibraryCacheTable()
  const db = getDB()
  const page = clampInt(opts.page, 1, 1, 1_000_000)
  const limit = clampInt(opts.limit, 48, 1, 200)
  if (!db) return { items: [], total: 0, page, limit }

  const dirs = getMusicPaths().filter(Boolean)
  const filter = buildDirSqlFilter(dirs)
  if (!filter) return { items: [], total: 0, page, limit }

  const params = [...filter.params]
  let where = filter.where
  const q = String(opts.q || '').trim()
  if (q) {
    const like = `%${escapeLike(q)}%`
    where = `(${where}) AND (album LIKE ? ESCAPE '\\' OR artist LIKE ? ESCAPE '\\' OR album_artist LIKE ? ESCAPE '\\')`
    params.push(like, like, like)
  }
  const artist = String(opts.artist || '').trim()
  if (artist) {
    const albumClauses = []
    const albumParams = []
    pushArtistMatchFilter(albumClauses, albumParams, artist)
    if (albumClauses.length) {
      where = `(${where}) AND (${albumClauses.join(' AND ')})`
      params.push(...albumParams)
    }
  }

  const rows = db.prepare(`
    SELECT
      CASE WHEN NULLIF(album, '') IS NULL THEN '未知专辑' ELSE album END AS album_name,
      CASE
        WHEN NULLIF(album_artist, '') IS NOT NULL THEN album_artist
        WHEN NULLIF(artist, '') IS NOT NULL THEN artist
        ELSE '未知艺术家'
      END AS artist_name,
      COUNT(*) AS track_count,
      MAX(mtime) AS latest_mtime,
      MAX(year) AS year,
      MAX(genre) AS genre,
      MAX(CASE WHEN has_picture = 1 THEN file_path ELSE NULL END) AS cover_path
    FROM library_index
    WHERE ${where}
    GROUP BY album_name, artist_name
  `).all(...params)

  let items = rows.map((r) => {
    const albumName = r.album_name || '未知专辑'
    const artistName = r.artist_name || '未知艺术家'
    return {
      id: `${artistName}::${albumName}`,
      name: albumName,
      artist: artistName,
      trackCount: r.track_count || 0,
      latestMtime: r.latest_mtime || 0,
      year: r.year || '',
      genre: r.genre || '',
      coverPath: r.cover_path || '',
    }
  }).filter((a) => a.name !== '未知专辑' || a.trackCount > 0)

  const sort = String(opts.sort || 'recent')
  items.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'zh-CN')
    if (sort === 'artist') return a.artist.localeCompare(b.artist, 'zh-CN') || a.name.localeCompare(b.name, 'zh-CN')
    if (sort === 'count') return b.trackCount - a.trackCount
    return (b.latestMtime || 0) - (a.latestMtime || 0)
  })

  const total = items.length
  const start = (page - 1) * limit
  items = items.slice(start, start + limit)
  return { items, total, page, limit }
}

/** 曲库总数（轻量） */
export function countCachedTracks() {
  ensureLibraryCacheTable()
  const db = getDB()
  if (!db) return 0
  const dirs = getMusicPaths().filter(Boolean)
  const filter = buildDirSqlFilter(dirs)
  if (!filter) return 0
  return db.prepare(`SELECT COUNT(*) AS n FROM library_index WHERE ${filter.where}`).get(...filter.params)?.n || 0
}

function splitGenreTags(genreRaw) {
  const raw = String(genreRaw || '').trim()
  if (!raw) return []
  const parts = raw.split(/[/;；、,，|]/).map((s) => s.trim()).filter(Boolean)
  return parts.length ? parts : []
}

function genreToId(name) {
  return encodeURIComponent(String(name || ''))
}

/**
 * 风格聚合（一首歌可属多个标签）；排除「未知风格」
 */
export function queryGenres(opts = {}) {
  ensureLibraryCacheTable()
  const db = getDB()
  const page = clampInt(opts.page, 1, 1, 1_000_000)
  const limit = clampInt(opts.limit, 48, 1, 200)
  if (!db) return { items: [], total: 0, page, limit }

  const dirs = getMusicPaths().filter(Boolean)
  const filter = buildDirSqlFilter(dirs)
  if (!filter) return { items: [], total: 0, page, limit }

  const rows = db.prepare(`
    SELECT file_path, artist, genre, mtime, has_picture
    FROM library_index
    WHERE ${filter.where}
  `).all(...filter.params)

  const map = new Map()
  const q = String(opts.q || '').trim().toLowerCase()
  for (const row of rows) {
    const tags = splitGenreTags(row.genre)
    if (!tags.length) continue
    for (const name of tags) {
      if (name === '未知风格') continue
      if (q && !name.toLowerCase().includes(q)) continue
      const id = genreToId(name)
      if (!map.has(id)) {
        map.set(id, {
          id,
          name,
          trackCount: 0,
          artistSet: new Set(),
          latestMtime: 0,
          coverPath: '',
        })
      }
      const entry = map.get(id)
      entry.trackCount += 1
      if (row.artist) entry.artistSet.add(row.artist)
      if ((row.mtime || 0) > entry.latestMtime) entry.latestMtime = row.mtime || 0
      if (!entry.coverPath && row.has_picture) entry.coverPath = row.file_path
    }
  }

  let items = [...map.values()].map((g) => ({
    id: g.id,
    name: g.name,
    trackCount: g.trackCount,
    artistCount: g.artistSet.size,
    latestMtime: g.latestMtime,
    coverPath: g.coverPath,
  }))

  const sort = String(opts.sort || 'count')
  items.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'zh-CN')
    if (sort === 'recent') return (b.latestMtime || 0) - (a.latestMtime || 0)
    return b.trackCount - a.trackCount || (b.latestMtime || 0) - (a.latestMtime || 0)
  })

  const total = items.length
  const start = (page - 1) * limit
  items = items.slice(start, start + limit)
  return { items, total, page, limit }
}

/** 需要情绪分析的曲目（未分析 / 版本过期 / 文件已变） */
export function listMoodAnalyzePending({ algoVersion = 1, limit = 0 } = {}) {
  ensureLibraryCacheTable()
  const db = getDB()
  if (!db) return []
  const ver = Number(algoVersion) || 1
  const sql = `
    SELECT file_path, mtime, size, title, artist, album, duration
    FROM library_index
    WHERE mood_status = ''
       OR mood_status = 'pending'
       OR mood_status = 'error'
       OR mood_version != ?
       OR ABS(mood_file_mtime - mtime) > 0.5
    ORDER BY mtime DESC
  `
  const rows = limit > 0
    ? db.prepare(`${sql} LIMIT ?`).all(ver, limit)
    : db.prepare(sql).all(ver)
  return rows.map((r) => ({
    filePath: r.file_path,
    mtime: r.mtime || 0,
    size: r.size || 0,
    title: r.title || '',
    artist: r.artist || '',
    album: r.album || '',
    duration: r.duration || 0,
  }))
}

export function getMoodAnalyzeStats({ algoVersion = 1 } = {}) {
  ensureLibraryCacheTable()
  const db = getDB()
  if (!db) {
    return { total: 0, analyzed: 0, pending: 0, skipped: 0, error: 0 }
  }
  const ver = Number(algoVersion) || 1
  const total = db.prepare('SELECT COUNT(*) AS c FROM library_index').get()?.c || 0
  const analyzed = db.prepare(`
    SELECT COUNT(*) AS c FROM library_index
    WHERE mood_status = 'ok' AND mood_version = ? AND ABS(mood_file_mtime - mtime) <= 0.5
  `).get(ver)?.c || 0
  const skipped = db.prepare(`
    SELECT COUNT(*) AS c FROM library_index WHERE mood_status = 'skipped' AND mood_version = ?
  `).get(ver)?.c || 0
  const error = db.prepare(`
    SELECT COUNT(*) AS c FROM library_index WHERE mood_status = 'error'
  `).get()?.c || 0
  const pending = Math.max(0, total - analyzed - skipped)
  return { total, analyzed, pending, skipped, error }
}

export function updateMoodResult(filePath, result = {}) {
  ensureLibraryCacheTable()
  const db = getDB()
  if (!db) return false
  const key = normalizePathKey(filePath)
  const status = String(result.status || '').trim() || 'ok'
  const valence = result.valence == null ? null : Number(result.valence)
  const arousal = result.arousal == null ? null : Number(result.arousal)
  const bpm = Number(result.bpm) || 0
  const version = Number(result.version) || 0
  const fileMtime = Number(result.fileMtime) || 0
  db.prepare(`
    UPDATE library_index SET
      mood_valence = ?,
      mood_arousal = ?,
      mood_bpm = ?,
      mood_status = ?,
      mood_version = ?,
      mood_analyzed_at = unixepoch(),
      mood_file_mtime = ?
    WHERE file_path = ?
  `).run(
    Number.isFinite(valence) ? valence : null,
    Number.isFinite(arousal) ? arousal : null,
    bpm,
    status,
    version,
    fileMtime,
    key,
  )
  return true
}

/**
 * 已分析的情绪地图点
 * @returns {{ points: object[], total: number }}
 */
export function queryMoodMapPoints({ limit = 5000 } = {}) {
  ensureLibraryCacheTable()
  const db = getDB()
  if (!db) return { points: [], total: 0 }
  const max = Math.min(20000, Math.max(1, Number(limit) || 5000))
  const total = db.prepare(`
    SELECT COUNT(*) AS c FROM library_index
    WHERE mood_status = 'ok'
      AND mood_valence IS NOT NULL
      AND mood_arousal IS NOT NULL
  `).get()?.c || 0
  const rows = db.prepare(`
    SELECT file_path, title, artist, album, duration, mood_valence, mood_arousal, mood_bpm, has_picture
    FROM library_index
    WHERE mood_status = 'ok'
      AND mood_valence IS NOT NULL
      AND mood_arousal IS NOT NULL
    ORDER BY mtime DESC
    LIMIT ?
  `).all(max)
  return {
    total,
    points: rows.map((r) => ({
      filePath: r.file_path,
      title: r.title || path.basename(r.file_path || ''),
      artist: r.artist || '',
      album: r.album || '',
      duration: r.duration || 0,
      x: Number(r.mood_valence),
      y: Number(r.mood_arousal),
      bpm: Number(r.mood_bpm) || 0,
      hasPicture: Boolean(r.has_picture),
    })),
  }
}

function pointInPolygon(x, y, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = Number(polygon[i]?.x)
    const yi = Number(polygon[i]?.y)
    const xj = Number(polygon[j]?.x)
    const yj = Number(polygon[j]?.y)
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue
    const intersect = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

function pointInBBox(x, y, bbox) {
  if (!bbox) return false
  const minX = Math.min(Number(bbox.x1), Number(bbox.x2))
  const maxX = Math.max(Number(bbox.x1), Number(bbox.x2))
  const minY = Math.min(Number(bbox.y1), Number(bbox.y2))
  const maxY = Math.max(Number(bbox.y1), Number(bbox.y2))
  if (![minX, maxX, minY, maxY].every(Number.isFinite)) return false
  return x >= minX && x <= maxX && y >= minY && y <= maxY
}

/**
 * 按圈选区域返回曲目（坐标为 valence/arousal，范围约 [-1,1]）
 */
export function queryMoodTracksInRegion({ bbox = null, polygon = null, limit = 500 } = {}) {
  ensureLibraryCacheTable()
  const db = getDB()
  if (!db) return { items: [], total: 0 }
  const max = Math.min(2000, Math.max(1, Number(limit) || 500))

  let minX = -1
  let maxX = 1
  let minY = -1
  let maxY = 1
  if (bbox) {
    minX = Math.min(Number(bbox.x1), Number(bbox.x2))
    maxX = Math.max(Number(bbox.x1), Number(bbox.x2))
    minY = Math.min(Number(bbox.y1), Number(bbox.y2))
    maxY = Math.max(Number(bbox.y1), Number(bbox.y2))
  } else if (Array.isArray(polygon) && polygon.length) {
    const xs = polygon.map((p) => Number(p.x)).filter(Number.isFinite)
    const ys = polygon.map((p) => Number(p.y)).filter(Number.isFinite)
    if (xs.length && ys.length) {
      minX = Math.min(...xs)
      maxX = Math.max(...xs)
      minY = Math.min(...ys)
      maxY = Math.max(...ys)
    }
  }

  const rows = db.prepare(`
    SELECT file_path, title, artist, album, album_artist, year, genre, duration, format,
           mood_valence, mood_arousal, mood_bpm, has_picture, has_lyrics, mtime, size
    FROM library_index
    WHERE mood_status = 'ok'
      AND mood_valence IS NOT NULL
      AND mood_arousal IS NOT NULL
      AND mood_valence BETWEEN ? AND ?
      AND mood_arousal BETWEEN ? AND ?
    ORDER BY title COLLATE NOCASE ASC
    LIMIT ?
  `).all(minX, maxX, minY, maxY, Math.min(5000, max * 4))

  const filtered = []
  for (const r of rows) {
    const x = Number(r.mood_valence)
    const y = Number(r.mood_arousal)
    const ok = polygon?.length
      ? pointInPolygon(x, y, polygon)
      : pointInBBox(x, y, bbox || { x1: minX, x2: maxX, y1: minY, y2: maxY })
    if (!ok) continue
    filtered.push({
      ...rowToQueryFile(r),
      x,
      y,
      bpm: Number(r.mood_bpm) || 0,
    })
    if (filtered.length >= max) break
  }
  return { items: filtered, total: filtered.length }
}

export { VARIOUS_ARTISTS_NAME }
