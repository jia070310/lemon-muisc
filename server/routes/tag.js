import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { readMeta, readMetaLite, batchWriteMeta, writeMeta } from '../meta.js'
import { matchByFilename, matchByArtistTitle, fetchMatchMeta, normalizeTagSource } from '../utils/tagMatch.js'
import { parseFilename } from '../utils/filenameParse.js'
import { fetchPicBuffer } from '../utils/fetchPic.js'
import { getFilePaths, addFilePath, removeFilePath } from '../utils/filePaths.js'
import { listAudioFiles, probeDir } from '../utils/audioScan.js'

export const tagRouter = Router()

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

/** 批量读取标签（列表页分批加载，避免单次请求超时） */
tagRouter.post('/read-batch', async (req, res) => {
  try {
    const { filePaths, lite = true } = req.body
    if (!Array.isArray(filePaths) || !filePaths.length) {
      return res.status(400).json({ error: '请提供文件路径数组' })
    }
    if (filePaths.length > 100) {
      return res.status(400).json({ error: '单次最多读取 100 个文件' })
    }

    const reader = lite ? readMetaLite : readMeta
    const results = []
    for (const filePath of filePaths) {
      if (!filePath || !fs.existsSync(filePath)) {
        results.push({ filePath, ok: false, error: '文件不存在' })
        continue
      }
      try {
        const meta = await reader(filePath)
        results.push({ filePath, ok: true, ...meta })
      } catch (e) {
        results.push({ filePath, ok: false, error: e.message })
      }
    }
    res.json({ ok: true, data: results })
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

/** 快速扫描：只列出文件，不读标签（大目录秒开） */
tagRouter.post('/scan', async (req, res) => {
  try {
    const { dirPath } = req.body
    if (!dirPath || !fs.existsSync(dirPath)) {
      return res.status(400).json({ error: `目录不存在：${dirPath || ''}` })
    }
    if (!getFilePaths().includes(dirPath)) {
      return res.status(400).json({ error: '该目录未在文件路径中配置，请先在设置中添加' })
    }

    const probe = probeDir(dirPath)
    if (!probe.readable) {
      return res.status(400).json({
        error: `目录不可读：${dirPath}（${probe.error || '权限不足'}）。请检查飞牛访问权限与路径设置。`,
        probe,
      })
    }

    const filePaths = listAudioFiles(dirPath)
    const results = filePaths.map((fp) => {
      const fileName = path.basename(fp)
      const parsed = parseFilename(fileName)
      return {
        filePath: fp,
        fileName,
        parsedTitle: parsed.title,
        parsedArtist: parsed.artist,
        title: parsed.title,
        artist: parsed.artist,
        album: '',
        year: '',
        genre: '',
        comment: '',
        hasPicture: false,
        hasLyrics: false,
        lyric: '',
        pictureBase64: '',
      }
    })

    let tip = ''
    if (!results.length) {
      if (probe.entryCount === 0) {
        if (dirPath === '/downloads') {
          tip = `下载目录是空的。若这是下载保存位置属正常；请改点左侧音乐库目录扫描。若音乐库也为空，请到「运行设置」重新保存路径。`
        } else {
          tip = `目录 ${dirPath} 是空的。请确认路径正确，或到应用设置 → 运行设置 / 访问权限重新授权后保存。`
        }
      } else {
        tip = `目录可读（共 ${probe.entryCount} 项），但未发现支持的音频（mp3/flac/wav/m4a 等）。样例：${probe.sampleNames.join(', ') || '无'}`
      }
    }

    res.json({
      ok: true,
      data: results,
      total: results.length,
      tip,
      probe,
      scanErrors: listAudioFiles.lastErrors?.slice(0, 5) || [],
    })
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
