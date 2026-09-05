import { Router } from 'express'
import path from 'path'
import {
  getMusicPaths,
  getDownloadSavePath,
  getDownloadPathInfo,
  addMusicPath,
  updateMusicPath,
  removeMusicPath,
  setDownloadSavePath,
  setPersonalDownloadSavePath,
  setDownloadPathMode,
  getSetupStatus,
} from '../utils/filePaths.js'
import { onMusicPathRemoved, onMusicPathUpdated } from '../utils/libraryScanSettings.js'
import { listAudioFiles, probeDir } from '../utils/audioScan.js'

import { requireAdmin } from '../middleware/auth.js'

export const pathsRouter = Router()

function downloadPayload(userId) {
  const info = getDownloadPathInfo(userId)
  return {
    downloadPath: info.savePath,
    sharedDownloadPath: info.sharedPath,
    personalDownloadPath: info.personalPath,
    downloadPathMode: info.mode,
    usePersonalDownloadPath: info.usePersonal,
  }
}

function getMusicLibraryStats() {
  const musicPaths = getMusicPaths()
  const seen = new Set()
  const dirs = []

  for (const dir of musicPaths) {
    const probe = probeDir(dir)
    let count = 0
    if (probe.readable) {
      try {
        const files = listAudioFiles(dir)
        count = files.length
        for (const filePath of files) {
          try { seen.add(path.resolve(filePath)) } catch { seen.add(filePath) }
        }
      } catch (e) {
        dirs.push({ path: dir, count: 0, readable: false, error: e.message })
        continue
      }
    }
    dirs.push({
      path: dir,
      count,
      readable: probe.readable,
      error: probe.error || '',
    })
  }

  return {
    musicDirs: musicPaths.length,
    totalTracks: seen.size,
    dirs,
  }
}

pathsRouter.get('/stats', (_req, res) => {
  res.json({ ok: true, data: getMusicLibraryStats() })
})

pathsRouter.get('/', (req, res) => {
  const musicPaths = getMusicPaths()
  res.json({
    ok: true,
    data: musicPaths,
    musicPaths,
    ...downloadPayload(req.user?.id),
    setup: getSetupStatus(),
  })
})

pathsRouter.post('/', requireAdmin, (req, res) => {
  try {
    const { dirPath, fromPicker } = req.body
    const data = addMusicPath(dirPath, { fromPicker: Boolean(fromPicker) })
    res.json({ ok: true, data, musicPaths: data, ...downloadPayload(req.user?.id) })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

pathsRouter.put('/', requireAdmin, (req, res) => {
  try {
    const { oldPath, newPath, fromPicker } = req.body
    const data = updateMusicPath(oldPath, newPath, { fromPicker: Boolean(fromPicker) })
    onMusicPathUpdated(oldPath, newPath)
    res.json({ ok: true, data, musicPaths: data, ...downloadPayload(req.user?.id) })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

pathsRouter.delete('/', requireAdmin, (req, res) => {
  try {
    const { dirPath } = req.body
    const data = removeMusicPath(dirPath)
    onMusicPathRemoved(dirPath)
    res.json({ ok: true, data, musicPaths: data, ...downloadPayload(req.user?.id) })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

/** 管理员设置共用下载目录 */
pathsRouter.put('/download', requireAdmin, (req, res) => {
  try {
    const { dirPath, fromPicker } = req.body
    const shared = setDownloadSavePath(dirPath, { fromPicker: Boolean(fromPicker) })
    res.json({
      ok: true,
      downloadPath: getDownloadSavePath(req.user?.id),
      sharedDownloadPath: shared,
      data: getMusicPaths(),
      musicPaths: getMusicPaths(),
      ...downloadPayload(req.user?.id),
    })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

/** 任意登录用户：切换共用 / 个人下载目录 */
pathsRouter.put('/download/mode', (req, res) => {
  try {
    const mode = req.body?.mode === 'personal' ? 'personal' : 'shared'
    const info = setDownloadPathMode(req.user.id, mode)
    res.json({ ok: true, ...downloadPayload(req.user.id), downloadPath: info.savePath })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

/** 任意登录用户：设置个人下载目录（按用户存储） */
pathsRouter.put('/download/personal', (req, res) => {
  try {
    const { dirPath, fromPicker, enable = true } = req.body || {}
    if (!dirPath) {
      const info = setDownloadPathMode(req.user.id, enable === false ? 'shared' : 'personal')
      return res.json({ ok: true, ...downloadPayload(req.user.id), downloadPath: info.savePath })
    }
    const info = setPersonalDownloadSavePath(req.user.id, dirPath, {
      fromPicker: Boolean(fromPicker),
      enable: enable !== false,
    })
    res.json({ ok: true, ...downloadPayload(req.user.id), downloadPath: info.savePath })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})
