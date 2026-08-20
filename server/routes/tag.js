import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { getDB } from '../db.js'
import { readMeta, batchWriteMeta, writeMeta } from '../meta.js'
import { matchByFilename, matchByArtistTitle, fetchMatchMeta, normalizeTagSource } from '../utils/tagMatch.js'
import { parseFilename } from '../utils/filenameParse.js'
import { fetchPicBuffer } from '../utils/fetchPic.js'
import { getFilePaths, addFilePath, removeFilePath } from '../utils/filePaths.js'

export const tagRouter = Router()

const AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.ape', '.ogg', '.m4a', '.aac', '.wma']

/** @deprecated 使用 /api/paths */
tagRouter.get('/dirs', (_req, res) => {
  res.json({ ok: true, data: getFilePaths() })
})

tagRouter.post('/dirs', (req, res) => {
  try {
    const data = addFilePath(req.body.dirPath)
    res.json({ ok: true, data })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

tagRouter.delete('/dirs', (req, res) => {
  try {
    const data = removeFilePath(req.body.dirPath)
    res.json({ ok: true, data })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

tagRouter.post('/read', async (req, res) => {
  try {
    const { filePath } = req.body
    if (!filePath || !fs.existsSync(filePath)) return res.status(400).json({ error: '文件不存在' })
    const meta = await readMeta(filePath)
    res.json({ ok: true, data: meta })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

tagRouter.post('/write', async (req, res) => {
  try {
    const { filePath, meta } = req.body
    if (!filePath || !fs.existsSync(filePath)) return res.status(400).json({ error: '文件不存在' })

    const ext = path.extname(filePath).toLowerCase()
    const writeData = { ...meta }

    if (meta.picUrl && !meta.pic) {
      const pic = await fetchPicBuffer(meta.picUrl)
      if (pic) writeData.pic = pic
    }

    await writeMeta(filePath, ext, writeData)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

tagRouter.post('/write-batch', async (req, res) => {
  try {
    const { files } = req.body
    if (!Array.isArray(files)) return res.status(400).json({ error: '请提供文件数组' })

    const prepared = []
    for (const f of files) {
      const meta = { ...f.meta }
      if (meta.picUrl && !meta.pic) {
        const pic = await fetchPicBuffer(meta.picUrl)
        if (pic) meta.pic = pic
      }
      prepared.push({ filePath: f.filePath, meta })
    }

    const results = await batchWriteMeta(prepared)
    res.json({ ok: true, data: results })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

tagRouter.post('/scan', async (req, res) => {
  try {
    const { dirPath } = req.body
    if (!dirPath || !fs.existsSync(dirPath)) return res.status(400).json({ error: '目录不存在' })
    if (!getFilePaths().includes(dirPath)) return res.status(400).json({ error: '该目录未在文件路径中配置，请先在设置中添加' })

    const files = scanDir(dirPath, AUDIO_EXTS)
    const results = []
    for (const fp of files) {
      try {
        const meta = await readMeta(fp)
        const parsed = parseFilename(path.basename(fp))
        results.push({
          filePath: fp,
          fileName: path.basename(fp),
          parsedTitle: parsed.title,
          parsedArtist: parsed.artist,
          ...meta,
        })
      } catch (e) {
        results.push({ filePath: fp, fileName: path.basename(fp), error: e.message })
      }
    }
    res.json({ ok: true, data: results })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

tagRouter.post('/match', async (req, res) => {
  try {
    const { fileName, keyword, artist, title, source = 'wy' } = req.body

    if (artist !== undefined || title !== undefined) {
      const matches = await matchByArtistTitle(artist || '', title || '', source)
      return res.json({ ok: true, data: matches, parsed: { artist: artist || '', title: title || '' } })
    }

    const searchName = fileName || keyword
    if (!searchName) return res.status(400).json({ error: '请提供歌手/歌名或文件名' })

    const matches = await matchByFilename(searchName, source)
    res.json({ ok: true, data: matches, parsed: parseFilename(searchName) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

tagRouter.post('/match-apply', async (req, res) => {
  try {
    const { match, source, fields } = req.body
    if (!match) return res.status(400).json({ error: '缺少匹配项' })

    const meta = await fetchMatchMeta(match, source, fields)
    res.json({ ok: true, data: meta })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

tagRouter.post('/match-batch', async (req, res) => {
  try {
    const { files, source = 'wy' } = req.body
    if (!Array.isArray(files)) return res.status(400).json({ error: '请提供文件列表' })

    const sdkSource = normalizeTagSource(source)
    const results = []
    for (const file of files) {
      try {
        const matches = await matchByFilename(file.fileName, sdkSource, 1)
        if (!matches.length) {
          results.push({ filePath: file.filePath, ok: false, error: '未找到匹配' })
          continue
        }
        const meta = await fetchMatchMeta(matches[0], sdkSource)
        results.push({ filePath: file.filePath, ok: true, meta, match: matches[0] })
      } catch (e) {
        results.push({ filePath: file.filePath, ok: false, error: e.message })
      }
    }
    res.json({ ok: true, data: results })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

function scanDir(dir, exts, maxDepth = 20, depth = 0) {
  if (depth > maxDepth) return []
  const files = []
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...scanDir(fullPath, exts, maxDepth, depth + 1))
      } else if (exts.includes(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath)
      }
    }
  } catch {}
  return files
}
