import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { readMeta, readMetaLite, batchWriteMeta, writeMeta, readEmbeddedCover } from '../meta.js'
import { matchByFilename, matchByArtistTitle, fetchMatchMeta, normalizeTagSource } from '../utils/tagMatch.js'
import { parseFilename } from '../utils/filenameParse.js'
import { fetchPicBuffer } from '../utils/fetchPic.js'
import { getMusicPaths, addMusicPath, removeMusicPath, isUnderConfiguredMusicDir, isAllowedMediaPath } from '../utils/filePaths.js'
import { listAudioFiles, listDirEntries, probeDir } from '../utils/audioScan.js'
import { mapWithConcurrency } from '../utils/asyncPool.js'
import { notifyLibraryChanged } from '../utils/libraryNotify.js'
import { scanBatchAndCache, enrichFilesFromCache, readBatchFromCacheOrScan } from '../utils/libraryCache.js'

export const tagRouter = Router()

function buildFileStub(fp) {
  const fileName = path.basename(fp)
  const parsed = parseFilename(fileName)
  let mtime = 0
  try { mtime = fs.statSync(fp).mtimeMs || 0 } catch {}
  return {
    filePath: fp,
    fileName,
    mtime,
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
}

function assertMusicDirAccess(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) {
    return { ok: false, status: 400, error: `目录不存在：${dirPath || ''}` }
  }
  if (!isUnderConfiguredMusicDir(dirPath)) {
    return { ok: false, status: 400, error: '该目录未在音乐库路径中配置，请先在设置中添加' }
  }
  const probe = probeDir(dirPath)
  if (!probe.readable) {
    return {
      ok: false,
      status: 400,
      error: `目录不可读：${dirPath}（${probe.error || '权限不足'}）。请检查飞牛访问权限与路径设置。`,
      probe,
    }
  }
  return { ok: true, probe }
}

/** 读取本地音频内嵌封面 */
tagRouter.get('/cover', async (req, res) => {
  try {
    const filePath = String(req.query.path || '').trim()
    if (!filePath || !isAllowedMediaPath(filePath)) {
      return res.status(403).json({ error: '无权访问该文件' })
    }
    const cover = await readEmbeddedCover(filePath)
    if (!cover?.buffer?.length) return res.status(404).end()
    res.set('Cache-Control', 'private, max-age=86400')
    res.type(cover.mime)
    res.send(cover.buffer)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** @deprecated 使用 /api/paths */
tagRouter.get('/dirs', (_req, res) => {
  res.json({ ok: true, data: getMusicPaths() })
})

tagRouter.post('/dirs', (req, res) => {
  try {
    const data = addMusicPath(req.body.dirPath)
    res.json({ ok: true, data })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

tagRouter.delete('/dirs', (req, res) => {
  try {
    const data = removeMusicPath(req.body.dirPath)
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

/** 批量读取标签（优先 library_index 缓存，未命中再扫描写入） */
tagRouter.post('/read-batch', async (req, res) => {
  try {
    const { filePaths, lite = true } = req.body
    if (!Array.isArray(filePaths) || !filePaths.length) {
      return res.status(400).json({ error: '请提供文件路径数组' })
    }
    if (filePaths.length > 100) {
      return res.status(400).json({ error: '单次最多读取 100 个文件' })
    }

    if (lite) {
      const data = await readBatchFromCacheOrScan(filePaths)
      return res.json({ ok: true, data })
    }

    const results = await mapWithConcurrency(filePaths, 4, async (filePath) => {
      if (!filePath || !fs.existsSync(filePath)) {
        return { filePath, ok: false, error: '文件不存在' }
      }
      let lastErr = null
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const meta = await readMeta(filePath)
          return { filePath, ok: true, ...meta }
        } catch (e) {
          lastErr = e
          if (attempt === 0) {
            await new Promise(resolve => setTimeout(resolve, 120))
          }
        }
      }
      return { filePath, ok: false, error: lastErr?.message || '读取失败' }
    })
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
    await scanBatchAndCache([{ filePath }]).catch(() => {})
    notifyLibraryChanged([filePath], { reason: 'tag-write' })
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
    await scanBatchAndCache(prepared.map(f => ({ filePath: f.filePath }))).catch(() => {})
    notifyLibraryChanged(prepared.map(f => f.filePath), { reason: 'tag-write-batch' })
    res.json({ ok: true, data: results })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 列出单层目录（子文件夹 + 当前层音频），用于标签编辑目录树 */
tagRouter.post('/list-dir', async (req, res) => {
  try {
    const { dirPath } = req.body
    const access = assertMusicDirAccess(dirPath)
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error, probe: access.probe })
    }

    const { dirs, audioFiles, error } = listDirEntries(dirPath)
    if (error) {
      return res.status(400).json({ error: `读取目录失败：${error}` })
    }

    const fileStubs = audioFiles.map(buildFileStub)
    const enriched = enrichFilesFromCache(fileStubs)

    res.json({
      ok: true,
      data: {
        dirs,
        files: enriched,
        dirPath,
      },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 快速扫描：只列出文件，不读标签（大目录秒开） */
tagRouter.post('/scan', async (req, res) => {
  try {
    const { dirPath, recursive = true } = req.body
    const access = assertMusicDirAccess(dirPath)
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error, probe: access.probe })
    }
    const probe = access.probe

    let filePaths = []
    if (recursive) {
      filePaths = listAudioFiles(dirPath)
    } else {
      const listed = listDirEntries(dirPath)
      if (listed.error) {
        return res.status(400).json({ error: `读取目录失败：${listed.error}` })
      }
      filePaths = listed.audioFiles
    }

    const results = filePaths.map(buildFileStub)

    const enriched = enrichFilesFromCache(results)

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
      data: enriched,
      total: enriched.length,
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
