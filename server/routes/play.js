import { Router } from 'express'
import { requestSource, getActiveSource } from '../sourceManager.js'
import { getLyric } from '../musicSdk.js'
import { buildMusicInfo } from '../utils/musicInfo.js'

export const playRouter = Router()

playRouter.post('/url', async (req, res) => {
  try {
    const { songId, source, quality } = req.body
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

playRouter.post('/lyric', async (req, res) => {
  try {
    const { songId, source } = req.body
    if (!songId || !source) return res.json({ ok: true, lyric: '', tlyric: '' })

    const result = await getLyric(songId, source)
    res.json({ ok: true, ...result })
  } catch {
    res.json({ ok: true, lyric: '', tlyric: '' })
  }
})
