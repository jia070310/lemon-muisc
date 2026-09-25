import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import {
  getMusicPaths,
  getMusicPathsForUser,
  getAllMusicScanRoots,
  isAllowedMediaPath,
  isPathUnderMusicDirs,
  addMusicPath,
  addPersonalMusicPath,
  resolveReal,
  getDownloadSavePath,
  getEffectivePathsMode,
} from '../utils/filePaths.js'
import { listAudioFiles } from '../utils/audioScan.js'
import {
  getAllCachedTracks,
  syncLibraryIndex,
  scanBatchAndCache,
  removeCachePaths,
  renameCachePath,
  upsertCacheEntry,
  queryCachedTracks,
  queryArtists,
  queryAlbums,
  queryGenres,
  queryTracksByPaths,
  countCachedTracks,
  getMoodAnalyzeStats,
  queryMoodMapPoints,
  queryMoodTracksInRegion,
} from '../utils/libraryCache.js'
import { inspectFakeFlacFile } from '../utils/audioFormat.js'
import { parseFilename } from '../utils/filenameParse.js'
import {
  getLibraryScanStatus,
  startLibraryScanJob,
} from '../utils/libraryScanJob.js'
import {
  getMoodAnalyzeStatus,
  startMoodAnalyzeJob,
  stopMoodAnalyzeJob,
} from '../utils/moodAnalyzeJob.js'
import { MOOD_ALGO_VERSION } from '../utils/moodAnalyze.js'
import {
  getLibraryScanSettings,
  setLibraryScanSettings,
  resolveScanDirs,
  isPartialScan,
} from '../utils/libraryScanSettings.js'
import { restartLibraryAutoWatch } from '../utils/libraryAutoWatch.js'
import { splitArtists } from '../utils/artistTag.js'
import {
  notifyLibraryRemoved,
  notifyLibraryChanged,
  notifyLibraryUserDataChanged,
} from '../utils/libraryNotify.js'
import {
  getCustomPlaylists,
  setCustomPlaylists,
  getLibraryUserData,
  setLibraryUserData,
} from '../utils/libraryUserData.js'

export const libraryRouter = Router()

/** 读取音乐库曲目：默认分页；?all=1 仍返回全量（兼容整理等内部用途，前端勿用） */
libraryRouter.get('/tracks', (req, res) => {
  try {
    const userDirs = getMusicPathsForUser(req.user?.id)
    const wantAll = String(req.query.all || '') === '1'
    if (wantAll) {
      const data = getAllCachedTracks(userDirs)
      return res.json({ ok: true, data, total: data.length })
    }
    const result = queryCachedTracks({
      page: req.query.page,
      limit: req.query.limit,
      q: req.query.q,
      sort: req.query.sort,
      artist: req.query.artist,
      album: req.query.album,
      albumArtist: req.query.albumArtist,
      genre: req.query.genre,
      dirs: userDirs,
    })
    res.json({
      ok: true,
      data: result.items,
      total: result.total,
      page: result.page,
      limit: result.limit,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 曲库总数 */
libraryRouter.get('/tracks/count', (req, res) => {
  try {
    const userDirs = getMusicPathsForUser(req.user?.id)
    res.json({ ok: true, total: countCachedTracks(userDirs) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 按路径批量取曲（歌单 / 收藏解析） */
libraryRouter.post('/tracks/by-paths', (req, res) => {
  try {
    const paths = Array.isArray(req.body?.paths) ? req.body.paths : []
    if (paths.length > 2000) {
      return res.status(400).json({ error: '单次最多 2000 条路径' })
    }
    const userDirs = getMusicPathsForUser(req.user?.id)
    const data = queryTracksByPaths(paths, { limit: paths.length || 500 })
      .filter((t) => isPathUnderMusicDirs(t.filePath || t.localPath, userDirs))
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 歌手聚合分页 */
libraryRouter.get('/artists', (req, res) => {
  try {
    const userDirs = getMusicPathsForUser(req.user?.id)
    const result = queryArtists({
      page: req.query.page,
      limit: req.query.limit,
      q: req.query.q,
      sort: req.query.sort,
      dirs: userDirs,
    })
    res.json({
      ok: true,
      data: result.items,
      total: result.total,
      page: result.page,
      limit: result.limit,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 专辑聚合分页 */
libraryRouter.get('/albums', (req, res) => {
  try {
    const userDirs = getMusicPathsForUser(req.user?.id)
    const result = queryAlbums({
      page: req.query.page,
      limit: req.query.limit,
      q: req.query.q,
      sort: req.query.sort,
      artist: req.query.artist,
      dirs: userDirs,
    })
    res.json({
      ok: true,
      data: result.items,
      total: result.total,
      page: result.page,
      limit: result.limit,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 风格聚合分页 */
libraryRouter.get('/genres', (req, res) => {
  try {
    const userDirs = getMusicPathsForUser(req.user?.id)
    const result = queryGenres({
      page: req.query.page,
      limit: req.query.limit,
      q: req.query.q,
      sort: req.query.sort,
      dirs: userDirs,
    })
    res.json({
      ok: true,
      data: result.items,
      total: result.total,
      page: result.page,
      limit: result.limit,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 比对磁盘与缓存，返回已缓存、待扫描、已删除列表 */
libraryRouter.post('/sync', (req, res) => {
  try {
    const userId = req.user?.id
    const dirs = resolveScanDirs(req.body?.dirs, userId)
    const partial = isPartialScan(dirs, userId)
    const result = syncLibraryIndex(dirs, { partial })
    if (result.removed.length) {
      notifyLibraryRemoved(result.removed)
    }
    res.json({
      ok: true,
      data: {
        cached: [],
        pending: [],
        removed: result.removed || [],
        cachedCount: result.cached?.length || 0,
        pendingCount: result.pending?.length || 0,
        total: result.total || 0,
      },
      scan: getLibraryScanStatus(),
      dirs,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 音乐库扫描配置：自动扫描哪些目录 */
libraryRouter.get('/scan-settings', (_req, res) => {
  try {
    res.json({ ok: true, data: getLibraryScanSettings() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

libraryRouter.put('/scan-settings', (req, res) => {
  try {
    const { autoMode, autoDirs, watchEnabled, watchIntervalSec } = req.body || {}
    const data = setLibraryScanSettings({ autoMode, autoDirs, watchEnabled, watchIntervalSec })
    restartLibraryAutoWatch()
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 启动服务端后台扫描（关闭页面后仍会继续） */
libraryRouter.post('/scan-start', (req, res) => {
  try {
    const force = Boolean(req.body?.force)
    const scanAll = Boolean(req.body?.scanAll)
    const userId = req.user?.id
    const userDirs = getMusicPathsForUser(userId)
    // 全库扫描仅管理员扫全部租户根；普通/专属用户只扫自己的生效路径
    const dirs = scanAll
      ? (req.user?.role === 'admin' ? getAllMusicScanRoots().filter(Boolean) : userDirs)
      : resolveScanDirs(req.body?.dirs, userId)
    const partial = isPartialScan(dirs, userId)
    const syncResult = syncLibraryIndex(dirs, { partial })
    if (syncResult.removed.length) {
      notifyLibraryRemoved(syncResult.removed)
    }
    const scan = startLibraryScanJob({ force, syncResult, dirs })
    res.json({
      ok: true,
      data: {
        // 不再下发全量 cached/pending，避免前端持有整库
        cached: [],
        pending: [],
        removed: syncResult.removed || [],
        cachedCount: syncResult.cached?.length || 0,
        pendingCount: syncResult.pending?.length || 0,
        total: syncResult.total || 0,
      },
      scan,
      dirs,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 查询后台扫描状态 */
libraryRouter.get('/scan-status', (_req, res) => {
  try {
    res.json({ ok: true, scan: getLibraryScanStatus() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 启动本地情绪分析（SensMe 风格） */
libraryRouter.post('/mood/analyze-start', async (req, res) => {
  try {
    const { assertFfmpegFeatureReady } = await import('../utils/apePlay.js')
    await assertFfmpegFeatureReady('进行情绪分析')
    const force = Boolean(req.body?.force)
    const mood = startMoodAnalyzeJob({ force })
    if (mood.blocked) {
      return res.status(409).json({ error: mood.errorMsg || '曲库正在扫描', mood })
    }
    res.json({ ok: true, mood })
  } catch (e) {
    const status = /未找到 ffmpeg|尚未启用|尚未检测到 ffmpeg/i.test(String(e?.message || '')) ? 400 : 500
    res.status(status).json({ error: e.message })
  }
})

libraryRouter.post('/mood/analyze-stop', (_req, res) => {
  try {
    const mood = stopMoodAnalyzeJob()
    res.json({ ok: true, mood })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

libraryRouter.get('/mood/analyze-status', (_req, res) => {
  try {
    res.json({ ok: true, mood: getMoodAnalyzeStatus() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 情绪地图散点 */
libraryRouter.get('/mood-map', (req, res) => {
  try {
    const limit = Number.parseInt(req.query.limit, 10) || 5000
    const userDirs = getMusicPathsForUser(req.user?.id)
    const data = queryMoodMapPoints({ limit, dirs: userDirs })
    const stats = getMoodAnalyzeStats({ algoVersion: MOOD_ALGO_VERSION, dirs: userDirs })
    res.json({
      ok: true,
      data: {
        ...data,
        stats,
        algoVersion: MOOD_ALGO_VERSION,
      },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 圈选区域查轨 */
libraryRouter.post('/mood-map/tracks', (req, res) => {
  try {
    const { bbox, polygon, limit } = req.body || {}
    if (!bbox && !(Array.isArray(polygon) && polygon.length >= 3)) {
      return res.status(400).json({ error: '请提供 bbox 或 polygon' })
    }
    const userDirs = getMusicPathsForUser(req.user?.id)
    const data = queryMoodTracksInRegion({
      bbox: bbox || null,
      polygon: Array.isArray(polygon) ? polygon : null,
      limit: Number.parseInt(limit, 10) || 500,
      dirs: userDirs,
    })
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 批量读取标签并写入缓存 */
libraryRouter.post('/scan-batch', async (req, res) => {
  try {
    const { files } = req.body
    if (!Array.isArray(files) || !files.length) {
      return res.status(400).json({ error: '请提供文件列表' })
    }
    if (files.length > 100) {
      return res.status(400).json({ error: '单次最多扫描 100 个文件' })
    }
    const data = await scanBatchAndCache(files)
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 规范化查重字段：小写、压缩空白 */
function normalizeDupField(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * 查重身份：优先文件名解析的标题/歌手。
 * 内嵌标签常被批量写错（多首共用同一 title），会导致不同文件名被误判为重复。
 */
function resolveDupIdentity(track) {
  const parsedTitle = normalizeDupField(track.parsedTitle)
  const parsedArtist = normalizeDupField(track.parsedArtist)
  const tagTitle = normalizeDupField(track.title)
  const tagArtist = normalizeDupField(track.artist)
  const title = parsedTitle || tagTitle
  const artist = parsedArtist || tagArtist
  return {
    title,
    artist,
    displayTitle: track.parsedTitle || track.title || '',
    displayArtist: track.parsedArtist || track.artist || '',
  }
}

/** 检测重复曲目（同标题+歌手；优先文件名解析，忽略大小写与空白） */
libraryRouter.get('/duplicates', (req, res) => {
  try {
    const userDirs = getMusicPathsForUser(req.user?.id)
    const tracks = getAllCachedTracks(userDirs) || []
    const groups = new Map()
    for (const t of tracks) {
      const id = resolveDupIdentity(t)
      if (!id.title) continue
      const key = `${id.title}\n${id.artist}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push({
        filePath: t.filePath,
        fileName: t.fileName,
        title: id.displayTitle || t.title || '',
        artist: id.displayArtist || t.artist || '',
        album: t.album || '',
        duration: t.duration || 0,
        bitrate: t.bitrate || 0,
      })
    }
    const duplicates = [...groups.values()]
      .filter((g) => g.length > 1)
      .map((files) => ({
        title: files[0].title,
        artist: files[0].artist,
        count: files.length,
        files,
      }))
      .sort((a, b) => b.count - a.count)
    res.json({
      ok: true,
      data: {
        groupCount: duplicates.length,
        fileCount: duplicates.reduce((n, g) => n + g.count, 0),
        groups: duplicates.slice(0, 200),
      },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 物理删除音乐库内文件（仅允许音乐库/下载目录下的文件） */
libraryRouter.post('/delete-files', (req, res) => {
  try {
    const raw = req.body?.filePaths ?? req.body?.paths ?? req.body?.filePath
    const list = Array.isArray(raw) ? raw : (raw ? [raw] : [])
    const filePaths = [...new Set(list.map((p) => String(p || '').trim()).filter(Boolean))]
    if (!filePaths.length) return res.status(400).json({ error: '请指定要删除的文件' })

    const deleted = []
    const failed = []
    for (const filePath of filePaths) {
      try {
        // allowMissing：文件可能已被移走（整理/外部删除）但缓存仍残留。
        // 这种"幽灵记录"只要路径仍归属音乐库/下载目录，就按已删除处理并清理缓存。
        if (!isAllowedMediaPath(filePath, { allowMissing: true, userId: req.user?.id })) {
          failed.push({ filePath, error: '路径不在允许的音乐库/下载目录内' })
          continue
        }
        const resolved = path.resolve(filePath)
        if (fs.existsSync(resolved)) {
          fs.unlinkSync(resolved)
        }
        deleted.push(resolved)
      } catch (e) {
        failed.push({ filePath, error: e.message || '删除失败' })
      }
    }

    if (deleted.length) {
      removeCachePaths(deleted)
      notifyLibraryRemoved(deleted, { reason: 'manual-delete' })
    }

    res.json({
      ok: true,
      deleted: deleted.length,
      failed: failed.length,
      data: { deleted, failed },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

function collectFakeFlacScanRoots(userId = null) {
  const roots = []
  for (const p of (userId ? getMusicPathsForUser(userId) : getMusicPaths()) || []) {
    if (p) roots.push(path.resolve(p))
  }
  try {
    const dl = getDownloadSavePath(userId)
    if (dl) roots.push(path.resolve(dl))
  } catch {}
  const seen = new Set()
  const out = []
  for (const r of roots) {
    const key = r.replace(/\\/g, '/').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

/** 扫描音乐库 / 下载目录中扩展名为 .flac、但文件头不符（或过小）的伪无损 */
libraryRouter.post('/scan-fake-flac', (req, res) => {
  try {
    const dirRaw = String(req.body?.dirPath || '').trim()
    let roots = collectFakeFlacScanRoots(req.user?.id)
    if (dirRaw) {
      const resolved = path.resolve(dirRaw)
      if (!fs.existsSync(resolved)) {
        return res.status(400).json({ error: `目录不存在：${dirRaw}` })
      }
      const under = roots.some((root) => {
        const a = resolved.replace(/\\/g, '/').toLowerCase()
        const b = root.replace(/\\/g, '/').toLowerCase()
        return a === b || a.startsWith(`${b}/`)
      })
      if (!under) {
        return res.status(400).json({ error: '目录不在已配置的音乐库/下载路径内' })
      }
      roots = [resolved]
    }
    if (!roots.length) {
      return res.status(400).json({ error: '请先在设置中配置音乐库路径' })
    }

    let scanned = 0
    const fakes = []
    for (const root of roots) {
      if (!fs.existsSync(root)) continue
      const files = listAudioFiles(root)
      for (const fp of files) {
        if (path.extname(fp).toLowerCase() !== '.flac') continue
        scanned += 1
        const info = inspectFakeFlacFile(fp)
        if (!info.fake) continue
        fakes.push({
          filePath: fp,
          fileName: path.basename(fp),
          kind: info.kind,
          size: info.size,
          reason: info.reason,
          suggestedExt: info.suggestedExt,
          issue: info.issue,
        })
        if (fakes.length >= 500) break
      }
      if (fakes.length >= 500) break
    }

    res.json({
      ok: true,
      data: {
        scanned,
        fakeCount: fakes.length,
        truncated: fakes.length >= 500,
        files: fakes,
      },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

const AUDIO_RENAME_EXTS = new Set(['.mp3', '.flac', '.wav', '.ape', '.ogg', '.m4a', '.aac', '.wma'])

function sanitizeAudioFileName(raw, fallbackExt = '.mp3') {
  let name = String(raw || '').trim()
  name = path.basename(name.replace(/\\/g, '/'))
  name = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
  if (!name) return null
  let ext = path.extname(name).toLowerCase()
  let base = ext ? name.slice(0, -ext.length) : name
  base = base.replace(/[. ]+$/g, '').trim()
  if (!base) return null
  if (!ext || !AUDIO_RENAME_EXTS.has(ext)) {
    const fb = String(fallbackExt || '.mp3').toLowerCase()
    ext = AUDIO_RENAME_EXTS.has(fb) ? fb : '.mp3'
  }
  return `${base}${ext}`.slice(0, 200)
}

/** 重命名音乐库/下载目录内的音频文件（仅改文件名，不移动目录） */
libraryRouter.post('/rename-file', (req, res) => {
  try {
    const filePath = String(req.body?.filePath || '').trim()
    const newNameRaw = String(req.body?.newName || req.body?.fileName || '').trim()
    if (!filePath) return res.status(400).json({ error: '请指定文件' })
    if (!newNameRaw) return res.status(400).json({ error: '请输入新文件名' })
    if (!isAllowedMediaPath(filePath, { userId: req.user?.id })) {
      return res.status(403).json({ error: '路径不在允许的音乐库/下载目录内' })
    }

    const resolved = path.resolve(filePath)
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return res.status(404).json({ error: '文件不存在' })
    }

    const oldExt = path.extname(resolved).toLowerCase() || '.mp3'
    const safeName = sanitizeAudioFileName(newNameRaw, oldExt)
    if (!safeName) return res.status(400).json({ error: '文件名无效' })

    const dir = path.dirname(resolved)
    const dest = path.resolve(dir, safeName)
    if (path.dirname(dest) !== dir) {
      return res.status(400).json({ error: '不允许改变文件所在目录' })
    }
    if (!isAllowedMediaPath(dest, { allowMissing: true, userId: req.user?.id })) {
      return res.status(403).json({ error: '目标路径不在允许的音乐库/下载目录内' })
    }

    const samePath = dest.replace(/\\/g, '/').toLowerCase() === resolved.replace(/\\/g, '/').toLowerCase()
    if (samePath) {
      return res.json({
        ok: true,
        data: {
          from: resolved,
          to: resolved,
          fileName: path.basename(resolved),
          unchanged: true,
        },
      })
    }
    if (fs.existsSync(dest)) {
      return res.status(409).json({ error: `目标已存在：${safeName}` })
    }

    fs.renameSync(resolved, dest)
    const renamedInCache = renameCachePath(resolved, dest)
    if (!renamedInCache) {
      removeCachePaths([resolved])
      try {
        const st = fs.statSync(dest)
        const parsed = parseFilename(path.basename(dest))
        upsertCacheEntry(dest, st.mtimeMs || 0, st.size || 0, {
          fileName: path.basename(dest),
          parsedTitle: parsed.title,
          parsedArtist: parsed.artist,
          title: parsed.title,
          artist: parsed.artist,
          format: path.extname(dest).replace(/^\./, '').toLowerCase(),
        })
      } catch {}
    }
    notifyLibraryRemoved([resolved], { reason: 'rename' })
    notifyLibraryChanged([dest], { reason: 'rename' })

    res.json({
      ok: true,
      data: {
        from: resolved,
        to: dest,
        fileName: path.basename(dest),
        unchanged: false,
      },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 读取用户库数据：歌单、收藏、最近播放 */
libraryRouter.get('/user-data', (req, res) => {
  try {
    const data = getLibraryUserData(req.user.id)
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 保存用户库数据（可部分更新） */
libraryRouter.put('/user-data', (req, res) => {
  try {
    const { playlists, favorites, recentPlays, revision } = req.body || {}
    if (playlists !== undefined && !Array.isArray(playlists)) {
      return res.status(400).json({ error: 'playlists 必须是数组' })
    }
    if (favorites !== undefined && !Array.isArray(favorites)) {
      return res.status(400).json({ error: 'favorites 必须是数组' })
    }
    if (recentPlays !== undefined && !Array.isArray(recentPlays)) {
      return res.status(400).json({ error: 'recentPlays 必须是数组' })
    }
    setLibraryUserData(req.user.id, { playlists, favorites, recentPlays, revision })
    notifyLibraryUserDataChanged(req.user.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 读取用户自定义歌单（兼容旧接口） */
libraryRouter.get('/playlists', (req, res) => {
  try {
    const data = getCustomPlaylists(req.user.id)
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 保存用户自定义歌单（兼容旧接口） */
libraryRouter.put('/playlists', (req, res) => {
  try {
    const { playlists } = req.body
    if (!Array.isArray(playlists)) {
      return res.status(400).json({ error: '请提供歌单数组' })
    }
    setCustomPlaylists(req.user.id, playlists)
    notifyLibraryUserDataChanged(req.user.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 多歌手合辑归档目录名 */
const VARIOUS_ARTISTS_DIR = '群星 (Various Artists)'

function sanitizeArtistDirSegment(name) {
  const cleaned = String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 80)
  return cleaned || '未知歌手'
}

/** 将歌手/专辑艺术家安全化为目录名；多歌手统一归档到「群星 (Various Artists)」 */
function artistToDirName(singerRaw) {
  const artists = splitArtists(singerRaw)
  if (artists.length >= 2) return VARIOUS_ARTISTS_DIR
  return sanitizeArtistDirSegment(artists[0] || '未知歌手')
}

/** 多歌手取第一位（合唱归主唱专辑） */
function primaryArtistToDirName(singerRaw) {
  const artists = splitArtists(singerRaw)
  return sanitizeArtistDirSegment(artists[0] || '未知歌手')
}

/** 专辑目录名 */
function albumToDirName(albumRaw) {
  const raw = String(albumRaw || '').trim()
  if (!raw || raw === '未知专辑') return '未知专辑'
  const cleaned = raw
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 80)
  return cleaned || '未知专辑'
}

/**
 * 优先专辑艺术家，否则歌手；再配专辑名 → 目标/<艺术家>/<专辑>/
 * @param {'primary'|'various'} mode primary=多歌手取第一位；various=多歌手进群星（旧行为）
 */
function resolveOrganizeDestDirs(cached = {}, mode = 'primary') {
  const albumArtist = String(cached.albumArtist || '').trim()
  const singer = cached.artist || cached.singer || cached.parsedArtist || ''
  const raw = albumArtist || singer
  const artistMode = mode === 'various' ? 'various' : 'primary'
  return {
    artistDir: artistMode === 'various' ? artistToDirName(raw) : primaryArtistToDirName(raw),
    albumDir: albumToDirName(cached.album),
  }
}

function safeBaseName(fileName) {
  return String(fileName || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 200) || 'untitled'
}

/** 目录目标：允许音乐库根的子目录或外部目录；禁止根目录/音乐库根/音乐库根的上层目录 */
function assertOrganizeTargetAllowed(targetDir, userId = null) {
  if (!targetDir || typeof targetDir !== 'string') {
    throw new Error('请填写整理的目标目录')
  }
  const resolved = path.resolve(String(targetDir).trim())
  const fsRoot = path.parse(resolved).root
  if (resolved === fsRoot) {
    throw new Error('目标目录不能是文件系统根目录')
  }
  const musicDirs = (userId ? getMusicPathsForUser(userId) : getMusicPaths()).filter(Boolean)
  for (const dir of musicDirs) {
    const base = path.resolve(dir)
    // 目标是音乐库根的上层目录 → 会把全部文件视为"已在目录内"，且可能越权扫全盘
    if (base.startsWith(resolved + path.sep)) {
      throw new Error('目标目录不能是音乐库目录的上层目录')
    }
  }
  // 目标目录等于某音乐库根（含整理成功后自动加入音乐库的目标目录）是允许的：
  // 整理是文件级移动，已在目标目录内的文件由 resolveOrganizeFiles/skip 单独判断（"已在目标目录内"），不会误整。
  return resolved
}

/** 移动文件：同文件系统用 rename；跨文件系统(EXDEV)时退化为复制+删除 */
function moveFile(src, dest) {
  try {
    fs.renameSync(src, dest)
  } catch (e) {
    if (e?.code === 'EXDEV') {
      fs.copyFileSync(src, dest)
      fs.unlinkSync(src)
    } else {
      throw e
    }
  }
}

/** 整理后清理空源目录：向上删除空文件夹，但不碰音乐库根 / 下载根 / 目标目录 */
function pruneEmptyDirsAfterOrganize(movedFromPaths, targetDir, userId = null) {
  const stopRoots = new Set()
  for (const p of (userId ? getMusicPathsForUser(userId) : getMusicPaths())) {
    try { if (p) stopRoots.add(resolveReal(p)) } catch {}
  }
  try {
    const dl = getDownloadSavePath(userId)
    if (dl) stopRoots.add(resolveReal(dl))
  } catch {}
  try {
    if (targetDir) stopRoots.add(resolveReal(targetDir))
  } catch {}

  const candidates = [...new Set(
    (movedFromPaths || [])
      .map((p) => {
        try { return path.dirname(path.resolve(String(p))) } catch { return '' }
      })
      .filter(Boolean),
  )].sort((a, b) => b.length - a.length)

  let removed = 0
  for (const start of candidates) {
    let dir = start
    while (dir) {
      let real = ''
      try { real = resolveReal(dir) } catch { break }
      if (!real || stopRoots.has(real)) break
      if (!isAllowedMediaPath(dir, { userId, allowMissing: true })) break
      try {
        if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) break
        const entries = fs.readdirSync(dir)
        if (entries.length > 0) break
        fs.rmdirSync(dir)
        removed += 1
        const parent = path.dirname(dir)
        if (!parent || parent === dir) break
        dir = parent
      } catch {
        break
      }
    }
  }
  return removed
}

/** 解析整理范围，返回待整理的文件路径数组 */
function resolveOrganizeFiles(body = {}, userId = null) {
  const mode = body.scope || 'all' // all | files | dir
  const input = body.filePaths || body.files
  const userDirs = userId ? getMusicPathsForUser(userId) : getMusicPaths()

  if (mode === 'files') {
    const list = Array.isArray(input) ? input : []
    if (!list.length) throw new Error('请选择要整理的文件')
    const seen = new Set()
    const out = []
    for (const p of list) {
      if (!p) continue
      const full = path.resolve(String(p))
      if (seen.has(full)) continue
      seen.add(full)
      if (!isAllowedMediaPath(full, { userId })) continue
      if (fs.existsSync(full) && fs.statSync(full).isFile()) out.push(full)
    }
    if (!out.length) throw new Error('所选文件均不存在或不在你的音乐库路径内')
    return out
  }

  if (mode === 'dir') {
    const dir = String(body.dir || body.dirPath || '').trim()
    if (!dir) throw new Error('请选择要整理的文件夹')
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      throw new Error(`文件夹不存在：${dir}`)
    }
    if (!isPathUnderMusicDirs(dir, userDirs) && !isAllowedMediaPath(dir, { userId, allowMissing: true })) {
      throw new Error('该文件夹不在你的音乐库路径内')
    }
    return listAudioFiles(dir) // 递归列出该目录下全部音频
  }

  // all / 默认：当前用户生效音乐库
  const tracks = getAllCachedTracks(userDirs) || []
  const out = []
  const seen = new Set()
  for (const t of tracks) {
    const p = t?.filePath
    if (!p || seen.has(p)) continue
    seen.add(p)
    out.push(p)
  }
  return out
}

/** 整理音乐库：迁移到 目标目录/专辑艺术家(或歌手)/专辑/文件 */
libraryRouter.post('/organize', async (req, res) => {
  try {
    const userId = req.user?.id
    const rawDir = req.body?.targetDir
    const targetDir = assertOrganizeTargetAllowed(rawDir, userId)

    const artistMode = String(req.body?.artistMode || '').trim() === 'various' ? 'various' : 'primary'

    const srcPaths = resolveOrganizeFiles(req.body || {}, userId)
    if (!srcPaths.length) {
      return res.status(400).json({ error: '音乐库为空，无可整理的歌曲' })
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    // 是否已位于目标目录下（跳过重复整理）
    const targetReal = resolveReal(targetDir).replace(/[\\/]+$/, '')

    // 路径 → 缓存曲目（含 albumArtist/artist/album）；未命中则按文件名兜底
    const userDirs = getMusicPathsForUser(userId)
    const tracksByPath = new Map(
      (getAllCachedTracks(userDirs) || []).map((t) => [path.resolve(t.filePath || ''), t]),
    )

    const moved = []
    const failed = []
    const skipped = []

    for (const src of srcPaths) {
      if (!src || !fs.existsSync(src)) {
        skipped.push({ filePath: src, reason: '文件不存在' })
        continue
      }
      const srcReal = resolveReal(src)
      if (srcReal.startsWith(targetReal + path.sep)) {
        skipped.push({ filePath: src, reason: '已在目标目录内' })
        continue
      }
      if (!isAllowedMediaPath(src, { userId })) {
        failed.push({ filePath: src, error: '路径不在允许的音乐库/下载目录内' })
        continue
      }

      const cached = tracksByPath.get(path.resolve(src)) || {}
      const { artistDir, albumDir } = resolveOrganizeDestDirs(cached, artistMode)
      const albumFolder = path.join(targetDir, artistDir, albumDir)
      const srcExt = path.extname(src).toLowerCase()
      const fileName = safeBaseName(path.basename(src, srcExt)) + srcExt
      let dest = path.join(albumFolder, fileName)

      // 处理文件名冲突：与源相同则跳过；已存在则追加序号
      if (resolveReal(src) === resolveReal(dest) && path.dirname(srcReal) === albumFolder) {
        skipped.push({ filePath: src, reason: '已在对应专辑目录' })
        continue
      }

      let n = 1
      while (fs.existsSync(dest) && resolveReal(dest) !== resolveReal(src)) {
        dest = path.join(albumFolder, `${safeBaseName(path.basename(src, srcExt))} (${n})${srcExt}`)
        n++
      }

      try {
        fs.mkdirSync(albumFolder, { recursive: true })
        moveFile(src, dest)
        moved.push({ from: src, to: dest, artist: artistDir, album: albumDir })
      } catch (e) {
        failed.push({ filePath: src, error: e.message || '迁移失败' })
      }
    }

    // 更新缓存：旧路径移除，新路径加入待扫描
    let cleanedDirs = 0
    if (moved.length) {
      removeCachePaths(moved.map((m) => m.from))
      const pending = moved
        .filter((m) => fs.existsSync(m.to))
        .map((m) => ({ filePath: m.to, mtime: 0, size: 0 }))
      if (pending.length) {
        try {
          await scanBatchAndCache(pending)
        } catch {}
      }
      // 目标目录不在已配置音乐库内时，自动加入当前用户的扫描列表
      try {
        const roots = getMusicPathsForUser(userId)
        if (!roots.some((p) => resolveReal(p) === resolveReal(targetDir))) {
          if (getEffectivePathsMode(userId) === 'personal') {
            addPersonalMusicPath(userId, targetDir)
          } else if (req.user?.role === 'admin') {
            addMusicPath(targetDir)
          }
        }
      } catch {}
      try {
        cleanedDirs = pruneEmptyDirsAfterOrganize(moved.map((m) => m.from), targetDir, userId)
      } catch {}
      notifyLibraryRemoved(moved.map((m) => m.from), { reason: 'organize' })
      notifyLibraryChanged(moved.map((m) => m.to), { reason: 'organize' })
    }

    res.json({
      ok: true,
      data: {
        targetDir,
        moved: moved.length,
        failed: failed.length,
        skipped: skipped.length,
        cleanedDirs,
        movedList: moved,
        failedList: failed,
        skippedList: skipped,
        artists: [...new Set(moved.map((m) => m.artist))].length,
        albums: [...new Set(moved.map((m) => `${m.artist}/${m.album}`))].length,
      },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
