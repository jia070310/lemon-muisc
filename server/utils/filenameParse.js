export function parseFilename(fileName) {
  const base = fileName.replace(/\.[^.]+$/, '').trim()
  if (!base) return { title: '', artist: '', keyword: '' }

  const sepMatch = base.match(/^(.+?)\s*[-–—_]\s*(.+)$/)
  if (sepMatch) {
    const a = sepMatch[1].trim()
    const b = sepMatch[2].trim()
    return {
      title: a,
      artist: b,
      keyword: `${a} ${b}`,
      altKeyword: `${b} ${a}`,
    }
  }

  return { title: base, artist: '', keyword: base }
}

export function scoreMatch(item, parsed) {
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
