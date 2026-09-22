import needle from 'needle'
import { searchMusic, fetchAlbum } from '../musicSdk.js'
import { parseFilename, scoreMatch } from './filenameParse.js'
import { fetchPicBuffer, detectImageMime } from './fetchPic.js'
import { fetchTrackLyric } from './trackMeta.js'
import { resolveCoverUrl } from './cover.js'
import { joinArtists } from './artistTag.js'

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

const WY_HEADERS = {
  Referer: 'https://music.163.com',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

function httpGet(url, headers = {}) {
  return needle('get', url, null, {
    headers,
    follow_max: 5,
    parse_response: false,
    timeout: 12000,
  }).then(resp => resp.body)
}

function parseJSON(buf) {
  try { return JSON.parse(buf.toString()) } catch { return null }
}

function cleanHtml(str) {
  if (!str) return ''
  return String(str).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

export function normalizeTagSource(source) {
  return SOURCE_MAP[source] || source || 'wy'
}

function parseYear(value) {
  if (value == null || value === '') return ''
  if (typeof value === 'number') {
    if (value > 1e12) return String(new Date(value).getUTCFullYear())
    if (value > 1e9) return String(new Date(value * 1000).getUTCFullYear())
    if (value >= 1900 && value <= 2100) return String(value)
  }
  const m = String(value).match(/\b(19|20)\d{2}\b/)
  return m ? m[0] : ''
}

function truncateComment(text, max = 240) {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

function normalizeGenre(value) {
  const s = cleanHtml(value)
  if (!s) return ''
  return s.split(/[,，/|、;；]/)[0].trim()
}

function parseYearFromDesc(desc) {
  const text = cleanHtml(desc)
  if (!text) return ''
  const cn = text.match(/(\d{4})\s*年/)
  if (cn) return cn[1]
  return parseYear(text)
}

function pickGenreFromInfo(info = {}) {
  const primary = normalizeGenre(info.genre || info.genreNew || info.tags)
  if (primary) return primary
  return normalizeGenre(info.language || info.lang || info.albumType || info.subType)
}

function pickYearFromInfo(info = {}) {
  return parseYear(info.publishTime || info.publishDate || info.releaseDate)
    || parseYearFromDesc(info.desc)
}

function mergeAlbumExtras(extras, info = {}) {
  const year = pickYearFromInfo(info)
  if (year) extras.year = year
  const genre = pickGenreFromInfo(info)
  if (genre) extras.genre = genre
  const comment = truncateComment(info.desc)
  if (comment) extras.comment = comment
  if (info.name) extras.album = cleanHtml(info.name)
  // 专辑详情的 author = Album Artist（整张专辑署名）
  if (info.author) extras.albumArtist = joinArtists(cleanHtml(info.author))
  if (info.img && !extras.picUrl) extras.picUrl = info.img
  if (!extras.genre && info.language) {
    const lang = normalizeGenre(info.language)
    if (lang) extras.genre = lang
  }
  return extras
}

function scoreMatchForTag(item, parsed) {
  let score = scoreMatch(item, parsed)
  const title = String(parsed?.title || '').trim().toLowerCase()
  const name = String(item?.name || '').trim().toLowerCase()
  const artist = String(parsed?.artist || '').trim().toLowerCase()
  const singer = String(item?.singer || '').trim().toLowerCase()
  const album = String(parsed?.album || '').trim().toLowerCase()
  const folderAlbum = String(parsed?.folderAlbum || '').trim().toLowerCase()
  const itemAlbum = String(item?.album || item?.albumName || '').trim().toLowerCase()
  if (title && name && !name.includes(title)) {
    score = Math.max(0, score - 6)
  }
  if (artist && singer && !singer.includes(artist)) {
    const mainArtist = artist.split(/[\s/、,，和与]+/).filter(Boolean)[0]
    if (mainArtist && !singer.includes(mainArtist)) score = Math.max(0, score - 5)
  }
  if (album && itemAlbum) {
    if (itemAlbum === album) score += 6
    else if (itemAlbum.includes(album) || album.includes(itemAlbum)) score += 3
    else score = Math.max(0, score - 5)
  }
  // 本地文件夹名（如演唱会）与结果专辑一致时强力加分，冲突则降权
  if (folderAlbum && itemAlbum) {
    if (itemAlbum === folderAlbum) score += 8
    else if (itemAlbum.includes(folderAlbum) || folderAlbum.includes(itemAlbum)) score += 4
    else if (!album || album === folderAlbum) score = Math.max(0, score - 6)
  }
  return score
}

async function fetchCrossSourceTagFallback(match, primarySource, { needCover = false } = {}) {
  // 歌名与专辑同名时，用「歌名 歌手」更稳（QQ 等对「歌名 歌名」常搜不出封面）
  const title = String(match?.name || '').trim()
  const album = String(match?.album || match?.albumName || '').trim()
  const artist = String(match?.singer || '').trim()
  const sameNameAlbum = title && album && title.toLowerCase() === album.toLowerCase()
  const keyword = sameNameAlbum
    ? [title, artist].filter(Boolean).join(' ')
    : ([title, album].filter(Boolean).join(' ') || [title, artist].filter(Boolean).join(' '))
  if (!keyword) return {}

  const trySources = ['tx', 'wy', 'kg', 'kw', 'mg'].filter(src => src !== primarySource)
  for (const src of trySources) {
    try {
      const result = await searchMusic(keyword, src, 1, 8)
      const hit = (result.list || [])
        .map(item => ({
          item,
          score: scoreMatchForTag(item, {
            title: match.name,
            artist: match.singer,
            album: match.album || match.albumName || '',
            keyword,
          }),
        }))
        .filter(row => row.score > 0)
        .sort((a, b) => b.score - a.score)[0]?.item
      if (!hit) continue
      const extras = await fetchAlbumTagExtras(hit, src)
      const cover = extras.picUrl || resolveCoverUrl({ ...hit, source: src })
      if (cover) extras.picUrl = cover
      if (extras.year || extras.genre || extras.comment || (needCover && extras.picUrl)) return extras
    } catch {}
  }
  return {}
}

function pickAlbumId(match, source) {
  const sdkSource = normalizeTagSource(source || match.source)
  const id = match.albumId || match.albumMid || match.albummid
    || match.al?.id
    || match.album?.id
  return id ? String(id) : ''
}

function wantsField(fields, name) {
  if (!fields?.length) return true
  if (fields.includes('all') || fields.includes('tags')) return true
  return fields.includes(name)
}

async function fetchAlbumTagExtras(match, source) {
  const sdkSource = normalizeTagSource(source || match.source)
  const albumId = pickAlbumId(match, sdkSource)
  if (!albumId) return {}

  try {
    const data = await fetchAlbum(sdkSource, albumId)
    const info = data?.info || {}
    return mergeAlbumExtras({}, info)
  } catch {
    return {}
  }
}

async function fetchWySongTagExtras(match) {
  const songId = match.songId || match.id
  if (!songId) return {}

  try {
    const extras = {}
    const detailBuf = await httpGet(
      `https://music.163.com/api/v3/song/detail?c=${encodeURIComponent(JSON.stringify([{ id: Number(songId) }]))}`,
      WY_HEADERS,
    )
    const detailData = parseJSON(detailBuf)
    const song = detailData?.songs?.[0]
    if (song) {
      const year = parseYear(song.publishTime)
      if (year) extras.year = year
      const tagNames = [
        ...(Array.isArray(song.displayTags) ? song.displayTags : []),
        ...(Array.isArray(song.entertainmentTags) ? song.entertainmentTags : []),
        ...(Array.isArray(song.markTags) ? song.markTags : []),
      ].map((tag) => (typeof tag === 'string' ? tag : tag?.name || tag?.tagName || '')).filter(Boolean)
      const genre = normalizeGenre(tagNames.join('/'))
      if (genre) extras.genre = genre
      if (song.al?.name) extras.album = cleanHtml(song.al.name)
      if (song.al?.id) {
        const albumExtras = await fetchAlbumTagExtras({ ...match, albumId: String(song.al.id) }, 'wy')
        return { ...extras, ...albumExtras }
      }
    }

    const buf = await httpGet(`https://music.163.com/api/song/detail/?ids=[${songId}]`, WY_HEADERS)
    const data = parseJSON(buf)
    const legacySong = data?.songs?.[0]
    if (!legacySong) return extras

    const al = legacySong.al || {}
    if (al.name) extras.album = cleanHtml(al.name)
    const year = parseYear(al.publishTime)
    if (year) extras.year = year

    if (al.id) {
      const albumExtras = await fetchAlbumTagExtras({ ...match, albumId: String(al.id) }, 'wy')
      return { ...extras, ...albumExtras }
    }
    return extras
  } catch {
    return {}
  }
}

async function fetchTagTextExtras(match, source) {
  const sdkSource = normalizeTagSource(source || match.source)
  let extras = await fetchAlbumTagExtras(match, sdkSource)
  if (sdkSource === 'wy' && (!extras.year || !extras.genre || !extras.comment)) {
    const wyExtras = await fetchWySongTagExtras(match)
    extras = { ...wyExtras, ...extras }
  }
  if (!extras.year && extras.comment) {
    const year = parseYearFromDesc(extras.comment)
    if (year) extras.year = year
  }
  if (!extras.genre || !extras.year) {
    const fallback = await fetchCrossSourceTagFallback(match, sdkSource)
    if (!extras.year && fallback.year) extras.year = fallback.year
    if (!extras.genre && fallback.genre) extras.genre = fallback.genre
    if (!extras.comment && fallback.comment) extras.comment = fallback.comment
  }
  return extras
}

export async function matchByFilename(fileName, source = 'wy', limit = 8, album = '', folderAlbum = '') {
  const parsed = parseFilename(fileName)
  return matchByArtistTitle(parsed.artist, parsed.title, source, limit, parsed, album, folderAlbum)
}

export async function matchByArtistTitle(artist = '', title = '', source = 'wy', limit = 8, parsedOverride = null, album = '', folderAlbum = '') {
  const sdkSource = normalizeTagSource(source)
  const a = String(artist || '').trim()
  const t = String(title || '').trim()
  const folderAlb = String(folderAlbum || parsedOverride?.folderAlbum || '').trim()
  const alb = String(album || parsedOverride?.album || '').trim() || folderAlb
  const parsed = parsedOverride
    ? {
      ...parsedOverride,
      album: alb || String(parsedOverride.album || '').trim(),
      folderAlbum: folderAlb || String(parsedOverride.folderAlbum || '').trim(),
    }
    : {
      title: t,
      artist: a,
      album: alb,
      folderAlbum: folderAlb,
      keyword: [a, t].filter(Boolean).join(' '),
      altKeyword: a && t ? `${t} ${a}` : '',
      swapped: a && t ? { title: a, artist: t, keyword: `${t} ${a}` } : null,
    }
  if (!parsed.title && t) parsed.title = t
  if (!parsed.artist && a) parsed.artist = a
  if (!parsed.album && alb) parsed.album = alb
  if (!parsed.folderAlbum && folderAlb) parsed.folderAlbum = folderAlb

  const keywords = []
  // 默认优先「歌名 专辑名」，同名多专辑时更准（issue #23）
  if (parsed.title && parsed.album) {
    // 歌名=专辑名时，「歌名 专辑」会退化成重复词，QQ 等接口常搜不出有效封面
    if (String(parsed.title).trim().toLowerCase() !== String(parsed.album).trim().toLowerCase()) {
      keywords.push(`${parsed.title} ${parsed.album}`)
    }
  }
  if (parsed.title) keywords.push(parsed.title)
  if (parsed.title && parsed.artist) {
    keywords.push(`${parsed.title} ${parsed.artist}`)
    keywords.push(`${parsed.artist} ${parsed.title}`)
  }
  if (parsed.title && parsed.artist && parsed.album) {
    keywords.push(`${parsed.title} ${parsed.artist} ${parsed.album}`)
  }
  if (parsed.artist && !parsed.title) keywords.push(parsed.artist)
  if (!keywords.length && parsed.keyword) keywords.push(parsed.keyword)
  if (parsed.altKeyword) keywords.push(parsed.altKeyword)
  if (parsed.swapped?.keyword) keywords.push(parsed.swapped.keyword)

  let best = []
  let fallback = []
  for (const keyword of [...new Set(keywords.filter(Boolean))]) {
    const result = await searchMusic(keyword, sdkSource, 1, 20)
    const list = result.list || []
    fallback = fallback.concat(list.map(item => ({ ...item, _score: 0, _source: sdkSource })))
    const scored = list.map(item => ({
      ...item,
      _score: scoreMatchForTag(item, parsed),
      _source: sdkSource,
    })).filter(i => i._score > 0)
    best = best.concat(scored)
    if (best.some(i => i._score >= 7)) break
  }

  const pool = best.length
    ? best
    : fallback
      .map(item => ({ ...item, _score: scoreMatchForTag(item, parsed) }))
      .filter(i => i._score > 0)
  let finalPool = pool
  if (!finalPool.length && sdkSource !== 'tx' && (parsed.title || parsed.artist)) {
    return matchByArtistTitle(artist, title, 'tx', limit, parsed, album, folderAlb)
  }
  if (!finalPool.length) finalPool = fallback.slice(0, limit)
  const seen = new Set()
  return finalPool
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
  const wantLyric = wantsField(fields, 'lyric')
  const wantCover = wantsField(fields, 'cover')
  const wantTags = !fields?.length
    || fields.includes('all')
    || fields.includes('tags')
    || ['title', 'artist', 'albumArtist', 'album', 'year', 'genre', 'comment'].some((key) => fields.includes(key))

  const meta = {
    title: cleanHtml(match.name || ''),
    artist: joinArtists(cleanHtml(match.singer || '')),
    albumArtist: '',
    album: cleanHtml(match.album || match.albumName || ''),
    year: '',
    genre: '',
    comment: '',
    picUrl: '',
    pic: '',
    lyric: '',
    songId,
    source: sdkSource,
  }

  if (wantTags) {
    const extras = await fetchTagTextExtras(match, sdkSource)
    if (extras.title) meta.title = extras.title
    if (extras.artist) meta.artist = joinArtists(extras.artist)
    if (extras.albumArtist) meta.albumArtist = joinArtists(extras.albumArtist)
    if (extras.album) meta.album = extras.album
    if (extras.year) meta.year = extras.year
    if (extras.genre) meta.genre = extras.genre
    if (extras.comment) meta.comment = extras.comment
    if (extras.picUrl) meta.picUrl = extras.picUrl
    // 专辑接口未给艺人时，用曲目歌手兜底（常见单人专辑）
    if (!meta.albumArtist && meta.artist) meta.albumArtist = meta.artist
  }

  if (wantLyric) {
    try {
      const lrc = await fetchTrackLyric({
        source: sdkSource,
        songId,
        musicInfo: match,
        meta: match,
        useOtherSource: true,
      })
      meta.lyric = lrc?.lyric || ''
    } catch {}
  }

  if (!meta.picUrl) meta.picUrl = resolveCoverUrl({ ...match, source: sdkSource })

  // 主平台无封面（歌名专辑同名等）：跨平台补封面
  if (wantCover && !meta.picUrl) {
    try {
      const coverFallback = await fetchCrossSourceTagFallback(match, sdkSource, { needCover: true })
      if (coverFallback.picUrl) meta.picUrl = coverFallback.picUrl
    } catch {}
  }

  if (wantCover && meta.picUrl) {
    try {
      const buf = await fetchPicBuffer(meta.picUrl)
      if (buf) {
        const mime = detectImageMime(buf)
        meta.pic = `data:${mime};base64,${buf.toString('base64')}`
      }
    } catch {}
  }

  // URL 有但拉图失败：再试跨平台
  if (wantCover && !meta.pic) {
    try {
      const coverFallback = await fetchCrossSourceTagFallback(match, sdkSource, { needCover: true })
      if (coverFallback.picUrl && coverFallback.picUrl !== meta.picUrl) {
        meta.picUrl = coverFallback.picUrl
        const buf = await fetchPicBuffer(meta.picUrl)
        if (buf) {
          const mime = detectImageMime(buf)
          meta.pic = `data:${mime};base64,${buf.toString('base64')}`
        }
      }
    } catch {}
  }

  return meta
}
