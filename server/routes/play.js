import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { requestSource, getActiveSource } from '../sourceManager.js'
import { getLyric } from '../musicSdk.js'
import { buildMusicInfo } from '../utils/musicInfo.js'
import { isAllowedMediaPath } from '../utils/filePaths.js'

export const playRouter = Router()

const AUDIO_MIME = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
}

playRouter.post('/url', async (req, res) => {
  try {
    const { songId, source, quality, localPath } = req.body

    // 本地文件：返回可流式播放的同源 URL
    if (localPath || source === 'local') {
      const filePath = localPath || req.body.filePath
      if (!filePath || !isAllowedMediaPath(filePath)) {
        return res.status(400).json({ error: '本地文件不可用或不在允许目录内' })
      }
      const url = `/api/play/local?path=${encodeURIComponent(path.resolve(filePath))}`
      return res.json({ ok: true, url, local: true })
    }

    if (!songId || !source) return res.status(400).json({ error: '缺少歌曲信息' })

    const active = getActiveSource()
    if (!active?.handler) return res.status(400).json({ error: '没有激活的音源，请先在设置中激活音源' })

    const result = await requestSource(source, 'musicUrl', {
      type: quality || '128k',
      musicInfo: buildMusicInfo(req.body),
    })

    const url = typeof result === 'string' ? result : result?.url
    if (!url) return res.status(500).json({ error: '获取播放链接失败' })

    res.json({ ok: true, url })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

playRouter.get('/local', (req, res) => {
  try {
    const filePath = req.query.path
    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ error: '缺少文件路径' })
    }
    if (!isAllowedMediaPath(filePath)) {
      return res.status(403).json({ error: '无权访问该文件' })
    }

    const resolved = path.resolve(filePath)
    const stat = fs.statSync(resolved)
    const ext = path.extname(resolved).toLowerCase()
    const mime = AUDIO_MIME[ext] || 'application/octet-stream'
    const total = stat.size
    const range = req.headers.range

    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Type', mime)
    res.setHeader('Cache-Control', 'private, max-age=3600')

    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!m) return res.status(416).end()
      const start = m[1] ? parseInt(m[1], 10) : 0
      const end = m[2] ? parseInt(m[2], 10) : total - 1
      if (start >= total || end >= total || start > end) {
        res.setHeader('Content-Range', `bytes */${total}`)
        return res.status(416).end()
      }
      res.status(206)
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`)
      res.setHeader('Content-Length', end - start + 1)
      fs.createReadStream(resolved, { start, end }).pipe(res)
      return
    }

    res.setHeader('Content-Length', total)
    fs.createReadStream(resolved).pipe(res)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

playRouter.post('/lyric', async (req, res) => {
  try {
    const { songId, source, lyric } = req.body
    // 本地文件可直接带上已读出的歌词
    if (typeof lyric === 'string' && lyric) {
      return res.json({ ok: true, lyric, tlyric: '' })
    }
    if (!songId || !source || source === 'local') {
      return res.json({ ok: true, lyric: '', tlyric: '' })
    }

    const result = await getLyric(songId, source)
    res.json({ ok: true, ...result })
  } catch {
    res.json({ ok: true, lyric: '', tlyric: '' })
  }
})
