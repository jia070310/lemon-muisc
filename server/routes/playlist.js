import { Router } from 'express'
import { fetchPlaylist, fetchRecommendPlaylists, AVAILABLE_SOURCES } from '../musicSdk.js'

export const playlistRouter = Router()

playlistRouter.get('/sources', (_req, res) => {
  res.json({ sources: AVAILABLE_SOURCES })
})

playlistRouter.get('/recommend', async (req, res) => {
  try {
    const { source = 'kw', sort = 'hot', page = 1 } = req.query
    if (!AVAILABLE_SOURCES[source]) {
      return res.status(400).json({ error: `不支持的平台: ${source}` })
    }
    const data = await fetchRecommendPlaylists(source, String(sort), Number(page))
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

playlistRouter.get('/', async (req, res) => {
  try {
    const { url, source = 'kw' } = req.query
    if (!url) return res.status(400).json({ error: '缺少歌单链接或 ID' })
    if (!AVAILABLE_SOURCES[source]) {
      return res.status(400).json({ error: `不支持的平台: ${source}` })
    }

    const data = await fetchPlaylist(source, url)
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
