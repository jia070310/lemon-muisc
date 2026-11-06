import { Router } from 'express'
import { getLibraryUserData, setLibraryUserData } from '../utils/libraryUserData.js'
import { setUserSettings, USER_SETTING_KEYS } from '../utils/userSettings.js'
import { notifyLibraryUserDataChanged } from '../utils/libraryNotify.js'
import { buildUserBackupPayload, EXPORTABLE_USER_KEYS, restorePodcastFeeds, restoreSourceScripts } from '../utils/autoUserBackup.js'

export const backupRouter = Router()

backupRouter.get('/export', (req, res) => {
  try {
    const payload = buildUserBackupPayload(req.user, { includeSources: true })
    res.json({ ok: true, data: payload })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

backupRouter.post('/import', (req, res) => {
  try {
    const body = req.body || {}
    let data = body.data && typeof body.data === 'object' ? body.data : body
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: '备份内容无效' })
    }

    // 音源脚本在两种格式中都位于 data.sources（v2 与 users 同级），需先于 users 解包取出
    const sourcesIn = Array.isArray(data.sources) ? data.sources : null

    // 兼容 v2 自动升级备份：data = { sources, users }，取当前登录用户的条目
    if (Array.isArray(data.users)) {
      const users = data.users.filter((u) => u && typeof u === 'object')
      const mine =
        users.find((u) => String(u.id) === String(req.user.id)) ||
        users.find((u) => u.username && u.username === req.user.username) ||
        (users.length === 1 ? users[0] : null)
      if (!mine) {
        return res.status(400).json({ error: '备份中没有当前用户的数据' })
      }
      data = mine
    }

    const playlists = Array.isArray(data.playlists) ? data.playlists : null
    const favorites = Array.isArray(data.favorites) ? data.favorites : null
    const favoriteAlbums = Array.isArray(data.favoriteAlbums) ? data.favoriteAlbums : null
    const favoriteArtists = Array.isArray(data.favoriteArtists) ? data.favoriteArtists : null
    const recentPlays = Array.isArray(data.recentPlays) ? data.recentPlays : null
    const playStats = Array.isArray(data.playStats) ? data.playStats : null
    const settingsIn = data.settings && typeof data.settings === 'object' ? data.settings : {}
    const podcastFeedsIn = Array.isArray(data.podcastFeeds) ? data.podcastFeeds : null

    // 音源是全局数据，仅管理员可恢复；播客按当前用户恢复
    const canRestoreSources = req.user.role === 'admin' && Boolean(sourcesIn?.length)
    const hasPodcastFeeds = Boolean(podcastFeedsIn?.length)

    if (!playlists && !favorites && !favoriteAlbums && !favoriteArtists && !recentPlays && !playStats && !Object.keys(settingsIn).length && !canRestoreSources && !hasPodcastFeeds) {
      return res.status(400).json({ error: '备份中没有可导入的数据' })
    }

    const mode = req.body?.mode === 'merge' ? 'merge' : 'replace'
    const current = getLibraryUserData(req.user.id)

    let nextPlaylists = current.playlists
    let nextFavorites = current.favorites
    let nextFavoriteAlbums = current.favoriteAlbums
    let nextFavoriteArtists = current.favoriteArtists
    let nextRecent = current.recentPlays
    let nextPlayStats = current.playStats

    if (playlists) {
      if (mode === 'merge') {
        const byId = new Map((current.playlists || []).map((p) => [String(p.id), p]))
        for (const p of playlists) {
          if (p?.id) byId.set(String(p.id), p)
          else byId.set(`imported_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, {
            ...p,
            id: `imported_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          })
        }
        nextPlaylists = [...byId.values()]
      } else {
        nextPlaylists = playlists
      }
    }
    if (favorites) {
      nextFavorites = mode === 'merge'
        ? [...new Map([...(current.favorites || []), ...favorites].map((f) => [JSON.stringify(f), f])).values()]
        : favorites
    }
    if (recentPlays) {
      nextRecent = mode === 'replace' ? recentPlays : [...recentPlays, ...(current.recentPlays || [])].slice(0, 200)
    }
    if (playStats) {
      if (mode === 'replace') nextPlayStats = playStats
      else {
        const byKey = new Map((current.playStats || []).map((s) => [String(s?.key || ''), s]))
        for (const s of playStats) {
          const key = String(s?.key || '')
          if (!key) continue
          const prev = byKey.get(key)
          if (!prev) byKey.set(key, s)
          else {
            byKey.set(key, {
              ...prev,
              ...s,
              count: Math.max(Number(prev.count) || 0, Number(s.count) || 0),
              recentAts: [...new Set([...(prev.recentAts || []), ...(s.recentAts || [])])].slice(-200),
            })
          }
        }
        nextPlayStats = [...byKey.values()].slice(0, 500)
      }
    }
    if (favoriteAlbums) {
      nextFavoriteAlbums = mode === 'merge'
        ? [...new Map([...(current.favoriteAlbums || []), ...favoriteAlbums].map((a) => [String(a?.id || ''), a])).values()].filter((a) => a?.id)
        : favoriteAlbums
    }
    if (favoriteArtists) {
      nextFavoriteArtists = mode === 'merge'
        ? [...new Map([...(current.favoriteArtists || []), ...favoriteArtists].map((a) => [String(a?.id || ''), a])).values()].filter((a) => a?.id)
        : favoriteArtists
    }

    setLibraryUserData(req.user.id, {
      playlists: nextPlaylists,
      favorites: nextFavorites,
      favoriteAlbums: nextFavoriteAlbums,
      favoriteArtists: nextFavoriteArtists,
      recentPlays: nextRecent,
      playStats: nextPlayStats,
      revision: (current.revision || 0) + 1,
    })

    const toSet = {}
    for (const key of EXPORTABLE_USER_KEYS) {
      if (settingsIn[key] != null && USER_SETTING_KEYS.has(key)) toSet[key] = settingsIn[key]
    }
    if (Object.keys(toSet).length) setUserSettings(req.user.id, toSet)

    // replace：用备份覆盖同 id 音源；merge：保留现有，仅补新增
    const sourcesRestored = canRestoreSources ? restoreSourceScripts(sourcesIn, { mode }) : null
    const podcastsRestored = hasPodcastFeeds ? restorePodcastFeeds(req.user.id, podcastFeedsIn) : null

    notifyLibraryUserDataChanged(req.user.id)
    res.json({
      ok: true,
      imported: {
        playlists: playlists?.length || 0,
        favorites: favorites?.length || 0,
        favoriteAlbums: favoriteAlbums?.length || 0,
        favoriteArtists: favoriteArtists?.length || 0,
        recentPlays: recentPlays?.length || 0,
        playStats: playStats?.length || 0,
        settings: Object.keys(toSet).length,
        sources: sourcesRestored ? sourcesRestored.added + sourcesRestored.updated : 0,
        podcasts: podcastsRestored?.added || 0,
        mode,
      },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
