import { Router } from 'express'
import { searchAlbums, fetchAlbum } from '../musicSdk.js'
import { getDisplaySources } from '../utils/displaySources.js'
import { formatUserError } from '../utils/userError.js'

export const albumRouter = Router()

const availableSources = () => getDisplaySources()

albumRouter.get('/search', async (req, res) => {
  try {
    const { keyword, source = 'kw', page = 1, limit = 30 } = req.query
    if (!keyword) return res.status(400).json({ error: '缺少搜索关键词' })
    if (!availableSources()[source]) {
      return res.status(400).json({ error: `不支持的搜索源: ${source}` })
    }
    const result = await searchAlbums(keyword, source, Number(page), Number(limit))
    res.json({ ok: true, data: result })
  } catch (e) {
    res.status(500).json({ error: formatUserError(e, '专辑搜索失败，请稍后重试') })
  }
})

albumRouter.get('/', async (req, res) => {
  try {
    const { source = 'kw', id } = req.query
    if (!id) return res.status(400).json({ error: '缺少专辑 ID' })
    if (!availableSources()[source]) {
      return res.status(400).json({ error: `不支持的平台: ${source}` })
    }
    const data = await fetchAlbum(source, id)
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ error: formatUserError(e, '获取专辑失败，请稍后重试') })
  }
})
