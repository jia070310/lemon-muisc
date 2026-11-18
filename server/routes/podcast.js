import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import {
  listFeeds,
  getFeed,
  listEpisodes,
  subscribeFeed,
  refreshFeed,
  updateFeed,
  unsubscribeFeed,
  resolvePodcastCoverFile,
  episodeToTrack,
  listUpdatedFeeds,
  markFeedRead,
  upsertProgress,
  getProgress,
  listProgressMap,
  listPlayHistory,
  listContinueListening,
  toggleFavorite,
  listFavorites,
  isFavorited,
  refreshAllFeeds,
} from '../utils/podcastStore.js'
import { buildPodcastExportPayload } from '../utils/backupExport.js'
import { broadcast } from '../ws.js'

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

/** 最近有更新的频道（含未读数） */
podcastRouter.get('/updates', (req, res) => {
  try {
    const data = listUpdatedFeeds(req.user.id, { limit: req.query.limit })
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 播放历史：最近听过的节目（默认至少 20 条，含已听完）
 *  ?continue=1 仅未听完且进度≥5 秒
 */
podcastRouter.get('/history', (req, res) => {
  try {
    const onlyContinue = String(req.query.continue || '') === '1'
    const limit = req.query.limit
    const data = onlyContinue
      ? listContinueListening(req.user.id, { limit })
      : listPlayHistory(req.user.id, { limit })
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 收藏列表：频道 + 单集 */
podcastRouter.get('/favorites', (req, res) => {
  try {
    res.json({ ok: true, data: listFavorites(req.user.id) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

podcastRouter.post('/favorites', (req, res) => {
  try {
    const kind = req.body?.kind === 'feed' ? 'feed' : 'episode'
    const targetId = String(req.body?.targetId || req.body?.id || '').trim()
    const result = toggleFavorite(req.user.id, kind, targetId)
    scheduleBackupAfterChange()
    res.json({ ok: true, ...result })
  } catch (e) {
    const status = /不存在/.test(String(e.message)) ? 404 : 400
    res.status(status).json({ error: e.message || '收藏失败' })
  }
})

/** 写入/更新播放进度 */
podcastRouter.put('/progress', (req, res) => {
  try {
    const episodeId = String(req.body?.episodeId || req.body?.id || '').trim()
    if (!episodeId) return res.status(400).json({ error: '缺少 episodeId' })
    const data = upsertProgress(req.user.id, episodeId, {
      positionSec: req.body?.positionSec ?? req.body?.position,
      durationSec: req.body?.durationSec ?? req.body?.duration,
      completed: Boolean(req.body?.completed),
      reset: Boolean(req.body?.reset),
    })
    if (!data) return res.status(404).json({ error: '节目不存在' })
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

podcastRouter.get('/progress/:episodeId', (req, res) => {
  try {
    const data = getProgress(req.user.id, req.params.episodeId)
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 一键刷新全部订阅 */
podcastRouter.post('/refresh-all', async (req, res) => {
  try {
    const result = await refreshAllFeeds(req.user.id, { concurrency: 2 })
    if (result.updated?.length) {
      broadcast('podcast:updated', {
        feeds: result.updated.map((f) => ({
          id: f.id,
          title: f.title,
          inserted: f.inserted || 0,
          unreadCount: f.unreadCount || 0,
          newestPubDate: f.newestPubDate || 0,
          imageUrl: f.imageUrl || '',
        })),
        at: Date.now(),
      }, req.user.id)
    }
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ error: e.message || '刷新失败' })
  }
})

podcastRouter.get('/:id', (req, res) => {
  try {
    const feed = getFeed(req.user.id, req.params.id)
    if (!feed) return res.status(404).json({ error: '订阅不存在' })
    res.json({
      ok: true,
      data: { ...feed, favorited: isFavorited(req.user.id, 'feed', feed.id) },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 自定义封面文件（本地上传） */
podcastRouter.get('/:id/cover', (req, res) => {
  try {
    const feed = getFeed(req.user.id, req.params.id)
    if (!feed) return res.status(404).json({ error: '订阅不存在' })
    const fp = resolvePodcastCoverFile(req.user.id, req.params.id)
    if (!fp) return res.status(404).json({ error: '无自定义封面' })
    const ext = path.extname(fp).toLowerCase()
    const type = ext === '.png' ? 'image/png'
      : ext === '.webp' ? 'image/webp'
        : ext === '.gif' ? 'image/gif'
          : 'image/jpeg'
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.type(type)
    fs.createReadStream(fp).pipe(res)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 修改订阅：封面 / RSS 链接 */
podcastRouter.patch('/:id', async (req, res) => {
  try {
    const body = req.body || {}
    const patch = {}
    if (Object.prototype.hasOwnProperty.call(body, 'url')) patch.url = body.url
    if (Object.prototype.hasOwnProperty.call(body, 'title')) patch.title = body.title
    if (Object.prototype.hasOwnProperty.call(body, 'imageUrl')) patch.imageUrl = body.imageUrl
    if (body.clearCustomImage) patch.clearCustomImage = true
    if (Object.prototype.hasOwnProperty.call(body, 'refetch')) patch.refetch = Boolean(body.refetch)
    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: '没有可保存的修改' })
    }
    const result = await updateFeed(req.user.id, req.params.id, patch)
    scheduleBackupAfterChange()
    res.json({
      ok: true,
      data: result.feed,
      inserted: result.inserted || 0,
      fetchError: result.fetchError || '',
    })
  } catch (e) {
    const status = /不存在/.test(String(e.message)) ? 404 : 400
    res.status(status).json({ error: e.message || '保存失败' })
  }
})

podcastRouter.get('/:id/episodes', (req, res) => {
  try {
    const data = listEpisodes(req.user.id, req.params.id, {
      page: req.query.page,
      limit: req.query.limit,
    })
    if (!data) return res.status(404).json({ error: '订阅不存在' })
    const progress = listProgressMap(req.user.id, data.episodes.map((e) => e.id))
    const fav = listFavorites(req.user.id)
    const favEp = new Set(fav.episodes.map((e) => e.id))
    res.json({
      ok: true,
      data: {
        ...data,
        feed: {
          ...data.feed,
          favorited: isFavorited(req.user.id, 'feed', data.feed.id),
        },
        episodes: data.episodes.map((ep) => ({
          ...ep,
          progress: progress[ep.id] || null,
          favorited: favEp.has(ep.id),
        })),
        tracks: data.episodes.map((ep) => ({
          ...episodeToTrack(ep),
          progress: progress[ep.id] || null,
        })),
      },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

podcastRouter.post('/:id/refresh', async (req, res) => {
  try {
    const result = await refreshFeed(req.user.id, req.params.id)
    if (result.inserted > 0) {
      broadcast('podcast:updated', {
        feeds: [{
          id: result.feed.id,
          title: result.feed.title,
          inserted: result.inserted,
          unreadCount: result.feed.unreadCount || 0,
          newestPubDate: result.feed.newestPubDate || 0,
          imageUrl: result.feed.imageUrl || '',
        }],
        at: Date.now(),
      }, req.user.id)
    }
    res.json({ ok: true, data: result.feed, inserted: result.inserted })
  } catch (e) {
    const status = /不存在/.test(String(e.message)) ? 404 : 400
    res.status(status).json({ error: e.message || '刷新失败' })
  }
})

podcastRouter.post('/:id/read', (req, res) => {
  try {
    const ok = markFeedRead(req.user.id, req.params.id)
    if (!ok) return res.status(404).json({ error: '订阅不存在' })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
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
