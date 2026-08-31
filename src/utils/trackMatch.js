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
