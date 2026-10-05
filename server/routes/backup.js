import { Router } from 'express'
import { getLibraryUserData, setLibraryUserData } from '../utils/libraryUserData.js'
import { getUserSettings, setUserSettings, USER_SETTING_KEYS } from '../utils/userSettings.js'
import { notifyLibraryUserDataChanged } from '../utils/libraryNotify.js'

export const backupRouter = Router()

const EXPORTABLE_USER_KEYS = [
  'ui.theme',
  'ui.librarySongColumns',
  'ui.lyricColorPreset',
  'ui.lyricTextColor',
  'ui.lyricHighlightColor',
  'player.coverStyle',
  'player.visualizer',
  'playlist.remoteSyncDays',
  'download.usePersonalSavePath',
  'source.active',
  'source.enabledPlatforms',
].filter((k) => USER_SETTING_KEYS.has(k))

backupRouter.get('/export', (req, res) => {
  try {
    const userData = getLibraryUserData(req.user.id)
    const allSettings = getUserSettings(req.user.id)
    const settings = {}
    for (const key of EXPORTABLE_USER_KEYS) {
      if (allSettings[key] != null) settings[key] = allSettings[key]
    }
    const payload = {
      app: 'lemon-music',
      type: 'user-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      username: req.user.username,
      data: {
        playlists: userData.playlists || [],
        favorites: userData.favorites || [],
        recentPlays: userData.recentPlays || [],
        settings,
      },
    }
    res.json({ ok: true, data: payload })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

backupRouter.post('/import', (req, res) => {
  try {
    const body = req.body || {}
    const root = body.data && typeof body.data === 'object' ? body : body
    const data = root.data || root
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: '备份内容无效' })
    }

    const playlists = Array.isArray(data.playlists) ? data.playlists : null
    const favorites = Array.isArray(data.favorites) ? data.favorites : null
    const recentPlays = Array.isArray(data.recentPlays) ? data.recentPlays : null
    const settingsIn = data.settings && typeof data.settings === 'object' ? data.settings : {}

    if (!playlists && !favorites && !recentPlays && !Object.keys(settingsIn).length) {
      return res.status(400).json({ error: '备份中没有可导入的数据' })
    }

    const mode = req.body?.mode === 'merge' ? 'merge' : 'replace'
    const current = getLibraryUserData(req.user.id)

    let nextPlaylists = current.playlists
    let nextFavorites = current.favorites
    let nextRecent = current.recentPlays

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

    setLibraryUserData(req.user.id, {
      playlists: nextPlaylists,
      favorites: nextFavorites,
      recentPlays: nextRecent,
      revision: (current.revision || 0) + 1,
    })

    const toSet = {}
    for (const key of EXPORTABLE_USER_KEYS) {
      if (settingsIn[key] != null && USER_SETTING_KEYS.has(key)) toSet[key] = settingsIn[key]
    }
    if (Object.keys(toSet).length) setUserSettings(req.user.id, toSet)

    notifyLibraryUserDataChanged(req.user.id)
    res.json({
      ok: true,
      imported: {
        playlists: playlists?.length || 0,
        favorites: favorites?.length || 0,
        recentPlays: recentPlays?.length || 0,
        settings: Object.keys(toSet).length,
        mode,
      },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
