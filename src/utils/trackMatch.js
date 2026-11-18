const MATCH_THRESHOLD = 7

function scoreOne(item, parsed) {
  const name = (item.name || '').toLowerCase()
  const singer = (item.singer || item.artist || '').toLowerCase()
  const title = (parsed.title || '').toLowerCase()
  const artist = (parsed.artist || '').toLowerCase()
  let score = 0

  if (title && name.includes(title)) score += 3
  if (artist && singer.includes(artist)) score += 3
  if (title && name === title) score += 2
  if (artist && singer === artist) score += 2
  if (title && artist && name.includes(title) && singer.includes(artist)) score += 4

  const keyword = (parsed.keyword || '').toLowerCase()
  if (keyword && `${name} ${singer}`.includes(keyword.replace(/\s+/g, ' '))) score += 2

  return score
}

export function scoreTrackMatch(localTrack, parsed) {
  let score = scoreOne(localTrack, parsed)
  if (parsed?.swapped) {
    score = Math.max(score, scoreOne(localTrack, parsed.swapped))
  }
  return score
}

export function trackToMatchParsed(track) {
  const title = String(track?.name || '').trim()
  const artist = String(track?.singer || track?.artist || '').trim()
  if (!title) return null
  return {
    title,
    artist,
    keyword: `${artist} ${title}`.trim(),
    swapped: artist
      ? { title: artist, artist: title, keyword: `${title} ${artist}`.trim() }
      : null,
  }
}

export function findLocalMatchForTrack(onlineTrack, libraryTracks, minScore = MATCH_THRESHOLD) {
  const parsed = trackToMatchParsed(onlineTrack)
  if (!parsed?.title) return null
  let best = null
  let bestScore = 0
  for (const local of libraryTracks) {
    const score = scoreTrackMatch(local, parsed)
    if (score > bestScore) {
      bestScore = score
      best = local
      if (score >= minScore + 4) break
    }
  }
  return bestScore >= minScore ? best : null
}

export function isLocalPlaylistTrack(track) {
  if (!track) return false
  if (track.localPath || track.filePath) return true
  if (track.key && String(track.key).startsWith('local:')) return true
  return track.source === 'local'
}

/** 版本标记：Live / 翻唱 / remix 等，有则不与「原版」合并 */
const VERSION_TAG_RE = /\b(live|remix|mix|cover|inst\.?|instrumental|acoustic|demo|edit|bootleg|karaoke|伴奏|纯音乐|现场|翻唱|串烧|dj\s*版|dj版)\b/i

function stripDecor(text) {
  return String(text || '')
    .replace(/[《》「」『』【】[\]()（）·・._\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** 标题归一化：去掉括号装饰与常见版后缀，保留版本冲突检测用的原文 */
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
  // 一方有版本标记、另一方没有 → 不合并（避免 Live 并进原版）
  if (ta.size !== tb.size) return true
  for (const t of ta) {
    if (!tb.has(t)) return true
  }
  return false
}

/** 解析时长为秒；无效返回 0 */
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

/**
 * 跨平台同曲判定（用于最近播放 / 听歌排行去重）：
 * 标题归一化相同 + 主唱相同 + 无版本冲突 + 双方时长有效时相差 ≤5 秒。
 */
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

/** 在列表中找第一条同曲；优先同 key，再按同曲身份 */
export function findSameSongIndex(list, track) {
  if (!Array.isArray(list) || !track) return -1
  const key = String(track.key || '')
  if (key) {
    const byKey = list.findIndex((item) => item?.key === key)
    if (byKey >= 0) return byKey
  }
  return list.findIndex((item) => isSameSongIdentity(item, track))
}

/**
 * 合并两条同曲快照：保留更新的 playedAt / updatedAt，封面与元数据只增不丢。
 */
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
  }
}
