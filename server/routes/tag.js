import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { readMeta, readMetaLite, batchWriteMeta, writeMeta, readEmbeddedCover } from '../meta.js'
import { matchByFilename, matchByArtistTitle, fetchMatchMeta, normalizeTagSource } from '../utils/tagMatch.js'
import { parseFilename } from '../utils/filenameParse.js'
import { fetchPicBuffer } from '../utils/fetchPic.js'
import { getMusicPaths, getMusicPathsForUser, addMusicPath, removeMusicPath, isUnderConfiguredMusicDir, isAllowedMediaPath } from '../utils/filePaths.js'
import { listAudioFiles, listDirEntries, probeDir } from '../utils/audioScan.js'
import { mapWithConcurrency } from '../utils/asyncPool.js'
import { notifyLibraryChanged } from '../utils/libraryNotify.js'
import { enrichFilesFromCache, readBatchFromCacheOrScan, getAllCachedTracks, refreshCacheAfterTagWrite } from '../utils/libraryCache.js'
import { getMergedSettings } from '../utils/userSettings.js'
import {
  albumHintFromFilePath,
  isMatchArtistAcceptable,
  mergeMatchMetaFillMissing,
} from '../utils/pathAlbumHint.js'

export const tagRouter = Router()

function matchSongKey(item) {
  return `${item.source || ''}:${item.id || item.songId || item.songmid || item.hash || item.name || ''}`
}

function mergeScoredMatches(...lists) {
  const map = new Map()
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const item of list) {
      const key = matchSongKey(item)
      const prev = map.get(key)
      if (!prev || (Number(item._score) || 0) > (Number(prev._score) || 0)) map.set(key, item)
    }
  }
  return [...map.values()].sort((a, b) => (Number(b._score) || 0) - (Number(a._score) || 0))
}

function keepRewriteFields(meta, fields) {
  if (!Array.isArray(fields) || !fields.length) return meta
  const set = new Set(fields)
  const out = { ...meta }
  if (!set.has('title')) delete out.title
  if (!set.has('artist')) delete out.artist
  if (!set.has('albumArtist')) delete out.albumArtist
  if (!set.has('album')) delete out.album
  if (!set.has('cover')) {
    delete out.pic
    delete out.picUrl
  }
  if (!set.has('lyric')) delete out.lyric
  if (!set.has('year')) delete out.year
  if (!set.has('genre')) delete out.genre
  if (!set.has('comment')) delete out.comment
  return out
}

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
    albumArtist: '',
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

function assertMusicDirAccess(dirPath, userId = null) {
  if (!dirPath || !fs.existsSync(dirPath)) {
    return { ok: false, status: 400, error: `目录不存在：${dirPath || ''}` }
  }
  if (!isUnderConfiguredMusicDir(dirPath, userId)) {
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
    if (!filePath || !isAllowedMediaPath(filePath, { userId: req.user?.id })) {
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
tagRouter.get('/dirs', (req, res) => {
  res.json({ ok: true, data: getMusicPathsForUser(req.user?.id) })
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
    await refreshCacheAfterTagWrite(filePath, writeData).catch(() => {})
    notifyLibraryChanged([filePath], { reason: 'tag-write' })
    res.json({ ok: true })
  } catch (e) {
    console.error('[tag/write]', e.message)
    res.status(500).json({ error: e.message || '标签写入失败' })
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
    const written = results.filter((row) => row?.ok).map((row) => row.filePath).filter(Boolean)
    const metaByPath = new Map(prepared.map((f) => [f.filePath, f.meta]))
    await Promise.all(written.map((fp) => refreshCacheAfterTagWrite(fp, metaByPath.get(fp) || {}).catch(() => {})))
    notifyLibraryChanged(written, { reason: 'tag-write-batch' })
    res.json({ ok: true, data: results })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 列出单层目录（子文件夹 + 当前层音频），用于标签编辑目录树 */
tagRouter.post('/list-dir', async (req, res) => {
  try {
    const { dirPath } = req.body
    const access = assertMusicDirAccess(dirPath, req.user?.id)
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
    const access = assertMusicDirAccess(dirPath, req.user?.id)
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
        tip = `目录可读（共 ${probe.entryCount} 项），但未发现支持的音频（mp3/flac/wav/ape/m4a 等）。样例：${probe.sampleNames.join(', ') || '无'}`
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
    const { fileName, keyword, artist, title, album, source = 'wy' } = req.body

    if (artist !== undefined || title !== undefined || album !== undefined) {
      const matches = await matchByArtistTitle(artist || '', title || '', source, 8, null, album || '')
      return res.json({
        ok: true,
        data: matches,
        parsed: { artist: artist || '', title: title || '', album: album || '' },
      })
    }

    const searchName = fileName || keyword
    if (!searchName) return res.status(400).json({ error: '请提供歌手/歌名或文件名' })

    const matches = await matchByFilename(searchName, source, 8, album || '')
    res.json({ ok: true, data: matches, parsed: { ...parseFilename(searchName), album: album || '' } })
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
    if (files.length > 50) return res.status(400).json({ error: '单次最多 50 个文件' })

    const settings = getMergedSettings(req.user?.id)
    const rewriteAll = req.body.rewriteAll === true
    const useExistingTags = req.body.useExistingTags === true
    const rewriteFields = Array.isArray(req.body.rewriteFields)
      ? req.body.rewriteFields.map((k) => String(k || '').trim()).filter(Boolean)
      : []
    const forceOverwrite = req.body.forceOverwrite === true || rewriteAll
    const preferFolderAlbum = req.body.preferFolderAlbum != null
      ? req.body.preferFolderAlbum !== false
      : settings['tag.matchPreferFolderAlbum'] !== 'false'
    const fillMissingOnly = forceOverwrite
      ? false
      : (req.body.fillMissingOnly != null
        ? req.body.fillMissingOnly !== false
        : settings['tag.matchFillMissingOnly'] !== 'false')
    const rejectForeignArtist = req.body.rejectForeignArtist != null
      ? req.body.rejectForeignArtist !== false
      : settings['tag.matchRejectForeignArtist'] !== 'false'

    const sdkSource = normalizeTagSource(source)
    const cacheMap = new Map(
      (getAllCachedTracks(getMusicPathsForUser(req.user?.id)) || []).map((t) => [path.resolve(String(t.filePath || '')), t]),
    )
    // 有限并发：加速批量匹配，同时降低被音源限流的概率
    const concurrency = Math.min(3, Math.max(1, files.length))
    const results = await mapWithConcurrency(files, concurrency, async (file) => {
      try {
        const cached = cacheMap.get(path.resolve(String(file.filePath || ''))) || {}
        const parsedName = parseFilename(file.fileName || path.basename(file.filePath || ''))
        const existArtist = String(file.artist || cached.artist || '').trim()
        const existTitle = String(file.title || cached.title || '').trim()
        const existAlbum = String(file.album || cached.album || '').trim()
        const parsedArtist = String(parsedName.artist || '').trim()
        const parsedTitle = String(parsedName.title || '').trim()
        const folderAlbum = preferFolderAlbum ? albumHintFromFilePath(file.filePath) : ''
        const artist = rewriteAll
          ? (useExistingTags ? (parsedArtist || existArtist) : parsedArtist)
          : existArtist
        const title = rewriteAll
          ? (useExistingTags ? (parsedTitle || existTitle) : parsedTitle)
          : existTitle
        const taggedAlbum = rewriteAll
          ? (useExistingTags ? existAlbum : '')
          : existAlbum
        const album = taggedAlbum || folderAlbum
        let matches
        if (rewriteAll) {
          const byName = await matchByFilename(file.fileName, sdkSource, 8, taggedAlbum, folderAlbum)
          if (useExistingTags && (existArtist || existTitle)) {
            const byTags = await matchByArtistTitle(
              existArtist || parsedArtist,
              existTitle || parsedTitle,
              sdkSource,
              8,
              null,
              existAlbum || taggedAlbum,
              folderAlbum,
            )
            matches = mergeScoredMatches(byName, byTags)
          } else {
            matches = byName
          }
        } else {
          matches = (title || artist || album)
            ? await matchByArtistTitle(artist, title, sdkSource, 8, null, taggedAlbum, folderAlbum)
            : await matchByFilename(file.fileName, sdkSource, 8, taggedAlbum, folderAlbum)
        }
        if (!matches.length) {
          return { filePath: file.filePath, ok: false, error: '未找到匹配' }
        }
        let picked = matches[0]
        if (rejectForeignArtist) {
          const filterArtist = artist || existArtist || parsedArtist
          const acceptable = matches.find((m) => isMatchArtistAcceptable(m.singer, filterArtist, file.filePath))
          if (!acceptable) {
            return { filePath: file.filePath, ok: false, error: '未找到与本地歌手/目录相符的结果' }
          }
          picked = acceptable
        }
        const fetchFields = rewriteAll && rewriteFields.length ? rewriteFields : null
        let meta = await fetchMatchMeta(picked, sdkSource, fetchFields, { title, artist })
        if (fillMissingOnly) {
          meta = mergeMatchMetaFillMissing({
            title: cached.title || title,
            artist: cached.artist || artist,
            albumArtist: cached.albumArtist || '',
            album: taggedAlbum,
            year: cached.year || '',
            genre: cached.genre || '',
            comment: cached.comment || '',
            lyric: cached.lyric || '',
            hasPicture: Boolean(cached.hasPicture),
            picUrl: cached.picUrl || '',
          }, meta)
        } else if (!taggedAlbum && folderAlbum && !String(meta.album || '').trim()) {
          meta.album = folderAlbum
        }
        if (rewriteAll && rewriteFields.length) {
          meta = keepRewriteFields(meta, rewriteFields)
        }
        return {
          filePath: file.filePath,
          ok: true,
          meta,
          match: picked,
          hints: {
            folderAlbum: folderAlbum || undefined,
            fillMissingOnly,
            rewriteAll,
            useExistingTags: rewriteAll ? useExistingTags : undefined,
            rewriteFields: rewriteAll && rewriteFields.length ? rewriteFields : undefined,
          },
        }
      } catch (e) {
        return { filePath: file.filePath, ok: false, error: e.message }
      }
    })
    res.json({ ok: true, data: results })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
