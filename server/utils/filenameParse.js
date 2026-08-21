export function parseFilename(fileName) {
  const base = String(fileName || '').replace(/\.[^.]+$/, '').trim()
  if (!base) return { title: '', artist: '', keyword: '' }

  const sepMatch = base.match(/^(.+?)\s*[-–—_]\s*(.+)$/)
  if (sepMatch) {
    const left = sepMatch[1].trim()
    const right = sepMatch[2].trim()
    // 中文曲库常见：歌手 - 歌名；同时保留互换形态用于评分兜底
    return {
      title: right,
      artist: left,
      keyword: `${left} ${right}`,
      altKeyword: `${right} ${left}`,
      swapped: { title: left, artist: right, keyword: `${right} ${left}` },
    }
  }

  return { title: base, artist: '', keyword: base }
}

function scoreOne(item, parsed) {
  const name = (item.name || '').toLowerCase()
  const singer = (item.singer || '').toLowerCase()
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

export function scoreMatch(item, parsed) {
  let score = scoreOne(item, parsed)
  if (parsed?.swapped) {
    score = Math.max(score, scoreOne(item, parsed.swapped))
  }
  return score
}
