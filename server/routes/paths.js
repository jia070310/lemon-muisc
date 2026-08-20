import { Router } from 'express'
import {
  getFilePaths,
  getDownloadSavePath,
  addFilePath,
  updateFilePath,
  removeFilePath,
  setDownloadSavePath,
} from '../utils/filePaths.js'

export const pathsRouter = Router()

pathsRouter.get('/', (_req, res) => {
  res.json({
    ok: true,
    data: getFilePaths(),
    downloadPath: getDownloadSavePath(),
  })
})

pathsRouter.post('/', (req, res) => {
  try {
    const { dirPath, fromPicker } = req.body
    const data = addFilePath(dirPath, { fromPicker: Boolean(fromPicker) })
    res.json({ ok: true, data, downloadPath: getDownloadSavePath() })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

pathsRouter.put('/', (req, res) => {
  try {
    const { oldPath, newPath, fromPicker } = req.body
    const data = updateFilePath(oldPath, newPath, { fromPicker: Boolean(fromPicker) })
    res.json({ ok: true, data, downloadPath: getDownloadSavePath() })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

pathsRouter.delete('/', (req, res) => {
  try {
    const { dirPath } = req.body
    const data = removeFilePath(dirPath)
    res.json({ ok: true, data, downloadPath: getDownloadSavePath() })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

pathsRouter.put('/download', (req, res) => {
  try {
    const { dirPath } = req.body
    const downloadPath = setDownloadSavePath(dirPath)
    res.json({ ok: true, downloadPath, data: getFilePaths() })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})
