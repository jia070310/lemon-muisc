import { Router } from 'express'
import { searchMusic, searchAlbums, fetchAlbum } from '../musicSdk.js'
import { getDisplaySources } from '../utils/displaySources.js'
import { formatUserError } from '../utils/userError.js'
import { createLimiter, withTimeout } from '../utils/asyncLimit.js'
import { buildAlbumCacheKey, getCachedAlbum, getOrFetchAlbum } from '../utils/albumCache.js'

export const searchRouter = Router()

const availableSources = (req) => getDisplaySources(req.user?.id)
const searchLimiter = createLimiter(4)
const SEARCH_TIMEOUT_MS = 20000
const ALBUM_TIMEOUT_MS = 45000

function sliceAlbumList(data, page, limit) {
  if (!limit || !data?.list?.length || data.list.length <= limit) return data
  const start = (page - 1) * limit
  return {
    ...data,
    list: data.list.slice(start, start + limit),
    trackPage: page,
    trackPageSize: limit,
    trackTotal: data.list.length,
  }
}

searchRouter.get('/album', async (req, res) => {
  try {
    const { keyword, source = 'kw', page = 1, limit = 30 } = req.query
    if (!keyword) return res.status(400).json({ error: '缺少搜索关键词' })
    if (!availableSources(req)[source]) {
      return res.status(400).json({ error: `不支持的搜索源: ${source}` })
    }
    const result = await searchLimiter(() => withTimeout(
      searchAlbums(keyword, source, Number(page), Number(limit)),
      SEARCH_TIMEOUT_MS,
      '专辑搜索超时，请稍后重试',
    ))
    res.json({ ok: true, data: result })
  } catch (e) {
    res.status(500).json({ error: formatUserError(e, '专辑搜索失败，请稍后重试') })
  }
})

searchRouter.get('/album/detail', async (req, res) => {
  try {
    const { source = 'kw', id, page = 1, limit = 0 } = req.query
    if (!id) return res.status(400).json({ error: '缺少专辑 ID' })
    if (!availableSources(req)[source]) {
      return res.status(400).json({ error: `不支持的平台: ${source}` })
    }
    const cacheKey = buildAlbumCacheKey(source, id)
    const cached = getCachedAlbum(cacheKey)
    const data = cached || await getOrFetchAlbum(cacheKey, () => searchLimiter(() => withTimeout(
      fetchAlbum(source, id),
      ALBUM_TIMEOUT_MS,
      '获取专辑超时，请稍后重试',
    )))
    const trackLimit = Math.min(Math.max(Number(limit) || 0, 0), 100)
    res.json({
      ok: true,
      data: trackLimit > 0 ? sliceAlbumList(data, Number(page) || 1, trackLimit) : data,
      cached: Boolean(cached),
    })
  } catch (e) {
    res.status(500).json({ error: formatUserError(e, '获取专辑失败，请稍后重试') })
  }
})

searchRouter.get('/', async (req, res) => {
  try {
    const { keyword, source = 'kw', page = 1, limit = 30 } = req.query
    if (!keyword) return res.status(400).json({ error: '缺少搜索关键词' })

    if (!availableSources(req)[source]) {
      return res.status(400).json({ error: `不支持的搜索源: ${source}` })
    }

    const result = await searchLimiter(() => withTimeout(
      searchMusic(keyword, source, Number(page), Number(limit)),
      SEARCH_TIMEOUT_MS,
      '搜索超时，请稍后重试',
    ))
    res.json({ ok: true, data: result })
  } catch (e) {
    res.status(500).json({ error: formatUserError(e, '搜索失败，请稍后重试') })
  }
})

searchRouter.get('/sources', (req, res) => {
  res.json({ sources: getDisplaySources(req.user?.id) })
})
