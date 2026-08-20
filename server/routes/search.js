import { Router } from 'express'
import { searchMusic, AVAILABLE_SOURCES } from '../musicSdk.js'

export const searchRouter = Router()

searchRouter.get('/', async (req, res) => {
  try {
    const { keyword, source = 'kw', page = 1, limit = 30 } = req.query
    if (!keyword) return res.status(400).json({ error: '缺少搜索关键词' })

    if (!AVAILABLE_SOURCES[source]) {
      return res.status(400).json({ error: `不支持的搜索源: ${source}` })
    }

    const result = await searchMusic(keyword, source, Number(page), Number(limit))
    res.json({ ok: true, data: result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

searchRouter.get('/sources', (_req, res) => {
  res.json({ sources: AVAILABLE_SOURCES })
})
