import { Router } from 'express'
import {
  getMusicPaths,
  getSharedMusicPaths,
  getDownloadSavePath,
  getPathsAccessInfo,
  addMusicPath,
  updateMusicPath,
  removeMusicPath,
  addPersonalMusicPath,
  updatePersonalMusicPath,
  removePersonalMusicPath,
  setDownloadSavePath,
  setPersonalDownloadSavePath,
  setPathsMode,
  getSetupStatus,
  getEffectivePathsMode,
} from '../utils/filePaths.js'
import { onMusicPathRemoved, onMusicPathUpdated } from '../utils/libraryScanSettings.js'
import fs from 'fs'
import { countCachedTracks } from '../utils/libraryCache.js'

import { requireAdmin } from '../middleware/auth.js'

export const pathsRouter = Router()

function pathsPayload(userId) {
  return getPathsAccessInfo(userId)
}

const STATS_CACHE_TTL_MS = 60_000
/** @type {Map<string, { at: number, data: object }>} */
const statsCache = new Map()

function getMusicLibraryStats(roots, { probeDisk = false } = {}) {
  const musicPaths = roots || getSharedMusicPaths()
  const dirs = []
  let totalTracks = 0

  for (const dir of musicPaths) {
    let readable = true
    let error = ''
    // 默认不每次打开页面都 stat 音乐根目录（索引计数已够用）；probeDisk 才碰盘
    if (probeDisk) {
      try {
        readable = fs.existsSync(dir) && fs.statSync(dir).isDirectory()
      } catch (e) {
        readable = false
        error = e.message || '不可读'
      }
    }
    const count = countCachedTracks([dir])
    totalTracks += count
    dirs.push({
      path: dir,
      count,
      readable,
      error,
    })
  }

  return {
    musicDirs: musicPaths.length,
    totalTracks,
    dirs,
    fromIndex: true,
  }
}

pathsRouter.get('/stats', (req, res) => {
  const info = pathsPayload(req.user?.id)
  // 管理员设置页统计共用库；普通用户统计当前生效库
  const roots = req.user?.role === 'admin' ? info.sharedMusicPaths : info.musicPaths
  const probeDisk = String(req.query.probe || '') === '1'
  const cacheKey = `${req.user?.id || 'anon'}:${(roots || []).join('|')}:${probeDisk ? '1' : '0'}`
  const hit = statsCache.get(cacheKey)
  if (hit && Date.now() - hit.at < STATS_CACHE_TTL_MS) {
    return res.json({ ok: true, data: hit.data })
  }
  const data = getMusicLibraryStats(roots, { probeDisk })
  statsCache.set(cacheKey, { at: Date.now(), data })
  res.json({ ok: true, data })
})

pathsRouter.get('/', (req, res) => {
  const info = pathsPayload(req.user?.id)
  res.json({
    ok: true,
    data: info.musicPaths,
    ...info,
    setup: getSetupStatus(),
  })
})

/** 添加音乐库路径：管理员改共用；普通用户在专属模式下改自己的 */
pathsRouter.post('/', (req, res) => {
  try {
    const { dirPath, fromPicker, scope } = req.body || {}
    const user = req.user
    const wantPersonal = scope === 'personal'
      || (user?.role !== 'admin' && getEffectivePathsMode(user?.id) === 'personal')

    let data
    if (wantPersonal) {
      if (!user?.id) return res.status(401).json({ error: '未登录' })
      data = addPersonalMusicPath(user.id, dirPath, { fromPicker: Boolean(fromPicker) })
    } else {
      if (user?.role !== 'admin') {
        return res.status(403).json({ error: '仅管理员可修改共用音乐库路径' })
      }
      data = addMusicPath(dirPath, { fromPicker: Boolean(fromPicker) })
    }
    const info = pathsPayload(user?.id)
    res.json({ ok: true, data: wantPersonal ? data : data, musicPaths: info.musicPaths, ...info })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

pathsRouter.put('/', (req, res) => {
  try {
    const { oldPath, newPath, fromPicker, scope } = req.body || {}
    const user = req.user
    const wantPersonal = scope === 'personal'
      || (user?.role !== 'admin' && getEffectivePathsMode(user?.id) === 'personal')

    let data
    if (wantPersonal) {
      if (!user?.id) return res.status(401).json({ error: '未登录' })
      data = updatePersonalMusicPath(user.id, oldPath, newPath, { fromPicker: Boolean(fromPicker) })
      onMusicPathUpdated(oldPath, newPath)
    } else {
      if (user?.role !== 'admin') {
        return res.status(403).json({ error: '仅管理员可修改共用音乐库路径' })
      }
      data = updateMusicPath(oldPath, newPath, { fromPicker: Boolean(fromPicker) })
      onMusicPathUpdated(oldPath, newPath)
    }
    const info = pathsPayload(user?.id)
    res.json({ ok: true, data, musicPaths: info.musicPaths, ...info })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

pathsRouter.delete('/', (req, res) => {
  try {
    const { dirPath, scope } = req.body || {}
    const user = req.user
    const wantPersonal = scope === 'personal'
      || (user?.role !== 'admin' && getEffectivePathsMode(user?.id) === 'personal')

    let data
    if (wantPersonal) {
      if (!user?.id) return res.status(401).json({ error: '未登录' })
      data = removePersonalMusicPath(user.id, dirPath)
      onMusicPathRemoved(dirPath)
    } else {
      if (user?.role !== 'admin') {
        return res.status(403).json({ error: '仅管理员可修改共用音乐库路径' })
      }
      data = removeMusicPath(dirPath)
      onMusicPathRemoved(dirPath)
    }
    const info = pathsPayload(user?.id)
    res.json({ ok: true, data, musicPaths: info.musicPaths, ...info })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

/** 管理员设置共用下载目录 */
pathsRouter.put('/download', requireAdmin, (req, res) => {
  try {
    const { dirPath, fromPicker } = req.body
    const shared = setDownloadSavePath(dirPath, { fromPicker: Boolean(fromPicker) })
    const info = pathsPayload(req.user?.id)
    res.json({
      ok: true,
      downloadPath: getDownloadSavePath(req.user?.id),
      sharedDownloadPath: shared,
      data: info.musicPaths,
      ...info,
    })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

/** 切换管理员路径 / 专属路径（仅策略为 choose 时） */
pathsRouter.put('/download/mode', (req, res) => {
  try {
    const mode = req.body?.mode === 'personal' ? 'personal' : 'shared'
    const info = setPathsMode(req.user.id, mode)
    res.json({ ok: true, ...info })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

/** 设置个人下载目录 */
pathsRouter.put('/download/personal', (req, res) => {
  try {
    const { dirPath, fromPicker, enable = true } = req.body || {}
    if (!dirPath) {
      const info = setPathsMode(req.user.id, enable === false ? 'shared' : 'personal')
      return res.json({ ok: true, ...info })
    }
    const info = setPersonalDownloadSavePath(req.user.id, dirPath, {
      fromPicker: Boolean(fromPicker),
      enable: enable !== false,
    })
    res.json({ ok: true, ...info })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})
