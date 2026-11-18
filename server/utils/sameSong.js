/**
 * 跨平台同曲判定（服务端）：与前端 src/utils/trackMatch.js 口径一致。
 * 标题归一化相同 + 主唱相同 + 无版本冲突 + 双方时长有效时相差 ≤5 秒。
 */

const VERSION_TAG_RE = /\b(live|remix|mix|cover|inst\.?|instrumental|acoustic|demo|edit|bootleg|karaoke|伴奏|纯音乐|现场|翻唱|串烧|dj\s*版|dj版)\b/i

function stripDecor(text) {
  return String(text || '')
    .replace(/[《》「」『』【】[\]()（）·・._\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function normalizeSongTitle(name) {
  if (!name) return ''
  return stripDecor(
    String(name)
      .replace(/[《》「」『』【】[\]()（）]/g, ' ')
      .replace(/\s*(国语|粤语|英语|正式版|完整版|原版|电台版)\s*/gi, ' '),
  )
}

export function normalizeSongArtist(artist) {
  if (!artist) return ''
  return stripDecor(String(artist).split(/[/／,，&＆+、]/)[0] || '')
}

function extractVersionTags(name) {
  const text = String(name || '')
  const tags = new Set()
  const re = new RegExp(VERSION_TAG_RE.source, 'gi')
  let m
  while ((m = re.exec(text))) tags.add(m[1].toLowerCase().replace(/\s+/g, ''))
  return tags
}

function versionTagsConflict(a, b) {
  const ta = extractVersionTags(a)
  const tb = extractVersionTags(b)
  if (!ta.size && !tb.size) return false
  if (ta.size !== tb.size) return true
  for (const t of ta) {
    if (!tb.has(t)) return true
  }
  return false
}

export function parseTrackDurationSec(track) {
  const raw = track?.duration ?? track?.interval ?? 0
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw > 10000 ? raw / 1000 : raw
  }
  const s = String(raw || '').trim()
  if (!s) return 0
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s)
    return n > 10000 ? n / 1000 : n
  }
  const parts = s.split(':').map((p) => Number(p))
  if (parts.some((n) => Number.isNaN(n))) return 0
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}

export function isSameSongIdentity(a, b, { maxDurationDiffSec = 5 } = {}) {
  if (!a || !b) return false
  const keyA = String(a.key || '')
  const keyB = String(b.key || '')
  if (keyA && keyB && keyA === keyB) return true

  const titleA = normalizeSongTitle(a.name)
  const titleB = normalizeSongTitle(b.name)
  if (!titleA || !titleB || titleA !== titleB) return false

  const artistA = normalizeSongArtist(a.singer || a.artist)
  const artistB = normalizeSongArtist(b.singer || b.artist)
  if (!artistA || !artistB || artistA !== artistB) return false

  if (versionTagsConflict(a.name, b.name)) return false

  const durA = parseTrackDurationSec(a)
  const durB = parseTrackDurationSec(b)
  if (durA > 0 && durB > 0 && Math.abs(durA - durB) > maxDurationDiffSec) return false

  return true
}

export function findSameSongIndex(list, track) {
  if (!Array.isArray(list) || !track) return -1
  const key = String(track.key || '')
  if (key) {
    const byKey = list.findIndex((item) => item?.key === key)
    if (byKey >= 0) return byKey
  }
  return list.findIndex((item) => isSameSongIdentity(item, track))
}

export function mergeSameSongSnapshots(prev, next) {
  if (!prev) return next
  if (!next) return prev
  const prevCover = prev.picUrl || prev.img || prev.cover || ''
  const nextCover = next.picUrl || next.img || next.cover || ''
  const cover = nextCover || prevCover
  const prevAt = Number(prev.playedAt || prev.updatedAt || prev.savedAt || 0)
  const nextAt = Number(next.playedAt || next.updatedAt || next.savedAt || 0)
  const newerIsNext = nextAt >= prevAt
  const base = newerIsNext ? { ...prev, ...next } : { ...next, ...prev }
  const count = Math.max(Number(prev.count) || 0, Number(next.count) || 0)
  const playedSec = Math.max(Number(prev.playedSec) || 0, Number(next.playedSec) || 0)
  return {
    ...base,
    key: newerIsNext ? (next.key || prev.key) : (prev.key || next.key),
    picUrl: cover,
    img: cover,
    hasPicture: Boolean(cover || base.hasPicture),
    name: base.name || prev.name || next.name,
    singer: base.singer || prev.singer || next.singer,
    album: base.album || prev.album || next.album,
    duration: base.duration || prev.duration || next.duration,
    interval: base.interval || prev.interval || next.interval,
    ...(count ? { count } : {}),
    ...(playedSec ? { playedSec } : {}),
  }
}

/** 列表按同曲折叠，保留顺序（先出现的位置），元数据只增不丢 */
export function dedupeSameSongs(list) {
  if (!Array.isArray(list) || list.length < 2) return Array.isArray(list) ? list : []
  const out = []
  for (const item of list) {
    if (!item) continue
    const idx = findSameSongIndex(out, item)
    if (idx < 0) out.push(item)
    else out[idx] = mergeSameSongSnapshots(out[idx], item)
  }
  return out
}
