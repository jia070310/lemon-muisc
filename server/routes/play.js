import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import needle from 'needle'
import { requestSource, getActiveSource } from '../sourceManager.js'
import { buildMusicInfo } from '../utils/musicInfo.js'
import { fetchTrackLyric, fetchTrackCover } from '../utils/trackMeta.js'
import { resolveCoverUrl } from '../utils/cover.js'
import { isAllowedMediaPath } from '../utils/filePaths.js'
import { formatUserError } from '../utils/userError.js'

export const playRouter = Router()

function formatPlayError(err) {
  return formatUserError(err, '无法获取播放链接，请尝试其他歌曲')
}

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

const SOURCE_HEADERS = {
  tx: { Referer: 'https://y.qq.com/', Origin: 'https://y.qq.com' },
  kw: { Referer: 'https://www.kuwo.cn/' },
  kg: { Referer: 'https://www.kugou.com/' },
  wy: { Referer: 'https://music.163.com/' },
  mg: { Referer: 'https://music.migu.cn/' },
}

function isAllowedRemoteUrl(raw) {
  try {
    const u = new URL(raw)
    if (!['http:', 'https:'].includes(u.protocol)) return false
    const host = u.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local')) return false
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false
    return true
  } catch {
    return false
  }
}

function guessMimeFromUrl(url) {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase()
    return AUDIO_MIME[ext] || 'audio/mpeg'
  } catch {
    return 'audio/mpeg'
  }
}

function wrapPlayUrl(url, source) {
  if (!url || url.startsWith('/api/play/')) return url
  if (!/^https?:\/\//i.test(url)) return url
  return `/api/play/proxy?url=${encodeURIComponent(url)}&source=${encodeURIComponent(source || '')}`
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

    const type = quality || req.body.quality || '128k'
    const musicInfo = buildMusicInfo({ ...req.body, source, quality: type })

    const result = await requestSource(source, 'musicUrl', {
      type,
      quality: type,
      musicInfo,
    })

    const url = typeof result === 'string' ? result : result?.url
    if (!url) return res.status(500).json({ error: '获取播放链接失败' })

    res.json({ ok: true, url: wrapPlayUrl(url, source) })
  } catch (e) {
    res.status(500).json({ error: formatPlayError(e) })
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

playRouter.get('/proxy', (req, res) => {
  const url = req.query.url
  const source = typeof req.query.source === 'string' ? req.query.source : ''
  if (!url || typeof url !== 'string' || !isAllowedRemoteUrl(url)) {
    return res.status(400).json({ error: '无效播放链接' })
  }

  const headers = {
    connection: 'close',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ...(SOURCE_HEADERS[source] || {}),
  }
  if (req.headers.range) headers.Range = req.headers.range

  const upstream = needle.get(url, { follow_max: 5, headers, parse_response: false })

  upstream.on('header', (statusCode, respHeaders) => {
    if (statusCode >= 400) {
      if (!res.headersSent) res.status(statusCode).json({ error: '远程音频不可用' })
      return
    }
    const mime = respHeaders['content-type']?.split(';')[0]?.trim() || guessMimeFromUrl(url)
    res.setHeader('Content-Type', mime)
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'private, no-cache')
    if (respHeaders['content-length']) res.setHeader('Content-Length', respHeaders['content-length'])
    if (statusCode === 206 && respHeaders['content-range']) {
      res.status(206)
      res.setHeader('Content-Range', respHeaders['content-range'])
    }
  })

  upstream.on('err', (err) => {
    if (!res.headersSent) res.status(502).json({ error: formatUserError(err, '音频流传输失败') })
  })

  upstream.pipe(res)
})

playRouter.post('/lyric', async (req, res) => {
  try {
    const { lyric } = req.body
    const source = req.body.source
    const songId = req.body.songId || req.body.songmid || req.body.hash || req.body.copyrightId || req.body.musicId
    if (typeof lyric === 'string' && lyric) {
      return res.json({ ok: true, lyric, tlyric: '', rlyric: '' })
    }
    if (!songId || !source || source === 'local') {
      return res.json({ ok: true, lyric: '', tlyric: '', rlyric: '' })
    }

    const musicInfo = buildMusicInfo(req.body)
    const result = await fetchTrackLyric({
      source,
      songId,
      musicInfo,
      meta: req.body,
      useOtherSource: true,
    })

    if (result?.lyric) {
      return res.json({ ok: true, ...result })
    }
    res.json({ ok: true, lyric: '', tlyric: '', rlyric: '' })
  } catch {
    res.json({ ok: true, lyric: '', tlyric: '', rlyric: '' })
  }
})

playRouter.post('/cover', async (req, res) => {
  try {
    const { source } = req.body
    if (!source || source === 'local') {
      return res.json({ ok: true, url: req.body.picUrl || req.body.img || '' })
    }
    const musicInfo = buildMusicInfo(req.body)
    const direct = resolveCoverUrl(musicInfo)
    if (direct) return res.json({ ok: true, url: direct })

    const url = await fetchTrackCover({
      source,
      musicInfo,
      meta: req.body,
      asBuffer: false,
      useOtherSource: true,
    })
    res.json({ ok: true, url: url || '' })
  } catch {
    res.json({ ok: true, url: '' })
  }
})
