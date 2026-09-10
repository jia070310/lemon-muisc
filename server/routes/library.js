import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import {
  getMusicPaths,
  isAllowedMediaPath,
  addMusicPath,
  resolveReal,
} from '../utils/filePaths.js'
import { listAudioFiles } from '../utils/audioScan.js'
import {
  getAllCachedTracks,
  syncLibraryIndex,
  scanBatchAndCache,
  removeCachePaths,
} from '../utils/libraryCache.js'
import {
  getLibraryScanStatus,
  startLibraryScanJob,
} from '../utils/libraryScanJob.js'
import {
  getLibraryScanSettings,
  setLibraryScanSettings,
  resolveScanDirs,
  isPartialScan,
} from '../utils/libraryScanSettings.js'
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

/** 读取已缓存的音乐库索引（秒开） */
libraryRouter.get('/tracks', (_req, res) => {
  try {
    const data = getAllCachedTracks()
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 比对磁盘与缓存，返回已缓存、待扫描、已删除列表 */
libraryRouter.post('/sync', (req, res) => {
  try {
    const dirs = resolveScanDirs(req.body?.dirs)
    const partial = isPartialScan(dirs)
    const result = syncLibraryIndex(dirs, { partial })
    if (result.removed.length) {
      notifyLibraryRemoved(result.removed)
    }
    res.json({ ok: true, data: result, scan: getLibraryScanStatus(), dirs })
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
    const { autoMode, autoDirs } = req.body || {}
    const data = setLibraryScanSettings({ autoMode, autoDirs })
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
    const dirs = scanAll ? getMusicPaths().filter(Boolean) : resolveScanDirs(req.body?.dirs)
    const partial = isPartialScan(dirs)
    const syncResult = syncLibraryIndex(dirs, { partial })
    if (syncResult.removed.length) {
      notifyLibraryRemoved(syncResult.removed)
    }
    const scan = startLibraryScanJob({ force, syncResult, dirs })
    res.json({
      ok: true,
      data: syncResult,
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
libraryRouter.get('/duplicates', (_req, res) => {
  try {
    const tracks = getAllCachedTracks() || []
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
    if (filePaths.length > 50) return res.status(400).json({ error: '单次最多删除 50 个文件' })

    const deleted = []
    const failed = []
    for (const filePath of filePaths) {
      try {
        // allowMissing：文件可能已被移走（整理/外部删除）但缓存仍残留。
        // 这种"幽灵记录"只要路径仍归属音乐库/下载目录，就按已删除处理并清理缓存。
        if (!isAllowedMediaPath(filePath, { allowMissing: true })) {
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

const ARTIST_SPLIT_RE = /[、,，/;；&]/

/** 将歌手字符串安全化为目录名：取第一位歌手、清除非法字符、保留中英文与常用符号 */
function artistToDirName(singerRaw) {
  const raw = String(singerRaw || '').trim()
  if (!raw) return '未知歌手'
  const first = raw.split(ARTIST_SPLIT_RE).map((s) => s.trim()).filter(Boolean)[0] || '未知歌手'
  const cleaned = first
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 80)
  return cleaned || '未知歌手'
}

function safeBaseName(fileName) {
  return String(fileName || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 200) || 'untitled'
}

/** 目录目标：允许音乐库根的子目录或外部目录；禁止根目录/音乐库根/音乐库根的上层目录 */
function assertOrganizeTargetAllowed(targetDir) {
  if (!targetDir || typeof targetDir !== 'string') {
    throw new Error('请填写整理的目标目录')
  }
  const resolved = path.resolve(String(targetDir).trim())
  const fsRoot = path.parse(resolved).root
  if (resolved === fsRoot) {
    throw new Error('目标目录不能是文件系统根目录')
  }
  const musicDirs = getMusicPaths().filter(Boolean)
  for (const dir of musicDirs) {
    const base = path.resolve(dir)
    // 目标 = 音乐库根 → 会把全部文件视为"已在目录内"，无意义
    if (resolved === base) {
      throw new Error('目标目录不能是音乐库根目录本身，请使用其子目录或新的外部目录')
    }
    // 目标是音乐库根的上层目录 → 同样会把全部文件视为"已在目录内"
    if (base.startsWith(resolved + path.sep)) {
      throw new Error('目标目录不能是音乐库目录的上层目录')
    }
  }
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

/** 解析整理范围，返回待整理的文件路径数组 */
function resolveOrganizeFiles(body = {}) {
  const mode = body.scope || 'all' // all | files | dir
  const input = body.filePaths || body.files

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
      if (fs.existsSync(full) && fs.statSync(full).isFile()) out.push(full)
    }
    if (!out.length) throw new Error('所选文件均不存在')
    return out
  }

  if (mode === 'dir') {
    const dir = String(body.dir || body.dirPath || '').trim()
    if (!dir) throw new Error('请选择要整理的文件夹')
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      throw new Error(`文件夹不存在：${dir}`)
    }
    return listAudioFiles(dir) // 递归列出该目录下全部音频
  }

  // all / 默认：整个音乐库
  const tracks = getAllCachedTracks() || []
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

/** 整理音乐库：按歌手将歌曲迁移到 目标目录/歌手名/ 下（支持按文件/文件夹范围） */
libraryRouter.post('/organize', async (req, res) => {
  try {
    const rawDir = req.body?.targetDir
    const targetDir = assertOrganizeTargetAllowed(rawDir)

    const srcPaths = resolveOrganizeFiles(req.body || {})
    if (!srcPaths.length) {
      return res.status(400).json({ error: '音乐库为空，无可整理的歌曲' })
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    // 是否已位于目标目录下的歌手子目录（跳过重复整理）
    const targetReal = resolveReal(targetDir).replace(/[\\/]+$/, '')

    // 路径 → 缓存曲目（含 singer/artist/album 标签）；未命中则按文件名兜底
    const tracksByPath = new Map(
      (getAllCachedTracks() || []).map((t) => [path.resolve(t.filePath || ''), t]),
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
      if (!isAllowedMediaPath(src)) {
        failed.push({ filePath: src, error: '路径不在允许的音乐库/下载目录内' })
        continue
      }

      const cached = tracksByPath.get(path.resolve(src))
      const artistDir = artistToDirName(
        cached?.artist || cached?.singer || cached?.parsedArtist || '',
      )

      const artistFolder = path.join(targetDir, artistDir)
      const srcExt = path.extname(src).toLowerCase()
      const fileName = safeBaseName(path.basename(src, srcExt)) + srcExt
      let dest = path.join(artistFolder, fileName)

      // 处理文件名冲突：与源相同则跳过；已存在则追加序号
      if (resolveReal(src) === resolveReal(dest) && path.dirname(srcReal) === artistFolder) {
        skipped.push({ filePath: src, reason: '已在对应歌手目录' })
        continue
      }

      let n = 1
      while (fs.existsSync(dest) && resolveReal(dest) !== resolveReal(src)) {
        dest = path.join(artistFolder, `${safeBaseName(path.basename(src, srcExt))} (${n})${srcExt}`)
        n++
      }

      try {
        fs.mkdirSync(artistFolder, { recursive: true })
        moveFile(src, dest)
        moved.push({ from: src, to: dest, artist: artistDir })
      } catch (e) {
        failed.push({ filePath: src, error: e.message || '迁移失败' })
      }
    }

    // 更新缓存：旧路径移除，新路径加入待扫描
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
      // 目标目录不在已配置音乐库内时，自动加入扫描列表
      try {
        if (!getMusicPaths().some((p) => resolveReal(p) === resolveReal(targetDir))) {
          addMusicPath(targetDir)
        }
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
        movedList: moved,
        failedList: failed,
        skippedList: skipped,
        artists: [...new Set(moved.map((m) => m.artist))].length,
      },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
