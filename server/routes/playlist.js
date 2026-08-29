import { Router } from 'express'
import { fetchPlaylist, fetchRecommendPlaylists } from '../musicSdk.js'
import { getDisplaySources } from '../utils/displaySources.js'
import { formatUserError } from '../utils/userError.js'

export const playlistRouter = Router()

const availableSources = () => getDisplaySources()

playlistRouter.get('/sources', (_req, res) => {
  res.json({ sources: getDisplaySources() })
})

playlistRouter.get('/recommend', async (req, res) => {
  try {
    const { source = 'kw', sort = 'hot', page = 1 } = req.query
    if (!availableSources()[source]) {
      return res.status(400).json({ error: `不支持的平台: ${source}` })
    }
    const data = await fetchRecommendPlaylists(source, String(sort), Number(page))
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ error: formatUserError(e, '获取推荐歌单失败，请稍后重试') })
  }
})

playlistRouter.get('/', async (req, res) => {
  try {
    const { url, source = 'kw' } = req.query
    if (!url) return res.status(400).json({ error: '缺少歌单链接或 ID' })
    if (!availableSources()[source]) {
      return res.status(400).json({ error: `不支持的平台: ${source}` })
    }

    const partial = req.query.partial === '1' || req.query.partial === 'true'
    const data = await fetchPlaylist(source, url, source === 'kg' ? { partial } : {})
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ error: formatUserError(e, '获取歌单失败，请检查链接后重试') })
  }
})
