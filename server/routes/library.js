import { Router } from 'express'
import { getMusicPaths } from '../utils/filePaths.js'
import {
  getAllCachedTracks,
  syncLibraryIndex,
  scanBatchAndCache,
} from '../utils/libraryCache.js'
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
libraryRouter.post('/sync', (_req, res) => {
  try {
    const dirs = getMusicPaths()
    const result = syncLibraryIndex(dirs)
    if (result.removed.length) {
      notifyLibraryRemoved(result.removed)
    }
    res.json({ ok: true, data: result })
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
libraryRouter.get('/user-data', (_req, res) => {
  try {
    const data = getLibraryUserData()
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
    setLibraryUserData({ playlists, favorites, recentPlays, revision })
    notifyLibraryUserDataChanged()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 读取用户自定义歌单（兼容旧接口） */
libraryRouter.get('/playlists', (_req, res) => {
  try {
    const data = getCustomPlaylists()
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
    setCustomPlaylists(playlists)
    notifyLibraryUserDataChanged()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
