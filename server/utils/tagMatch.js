import { searchMusic } from '../musicSdk.js'
import { parseFilename, scoreMatch } from './filenameParse.js'
import { getLyric } from '../musicSdk.js'
import { fetchPicBuffer } from './fetchPic.js'

const SOURCE_MAP = {
  wy: 'wy',
  netease: 'wy',
  kw: 'kw',
  kuwo: 'kw',
  kg: 'kg',
  kugou: 'kg',
  tx: 'tx',
  qmusic: 'tx',
  qq: 'tx',
  mg: 'mg',
  migu: 'mg',
}

export function normalizeTagSource(source) {
  return SOURCE_MAP[source] || source || 'wy'
}

export async function matchByFilename(fileName, source = 'wy', limit = 8) {
  const parsed = parseFilename(fileName)
  return matchByArtistTitle(parsed.artist, parsed.title, source, limit, parsed)
}

export async function matchByArtistTitle(artist = '', title = '', source = 'wy', limit = 8, parsedOverride = null) {
  const sdkSource = normalizeTagSource(source)
  const parsed = parsedOverride || {
    title: (title || '').trim(),
    artist: (artist || '').trim(),
    keyword: [artist, title].filter(Boolean).join(' '),
  }

  const keywords = []
  if (parsed.title) keywords.push(parsed.title)
  if (parsed.title && parsed.artist) {
    keywords.push(`${parsed.title} ${parsed.artist}`)
    keywords.push(`${parsed.artist} ${parsed.title}`)
  }
  if (parsed.artist && !parsed.title) keywords.push(parsed.artist)
  if (!keywords.length && parsed.keyword) keywords.push(parsed.keyword)

  const uniqueKeywords = [...new Set(keywords.filter(Boolean))]

  let best = []
  for (const keyword of uniqueKeywords) {
    const result = await searchMusic(keyword, sdkSource, 1, 20)
    const scored = (result.list || []).map(item => ({
      ...item,
      _score: scoreMatch(item, parsed),
      _source: sdkSource,
    })).filter(i => i._score > 0)
    best = best.concat(scored)
    if (best.some(i => i._score >= 7)) break
  }

  const seen = new Set()
  return best
    .sort((a, b) => b._score - a._score)
    .filter(item => {
      const key = `${item.source}-${item.id || item.songId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}

export async function fetchMatchMeta(match, source, fields = null) {
  const sdkSource = normalizeTagSource(source || match.source)
  const songId = match.songmid || match.hash || match.songId || match.copyrightId || match.id
  const wantLyric = !fields || fields.includes('lyric')
  const wantCover = !fields || fields.includes('cover')

  let lyric = ''
  if (wantLyric) {
    try {
      const lrc = await getLyric(songId, sdkSource)
      lyric = lrc.lyric || ''
    } catch {}
  }

  let pic = ''
  let picUrl = match.picUrl || ''
  if (wantCover && match.picUrl) {
    try {
      const buf = await fetchPicBuffer(match.picUrl)
      if (buf) pic = `data:image/jpeg;base64,${buf.toString('base64')}`
    } catch {}
  }

  return {
    title: match.name || '',
    artist: match.singer || '',
    album: match.album || match.albumName || '',
    picUrl,
    pic,
    lyric,
    songId,
    source: sdkSource,
  }
}
