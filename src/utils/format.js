export function formatDuration(seconds) {
  const n = Number(seconds)
  if (!n || !Number.isFinite(n) || n <= 0) return ''
  const total = Math.floor(n)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function isGarbledTag(text) {
  const s = String(text || '').trim()
  if (!s || /[\u4e00-\u9fff]/.test(s)) return false
  return /[ÃÂÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýÿ]{3,}/.test(s)
}

function cleanTagPart(value, { title } = {}) {
  const s = String(value || '').trim()
  if (!s || s === '未知专辑') return ''
  if (title && s === title) return ''
  if (isGarbledTag(s)) return ''
  return s
}

export function formatTrackTags(track) {
  const parts = []
  const album = cleanTagPart(track.album, { title: track.name })
  if (album) parts.push(album)
  if (track.year) parts.push(String(track.year))
  const genre = cleanTagPart(track.genre)
  if (genre) parts.push(genre)
  if (track.format) parts.push(String(track.format).toUpperCase())
  const dur = formatDuration(track.duration)
  if (dur) parts.push(dur)
  return parts.join(' · ') || '—'
}

export function formatAlbumTags(album) {
  const parts = []
  if (album.year) parts.push(String(album.year))
  const genre = cleanTagPart(album.genre)
  if (genre) parts.push(genre)
  if (album.trackCount) parts.push(`${album.trackCount} 首`)
  return parts.join(' · ')
}
