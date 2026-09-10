import needle from 'needle'

const req = (method, url, body, headers = {}) => {
  return needle(method, url, body, {
    headers,
    follow_max: 5,
    parse_response: false,
    timeout: 15000,
  }).then(resp => resp.body)
}

const parseJSON = (buf) => {
  if (buf == null) return null
  let text = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf)
  text = text.replace(/^\uFEFF/, '').trim()
  if (!text) return null
  try { return JSON.parse(text) } catch {}
  // QQ 等接口偶发 JSONP / 前缀包裹
  const start = text.search(/[\[{]/)
  const endObj = text.lastIndexOf('}')
  const endArr = text.lastIndexOf(']')
  const end = Math.max(endObj, endArr)
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)) } catch {}
  }
  return null
}

// --- 酷我 kw (单引号JSON需转换) ---
async function kwSearch(keyword, page = 1, limit = 30) {
  const url = `https://search.kuwo.cn/r.s?client=kt&all=${encodeURIComponent(keyword)}&pn=${page - 1}&rn=${limit}&uid=0&ver=kwplayer_ar_9.2.2.1&vipver=1&show_copyright_off=1&newver=1&ft=music&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&moession=`
  const raw = await req('get', url)
  const fixed = raw.toString().replace(/'/g, '"')
  const data = JSON.parse(fixed)
  if (!data?.abslist) return { list: [], allPage: 0, total: 0 }
  return {
    list: data.abslist.map(item => {
      const types = parseKwTypes(item)
      return withTypes({
        id: item.MUSICRID?.replace('MUSIC_', '') || item.DC_TARGETID || '',
        name: cleanHtml(item.SONGNAME),
        singer: formatArtists(item.ARTIST),
        album: cleanHtml(item.ALBUM),
        albumName: cleanHtml(item.ALBUM),
        albumId: String(item.ALBUMID || item.albumid || item.AlbumId || ''),
        interval: formatTime(parseInt(item.DURATION) || 0),
        source: 'kw',
        songId: item.MUSICRID?.replace('MUSIC_', '') || item.DC_TARGETID || '',
        musicId: item.MUSICRID?.replace('MUSIC_', '') || item.DC_TARGETID || '',
        rid: item.MUSICRID?.replace('MUSIC_', '') || '',
        dcTargetId: item.DC_TARGETID || '',
        picUrl: kwPicUrl(item),
        img: kwPicUrl(item),
      }, types)
    }),
    allPage: Math.ceil((parseInt(data.TOTAL) || 0) / limit),
    total: parseInt(data.TOTAL) || 0,
  }
}

// --- 酷狗 kg ---
function mapKgWebSearchItem(item) {
  const types = parseKgTypes(item)
  return withTypes({
    id: item.FileHash || '',
    name: cleanHtml(item.SongName),
    singer: formatArtists(item.SingerName),
    album: cleanHtml(item.AlbumName),
    interval: formatTime(item.Duration || 0),
    source: 'kg',
    songId: item.FileHash || '',
    hash: item.FileHash || '',
    albumId: item.AlbumID || '',
    albumAudioId: String(item.ID || item.AlbumAudioID || item.MixSongID || ''),
    duration: item.Duration || 0,
    picUrl: kgPicUrl(item),
    img: kgPicUrl(item),
  }, types)
}

function buildKgSearchResult(list, total, limit) {
  const safeTotal = total || list.length
  return {
    list,
    allPage: Math.max(1, Math.ceil(safeTotal / limit)),
    total: safeTotal,
  }
}

async function kgSearchWeb(keyword, page = 1, limit = 30) {
  const url = `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=${limit}&userid=-1&clientver=2000&platform=WebFilter&filter=2&iscorrection=1&privilege_filter=0&area_code=1`
  const data = parseJSON(await req('get', url, null, KG_HEADERS))
  const lists = data?.data?.lists
  if (!Array.isArray(lists) || !lists.length) return null
  return buildKgSearchResult(lists.map(mapKgWebSearchItem), data.data.total || 0, limit)
}

async function kgSearchMobile(keyword, page = 1, limit = 30) {
  const url = `http://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=${limit}&showtype=1`
  const data = await kgFetchMobileJson(url, 2)
  const lists = data?.data?.lists || data?.data?.info
  if (data?.status !== 1 || !Array.isArray(lists) || !lists.length) return null
  const list = lists.map(mapKgSongItem).filter(s => s.hash || s.name)
  if (!list.length) return null
  return buildKgSearchResult(list, data.data.total || list.length, limit)
}

async function kgSearchComplex(keyword, page = 1, limit = 30) {
  const url = `https://complexsearch.kugou.com/v2/search/song?keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=${limit}&bitrate=0&isfuzzy=0&tag=em&inputtype=0&platform=WebFilter&userid=-1&clientver=2000&iscorrection=1&privilege_filter=0&filter=2&token=&appid=1014`
  const data = parseJSON(await req('get', url, null, KG_HEADERS))
  const lists = data?.data?.lists
  if (!Array.isArray(lists) || !lists.length) return null
  return buildKgSearchResult(lists.map(mapKgWebSearchItem), data.data.total || 0, limit)
}

// --- QQ音乐 tx ---
const TX_H5_HEADERS = {
  Referer: 'https://y.qq.com/m/index.html',
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
}

/** H5 搜索（旧 client_search_cp 对多数出口 IP 返回 500/空） t: 0 歌曲 / 8 专辑 */
async function txH5Search(keyword, page = 1, limit = 30, type = 0) {
  const url =
    `https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp?g_tk=5381&uin=0&format=json` +
    `&inCharset=utf-8&outCharset=utf-8&notice=0&platform=h5&needNewCode=1` +
    `&w=${encodeURIComponent(keyword)}&zhidaqu=1&catZhida=1&t=${type}&flag=1&ie=utf-8&sem=1&aggr=0` +
    `&perpage=${limit}&n=${limit}&p=${page}&remoteplace=txt.mqq.all`
  let raw
  try {
    raw = await req('get', url, null, TX_H5_HEADERS)
  } catch (e) {
    throw new Error(e?.message || 'QQ音乐搜索网络异常，请稍后重试')
  }
  const data = parseJSON(raw)
  if (!data) {
    throw new Error('QQ音乐搜索返回异常，请稍后重试')
  }
  if (data.code !== 0) {
    throw new Error(`QQ音乐搜索失败(${data.code})，请稍后重试`)
  }
  return data
}

async function txSearch(keyword, page = 1, limit = 30) {
  const data = await txH5Search(keyword, page, limit, 0)
  const list = data?.data?.song?.list
  if (!Array.isArray(list)) return { list: [], allPage: 0, total: 0 }
  const total = data.data.song.totalnum || list.length
  return {
    list: list.map(mapTxSongItem),
    allPage: Math.max(1, Math.ceil(total / limit)),
    total,
  }
}

// --- 网易云 wy (cloudsearch API) ---
async function wySearch(keyword, page = 1, limit = 30) {
  const offset = (page - 1) * limit
  const buf = await req('get',
    `https://music.163.com/api/cloudsearch/pc?s=${encodeURIComponent(keyword)}&type=1&offset=${offset}&limit=${limit}`,
    null, {
      Referer: 'https://music.163.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })
  const data = parseJSON(buf)
  if (!data?.result?.songs) return { list: [], allPage: 0, total: 0 }
  const total = data.result.songCount || 0
  return {
    list: data.result.songs.map(item => {
      const types = parseWyTypes(item)
      return withTypes({
        id: String(item.id),
        name: cleanHtml(item.name),
        singer: formatArtists((item.ar || item.artists || []).map(a => a.name).join('/')),
        album: cleanHtml(item.al?.name || item.album?.name),
        albumName: cleanHtml(item.al?.name || item.album?.name),
        albumId: String(item.al?.id || item.album?.id || ''),
        interval: formatTime(Math.floor((item.dt || item.duration || 0) / 1000)),
        source: 'wy',
        songId: String(item.id),
        picUrl: item.al?.picUrl || '',
        img: item.al?.picUrl || '',
      }, types)
    }),
    allPage: Math.ceil(total / limit),
    total,
  }
}

// --- 咪咕 mg ---
async function mgSearch(keyword, page = 1, limit = 30) {
  const url = `https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/search_all.do?text=${encodeURIComponent(keyword)}&pageNo=${page}&pageSize=${limit}&searchSwitch=%7B%22song%22%3A1%7D`
  const buf = await req('get', url, null, {
    Referer: 'https://music.migu.cn',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    channel: '0146951',
  })
  const data = parseJSON(buf)
  if (!data?.songResultData?.result) return { list: [], allPage: 0, total: 0 }
  const total = parseInt(data.songResultData.totalCount) || 0
  return {
    list: data.songResultData.result.map(item => {
      const types = parseMgTypes(item)
      return withTypes({
        id: item.copyrightId || item.id || '',
        name: cleanHtml(item.name),
        singer: formatArtists((item.singers || []).map(s => s.name).join('/')),
        album: cleanHtml(item.albums?.[0]?.name),
        albumName: cleanHtml(item.albums?.[0]?.name),
        albumId: String(item.albums?.[0]?.id || item.albumId || ''),
        interval: '',
        source: 'mg',
        songId: item.copyrightId || item.id || '',
        copyrightId: item.copyrightId || '',
        picUrl: mgPicUrl(item),
        img: mgPicUrl(item),
      }, types)
    }),
    allPage: Math.ceil(total / limit),
    total,
  }
}

// --- utils ---
function kwPicUrl(item) {
  // 搜索接口
  const album = String(item.web_albumpic_short || '').trim()
  if (album) {
    return `https://img4.kuwo.cn/star/albumcover/${album.replace(/120/, '500')}`
  }
  const artist = String(item.web_artistpic_short || '').trim()
  if (artist) {
    return `https://img1.kuwo.cn/star/starheads/${artist.replace(/120/, '500')}`
  }
  // 歌单 / 其它接口：pic、albumpic、artistPic 等
  for (const key of ['albumpic', 'pic', 'pic120', 'musicPic', 'artistPic', 'img']) {
    const v = item[key]
    if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) {
      return v.trim().replace(/\/120\//, '/500/')
    }
  }
  return ''
}

function kgPicUrl(item) {
  let img = item.Image || item.AlbumImage || item.album_img || item.imgurl
    || item.album_info?.sizable_cover || item.album_info?.imgurl || item.cover || item.img || item.pic || ''
  if (typeof img === 'string' && img) {
    return img.replace(/\{size\}/g, '400')
  }
  return ''
}

/** 酷狗专辑封面缓存（歌单/移动端曲目常只有 album_id） */
const kgAlbumCoverCache = new Map()

export async function kgResolveAlbumCover(albumId) {
  const id = String(albumId || '').trim()
  if (!id || id === '0') return ''
  if (kgAlbumCoverCache.has(id)) {
    const cached = kgAlbumCoverCache.get(id)
    return typeof cached?.then === 'function' ? await cached : (cached || '')
  }
  const pending = (async () => {
    try {
      let data = null
      for (const host of KG_MOBILE_HOSTS) {
        try {
          data = await kgFetchMobileJson(`${host}/api/v3/album/info?albumid=${encodeURIComponent(id)}`, 1)
          if (data?.data) break
        } catch {
          data = null
        }
      }
      const img = String(data?.data?.imgurl || data?.data?.img || '').replace(/\{size\}/g, '400')
      kgAlbumCoverCache.set(id, img || '')
      return img || ''
    } catch {
      kgAlbumCoverCache.set(id, '')
      return ''
    }
  })()
  kgAlbumCoverCache.set(id, pending)
  return pending
}

async function enrichKgSongsCoversByAlbum(songs, { playlistCover = '', concurrency = 5 } = {}) {
  if (!Array.isArray(songs) || !songs.length) return songs
  const needIds = [...new Set(
    songs
      .filter((s) => !(s.picUrl || s.img) && s.albumId)
      .map((s) => String(s.albumId).trim())
      .filter((id) => id && id !== '0'),
  )]
  if (needIds.length) {
    let next = 0
    const workers = Math.max(1, Math.min(concurrency, needIds.length))
    await Promise.all(Array.from({ length: workers }, async () => {
      while (next < needIds.length) {
        const id = needIds[next++]
        await kgResolveAlbumCover(id)
      }
    }))
  }
  const fallback = String(playlistCover || '').replace(/\{size\}/g, '400')
  return songs.map((s) => {
    if (s.picUrl || s.img) return s
    const albumPic = s.albumId ? kgAlbumCoverCache.get(String(s.albumId).trim()) : ''
    const pic = (typeof albumPic === 'string' ? albumPic : '') || fallback
    if (!pic) return s
    return { ...s, picUrl: pic, img: pic, coverFallback: Boolean(fallback && pic === fallback) }
  })
}

/** 移动端搜歌常无封面；用同批 web/complex 结果按 hash 补 pic */
function enrichKgListCovers(primaryList, ...coverSources) {
  if (!Array.isArray(primaryList) || !primaryList.length) return primaryList
  const coverByHash = new Map()
  for (const list of coverSources) {
    if (!Array.isArray(list)) continue
    for (const song of list) {
      const h = String(song?.hash || song?.id || '').toLowerCase()
      const pic = song?.picUrl || song?.img || ''
      if (h && pic && !coverByHash.has(h)) coverByHash.set(h, pic)
    }
  }
  if (!coverByHash.size) return primaryList
  return primaryList.map((song) => {
    if (song.picUrl || song.img) return song
    const pic = coverByHash.get(String(song.hash || song.id || '').toLowerCase())
    if (!pic) return song
    return { ...song, picUrl: pic, img: pic }
  })
}

async function kgSearch(keyword, page = 1, limit = 30) {
  const results = await Promise.allSettled([
    kgSearchMobile(keyword, page, limit),
    kgSearchWeb(keyword, page, limit),
    kgSearchComplex(keyword, page, limit),
  ])
  const settled = results.map((r) => (r.status === 'fulfilled' ? r.value : null))
  const [mobile, web, complex] = settled
  const primary = [mobile, web, complex].find((r) => r?.list?.length)
  if (!primary) return { list: [], allPage: 0, total: 0 }

  const coverLists = settled
    .filter((r) => r && r !== primary && r.list?.length)
    .map((r) => r.list)
  let list = enrichKgListCovers(primary.list, ...coverLists)
  // 仍几乎无封面时，优先改用带 Image 的 web 列表（保证搜索页能显示）
  const withPic = list.filter((s) => s.picUrl || s.img).length
  if (withPic < Math.min(3, list.length) && web?.list?.length) {
    const webFilled = enrichKgListCovers(web.list, primary.list, complex?.list)
    if (webFilled.some((s) => s.picUrl || s.img)) {
      list = webFilled
      const albumFilled = await enrichKgSongsCoversByAlbum(list)
      return { ...web, list: albumFilled }
    }
  }
  list = await enrichKgSongsCoversByAlbum(list)
  return { ...primary, list }
}

function mgPicUrl(item) {
  for (const key of ['img3', 'img2', 'img1', 'imgUrl', 'cover']) {
    if (typeof item[key] === 'string' && item[key]) return item[key]
  }
  const imgs = item.imgItems || item.imgList || []
  if (Array.isArray(imgs) && imgs.length) {
    const best = imgs.find(i => i.imgSizeType === '03' || i.imgSizeType === '02') || imgs[0]
    return best?.img || best?.url || ''
  }
  return ''
}

function cleanHtml(str) {
  if (!str) return ''
  let s = String(str).replace(/<[^>]+>/g, '')
  // 音源脚本偶发返回 \\u0026 这类转义
  s = s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  s = s.replace(/&nbsp;/gi, ' ')
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  s = s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  return s.replace(/\s+/g, ' ').trim()
}

function formatArtists(str) {
  let s = cleanHtml(str)
  if (!s) return ''
  s = s.replace(/\\&/g, '&')
  if (s.includes('\0')) {
    return s.split('\0').map((p) => p.trim()).filter(Boolean).join(' / ')
  }
  const parts = s.split(/(?:\s*\/\s*|\s*[;|]\s*|\s*[&＆]\s*|、|，|,)+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (!parts.length) return s
  const seen = new Set()
  const uniq = []
  for (const p of parts) {
    const key = p.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    uniq.push(p)
  }
  return uniq.join(' / ')
}

function formatSize(bytes) {
  const n = Number(bytes)
  if (!n || n <= 0) return ''
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

function buildTypes(qualityMap, formatMap = {}) {
  const types = []
  for (const [type, size] of Object.entries(qualityMap)) {
    if (size !== false && size !== 0 && size != null) {
      const entry = {
        type,
        size: typeof size === 'string' ? size : (size === true ? '' : formatSize(size)),
      }
      const fmt = formatMap[type]
      if (fmt) entry.format = String(fmt).toLowerCase()
      else if (type === '128k' || type === '320k') entry.format = 'mp3'
      else if (type === 'flac' || type === 'flac24bit' || type === 'hires' || type === 'master') entry.format = 'flac'
      else if (type === 'atmos' || type === 'atmos_plus') entry.format = 'm4a'
      if (!entry.size) delete entry.size
      types.push(entry)
    }
  }
  return types
}

function parseKwTypes(item) {
  const minfo = item.N_MINFO || item.MINFO
  if (!minfo) return []
  const map = {}
  const formats = {}
  /** @type {{ bitrate: number, level: string, fmt: string, size: string }[]} */
  const hiresCandidates = []

  for (const part of String(minfo).split(';')) {
    // level 可能含数字：zpga201 / zpga501 / zply …
    const m = part.match(/level:([^,]+),bitrate:(\d+),format:([^,]+),size:([^;]+)/i)
    if (!m) continue
    const level = String(m[1] || '').trim()
    const bitrate = parseInt(m[2], 10) || 0
    const fmt = String(m[3] || '').trim().toLowerCase()
    const sizeRaw = String(m[4] || '').trim()
    // 无效占位如 zpMb
    if (!sizeRaw || !/^[\d.]+/i.test(sizeRaw) || /zpmb/i.test(sizeRaw)) continue
    const size = sizeRaw.toUpperCase()

    if (bitrate === 128 && fmt === 'mp3') {
      map['128k'] = size
      formats['128k'] = 'mp3'
      continue
    }
    if (bitrate === 320 && fmt === 'mp3') {
      map['320k'] = size
      formats['320k'] = 'mp3'
      continue
    }
    // 标准无损：bitrate 2000 + flac（落雪「无损 FLAC」）
    if (bitrate === 2000 && (fmt === 'flac' || level === 'ff')) {
      map.flac = size
      formats.flac = 'flac'
      continue
    }
    // 旧接口 Hi-Res
    if (bitrate === 4000 && (fmt === 'flac' || fmt === 'mflac')) {
      map.flac24bit = size
      formats.flac24bit = 'flac'
      continue
    }
    // 新接口 Hi-Res：zpga201(20201) / zpga501 / zply 等 mflac，落雪显示「FLAC Hires」
    if ((fmt === 'mflac' || fmt === 'flac') && bitrate >= 4000) {
      hiresCandidates.push({ bitrate, level, fmt, size })
    }
  }

  if (!map.flac24bit && hiresCandidates.length) {
    // 优先 zpga201 / 20201（体量接近「标准 Hi-Res」）；否则取 bitrate 最低的一档，避免一上来就是上百 MB 母带
    hiresCandidates.sort((a, b) => {
      const rank = (c) => {
        if (c.level === 'zpga201' || c.bitrate === 20201) return 0
        if (c.level === 'zpga501' || c.bitrate === 20501) return 1
        return 10 + c.bitrate
      }
      return rank(a) - rank(b)
    })
    const best = hiresCandidates[0]
    map.flac24bit = best.size
    formats.flac24bit = 'flac'
  }

  return buildTypes(map, formats)
}

function parseKgTypes(item) {
  const map = {}
  if (item.FileSize) map['128k'] = item.FileSize
  if (item.HQFileSize) map['320k'] = item.HQFileSize
  if (item.SQFileSize) map.flac = item.SQFileSize
  if (item.ResFileSize) map.flac24bit = item.ResFileSize
  return buildTypes(map)
}

function parseTxTypes(item) {
  const f = item.file || {}
  const map = {}
  const formats = {}
  const s128 = f.size_128mp3 ?? item.size128
  const s320 = f.size_320mp3 ?? item.size320
  const sflac = f.size_flac ?? item.sizeflac
  const shires = f.size_hires ?? item.sizehires
  if (s128) { map['128k'] = s128; formats['128k'] = 'mp3' }
  if (s320) { map['320k'] = s320; formats['320k'] = 'mp3' }
  if (sflac) { map.flac = sflac; formats.flac = 'flac' }
  if (shires) { map.flac24bit = shires; formats.flac24bit = 'flac' }
  return buildTypes(map, formats)
}

function parseWyTypes(item) {
  const map = {}
  if (item.hr?.size) map.flac24bit = item.hr.size
  if (item.sq?.size) map.flac = item.sq.size
  if (item.h?.size) map['320k'] = item.h.size
  if (item.l?.size) map['128k'] = item.l.size
  // 仅有 maxbr、无分档体积时：只标最高可达档，不臆造 128+320+flac 全开
  if (!Object.keys(map).length && item.privilege?.maxbr) {
    const br = item.privilege.maxbr
    if (br >= 999000) map.flac = true
    else if (br >= 320000) map['320k'] = true
    else if (br >= 128000) map['128k'] = true
  }
  return buildTypes(map)
}

function parseMgTypes(item) {
  const map = {}
  const formats = item.newRateFormats || item.rateFormats || item.newFormat || item.audioFormats || []
  for (const type of formats) {
    const size = type.asize ?? type.isize ?? type.fileSize ?? type.size
    switch (type.formatType || type.format) {
      case 'PQ': map['128k'] = size; break
      case 'HQ': map['320k'] = size; break
      case 'SQ': map.flac = size; break
      case 'ZQ24': map.flac24bit = size; break
    }
  }
  return buildTypes(map)
}

function withTypes(base, types) {
  const ordered = Array.isArray(types) ? [...types] : []
  ordered.sort((a, b) => {
    const order = ['master', 'atmos_plus', 'atmos', 'hires', 'flac24bit', 'flac', '320k', '128k']
    const ia = order.indexOf(a?.type)
    const ib = order.indexOf(b?.type)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
  return {
    ...base,
    types: ordered,
    qualitys: ordered.map(t => t.type).filter(Boolean),
  }
}

/**
 * 给已映射歌曲挂上 types/qualitys（发现页新歌/榜单等复用）。
 * 优先解析音源返回的分档体积；接口未带体积时给出常见可取链档位（无 size），避免下载菜单空态。
 */
export function attachSongTypes(source, rawItem, mapped, { fallback = true } = {}) {
  const raw = rawItem && typeof rawItem === 'object' ? rawItem : {}
  let types = []
  if (source === 'tx') {
    types = parseTxTypes(raw)
  } else if (source === 'wy') {
    types = parseWyTypes(raw)
  } else if (source === 'kw') {
    types = parseKwTypes(raw)
  } else if (source === 'kg') {
    const audio = raw.audio_info || raw.audioInfo || {}
    types = parseKgTypes({
      FileSize: audio.filesize || raw.filesize || raw.FileSize,
      HQFileSize: audio.filesize_320 || raw.filesize_320 || raw['320filesize'] || raw.HQFileSize,
      SQFileSize: audio.filesize_flac || raw.filesize_flac || raw.sqfilesize || raw.SQFileSize,
      ResFileSize: audio.filesize_high || raw.filesize_high || raw.ResFileSize,
    })
    const hash = mapped?.hash || raw.hash || raw.FileHash || ''
    if (hash && types.length) types[0].hash = hash
  } else if (source === 'mg') {
    types = parseMgTypes(raw)
  }

  if (!types.length && fallback) {
    types = buildTypes({ flac: true, '320k': true, '128k': true })
  }
  return withTypes(mapped, types)
}

function formatTime(seconds) {
  if (!seconds || seconds <= 0) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** 对齐落雪 LX Music tx 歌曲字段（songId / songmid / strMediaMid 分开） */
function txCoverUrl(item, albumMid, albumName) {
  // 有 albumMid 即可拼封面，不强制要求专辑名（歌单里专辑名常为空）
  if (albumMid && String(albumMid) !== '0') {
    return `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumMid}.jpg`
  }
  const singerMid = item.singer?.[0]?.mid
  if (singerMid) {
    return `https://y.gtimg.cn/music/photo_new/T001R500x500M000${singerMid}.jpg`
  }
  if (albumName && albumName !== '空') {
    // 无 mid 时无法可靠拼 URL，仅占位避免误用
  }
  return ''
}

function mapTxSongItem(item) {
  const types = parseTxTypes(item)
  const albumMid = item.album?.mid || item.albummid || ''
  const albumName = cleanHtml(item.album?.name || item.albumname || '')
  const songmid = item.mid || item.songmid || ''
  const songId = item.id != null && item.id !== ''
    ? String(item.id)
    : (item.songid != null && item.songid !== '' ? String(item.songid) : songmid)
  const strMediaMid = item.file?.media_mid || item.strMediaMid || item.media_mid || ''
  const img = txCoverUrl(item, albumMid, albumName)

  return withTypes({
    id: songmid,
    name: cleanHtml(item.title || item.songname || item.name || ''),
    singer: formatArtists(
      Array.isArray(item.singer)
        ? item.singer.map(s => s.name).join('/')
        : (item.singername || ''),
    ),
    album: albumName,
    albumName,
    interval: formatTime(item.interval || 0),
    source: 'tx',
    songId,
    songmid,
    strMediaMid,
    musicId: songId,
    albumId: albumMid,
    albumMid,
    albummid: albumMid,
    img,
    picUrl: img,
  }, types)
}

// --- export ---
const sdkMap = { kw: kwSearch, kg: kgSearch, tx: txSearch, wy: wySearch, mg: mgSearch }

export const AVAILABLE_SOURCES = {
  kw: { name: '酷我', key: 'kw' },
  kg: { name: '酷狗', key: 'kg' },
  tx: { name: 'QQ音乐', key: 'tx' },
  wy: { name: '网易云', key: 'wy' },
  mg: { name: '咪咕', key: 'mg' },
}

export async function searchMusic(keyword, source, page = 1, limit = 30) {
  const fn = sdkMap[source]
  if (!fn) throw new Error(`不支持的搜索源: ${source}`)
  return fn(keyword, page, limit)
}

const WY_HEADERS = {
  Referer: 'https://music.163.com',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

const MG_HEADERS = {
  Referer: 'https://music.migu.cn',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  channel: '0146951',
}

function mapAlbumItem({ id, name, artist, img, publishTime, count, source }) {
  return {
    id: String(id),
    name: cleanHtml(name),
    artist: formatArtists(artist),
    img: img || '',
    publishTime: publishTime || '',
    count: Number(count) || 0,
    source,
  }
}

function buildAlbumSearchResult(list, total, limit) {
  const safeTotal = total || list.length
  return {
    list,
    allPage: Math.max(1, Math.ceil(safeTotal / limit)),
    total: safeTotal,
  }
}

async function wyAlbumSearch(keyword, page = 1, limit = 30) {
  const offset = (page - 1) * limit
  const buf = await req('get',
    `https://music.163.com/api/cloudsearch/pc?s=${encodeURIComponent(keyword)}&type=10&offset=${offset}&limit=${limit}`,
    null, WY_HEADERS)
  const data = parseJSON(buf)
  if (!data?.result?.albums) return { list: [], allPage: 0, total: 0 }
  const total = data.result.albumCount || 0
  return buildAlbumSearchResult(data.result.albums.map(item => mapAlbumItem({
    id: item.id,
    name: item.name,
    artist: (item.artists || []).map(a => a.name).join('/'),
    img: item.picUrl,
    publishTime: item.publishTime ? new Date(item.publishTime).toISOString().slice(0, 10) : '',
    count: item.size,
    source: 'wy',
  })), total, limit)
}

async function txAlbumSearch(keyword, page = 1, limit = 30) {
  const data = await txH5Search(keyword, page, limit, 8)
  const list = data?.data?.album?.list
  if (!Array.isArray(list) || !list.length) return { list: [], allPage: 0, total: 0 }
  const total = data.data.album.totalnum || list.length
  return buildAlbumSearchResult(list.map(item => {
    const albumMid = item.albumMID || item.albummid || item.albumId || ''
    return mapAlbumItem({
      id: albumMid || item.albumID || item.albumid,
      name: item.albumName || item.albumname || item.name,
      artist: item.singerName || item.singer || item.singername || '',
      img: item.albumPic
        || (albumMid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg` : ''),
      publishTime: item.publicTime || '',
      count: item.song_count || item.songnum || 0,
      source: 'tx',
    })
  }), total, limit)
}

function formatWyAlbumArtists(artist, artists) {
  if (Array.isArray(artists) && artists.length) {
    return formatArtists(artists.map(a => a.name).join('/'))
  }
  if (Array.isArray(artist) && artist.length) {
    return formatArtists(artist.map(a => a.name).join('/'))
  }
  if (artist && typeof artist === 'object') return formatArtists(artist.name || '')
  return ''
}

async function kwAlbumSearch(keyword, page = 1, limit = 30) {
  const url = `https://search.kuwo.cn/r.s?client=kt&all=${encodeURIComponent(keyword)}&pn=${page - 1}&rn=${limit}&uid=0&ver=kwplayer_ar_9.2.2.1&vipver=1&show_copyright_off=1&newver=1&ft=album&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&moession=`
  const raw = await req('get', url)
  const data = parseKuwoPlaylistBody(raw)
  const list = data?.albumlist || data?.abslist
  if (!list?.length) return { list: [], allPage: 0, total: 0 }
  const total = parseInt(data.total || data.TOTAL, 10) || 0
  return buildAlbumSearchResult(list.map(item => {
    const id = item.albumid || item.ALBUMID || item.id || item.DC_TARGETID || ''
    const pic = item.img || item.hts_img || (item.pic ? `https://img4.kuwo.cn/star/albumcover/500/${item.pic}` : '')
    return mapAlbumItem({
      id,
      name: item.name || item.NAME || item.ALBUM || item.DISPALBUMNAME,
      artist: item.artist || item.ARTIST || item.fartist,
      img: pic,
      publishTime: item.pub || item.RELEASEDATE || item.releaseDate || '',
      count: item.musiccnt || item.SONGNUM || item.songnum || 0,
      source: 'kw',
    })
  }), total, limit)
}

async function kgAlbumSearch(keyword, page = 1, limit = 30) {
  const url = `http://mobilecdn.kugou.com/api/v3/search/album?format=json&keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=${limit}&showtype=1`
  const data = await kgFetchMobileJson(url, 2)
  const info = data?.data?.info
  if (data?.status !== 1 || !Array.isArray(info) || !info.length) return { list: [], allPage: 0, total: 0 }
  const total = data.data.total || info.length
  return buildAlbumSearchResult(info.map(item => mapAlbumItem({
    id: item.albumid || item.album_id,
    name: item.albumname || item.album_name,
    artist: item.singername || item.author_name,
    img: (item.imgurl || item.img || '').replace('{size}', '400'),
    publishTime: item.publish_date || item.publishtime || '',
    count: item.songcount || item.song_count || 0,
    source: 'kg',
  })), total, limit)
}

function formatTxSingers(singers) {
  if (!singers) return ''
  if (Array.isArray(singers)) return formatArtists(singers.map(s => s.name).filter(Boolean).join('/'))
  if (typeof singers === 'object') return formatArtists(singers.name || '')
  return formatArtists(String(singers))
}

async function mgAlbumSearch(keyword, page = 1, limit = 30) {
  const url = `https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/search_all.do?text=${encodeURIComponent(keyword)}&pageNo=${page}&pageSize=${limit}&searchSwitch=%7B%22album%22%3A1%7D`
  const buf = await req('get', url, null, MG_HEADERS)
  const data = parseJSON(buf)
  if (!data?.albumResultData?.result) return { list: [], allPage: 0, total: 0 }
  const total = parseInt(data.albumResultData.totalCount, 10) || 0
  const mapped = data.albumResultData.result.map(item => mapAlbumItem({
    id: item.id || item.copyrightId,
    name: item.name,
    artist: item.singer || (item.singers || []).map(s => s.name).join('/'),
    img: item.imgItems?.[0]?.img || item.img || '',
    publishTime: item.publishDate || item.publishTime || '',
    count: item.songCount || item.totalCount || 0,
    source: 'mg',
  }))
  const list = mapped
    .filter(item => String(item.id).length < 14)
    .slice(0, limit)
  return buildAlbumSearchResult(list.length ? list : mapped.slice(0, limit), total, limit)
}

const albumSearchMap = {
  wy: wyAlbumSearch,
  tx: txAlbumSearch,
  kw: kwAlbumSearch,
  kg: kgAlbumSearch,
  mg: mgAlbumSearch,
}

export async function searchAlbums(keyword, source, page = 1, limit = 30) {
  const fn = albumSearchMap[source]
  if (!fn) throw new Error(`不支持的搜索源: ${source}`)
  return fn(keyword, page, limit)
}

function buildPlaylistSearchResult(list, total, limit) {
  const safeTotal = total || list.length
  return {
    list,
    allPage: Math.max(1, Math.ceil(safeTotal / limit)),
    total: safeTotal,
  }
}

async function wyPlaylistSearch(keyword, page = 1, limit = 30) {
  const offset = (page - 1) * limit
  const buf = await req('get',
    `https://music.163.com/api/cloudsearch/pc?s=${encodeURIComponent(keyword)}&type=1000&offset=${offset}&limit=${limit}`,
    null, WY_HEADERS)
  const data = parseJSON(buf)
  const playlists = data?.result?.playlists
  if (!Array.isArray(playlists) || !playlists.length) return { list: [], allPage: 0, total: 0 }
  const total = data.result.playlistCount || playlists.length
  return buildPlaylistSearchResult(playlists.map(item => mapRecommendItem({
    id: item.id,
    name: item.name,
    author: item.creator?.nickname,
    img: item.coverImgUrl,
    play_count: formatPlayCount(item.playCount),
    total: item.trackCount,
    desc: item.description,
    source: 'wy',
  })), total, limit)
}

async function txPlaylistSearch(keyword, page = 1, limit = 30) {
  // client_search_cp 歌单搜索已失效；专用歌单搜索接口仍可用
  const url =
    `https://c.y.qq.com/soso/fcgi-bin/client_music_search_songlist` +
    `?remoteplace=txt.yqq.center&searchid=${Date.now()}&page_no=${page}&num_per_page=${limit}` +
    `&query=${encodeURIComponent(keyword)}&format=json&outCharset=utf-8`
  const data = parseJSON(await req('get', url, null, {
    Referer: 'https://y.qq.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  }))
  if (!data || data.code !== 0) {
    throw new Error('QQ音乐歌单搜索失败，请稍后重试')
  }
  const list = data?.data?.list || []
  if (!list.length) return { list: [], allPage: 0, total: 0 }
  const total = data.data.display_num || data.data.sum || list.length
  return buildPlaylistSearchResult(list.map(item => mapRecommendItem({
    id: item.dissid || item.tid || item.id,
    name: cleanHtml(item.dissname || item.title || item.name || ''),
    author: item.creator?.name || item.nickname || item.creator_name || '',
    img: item.imgurl || item.cover_url_medium || item.logo || '',
    play_count: formatPlayCount(item.listennum || item.access_num || item.play_count),
    total: item.song_count || item.songnum || item.total || 0,
    desc: cleanHtml(item.introduction || item.desc || ''),
    source: 'tx',
  })), total, limit)
}

async function kwPlaylistSearch(keyword, page = 1, limit = 30) {
  const url = `https://search.kuwo.cn/r.s?client=kt&all=${encodeURIComponent(keyword)}&pn=${page - 1}&rn=${limit}&uid=0&ver=kwplayer_ar_9.2.2.1&vipver=1&show_copyright_off=1&newver=1&ft=playlist&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&moession=`
  const raw = await req('get', url)
  const data = parseKuwoPlaylistBody(raw)
  const list = data?.abslist || data?.playlist || data?.list
  if (!list?.length) return { list: [], allPage: 0, total: 0 }
  const total = parseInt(data.total || data.TOTAL, 10) || list.length
  return buildPlaylistSearchResult(list.map((item) => {
    const pid = item.playlistid || item.PLAYLISTID || item.id || item.DC_TARGETID || ''
    const digest = item.digest || item.DIGEST || '8'
    const id = pid ? `digest-${digest}__${pid}` : ''
    return mapRecommendItem({
      id,
      name: item.name || item.NAME || item.PLAYLISTNAME || item.DISSNAME,
      author: item.uname || item.NICK || item.artist || item.ARTIST || '',
      img: item.img || item.hts_img || item.pic || '',
      play_count: formatPlayCount(item.playcnt || item.PLAYCNT || item.listencnt),
      total: item.musiccnt || item.SONGNUM || item.songnum || item.total || 0,
      desc: item.info || item.INFO || item.desc || '',
      source: 'kw',
    })
  }).filter(item => item.id), total, limit)
}

async function kgPlaylistSearch(keyword, page = 1, limit = 30) {
  const url = `http://mobilecdn.kugou.com/api/v3/search/special?format=json&keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=${limit}&showtype=1`
  const data = await kgFetchMobileJson(url, 2)
  const info = data?.data?.info
  if (data?.status !== 1 || !Array.isArray(info) || !info.length) return { list: [], allPage: 0, total: 0 }
  const total = data.data.total || info.length
  return buildPlaylistSearchResult(info.map(item => mapRecommendItem({
    id: `id_${item.specialid || item.special_id || item.gid}`,
    name: item.specialname || item.special_name || item.intro,
    author: item.nickname || item.singername || item.username || '',
    img: (item.imgurl || item.img || '').replace(/\{size\}/g, '400'),
    play_count: formatPlayCount(item.playcount || item.play_count || item.total_play_count),
    total: item.songcount || item.song_count || 0,
    desc: item.intro || item.description || '',
    source: 'kg',
  })).filter(item => item.id && item.id !== 'id_'), total, limit)
}

async function mgPlaylistSearch(keyword, page = 1, limit = 30) {
  const url = `https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/search_all.do?text=${encodeURIComponent(keyword)}&pageNo=${page}&pageSize=${limit}&searchSwitch=%7B%22songList%22%3A1%7D`
  const buf = await req('get', url, null, MG_HEADERS)
  const data = parseJSON(buf)
  const result = data?.songListResultData?.result
    || data?.playlistResultData?.result
    || data?.songlistResultData?.result
  if (!Array.isArray(result) || !result.length) return { list: [], allPage: 0, total: 0 }
  const total = parseInt(
    data.songListResultData?.totalCount
    || data.playlistResultData?.totalCount
    || data.songlistResultData?.totalCount
    || result.length,
    10,
  ) || result.length
  return buildPlaylistSearchResult(result.map(item => mapRecommendItem({
    id: item.id || item.musicListId || item.playlistId || item.copyrightId,
    name: item.name || item.title,
    author: item.ownerName || item.userName || item.createName || (item.singer || ''),
    img: item.imgItems?.[0]?.img || item.img || item.image || '',
    play_count: formatPlayCount(item.playCount || item.playNum || item.keepNum),
    total: item.musicNum || item.songCount || item.totalCount || 0,
    desc: item.summary || item.intro || '',
    source: 'mg',
  })).filter(item => item.id), total, limit)
}

const playlistSearchMap = {
  wy: wyPlaylistSearch,
  tx: txPlaylistSearch,
  kw: kwPlaylistSearch,
  kg: kgPlaylistSearch,
  mg: mgPlaylistSearch,
}

export async function searchPlaylists(keyword, source, page = 1, limit = 30) {
  const fn = playlistSearchMap[source]
  if (!fn) throw new Error(`不支持的搜索源: ${source}`)
  return fn(keyword, page, limit)
}

async function wyAlbum(id) {
  let data = parseJSON(await req('get', `https://music.163.com/api/album/${id}?ext=true`, null, WY_HEADERS))
  if (data?.code !== 200 || !data.album) {
    data = parseJSON(await req('get', `https://music.163.com/api/v1/album/${id}`, null, WY_HEADERS))
  }
  if (data?.code !== 200 || !data.album) throw new Error('无法获取网易云专辑')
  const album = data.album
  if (!album.songs?.length && album.size > 0) {
    const ext = parseJSON(await req('get', `https://music.163.com/api/album/${id}?ext=true`, null, WY_HEADERS))
    if (ext?.album?.songs?.length) {
      album.songs = ext.album.songs
    }
  }
  const privMap = new Map((data.privileges || []).map(p => [p.id, p]))
  let list = (album.songs || []).map(item => mapWyPlaylistTrack(item, privMap.get(item.id), album))
  if (!list.length && album.name) {
    const searched = await wySearch(album.name, 1, 100)
    const albumName = cleanHtml(album.name)
    list = searched.list.filter(item => cleanHtml(item.album || item.albumName) === albumName)
  }
  if (!list.length) throw new Error('无法获取网易云专辑歌曲')
  return {
    list,
    total: album.size || list.length,
    source: 'wy',
    info: {
      name: cleanHtml(album.name),
      img: album.picUrl || '',
      desc: cleanHtml(album.description || ''),
      author: formatWyAlbumArtists(album.artist, album.artists),
      publishTime: album.publishTime ? new Date(album.publishTime).toISOString().slice(0, 10) : '',
      genre: cleanHtml(album.tags || album.subType || ''),
      language: cleanHtml(album.language || ''),
    },
  }
}

async function txAlbum(id) {
  const albumMid = String(id)
  const albumID = /^\d+$/.test(albumMid) ? Number(albumMid) : 0
  const pageSize = 100
  let begin = 0
  let detail = null
  let total = 0
  const list = []

  while (true) {
    const payload = {
      comm: { cv: 1602, ct: 20 },
      detail: {
        method: 'GetAlbumDetail',
        param: { albumMid, albumID },
        module: 'music.musichallAlbum.AlbumInfoServer',
      },
      songs: {
        method: 'GetAlbumSongList',
        param: { albumMid, begin, num: pageSize, order: 1 },
        module: 'music.musichallAlbum.AlbumSongList',
      },
    }
    const buf = await req('get', `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(JSON.stringify(payload))}`)
    const data = parseJSON(buf)
    if (data?.code !== 0) throw new Error('无法获取 QQ 音乐专辑')

    if (!detail) detail = data?.detail?.data || {}
    const songData = data?.songs?.data || {}
    total = parseInt(songData.totalNum, 10) || total
    const batch = (songData.songList || [])
      .map(entry => mapTxSongItem(entry.songInfo || entry))
      .filter(s => s.name || s.id)
    list.push(...batch)
    if (!batch.length || list.length >= total || batch.length < pageSize) break
    begin += pageSize
  }

  if (!list.length) throw new Error('无法获取 QQ 音乐专辑')

  const basic = detail?.basicInfo || detail || {}
  return {
    list,
    total: total || list.length,
    source: 'tx',
    info: {
      name: cleanHtml(basic.name || basic.title || list[0]?.album || ''),
      img: basic.pic || basic.picUrl || list[0]?.img || '',
      desc: cleanHtml(detail?.desc || detail?.description || basic.desc || ''),
      author: formatTxSingers(detail?.singer || basic.singer),
      publishTime: basic.publishDate || basic.aDate || basic.pubTime || basic.time_public || '',
      genre: cleanHtml(basic.genreNew || basic.genre || ''),
      language: cleanHtml(basic.language || ''),
      albumType: cleanHtml(basic.albumType || ''),
    },
  }
}

async function kwAlbum(id) {
  const infoData = parseJSON(await req('get', `http://wapi.kuwo.cn/api/www/album/albumInfo?albumId=${id}`))
  const meta = infoData?.data || {}

  const attempts = [
    `http://search.kuwo.cn/r.s?client=kt&pn=0&rn=1000&uid=0&ver=kwplayer_ar_9.2.2.1&vipver=1&ft=music&albumid=${id}&encoding=utf8&rformat=json&show_copyright_off=1&newver=1`,
    `http://search.kuwo.cn/r.s?client=kt&rformat=json&encoding=utf8&pcmp4=1&vipver=1&newver=1&pn=0&rn=1000&albumid=${id}&ft=album`,
  ]
  const settled = await Promise.allSettled(attempts.map(async (url) => {
    const data = parseKuwoPlaylistBody(await req('get', url))
    return data.musiclist || data.abslist || []
  }))
  let musiclist = []
  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value.length) {
      musiclist = result.value
      break
    }
  }
  let list = []
  if (musiclist.length) {
    list = musiclist.map(item => {
      const types = parseKwTypes(item)
      const musicRid = String(item.musicrid || item.MUSICRID || '').replace(/^MUSIC_/i, '')
      const dcTargetId = String(item.dcTargetId || item.DC_TARGETID || item.audiosourceid || '')
      const songId = String(item.id || musicRid || dcTargetId || '')
      return withTypes({
        id: songId,
        name: cleanHtml(item.name || item.SONGNAME),
        singer: formatArtists(item.artist || item.ARTIST),
        album: cleanHtml(item.album || item.ALBUM || meta.album || meta.name || ''),
        albumName: cleanHtml(item.album || item.ALBUM || meta.album || meta.name || ''),
        interval: formatTime(parseInt(item.duration, 10) || parseInt(item.DURATION, 10) || 0),
        source: 'kw',
        songId,
        songmid: songId,
        musicId: songId,
        rid: musicRid || songId,
        dcTargetId,
        albumId: String(id),
        picUrl: kwPicUrl(item) || meta.pic || '',
        img: kwPicUrl(item) || meta.pic || '',
      }, types)
    })
  } else if (meta.album) {
    const searched = await kwSearch(meta.album, 1, 100)
    const albumName = cleanHtml(meta.album)
    list = searched.list.filter(item => cleanHtml(item.album || item.albumName) === albumName)
  }
  if (!list.length) throw new Error('无法获取酷我专辑')

  return {
    list,
    total: parseInt(meta.total, 10) || list.length,
    source: 'kw',
    info: {
      name: cleanHtml(meta.album || meta.name || ''),
      img: meta.pic || '',
      desc: cleanHtml(meta.albuminfo || meta.info || meta.desc || ''),
      author: formatArtists(meta.artist || meta.ARTIST || ''),
      publishTime: meta.releaseDate || meta.pub || meta.RELEASEDATE || '',
      genre: cleanHtml(meta.lang || meta.content_type || ''),
    },
  }
}

async function kgAlbum(id) {
  const infoData = await kgFetchMobileJson(`http://mobilecdn.kugou.com/api/v3/album/info?albumid=${id}`, 2)
  const albumInfo = infoData?.data || {}
  const all = []
  let page = 1
  let total = 0
  while (true) {
    const data = await kgFetchMobileJson(
      `http://mobilecdn.kugou.com/api/v3/album/song?albumid=${id}&page=${page}&pagesize=300&version=9108`,
      2,
    )
    if (data?.status !== 1) break
    total = parseInt(data.data?.total, 10) || total
    const batch = (data.data?.info || []).map(mapKgSongItem).filter(s => s.hash || s.name)
    all.push(...batch)
    if (!batch.length || all.length >= total) break
    page += 1
  }
  if (!all.length) throw new Error('无法获取酷狗专辑')
  const albumCover = String(albumInfo.imgurl || albumInfo.img || '').replace(/\{size\}/g, '400')
  const list = albumCover
    ? all.map((s) => (s.picUrl || s.img ? s : { ...s, picUrl: albumCover, img: albumCover }))
    : all
  return {
    list,
    total: total || list.length,
    source: 'kg',
    info: {
      name: cleanHtml(albumInfo.albumname || albumInfo.name || ''),
      img: albumCover,
      desc: cleanHtml(albumInfo.intro || albumInfo.description || ''),
      author: formatArtists(albumInfo.singername || albumInfo.author_name || ''),
      publishTime: albumInfo.publishtime || albumInfo.publish_date || '',
      genre: cleanHtml(albumInfo.language || albumInfo.type || albumInfo.genre || ''),
    },
  }
}

async function mgAlbum(id) {
  const headers = {
    Referer: 'https://m.music.migu.cn/',
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
    channel: '0146951',
  }

  let albumInfo = null
  const all = []
  let page = 1
  let total = 0

  const songEndpoints = [
    (albumId, pageNo) => `https://app.c.nf.migu.cn/MIGUM3.0/resource/music/album/song/v2.0?albumId=${albumId}&pageNo=${pageNo}&pageSize=50`,
    (albumId, pageNo) => `https://c.musicapp.migu.cn/MIGUM3.0/resource/music/album/song/v2.0?albumId=${albumId}&pageNo=${pageNo}&pageSize=50`,
  ]

  for (const buildUrl of songEndpoints) {
    all.length = 0
    page = 1
    total = 0
    while (true) {
      const buf = await req('get', buildUrl(id, page), null, headers)
      const data = parseJSON(buf)
      if (data?.code !== '000000' && data?.code !== 0) break
      total = parseInt(data.data?.totalCount, 10) || total
      const batch = (data.data?.songList || data.data?.songs || []).map(item => {
        const types = parseMgTypes(item)
        return withTypes({
          id: item.copyrightId || item.songId || item.id || '',
          name: cleanHtml(item.songName || item.name),
          singer: formatArtists((item.singerList || item.singers || []).map(s => s.name).join('/')),
          album: cleanHtml(item.album || albumInfo?.name || ''),
          albumName: cleanHtml(item.album || albumInfo?.name || ''),
          interval: formatTime(item.duration || 0),
          source: 'mg',
          songId: item.copyrightId || item.songId || item.id || '',
          copyrightId: item.copyrightId || '',
          picUrl: item.img3 || item.img2 || item.img1 || albumInfo?.img || '',
          img: item.img3 || item.img2 || item.img1 || albumInfo?.img || '',
        }, types)
      })
      all.push(...batch)
      if (!batch.length || all.length >= total) break
      page += 1
    }
    if (all.length) break
  }

  if (!all.length) {
    const infoBuf = await req('get', `https://c.musicapp.migu.cn/MIGUM3.0/resource/info/albumInfo?albumId=${id}`, null, headers)
    const infoData = parseJSON(infoBuf)
    albumInfo = infoData?.data || {}
    throw new Error('暂无法获取咪咕专辑歌曲，请尝试其他平台')
  }

  if (!albumInfo) {
    const infoBuf = await req('get', `https://c.musicapp.migu.cn/MIGUM3.0/resource/info/albumInfo?albumId=${id}`, null, headers)
    const infoData = parseJSON(infoBuf)
    albumInfo = infoData?.data || {}
  }

  return {
    list: all,
    total: total || all.length,
    source: 'mg',
    info: {
      name: cleanHtml(albumInfo.name || albumInfo.title || all[0]?.album || ''),
      img: albumInfo.img || albumInfo.imgItems?.[0]?.img || all[0]?.img || '',
      desc: cleanHtml(albumInfo.summary || albumInfo.desc || ''),
      author: formatArtists((albumInfo.singers || []).map(s => s.name).join('/') || albumInfo.singer || ''),
      publishTime: albumInfo.publishTime || albumInfo.publishDate || '',
      genre: cleanHtml(albumInfo.genre || albumInfo.language || albumInfo.type || ''),
    },
  }
}

const albumMap = { wy: wyAlbum, tx: txAlbum, kw: kwAlbum, kg: kgAlbum, mg: mgAlbum }

export async function fetchAlbum(source, id) {
  if (!AVAILABLE_SOURCES[source]) throw new Error(`不支持的平台: ${source}`)
  const fn = albumMap[source]
  if (!fn) throw new Error(`不支持的平台: ${source}`)
  return fn(String(id))
}

// --- 歌单解析 ---
function formatPlayCount(n) {
  const num = Number(n)
  if (!num || num <= 0) return ''
  if (num >= 100000000) return `${(num / 100000000).toFixed(1).replace(/\.0$/, '')}亿`
  if (num >= 10000) return `${(num / 10000).toFixed(1).replace(/\.0$/, '')}万`
  return String(num)
}

export function parsePlaylistInput(source, raw) {
  const input = String(raw || '').trim()
  if (!input) throw new Error('请输入歌单链接或 ID')

  let token = ''
  let body = input
  if (input.includes('###')) {
    const idx = input.indexOf('###')
    body = input.slice(0, idx).trim()
    token = input.slice(idx + 3).trim()
  }

  const idFromUrl = (patterns) => {
    for (const re of patterns) {
      const m = body.match(re)
      if (m?.[1]) return m[1]
    }
    return null
  }

  switch (source) {
    case 'wy': {
      const id = idFromUrl([/(?:\?|&)id=(\d+)/, /\/playlist\/(\d+)/, /^(\d+)$/])
      if (!id) throw new Error('无法解析网易云歌单，请粘贴完整链接或歌单 ID')
      return { id, token }
    }
    case 'tx': {
      const id = idFromUrl([/\/playlist\/(\d+)/, /[?&]id=(\d+)/, /^(\d+)$/])
      if (!id) throw new Error('无法解析 QQ 音乐歌单，请粘贴完整链接或歌单 ID')
      return { id }
    }
    case 'kw': {
      if (/^digest-\d+__\d+$/.test(body)) return { digestId: body }
      const id = idFromUrl([/\/playlist(?:_detail)?\/(\d+)/, /[?&]pid=(\d+)/, /^(\d+)$/])
      if (!id) throw new Error('无法解析酷我歌单，请粘贴完整链接或歌单 ID')
      return { id }
    }
    case 'mg': {
      const id = idFromUrl([/\/playlist\/(\d+)/, /[?&](?:playlistId|id)=(\d+)/, /^(\d+)$/])
      if (!id) throw new Error('无法解析咪咕歌单，请粘贴完整链接或歌单 ID')
      return { id }
    }
    case 'kg': {
      const collectionId = body.match(/global_collection_id=([a-zA-Z0-9_]+)/)?.[1]
        || body.match(/(collection_[a-zA-Z0-9_]+)/)?.[1]
      if (collectionId) return { globalCollectionId: collectionId }
      const gcid = body.match(/(gcid_[a-zA-Z0-9_]+)/)?.[1]
      if (gcid) return { encodeGcid: gcid }
      if (/^id_\d+$/.test(body)) return { id: body.replace(/^id_/, '') }
      const id = idFromUrl([/\/special\/single\/(\d+)/, /\/songlist\/(\d+)/, /^(\d+)$/])
      if (id) return { id }
      throw new Error('无法解析酷狗歌单，请使用歌单分享链接或数字 ID')
    }
    default:
      throw new Error(`不支持的平台: ${source}`)
  }
}

async function wyFetchSongsByIds(ids, headers) {
  const BATCH = 200
  const songs = []
  const privileges = []
  const postHeaders = {
    ...headers,
    'Content-Type': 'application/x-www-form-urlencoded',
  }

  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    const c = JSON.stringify(chunk.map(id => ({ id: String(id) })))
    const buf = await req('post', 'https://music.163.com/api/v3/song/detail', `c=${encodeURIComponent(c)}`, postHeaders)
    const data = parseJSON(buf)
    if (data?.code !== 200) continue
    if (data.songs?.length) songs.push(...data.songs)
    if (data.privileges?.length) privileges.push(...data.privileges)
  }

  return { songs, privileges }
}

function mapWyPlaylistTrack(item, priv, pl) {
  const types = parseWyTypes({ ...item, privilege: priv })
  return withTypes({
    id: String(item.id),
    name: cleanHtml(item.name),
    singer: formatArtists((item.ar || []).map(a => a.name).join('/')),
    album: cleanHtml(item.al?.name),
    albumName: cleanHtml(item.al?.name),
    interval: formatTime(Math.floor((item.dt || 0) / 1000)),
    source: 'wy',
    songId: String(item.id),
    songmid: String(item.id),
    picUrl: item.al?.picUrl || pl.coverImgUrl || '',
    img: item.al?.picUrl || pl.coverImgUrl || '',
  }, types)
}

const PLAYLIST_PARTIAL_LIMIT = 100

/** 歌单曲目缺封面时回落到歌单封面，避免导入音乐库后大量空白封面 */
function applyPlaylistTrackCoverFallback(list, cover) {
  const fallback = String(cover || '').replace(/\{size\}/g, '400').trim()
  if (!Array.isArray(list) || !list.length) return list || []
  const resolvedCover = fallback
    || list.find((s) => s?.picUrl || s?.img)?.picUrl
    || list.find((s) => s?.img)?.img
    || ''
  if (!resolvedCover) return list
  return list.map((s) => {
    if (s?.picUrl || s?.img) return s
    return { ...s, picUrl: resolvedCover, img: resolvedCover, coverFallback: true }
  })
}

function finalizePlaylistInfo(info, list) {
  const base = info && typeof info === 'object' ? { ...info } : { name: '', img: '', desc: '', author: '', play_count: '' }
  if (base.img || base.picUrl) {
    base.img = String(base.img || base.picUrl || '').replace(/\{size\}/g, '400')
    return base
  }
  const fromTrack = list.find((s) => s?.picUrl || s?.img)?.picUrl
    || list.find((s) => s?.img)?.img
    || ''
  if (fromTrack) base.img = fromTrack
  return base
}

function buildPlaylistResponse(list, total, source, info, { partial = false, hasMore = false } = {}) {
  const nextInfo = finalizePlaylistInfo(info, list)
  const enriched = applyPlaylistTrackCoverFallback(list, nextInfo.img || nextInfo.picUrl || '')
  return {
    list: enriched,
    total: total || enriched.length,
    source,
    info: nextInfo,
    ...(partial ? { partial: true, hasMore: Boolean(hasMore) } : { partial: false, hasMore: false }),
  }
}

async function wyPlaylist({ id, token }, options = {}) {
  const headers = {
    Referer: 'https://music.163.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  }
  if (token) headers.Cookie = `MUSIC_U=${token}`

  const buf = await req('get', `https://music.163.com/api/v6/playlist/detail?id=${id}&n=100000&s=8`, null, headers)
  const data = parseJSON(buf)
  if (data?.code !== 200 || !data.playlist) {
    throw new Error('无法获取网易云歌单，私人歌单请在链接或 ID 后加 ###MUSIC_U')
  }

  const pl = data.playlist
  const privMap = new Map((data.privileges || []).map(p => [p.id, p]))
  const trackIdList = (pl.trackIds || []).map(t => (typeof t === 'object' ? t.id : t)).filter(Boolean)
  const total = pl.trackCount || trackIdList.length || 0
  const info = {
    name: cleanHtml(pl.name),
    img: pl.coverImgUrl || '',
    desc: cleanHtml(pl.description || ''),
    author: cleanHtml(pl.creator?.nickname || ''),
    play_count: formatPlayCount(pl.playCount),
  }

  if (options.partial) {
    const partialIds = trackIdList.slice(0, PLAYLIST_PARTIAL_LIMIT)
    let tracks = (pl.tracks || []).filter(t => partialIds.includes(t.id))
    if (partialIds.length > tracks.length || trackIdList.length > (pl.tracks || []).length) {
      const fetched = await wyFetchSongsByIds(partialIds, headers)
      for (const p of fetched.privileges) privMap.set(p.id, p)
      const trackMap = new Map(fetched.songs.map(t => [t.id, t]))
      tracks = partialIds.map(tid => trackMap.get(tid)).filter(Boolean)
    } else {
      tracks = tracks.slice(0, PLAYLIST_PARTIAL_LIMIT)
    }
    const list = tracks.map(item => mapWyPlaylistTrack(item, privMap.get(item.id), pl))
    return buildPlaylistResponse(list, total, 'wy', info, { partial: true, hasMore: total > list.length })
  }

  let tracks = pl.tracks || []

  if (trackIdList.length > tracks.length) {
    const fetched = await wyFetchSongsByIds(trackIdList, headers)
    for (const p of fetched.privileges) privMap.set(p.id, p)
    const trackMap = new Map(fetched.songs.map(t => [t.id, t]))
    tracks = trackIdList.map(tid => trackMap.get(tid)).filter(Boolean)
  }

  if (!tracks.length && (trackIdList.length || pl.trackCount)) {
    throw new Error('歌单歌曲未返回，若为私人歌单请在链接或 ID 后加 ###MUSIC_U')
  }

  const list = tracks.map(item => mapWyPlaylistTrack(item, privMap.get(item.id), pl))
  return buildPlaylistResponse(list, total, 'wy', info)
}

const TX_PLAYLIST_HEADERS = (id) => ({
  Referer: `https://y.qq.com/n/yqq/playlist/${id}.html`,
  Origin: 'https://y.qq.com',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
})

/** QQ 歌单默认常只回 50 首；必须带 song_begin/song_num，并用 songnum 作为真实总数 */
async function txFetchPlaylistCd(id, songBegin = 0, songNum = 1000) {
  const url = `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg`
    + `?type=1&json=1&utf8=1&onlysong=0&new_format=1&disstid=${id}`
    + `&song_begin=${songBegin}&song_num=${songNum}`
    + `&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8`
    + `&notice=0&platform=yqq.json&needNewCode=0`
  const data = parseJSON(await req('get', url, null, TX_PLAYLIST_HEADERS(id)))
  const cd = data?.cdlist?.[0]
  if (data?.code !== 0 || !cd) return null
  return cd
}

async function txFetchPlaylistCdViaMusicu(id, songBegin = 0, songNum = 1000) {
  const payload = {
    comm: {
      ct: 24,
      cv: 0,
      format: 'json',
      platform: 'yqq.json',
      uin: '0',
      g_tk: 5381,
      needNewCode: 1,
    },
    req_1: {
      module: 'music.srfDissInfo.aiDissInfo',
      method: 'uniform_get_Dissinfo',
      param: {
        disstid: Number(id) || id,
        userinfo: 1,
        tag: 1,
        orderlist: 1,
        song_begin: songBegin,
        song_num: songNum,
        onlysonglist: 0,
        enc_host_uin: '',
      },
    },
  }
  const data = parseJSON(await req('post', 'https://u.y.qq.com/cgi-bin/musicu.fcg', JSON.stringify(payload), {
    ...TX_PLAYLIST_HEADERS(id),
    Referer: `https://y.qq.com/n/yqq/playsquare/${id}.html`,
    'Content-Type': 'application/json',
  }))
  const result = data?.req_1?.data
  if (data?.code !== 0 || data?.req_1?.code !== 0 || !result) return null
  const dirinfo = result.dirinfo || {}
  return {
    dissname: dirinfo.title || dirinfo.dissname || '',
    logo: dirinfo.picurl || dirinfo.logo || '',
    desc: dirinfo.desc || '',
    nickname: dirinfo.host_nick || dirinfo.nickname || '',
    visitnum: dirinfo.listennum || dirinfo.visitnum || 0,
    songnum: result.songnum || result.total_song_num || (result.songlist || []).length,
    songlist: result.songlist || [],
  }
}

function txPlaylistInfoFromCd(cd) {
  return {
    name: cleanHtml(cd.dissname),
    img: cd.logo || '',
    desc: cleanHtml(cd.desc || ''),
    author: cleanHtml(cd.nickname || ''),
    play_count: formatPlayCount(cd.visitnum),
  }
}

async function txPlaylist({ id }, options = {}) {
  const pageSize = options.partial ? PLAYLIST_PARTIAL_LIMIT : 1000
  let cd = await txFetchPlaylistCd(id, 0, pageSize)
  if (!cd?.songlist) cd = await txFetchPlaylistCdViaMusicu(id, 0, pageSize)
  if (!cd?.songlist) throw new Error('无法获取 QQ 音乐歌单')

  const info = txPlaylistInfoFromCd(cd)
  const total = parseInt(cd.songnum, 10) || cd.songlist.length || 0
  let all = (cd.songlist || []).map(mapTxSongItem)

  if (options.partial) {
    return buildPlaylistResponse(all, total || all.length, 'tx', info, {
      partial: true,
      hasMore: (total || 0) > all.length,
    })
  }

  while (all.length < total) {
    const next = await txFetchPlaylistCd(id, all.length, pageSize)
      || await txFetchPlaylistCdViaMusicu(id, all.length, pageSize)
    const batch = (next?.songlist || []).map(mapTxSongItem)
    if (!batch.length) break
    all = all.concat(batch)
    if (batch.length < pageSize) break
  }

  return buildPlaylistResponse(all, total || all.length, 'tx', info)
}

function parseKuwoPlaylistBody(raw) {
  const text = raw.toString().trim()
  try {
    return JSON.parse(text)
  } catch {
    return JSON.parse(text.replace(/'/g, '"'))
  }
}

async function kwPlaylist({ id, digestId }, options = {}) {
  if (digestId) {
    const match = digestId.match(/^digest-(\d+)__(\d+)$/)
    if (match) {
      const digest = Number(match[1])
      const pid = match[2]
      if (digest === 8 || digest === 13) return kwPlaylist({ id: pid })
      if (digest === 5) {
        const infoBuf = await req('get', `http://qukudata.kuwo.cn/q.k?op=query&cont=ninfo&node=${pid}&pn=0&rn=1&fmt=json&src=mbox&level=2`)
        const infoData = parseJSON(infoBuf)
        const sourceId = infoData?.child?.[0]?.sourceid
        if (sourceId) return kwPlaylist({ id: String(sourceId) })
      }
      return kwPlaylist({ id: pid })
    }
  }

  let page = 0
  const all = []
  let meta = null
  let total = 0

  while (true) {
    const pageSize = options.partial && page === 0 ? PLAYLIST_PARTIAL_LIMIT : 1000
    const url = `http://nplserver.kuwo.cn/pl.svc?op=getlistinfo&pid=${id}&pn=${page}&rn=${pageSize}&encode=utf8&keyset=pl2012&identity=kuwo&pcmp4=1&vipver=MUSIC_9.0.5.0_W1&newver=1`
    const raw = await req('get', url)
    const data = parseKuwoPlaylistBody(raw)
    if (data.result !== 'ok' && !data.musiclist?.length) throw new Error('无法获取酷我歌单')

    if (!meta) {
      meta = {
        name: cleanHtml(data.title),
        img: data.pic || '',
        desc: cleanHtml(data.info || ''),
        author: cleanHtml(data.uname || ''),
        play_count: formatPlayCount(data.playnum),
      }
      total = parseInt(data.total, 10) || 0
    }

    const batch = (data.musiclist || []).map(item => {
      const types = parseKwTypes(item)
      const musicRid = String(item.musicrid || item.MUSICRID || '').replace(/^MUSIC_/i, '')
      const dcTargetId = String(item.dcTargetId || item.DC_TARGETID || item.audiosourceid || '')
      const songId = String(item.id || musicRid || dcTargetId || '')
      return withTypes({
        id: songId,
        name: cleanHtml(item.name),
        singer: formatArtists(item.artist),
        album: cleanHtml(item.album),
        albumName: cleanHtml(item.album),
        interval: formatTime(parseInt(item.duration, 10) || 0),
        source: 'kw',
        songId,
        songmid: songId,
        musicId: songId,
        rid: musicRid || songId,
        dcTargetId,
        albumId: item.albumid || '',
        picUrl: kwPicUrl(item),
        img: kwPicUrl(item),
      }, types)
    })

    all.push(...batch)
    if (options.partial) {
      const t = total || all.length
      return buildPlaylistResponse(all, t, 'kw', meta, { partial: true, hasMore: all.length < t })
    }
    if (!batch.length || all.length >= total) break
    page += 1
  }

  return buildPlaylistResponse(all, total || all.length, 'kw', meta)
}

async function mgPlaylist({ id }, options = {}) {
  const infoBuf = await req('get', `https://c.musicapp.migu.cn/MIGUM3.0/resource/playlist/v2.0?playlistId=${id}`, null, {
    Referer: 'https://music.migu.cn',
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
  })
  const infoData = parseJSON(infoBuf)
  const plInfo = infoData?.data || {}
  const info = {
    name: cleanHtml(plInfo.title),
    img: plInfo.imgItem?.img || plInfo.img || '',
    desc: cleanHtml(plInfo.summary || ''),
    author: cleanHtml(plInfo.ownerName || ''),
    play_count: formatPlayCount(plInfo.opNumItem?.playNum),
  }

  const all = []
  let page = 1
  let total = 0

  while (true) {
    const buf = await req('get',
      `https://app.c.nf.migu.cn/MIGUM3.0/resource/playlist/song/v2.0?pageNo=${page}&pageSize=50&playlistId=${id}`,
      null, {
        Referer: 'https://m.music.migu.cn/',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
      })
    const data = parseJSON(buf)
    if (data?.code !== '000000' && data?.code !== 0) throw new Error('无法获取咪咕歌单')

    total = parseInt(data.data?.totalCount, 10) || total
    const batch = (data.data?.songList || []).map(item => {
      const types = parseMgTypes(item)
      return withTypes({
        id: item.copyrightId || item.songId || '',
        name: cleanHtml(item.songName),
        singer: formatArtists((item.singerList || []).map(s => s.name).join('/')),
        album: cleanHtml(item.album),
        albumName: cleanHtml(item.album),
        interval: formatTime(item.duration || 0),
        source: 'mg',
        songId: item.copyrightId || item.songId || '',
        copyrightId: item.copyrightId || '',
        picUrl: item.img3 || item.img2 || item.img1 || mgPicUrl(item),
        img: item.img3 || item.img2 || item.img1 || mgPicUrl(item),
      }, types)
    })

    all.push(...batch)
    if (options.partial) {
      return buildPlaylistResponse(all, total || all.length, 'mg', info, { partial: true, hasMore: (total || 0) > all.length })
    }
    if (!batch.length || all.length >= total) break
    page += 1
  }

  return buildPlaylistResponse(all, total || all.length, 'mg', info)
}

function mapKgSongItem(item) {
  const audio = item.audio_info || item
  let hash = audio.hash || item.hash || item.FileHash || ''
  let name = item.songname || item.SongName || item.name || item.audio_name || item.remark || ''
  let singer = item.author_name || item.SingerName || item.singer || ''
  if (!singer && Array.isArray(item.authors) && item.authors.length) {
    singer = item.authors.map(a => a.author_name).filter(Boolean).join('、')
  }
  if (item.filename && (!name || !singer)) {
    const idx = String(item.filename).indexOf(' - ')
    if (idx >= 0) {
      if (!singer) singer = item.filename.slice(0, idx)
      if (!name) name = item.filename.slice(idx + 3)
    } else if (!name) {
      name = item.filename
    }
  }

  const types = parseKgTypes({
    FileSize: audio.filesize || item.filesize || item.FileSize,
    HQFileSize: audio.filesize_320 || item.filesize_320 || item['320filesize'] || item.HQFileSize,
    SQFileSize: audio.filesize_flac || item.filesize_flac || item.sqfilesize || item.SQFileSize,
    ResFileSize: audio.filesize_high || item.filesize_high || item.ResFileSize,
  })
  if (hash && types.length) types[0].hash = hash

  const rawDuration = audio.timelength || item.Duration || item.duration || 0
  const durationSec = rawDuration > 1000 && (audio.timelength || item.filesize)
    ? Math.floor(rawDuration / 1000)
    : Math.floor(rawDuration)

  const albumAudioId = String(audio.audio_id || item.album_audio_id || item.ID || item.albumAudioId || '')
  return withTypes({
    id: hash || albumAudioId,
    name: cleanHtml(name),
    singer: formatArtists(singer),
    album: cleanHtml(item.album_info?.album_name || item.AlbumName || item.album || item.album_name || ''),
    albumName: cleanHtml(item.album_info?.album_name || item.AlbumName || item.album || item.album_name || ''),
    albumId: String(item.album_id || item.albumid || item.album_info?.album_id || item.AlbumID || ''),
    interval: formatTime(durationSec),
    source: 'kg',
    songId: hash || albumAudioId,
    hash,
    albumAudioId,
    duration: durationSec,
    picUrl: kgPicUrl(item),
    img: kgPicUrl(item),
  }, types)
}

const KG_HEADERS = {
  Referer: 'https://www.kugou.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

function parseKgTagResponse(buf) {
  let text = Buffer.isBuffer(buf) ? buf.toString() : String(buf || '')
  text = text.replace(/^\uFEFF/, '').trim()
  const startMark = '<!--KG_TAG_RES_START-->'
  const endMark = '<!--KG_TAG_RES_END-->'
  const start = text.indexOf(startMark)
  if (start >= 0) {
    const from = start + startMark.length
    const end = text.indexOf(endMark, from)
    text = text.slice(from, end >= 0 ? end : undefined).trim()
  }
  try {
    return JSON.parse(text)
  } catch {
    const i = text.indexOf('{')
    const j = text.lastIndexOf('}')
    if (i >= 0 && j > i) {
      try { return JSON.parse(text.slice(i, j + 1)) } catch { return null }
    }
    return null
  }
}

function extractJsonAfterMarker(html, marker) {
  const idx = html.indexOf(marker)
  if (idx < 0) return null
  let i = idx + marker.length
  while (i < html.length && /\s/.test(html[i])) i++
  const start = i
  const open = html[i]
  if (open !== '[' && open !== '{') return null
  const close = open === '[' ? ']' : '}'
  let depth = 0
  let inStr = false
  let esc = false
  for (; i < html.length; i++) {
    const ch = html[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') { inStr = true; continue }
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return html.slice(start, i + 1)
    }
  }
  return null
}

async function kgFetchMobileJson(url, retries = 1) {
  let lastErr = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const data = parseKgTagResponse(await req('get', url, null, KG_HEADERS))
      if (data) return data
      lastErr = new Error('酷狗接口返回异常')
    } catch (e) {
      lastErr = e
    }
    if (attempt < retries) await new Promise(r => setTimeout(r, 120 * (attempt + 1)))
  }
  throw lastErr || new Error('酷狗接口请求失败')
}

function kgMobileSongPageUrl(specialId, page, pageSize, host = 'https://mobilecdn.kugou.com') {
  return `${host}/api/v3/special/song?plat=0&specialid=${specialId}&page=${page}&pagesize=${pageSize}&version=9108&with_res_tag=1`
}

function kgMobileInfoUrl(specialId, host = 'https://mobilecdn.kugou.com') {
  return `${host}/api/v3/special/info?specialid=${specialId}`
}

const KG_MOBILE_HOSTS = [
  'https://mobilecdn.kugou.com',
  'http://mobilecdn.kugou.com',
  'http://mobilecdnbj.kugou.com',
]

function kgMapMobilePlaylistInfo(infoPayload = {}) {
  return {
    name: cleanHtml(infoPayload.specialname || infoPayload.name || ''),
    img: String(infoPayload.imgurl || infoPayload.img || '').replace(/\{size\}/g, '400'),
    desc: cleanHtml(infoPayload.intro || infoPayload.description || ''),
    author: cleanHtml(infoPayload.nickname || infoPayload.singername || infoPayload.username || ''),
    play_count: formatPlayCount(infoPayload.playcount || infoPayload.play_count || infoPayload.total_play_count),
  }
}

function kgMapMobileSongPage(data) {
  const batch = (data?.data?.info || []).map(mapKgSongItem).filter(s => s.hash || s.name)
  const total = parseInt(data?.data?.total, 10) || batch.length
  return { batch, total }
}

async function kgFetchMobilePlaylistPages(specialId, { pageSize = 100, partial = false } = {}) {
  let infoData = null
  let firstData = null
  let activeHost = KG_MOBILE_HOSTS[0]
  let lastErr = null

  for (const host of KG_MOBILE_HOSTS) {
    try {
      const [info, first] = await Promise.all([
        kgFetchMobileJson(kgMobileInfoUrl(specialId, host)).catch(() => null),
        kgFetchMobileJson(kgMobileSongPageUrl(specialId, 1, pageSize, host)),
      ])
      if (first?.status === 1 && first.data) {
        infoData = info
        firstData = first
        activeHost = host
        break
      }
      lastErr = new Error('无法获取酷狗歌单')
    } catch (e) {
      lastErr = e
    }
  }
  if (!firstData) throw lastErr || new Error('无法获取酷狗歌单')

  const { batch: firstBatch, total } = kgMapMobileSongPage(firstData)
  if (!firstBatch.length) throw new Error('无法获取酷狗歌单')
  const info = kgMapMobilePlaylistInfo(infoData?.data || {})
  const playlistCover = info.img || ''

  // 首屏（partial）只用歌单封面兜底，避免上百次专辑封面请求拖过 30s 超时
  if (partial) {
    const list = applyPlaylistTrackCoverFallback(firstBatch, playlistCover)
    const infoFinal = finalizePlaylistInfo(info, list)
    return {
      list: applyPlaylistTrackCoverFallback(list, infoFinal.img || playlistCover),
      total,
      source: 'kg',
      info: infoFinal,
      hasMore: total > list.length,
      partial: true,
    }
  }

  const totalPages = Math.ceil(total / pageSize)
  const pageResults = [firstBatch]
  if (totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) => (
        kgFetchMobileJson(kgMobileSongPageUrl(specialId, i + 2, pageSize, activeHost))
      )),
    )
    for (const data of rest) {
      if (data?.status === 1 && data.data) {
        pageResults.push(kgMapMobileSongPage(data).batch)
      }
    }
  }

  const flat = pageResults.flat()
  // 仅充实首屏封面，其余走兜底，避免等全部专辑封面才出列表
  const headSize = Math.min(50, flat.length)
  const head = await enrichKgSongsCoversByAlbum(flat.slice(0, headSize), { playlistCover })
  const rest = applyPlaylistTrackCoverFallback(flat.slice(headSize), playlistCover)
  const list = head.concat(rest)
  const infoFinal = finalizePlaylistInfo(info, list)
  const enriched = applyPlaylistTrackCoverFallback(list, infoFinal.img || playlistCover)
  return {
    list: enriched,
    total: total || enriched.length,
    source: 'kg',
    info: infoFinal,
    hasMore: false,
    partial: false,
  }
}

async function kgPlaylistFromMobileApi(specialId, options = {}) {
  return kgFetchMobilePlaylistPages(specialId, options)
}

async function kgPlaylistFromHtml(id) {
  const html = (await req('get', `https://www.kugou.com/yy/special/single/${id}.html`, null, KG_HEADERS)).toString()

  let listRaw = []
  const legacyMatch = html.match(/global\.data\s*=\s*(\[[\s\S]*?\])\s*;/)
  if (legacyMatch) {
    try { listRaw = JSON.parse(legacyMatch[1]) } catch {}
  }
  if (!listRaw.length) {
    const dataJson = extractJsonAfterMarker(html, 'var data=')
    if (dataJson) {
      try { listRaw = JSON.parse(dataJson) } catch {}
    }
  }

  let info = { name: '', img: '', desc: '', author: '', play_count: '' }
  const legacyInfo = html.match(/var\s+global\s*=\s*(\{[\s\S]*?\})\s*;/)
  if (legacyInfo) {
    try {
      const g = JSON.parse(legacyInfo[1])
      info = {
        name: cleanHtml(g.name || g.specialname || ''),
        img: g.pic || g.img || '',
        desc: cleanHtml(g.intro || g.desc || ''),
        author: cleanHtml(g.nickname || g.user_name || ''),
        play_count: formatPlayCount(g.play_count || g.playcount),
      }
    } catch {}
  } else {
    const infoJson = extractJsonAfterMarker(html, 'var specialInfo =')
    if (infoJson) {
      try {
        const g = JSON.parse(infoJson)
        info = {
          name: cleanHtml(g.name || g.class_name || ''),
          img: g.image || g.pic || '',
          desc: cleanHtml(g.intro || ''),
          author: cleanHtml(g.nickname || ''),
          play_count: formatPlayCount(g.play_count || g.playcount),
        }
      } catch {}
    }
  }

  if (!listRaw.length) {
    throw new Error('无法解析酷狗歌单歌曲，请尝试使用完整分享链接')
  }

  const mapped = listRaw.map(item => {
    if (typeof item === 'string') {
      return mapKgSongItem({ hash: item, SongName: '', SingerName: '' })
    }
    return mapKgSongItem(item)
  }).filter(s => s.hash || s.name)
  const playlistCover = info.img || ''
  const headSize = Math.min(50, mapped.length)
  const head = await enrichKgSongsCoversByAlbum(mapped.slice(0, headSize), { playlistCover })
  const rest = applyPlaylistTrackCoverFallback(mapped.slice(headSize), playlistCover)
  const list = head.concat(rest)

  const infoFinal = finalizePlaylistInfo(info, list)
  const enriched = applyPlaylistTrackCoverFallback(list, infoFinal.img || info.img || '')
  return { list: enriched, total: enriched.length, source: 'kg', info: infoFinal }
}

async function kgPlaylistFromSpecial(id, options = {}) {
  try {
    return await kgPlaylistFromMobileApi(id, options)
  } catch (mobileErr) {
    try {
      // partial 首屏也曾直接抛错跳过官网 HTML；移动端接口失败时仍应兜底
      return await kgPlaylistFromHtml(id)
    } catch {
      throw mobileErr instanceof Error ? mobileErr : new Error('无法获取酷狗歌单')
    }
  }
}

async function kgPlaylistFromGid(globalCollectionId, options = {}) {
  const pageSize = 300
  const fetchPage = async (page) => {
    const buf = await req('get',
      `https://pubsongscdn.kugou.com/v2/get_other_list_file?specialid=0&global_specialid=${encodeURIComponent(globalCollectionId)}&page=${page}&pagesize=${pageSize}&userid=0&clientver=12345&appid=1005&area_code=1`,
      null, KG_HEADERS)
    return parseJSON(buf)
  }

  const firstData = await fetchPage(1)
  if (firstData?.status !== 1 && firstData?.errcode !== 0) {
    throw new Error('无法获取酷狗分享歌单，请改用官网歌单链接或数字 ID（如 id_636158）')
  }

  let info = { name: '', img: '', desc: '', author: '', play_count: '' }
  if (firstData.data?.info) {
    const pi = firstData.data.info
    info = {
      name: cleanHtml(pi.specialname || pi.name || ''),
      img: pi.img || pi.pic || '',
      desc: cleanHtml(pi.intro || ''),
      author: cleanHtml(pi.nickname || pi.username || ''),
      play_count: formatPlayCount(pi.play_count),
    }
  }

  const mapPageSongs = (data) => (data.data?.info?.songs || data.data?.songs || data.data?.lists || []).map(mapKgSongItem)
  const firstBatch = mapPageSongs(firstData)
  const total = parseInt(firstData.data?.count || firstData.data?.total, 10) || firstBatch.length
  const playlistCover = info.img || ''

  if (options.partial) {
    // 首屏尽快返回：用歌单封面兜底，不阻塞拉专辑封面
    const list = applyPlaylistTrackCoverFallback(firstBatch, playlistCover)
    const infoFinal = finalizePlaylistInfo(info, list)
    return {
      list: applyPlaylistTrackCoverFallback(list, infoFinal.img || playlistCover),
      total: total || list.length,
      source: 'kg',
      info: infoFinal,
      hasMore: total > list.length,
      partial: true,
    }
  }

  const totalPages = Math.ceil((total || firstBatch.length) / pageSize)
  const batches = [firstBatch]
  if (totalPages > 1) {
    const rest = await Promise.all(Array.from({ length: totalPages - 1 }, (_, i) => fetchPage(i + 2)))
    for (const data of rest) {
      if (data?.status === 1 || data?.errcode === 0) batches.push(mapPageSongs(data))
    }
  }

  const flat = batches.flat()
  // 仅充实首屏封面，其余用兜底，避免等全部专辑封面才返回
  const headSize = Math.min(50, flat.length)
  const head = await enrichKgSongsCoversByAlbum(flat.slice(0, headSize), { playlistCover })
  const rest = applyPlaylistTrackCoverFallback(flat.slice(headSize), playlistCover)
  const list = head.concat(rest)
  const infoFinal = finalizePlaylistInfo(info, list)
  const enriched = applyPlaylistTrackCoverFallback(list, infoFinal.img || playlistCover)
  return { list: enriched, total: total || enriched.length, source: 'kg', info: infoFinal, hasMore: false, partial: false }
}

async function kgResolveShareInput(raw) {
  const input = String(raw || '').trim()
  if (!/^https?:\/\/t\d*\.kugou\.com\//i.test(input)) return input
  try {
    const resp = await needle('get', input, {
      headers: KG_HEADERS,
      follow_max: 5,
      parse_response: false,
      timeout: 15000,
    })
    return resp.request?.uri?.href || input
  } catch {
    return input
  }
}

async function kgPlaylist(parsed, options = {}) {
  if (parsed.id) return kgPlaylistFromSpecial(parsed.id, options)
  if (parsed.encodeGcid) {
    throw new Error('酷狗 gcid 分享链接暂不稳定，请在浏览器打开歌单后复制数字 ID 或官网链接')
  }
  if (parsed.globalCollectionId) return kgPlaylistFromGid(parsed.globalCollectionId, options)
  throw new Error('无法解析酷狗歌单')
}

const playlistMap = { wy: wyPlaylist, tx: txPlaylist, kw: kwPlaylist, mg: mgPlaylist, kg: kgPlaylist }

export async function fetchPlaylist(source, input, options = {}) {
  if (!AVAILABLE_SOURCES[source]) throw new Error(`不支持的平台: ${source}`)
  const resolvedInput = source === 'kg' ? await kgResolveShareInput(input) : input
  const parsed = parsePlaylistInput(source, resolvedInput)
  const fn = playlistMap[source]
  return fn(parsed, options)
}

function mapRecommendItem(item) {
  return {
    id: String(item.id),
    name: cleanHtml(item.name),
    author: cleanHtml(item.author || ''),
    img: item.img || '',
    play_count: item.play_count || '',
    total: item.total || 0,
    desc: cleanHtml(item.desc || ''),
    source: item.source,
  }
}

async function wyRecommendPlaylists(sort = 'hot', page = 1, limit = 30) {
  const order = sort === 'new' ? 'new' : 'hot'
  const offset = (page - 1) * limit
  const buf = await req('get',
    `https://music.163.com/api/playlist/list?cat=${encodeURIComponent('全部')}&order=${order}&limit=${limit}&offset=${offset}`,
    null, {
      Referer: 'https://music.163.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    })
  const data = parseJSON(buf)
  if (data?.code !== 200 || !data.playlists) throw new Error('无法获取网易云推荐歌单')
  return {
    list: data.playlists.map(item => mapRecommendItem({
      id: item.id,
      name: item.name,
      author: item.creator?.nickname,
      img: item.coverImgUrl,
      play_count: formatPlayCount(item.playCount),
      total: item.trackCount,
      desc: item.description,
      source: 'wy',
    })),
    total: data.total || data.playlists.length,
    page,
    limit,
    source: 'wy',
  }
}

async function txRecommendPlaylists(sort = 'hot', page = 1, limit = 36) {
  const order = sort === 'new' ? 2 : 5
  const payload = {
    comm: { cv: 1602, ct: 20 },
    playlist: {
      method: 'get_playlist_by_tag',
      param: { id: 10000000, sin: limit * (page - 1), size: limit, order, cur_page: page },
      module: 'playlist.PlayListPlazaServer',
    },
  }
  const buf = await req('get', `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(JSON.stringify(payload))}`)
  const data = parseJSON(buf)
  const pl = data?.playlist?.data
  if (data?.code !== 0 || !pl?.v_playlist) throw new Error('无法获取 QQ 音乐推荐歌单')
  return {
    list: pl.v_playlist.map(item => mapRecommendItem({
      id: item.tid,
      name: item.title,
      author: item.creator_info?.nick,
      img: item.cover_url_medium || item.cover_url_big,
      play_count: formatPlayCount(item.access_num),
      total: item.song_num || item.songnum || item.total_song_num || item.song_ids?.length || 0,
      desc: item.desc,
      source: 'tx',
    })),
    total: pl.total || pl.v_playlist.length,
    page,
    limit,
    source: 'tx',
  }
}

async function kwRecommendPlaylists(sort = 'hot', page = 1, limit = 36) {
  const order = sort === 'new' ? 'new' : 'hot'
  const buf = await req('get',
    `http://wapi.kuwo.cn/api/pc/classify/playlist/getRcmPlayList?loginUid=0&loginSid=0&appUid=76039576&pn=${page}&rn=${limit}&order=${order}`)
  const data = parseJSON(buf)
  if (data?.code !== 200 || !data.data?.data) throw new Error('无法获取酷我推荐歌单')
  return {
    list: data.data.data.map(item => mapRecommendItem({
      id: `digest-${item.digest}__${item.id}`,
      name: item.name,
      author: item.uname,
      img: item.img,
      play_count: formatPlayCount(item.listencnt),
      total: item.total,
      desc: item.desc,
      source: 'kw',
    })),
    total: data.data.total || data.data.data.length,
    page: data.data.pn || page,
    limit: data.data.rn || limit,
    source: 'kw',
  }
}

async function kgRecommendPlaylists(sort = 'hot', page = 1, limit = 30) {
  const sortMap = { hot: '6', new: '7', recommend: '5' }
  const t = sortMap[sort] || sortMap.recommend
  const buf = await req('get',
    `http://www2.kugou.kugou.com/yueku/v9/special/getSpecial?is_ajax=1&cdn=cdn&t=${t}&c=&p=${page}`,
    null, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' })
  const data = parseJSON(buf)
  if (data?.status !== 1 || !data.special_db) throw new Error('无法获取酷狗推荐歌单')
  const list = data.special_db.map(item => mapRecommendItem({
    id: `id_${item.specialid}`,
    name: item.specialname,
    author: item.nickname || item.singername,
    img: item.imgurl?.replace('{size}', '400') || item.img,
    play_count: formatPlayCount(item.play_count || item.total_play_count),
    total: item.songcount,
    desc: item.intro,
    source: 'kg',
  }))
  const total = parseInt(data.recordcount, 10) || 0
  return {
    list,
    total,
    page,
    limit: list.length || limit,
    hasMore: total ? page * (list.length || limit) < total : list.length > 0,
    source: 'kg',
  }
}

function extractMgRecommendItems(contents, list = [], ids = new Set()) {
  for (const item of contents || []) {
    if (item.contents?.length) extractMgRecommendItems(item.contents, list, ids)
    const id = item.resId || item.txt4 || (item.viewId?.startsWith('4006-') ? item.viewId.split('-')[1] : '')
    if (id && item.txt && !ids.has(String(id))) {
      ids.add(String(id))
      list.push(mapRecommendItem({
        id,
        name: item.txt,
        author: '',
        img: item.img || item.img2 || item.txt5,
        play_count: '',
        total: 0,
        desc: '',
        source: 'mg',
      }))
    }
  }
  return list
}

async function mgRecommendPlaylists(_sort = 'hot', page = 1, _limit = 30) {
  const buf = await req('get',
    `https://app.c.nf.migu.cn/pc/bmw/page-data/playlist-square-recommend/v1.0?templateVersion=2&pageNo=${page}`,
    null, {
      Referer: 'https://m.music.migu.cn/',
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
    })
  const data = parseJSON(buf)
  if (data?.code !== '000000' || !data.data?.contents) throw new Error('无法获取咪咕推荐歌单')
  const list = extractMgRecommendItems(data.data.contents)
  // 咪咕不返回总数：有下一页数据则继续翻页
  return {
    list,
    total: 0,
    page,
    limit: list.length || _limit,
    hasMore: list.length > 0,
    source: 'mg',
  }
}

const recommendMap = {
  wy: wyRecommendPlaylists,
  tx: txRecommendPlaylists,
  kw: kwRecommendPlaylists,
  kg: kgRecommendPlaylists,
  mg: mgRecommendPlaylists,
}

export async function fetchRecommendPlaylists(source, sort = 'hot', page = 1, limit = 30) {
  if (!AVAILABLE_SOURCES[source]) throw new Error(`不支持的平台: ${source}`)
  const fn = recommendMap[source]
  return fn(sort, page, limit)
}

// --- 歌词获取 ---
const LYRIC_HEADERS = {
  kw: {
    Referer: 'https://www.kuwo.cn/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
  kg: {
    Referer: 'https://www.kugou.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
}

function normalizeLyricResult(result) {
  const lyric = String(result?.lyric || '').replace(/\r/g, '').trim()
  return {
    lyric,
    tlyric: String(result?.tlyric || '').replace(/\r/g, '').trim(),
    rlyric: String(result?.rlyric || '').replace(/\r/g, '').trim(),
  }
}

function parseKwLrcPayload(data) {
  if (!data) return null
  const list = data?.data?.lrclist || data?.data?.lrcList || data?.lrclist
  if (Array.isArray(list) && list.length) {
    const lines = list
      .filter(l => l?.lineLyric != null && l?.time != null)
      .map(l => `[${fmtLrcTime(parseFloat(l.time))}]${l.lineLyric}`)
      .join('\n')
    if (lines.trim()) return normalizeLyricResult({ lyric: lines })
  }
  for (const key of ['lrctxt', 'lyric', 'songLrc', 'lrc', 'content']) {
    const raw = data?.data?.[key] || data?.[key]
    if (typeof raw === 'string' && raw.trim()) {
      return normalizeLyricResult({ lyric: raw.trim() })
    }
  }
  return null
}

function kwLyricIdVariants(musicId) {
  const raw = String(musicId || '').trim()
  if (!raw) return []
  const bare = raw.replace(/^MUSIC_/i, '')
  return [...new Set([
    raw,
    bare,
    /^\d+$/.test(bare) ? `MUSIC_${bare}` : '',
  ].filter(Boolean))]
}

async function fetchKwLyricById(musicId) {
  const ids = kwLyricIdVariants(musicId)
  for (const id of ids) {
    const urls = [
      `https://www.kuwo.cn/openapi/v1/www/lyric/getlyric?musicId=${id}`,
      `https://www.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${id}`,
      `https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${id}&httpsStatus=1`,
      `https://wbxapi.kuwo.cn/api/www/lyric/lyric?httpsStatus=1&musicId=${id}`,
    ]
    for (const url of urls) {
      try {
        const buf = await req('get', url, null, LYRIC_HEADERS.kw)
        const text = Buffer.isBuffer(buf) ? buf.toString() : String(buf || '')
        const data = parseJSON(text.trim()) || parseJSON(text.replace(/^[^{\[]+/, ''))
        const parsed = parseKwLrcPayload(data)
        if (parsed?.lyric) return parsed
      } catch {}
    }
  }
  return null
}

async function wyLyric(songId) {
  const buf = await req('get', `https://music.163.com/api/song/lyric?id=${songId}&lv=1&tv=1&rv=1`, null, { Referer: 'https://music.163.com' })
  const data = parseJSON(buf)
  return normalizeLyricResult({
    lyric: data?.lrc?.lyric || '',
    tlyric: data?.tlyric?.lyric || '',
    rlyric: data?.romalrc?.lyric || '',
  })
}

async function txLyric(songmid, extra = {}) {
  const ids = [...new Set([
    extra.songmid,
    extra.strMediaMid,
    songmid,
  ].filter(Boolean).map(String))]

  for (const id of ids) {
    try {
      const buf = await req('get',
        `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${id}&format=json&nobase64=1`,
        null,
        { Referer: 'https://y.qq.com/portal/player.html' })
      const data = parseJSON(buf)
      let lyric = data?.lyric || ''
      let tlyric = data?.trans || ''
      let rlyric = data?.roma || data?.rom || ''
      if (lyric && !lyric.includes('[') && /^[A-Za-z0-9+/=\s]+$/.test(lyric.slice(0, 80))) {
        try { lyric = Buffer.from(lyric, 'base64').toString('utf8') } catch {}
      }
      if (tlyric && !tlyric.includes('[') && /^[A-Za-z0-9+/=\s]+$/.test(tlyric.slice(0, 80))) {
        try { tlyric = Buffer.from(tlyric, 'base64').toString('utf8') } catch {}
      }
      if (rlyric && !rlyric.includes('[') && /^[A-Za-z0-9+/=\s]+$/.test(rlyric.slice(0, 80))) {
        try { rlyric = Buffer.from(rlyric, 'base64').toString('utf8') } catch {}
      }
      const parsed = normalizeLyricResult({ lyric, tlyric, rlyric })
      if (parsed.lyric) return parsed
    } catch {}
  }
  return normalizeLyricResult({})
}

async function kwLyric(songId, extra = {}) {
  const ids = [...new Set([
    songId,
    extra.musicId,
    extra.rid,
    extra.dcTargetId,
  ].filter(Boolean).map(String))]

  for (const id of ids) {
    const parsed = await fetchKwLyricById(id)
    if (parsed?.lyric) return parsed
  }

  // 按歌名再搜一次，尝试其它 musicId（部分条目 m.kuwo 会失败但同曲其它 id 可用）
  const keyword = [extra.name, extra.singer].filter(Boolean).join(' ')
  if (keyword) {
    try {
      const result = await kwSearch(keyword, 1, 8)
      for (const hit of result.list || []) {
        const hitIds = [hit.songId, hit.id, hit.musicId, hit.rid].filter(Boolean).map(String)
        for (const id of hitIds) {
          if (ids.includes(id)) continue
          const parsed = await fetchKwLyricById(id)
          if (parsed?.lyric) return parsed
        }
      }
    } catch {}
  }

  return normalizeLyricResult({})
}

async function kgDownloadLyric(candidate) {
  const clients = ['pc', 'mobi']
  for (const client of clients) {
    try {
      const lrcBuf = await req('get',
        `https://lyrics.kugou.com/download?ver=1&client=${client}&id=${candidate.id}&accesskey=${candidate.accesskey}&fmt=lrc&charset=utf8`,
        null, LYRIC_HEADERS.kg)
      const lrcData = parseJSON(lrcBuf)
      if (!lrcData?.content) continue
      const lyric = Buffer.from(lrcData.content, 'base64').toString('utf-8').trim()
      if (lyric) return normalizeLyricResult({ lyric })
    } catch {}
  }
  return null
}

async function kgSearchLyricCandidates(hash, extra = {}) {
  const albumAudioId = extra.albumAudioId || extra.album_audio_id || ''
  const duration = extra.duration ?? extra.interval ?? ''
  const queries = [
    `https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=&duration=${duration}&hash=${hash}&album_audio_id=${albumAudioId}`,
    `https://krcs.kugou.com/search?ver=1&man=yes&client=pc&keyword=&duration=${duration}&hash=${hash}&album_audio_id=${albumAudioId}`,
    `https://krcs.kugou.com/search?ver=1&man=yes&client=pc&keyword=&duration=&hash=${hash}&album_audio_id=`,
  ]
  const candidates = []
  for (const url of queries) {
    try {
      const buf = await req('get', url, null, LYRIC_HEADERS.kg)
      const data = parseJSON(buf)
      for (const c of data?.candidates || []) {
        if (c?.id && c?.accesskey) candidates.push(c)
      }
    } catch {}
  }
  return candidates
}

async function kgLyric(hash, extra = {}) {
  if (!hash) return normalizeLyricResult({})

  const candidates = await kgSearchLyricCandidates(hash, extra)
  for (const c of candidates) {
    const parsed = await kgDownloadLyric(c)
    if (parsed?.lyric) return parsed
  }

  const keyword = [extra.name, extra.singer].filter(Boolean).join(' ')
  if (keyword) {
    try {
      const result = await kgSearch(keyword, 1, 8)
      for (const hit of result.list || []) {
        const hitHash = hit.hash || hit.songId || hit.id
        if (!hitHash || hitHash === hash) continue
        const more = await kgSearchLyricCandidates(hitHash, {
          ...extra,
          albumAudioId: hit.albumAudioId || extra.albumAudioId,
          duration: hit.duration || extra.duration,
        })
        for (const c of more) {
          const parsed = await kgDownloadLyric(c)
          if (parsed?.lyric) return parsed
        }
      }
    } catch {}
  }

  return normalizeLyricResult({})
}

async function mgLyric(copyrightId) {
  const buf = await req('get', `https://music.migu.cn/v3/api/music/audioPlayer/getLyric?copyrightId=${copyrightId}`, null, { Referer: 'https://music.migu.cn' })
  const data = parseJSON(buf)
  return normalizeLyricResult({
    lyric: data?.lyric || '',
    tlyric: data?.translatedLyric || '',
    rlyric: data?.transliterationLyric || data?.romaLyric || '',
  })
}

function fmtLrcTime(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`
}

const lyricMap = { wy: wyLyric, tx: txLyric, kw: kwLyric, kg: kgLyric, mg: mgLyric }

export async function getLyric(songId, source, extra = {}) {
  const fn = lyricMap[source]
  if (!fn) return normalizeLyricResult({})
  // 各平台 ID 字段不同：QQ 要用 songmid，酷狗要用 hash，咪咕要用 copyrightId
  let id = songId
  if (source === 'tx') id = extra.songmid || extra.strMediaMid || songId
  else if (source === 'kg') id = extra.hash || songId
  else if (source === 'mg') id = extra.copyrightId || songId
  else if (source === 'kw') id = extra.musicId || extra.rid || extra.dcTargetId || songId
  if (!id) return normalizeLyricResult({})
  try {
    return normalizeLyricResult(await fn(id, extra))
  } catch {
    return normalizeLyricResult({})
  }
}
