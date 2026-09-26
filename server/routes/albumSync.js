import { Router } from 'express'
import { searchOnlineAlbumsForSync, diffAlbumSync } from '../utils/albumSync.js'
import { isAllowedMediaPath } from '../utils/filePaths.js'
import { hasActiveSource } from '../sourceManager.js'
import { getStoredActiveSourceIds } from '../utils/activeSources.js'

export const albumSyncRouter = Router()

function sanitizeLocalTracks(tracks, userId) {
  const list = Array.isArray(tracks) ? tracks : []
  const out = []
  for (const t of list) {
    const filePath = String(t?.filePath || t?.localPath || '').trim()
    if (filePath && !isAllowedMediaPath(filePath, { userId })) continue
    out.push({
      name: String(t?.name || t?.title || '').trim(),
      singer: String(t?.singer || t?.artist || '').trim(),
      filePath,
      format: String(t?.format || '').trim(),
    })
  }
  return out
}

/**
 * POST /api/library/album-sync/preview
 * 1) 无 onlineAlbumId：按歌手+专辑搜多平台候选
 * 2) 有 onlineAlbumId + source：拉曲目并与本地 diff
 */
albumSyncRouter.post('/preview', async (req, res) => {
  try {
    const userId = req.user?.id
    if (!hasActiveSource(getStoredActiveSourceIds(userId))) {
      return res.status(400).json({
        error: '请先在设置中激活至少一个音源',
        code: 'NO_ACTIVE_SOURCE',
      })
    }

    const artist = String(req.body?.artist || '').trim()
    const album = String(req.body?.album || '').trim()
    const source = String(req.body?.source || '').trim()
    const onlineAlbumId = String(req.body?.onlineAlbumId || req.body?.albumId || '').trim()
    const preferredQuality = String(req.body?.preferredQuality || 'flac').trim() || 'flac'
    const localTracks = sanitizeLocalTracks(req.body?.tracks, userId)

    if (!onlineAlbumId) {
      const data = await searchOnlineAlbumsForSync({ artist, album, userId })
      return res.json({
        ok: true,
        mode: 'search',
        data: {
          artist,
          album,
          preferredQuality,
          ...data,
        },
      })
    }

    if (!source) {
      return res.status(400).json({ error: '请指定在线专辑来源平台' })
    }

    const data = await diffAlbumSync({
      source,
      onlineAlbumId,
      localTracks,
      preferredQuality,
    })

    res.json({
      ok: true,
      mode: 'diff',
      data: {
        artist,
        album,
        ...data,
      },
    })
  } catch (e) {
    res.status(500).json({ error: e.message || '专辑检测失败' })
  }
})
