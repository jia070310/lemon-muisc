import { Router } from 'express'
import {
  listFeeds,
  getFeed,
  listEpisodes,
  subscribeFeed,
  refreshFeed,
  unsubscribeFeed,
  episodeToTrack,
} from '../utils/podcastStore.js'
import { buildPodcastExportPayload } from '../utils/backupExport.js'

export const podcastRouter = Router()

function scheduleBackupAfterChange() {
  import('../utils/autoUserBackup.js')
    .then(({ scheduleAutoBackupAfterUserDataChange }) => scheduleAutoBackupAfterUserDataChange())
    .catch(() => {})
}

podcastRouter.get('/', (req, res) => {
  try {
    res.json({ ok: true, data: listFeeds(req.user.id) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

podcastRouter.post('/', async (req, res) => {
  try {
    const url = String(req.body?.url || '').trim()
    if (!url) return res.status(400).json({ error: '请填写 RSS 地址' })
    const feed = await subscribeFeed(req.user.id, url)
    scheduleBackupAfterChange()
    res.json({ ok: true, data: feed })
  } catch (e) {
    res.status(400).json({ error: e.message || '订阅失败' })
  }
})

/** 导出当前用户的播客订阅，格式与备份导入兼容 */
podcastRouter.get('/export', (req, res) => {
  try {
    res.json({ ok: true, ...buildPodcastExportPayload(req.user.id) })
  } catch (e) {
    res.status(500).json({ error: e.message || '导出失败' })
  }
})

podcastRouter.get('/:id', (req, res) => {
  try {
    const feed = getFeed(req.user.id, req.params.id)
    if (!feed) return res.status(404).json({ error: '订阅不存在' })
    res.json({ ok: true, data: feed })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

podcastRouter.get('/:id/episodes', (req, res) => {
  try {
    const data = listEpisodes(req.user.id, req.params.id, {
      page: req.query.page,
      limit: req.query.limit,
    })
    if (!data) return res.status(404).json({ error: '订阅不存在' })
    res.json({
      ok: true,
      data: {
        ...data,
        tracks: data.episodes.map(episodeToTrack),
      },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

podcastRouter.post('/:id/refresh', async (req, res) => {
  try {
    const feed = await refreshFeed(req.user.id, req.params.id)
    res.json({ ok: true, data: feed })
  } catch (e) {
    const status = /不存在/.test(String(e.message)) ? 404 : 400
    res.status(status).json({ error: e.message || '刷新失败' })
  }
})

podcastRouter.delete('/:id', (req, res) => {
  try {
    const ok = unsubscribeFeed(req.user.id, req.params.id)
    if (!ok) return res.status(404).json({ error: '订阅不存在' })
    scheduleBackupAfterChange()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
