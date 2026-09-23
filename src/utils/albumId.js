/** 专辑详情页 id：artist::album（两端 encode，避免 & # % :: 等破坏 query / 解析） */

function safeDecode(part) {
  const s = String(part || '')
  if (!s) return ''
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export function encodeAlbumId(artist, album) {
  return `${encodeURIComponent(String(artist || ''))}::${encodeURIComponent(String(album || ''))}`
}

export function parseAlbumId(id) {
  const raw = String(id || '')
  const idx = raw.indexOf('::')
  if (idx < 0) return { artist: '', name: safeDecode(raw) }
  return {
    artist: safeDecode(raw.slice(0, idx)),
    name: safeDecode(raw.slice(idx + 2)),
  }
}
