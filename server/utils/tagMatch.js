import { searchMusic } from '../musicSdk.js'
import { parseFilename, scoreMatch } from './filenameParse.js'
import { getLyric } from '../musicSdk.js'
import { fetchPicBuffer, detectImageMime } from './fetchPic.js'

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
  if (parsed.altKeyword) uniqueKeywords.push(parsed.altKeyword)

  let best = []
  let fallback = []
  for (const keyword of [...new Set(uniqueKeywords.filter(Boolean))]) {
    const result = await searchMusic(keyword, sdkSource, 1, 20)
    const list = result.list || []
    fallback = fallback.concat(list.map(item => ({ ...item, _score: 0, _source: sdkSource })))
    const scored = list.map(item => ({
      ...item,
      _score: scoreMatch(item, parsed),
      _source: sdkSource,
    })).filter(i => i._score > 0)
    best = best.concat(scored)
    if (best.some(i => i._score >= 7)) break
  }

  // 评分全被滤掉时，仍返回搜索第一页结果，避免自动匹配“完全没反应”
  const pool = best.length ? best : fallback
  const seen = new Set()
  return pool
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
  if (wantLyric && songId) {
    try {
      const lrc = await getLyric(songId, sdkSource)
      lyric = lrc.lyric || ''
    } catch {}
  }

  let pic = ''
  let picUrl = match.picUrl || ''
  // QQ：无 picUrl 时用 albummid 拼封面
  if (!picUrl && match.albummid) {
    picUrl = `https://y.gtimg.cn/music/photo_new/T002R500x500M000${match.albummid}.jpg`
  }
  if (wantCover && picUrl) {
    try {
      const buf = await fetchPicBuffer(picUrl)
      if (buf) {
        const mime = detectImageMime(buf)
        pic = `data:${mime};base64,${buf.toString('base64')}`
      }
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
