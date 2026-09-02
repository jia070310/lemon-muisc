import { Router } from 'express'
import { getMusicPaths } from '../utils/filePaths.js'
import {
  getAllCachedTracks,
  syncLibraryIndex,
  scanBatchAndCache,
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
