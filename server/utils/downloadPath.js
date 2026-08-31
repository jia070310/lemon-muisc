import path from 'path'

export function sanitizePathSegment(name) {
  return String(name || '').replace(/[\\/:*?"<>|]/g, '_').trim()
}

function resolveGroupMode(settings = {}) {
  const mode = String(settings['download.savePathGroupBy'] || '').trim()
  if (mode === 'artist' || mode === 'album' || mode === 'artist-album') return mode
  if (settings['download.isSavePathGroupByListName'] === 'true') return 'album'
  return 'none'
}

function pickArtistSegment(task = {}) {
  const raw = String(task.singer || '').trim()
  if (!raw) return ''
  return raw.split(/[/;；、,，|]/)[0]?.trim() || raw
}

function pickGroupSegment(mode, task = {}) {
  if (mode === 'album') return task.album || ''
  if (mode === 'artist') return pickArtistSegment(task)
  return ''
}

/** 根据设置解析下载保存目录（可在根目录下按歌手/专辑分子文件夹） */
export function resolveDownloadGroupDir(savePath, settings, task) {
  const mode = resolveGroupMode(settings)

  if (mode === 'artist-album') {
    const artist = sanitizePathSegment(pickArtistSegment(task)) || '未知歌手'
    const album = sanitizePathSegment(task.album || '') || '未知专辑'
    return path.join(savePath, artist, album)
  }

  const segment = sanitizePathSegment(pickGroupSegment(mode, task))
  if (!segment) return savePath
  return path.join(savePath, segment)
}
