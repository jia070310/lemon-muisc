import { Router } from 'express'
import { fetchPlaylist, fetchRecommendPlaylists } from '../musicSdk.js'
import { getDisplaySources } from '../utils/displaySources.js'
import { formatUserError } from '../utils/userError.js'
import { createLimiter, withTimeout } from '../utils/asyncLimit.js'
import { buildPlaylistCacheKey, getCachedPlaylist, getOrFetchPlaylist } from '../utils/playlistCache.js'

export const playlistRouter = Router()

const availableSources = () => getDisplaySources()
const playlistLimiter = createLimiter(3)
const RECOMMEND_TIMEOUT_MS = 20000
const PLAYLIST_TIMEOUT_MS = 120000

playlistRouter.get('/sources', (_req, res) => {
  res.json({ sources: getDisplaySources() })
})

playlistRouter.get('/recommend', async (req, res) => {
  try {
    const { source = 'kw', sort = 'hot', page = 1 } = req.query
    if (!availableSources()[source]) {
      return res.status(400).json({ error: `不支持的平台: ${source}` })
    }
    const data = await playlistLimiter(() => withTimeout(
      fetchRecommendPlaylists(source, String(sort), Number(page)),
      RECOMMEND_TIMEOUT_MS,
      '获取推荐歌单超时，请稍后重试',
    ))
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
    const cacheKey = buildPlaylistCacheKey(source, url, partial)
    const cached = getCachedPlaylist(cacheKey)
    const data = cached || await getOrFetchPlaylist(cacheKey, () => playlistLimiter(() => withTimeout(
      fetchPlaylist(source, url, { partial }),
      partial ? 30000 : PLAYLIST_TIMEOUT_MS,
      '获取歌单超时，请稍后重试',
    )))
    res.json({ ok: true, data, cached: Boolean(cached) })
  } catch (e) {
    res.status(500).json({ error: formatUserError(e, '获取歌单失败，请检查链接后重试') })
  }
})
