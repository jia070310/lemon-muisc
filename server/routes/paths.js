import { Router } from 'express'
import path from 'path'
import {
  getMusicPaths,
  getFilePaths,
  getDownloadSavePath,
  addMusicPath,
  updateMusicPath,
  removeMusicPath,
  setDownloadSavePath,
  getSetupStatus,
} from '../utils/filePaths.js'
import { listAudioFiles, probeDir } from '../utils/audioScan.js'

export const pathsRouter = Router()

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

pathsRouter.get('/', (_req, res) => {
  const musicPaths = getMusicPaths()
  res.json({
    ok: true,
    data: musicPaths,
    musicPaths,
    downloadPath: getDownloadSavePath(),
    setup: getSetupStatus(),
  })
})

pathsRouter.post('/', (req, res) => {
  try {
    const { dirPath, fromPicker } = req.body
    const data = addMusicPath(dirPath, { fromPicker: Boolean(fromPicker) })
    res.json({ ok: true, data, musicPaths: data, downloadPath: getDownloadSavePath() })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

pathsRouter.put('/', (req, res) => {
  try {
    const { oldPath, newPath, fromPicker } = req.body
    const data = updateMusicPath(oldPath, newPath, { fromPicker: Boolean(fromPicker) })
    res.json({ ok: true, data, musicPaths: data, downloadPath: getDownloadSavePath() })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

pathsRouter.delete('/', (req, res) => {
  try {
    const { dirPath } = req.body
    const data = removeMusicPath(dirPath)
    res.json({ ok: true, data, musicPaths: data, downloadPath: getDownloadSavePath() })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

pathsRouter.put('/download', (req, res) => {
  try {
    const { dirPath, fromPicker } = req.body
    const downloadPath = setDownloadSavePath(dirPath, { fromPicker: Boolean(fromPicker) })
    res.json({ ok: true, downloadPath, data: getMusicPaths(), musicPaths: getMusicPaths() })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})
