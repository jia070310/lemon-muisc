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
  try { return JSON.parse(buf.toString()) } catch { return null }
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

async function kgSearch(keyword, page = 1, limit = 30) {
  const attempts = [
    () => kgSearchMobile(keyword, page, limit),
    () => kgSearchWeb(keyword, page, limit),
    () => kgSearchComplex(keyword, page, limit),
  ]
  for (const attempt of attempts) {
    try {
      const result = await attempt()
      if (result?.list?.length) return result
    } catch {}
  }
  return { list: [], allPage: 0, total: 0 }
}

// --- QQ音乐 tx ---
async function txSearch(keyword, page = 1, limit = 30) {
  const buf = await req('get',
    `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=${encodeURIComponent(keyword)}&p=${page}&n=${limit}&format=json&cr=1&catZhida=1&t=0`,
    null, { Referer: 'https://y.qq.com' })
  const data = parseJSON(buf)
  if (!data?.data?.song?.list) return { list: [], allPage: 0, total: 0 }
  const total = data.data.song.totalnum || 0
  return {
    list: data.data.song.list.map(mapTxSongItem),
    allPage: Math.ceil(total / limit),
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
  let img = item.Image || item.AlbumImage || item.album_img
    || item.album_info?.sizable_cover || item.cover || item.img || item.pic || ''
  if (typeof img === 'string' && img) {
    return img.replace(/\{size\}/g, '400')
  }
  return ''
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
  const parts = s.split(/(?:\s*&\s*|\s*\/\s*|;|、|，|,|\|)+/)
    .map((p) => p.trim())
    .filter(Boolean)
  return parts.length > 1 ? parts.join(' ') : s
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
  for (const part of minfo.split(';')) {
    const m = part.match(/level:(\w+),bitrate:(\d+),format:(\w+),size:([\w.]+)/)
    if (!m) continue
    const fmt = m[3]
    switch (m[2]) {
      case '4000': map.flac24bit = m[4].toUpperCase(); formats.flac24bit = fmt; break
      case '2000': map.flac = m[4].toUpperCase(); formats.flac = fmt; break
      case '320': map['320k'] = m[4].toUpperCase(); formats['320k'] = fmt; break
      case '128': map['128k'] = m[4].toUpperCase(); formats['128k'] = fmt; break
    }
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
  if (!Object.keys(map).length && item.privilege?.maxbr) {
    const br = item.privilege.maxbr
    if (br >= 999000) map.flac = true
    if (br >= 320000) map['320k'] = true
    if (br >= 128000) map['128k'] = true
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
  return {
    ...base,
    types,
    qualitys: types.map(t => t.type),
  }
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
  const songId = item.id != null && item.id !== '' ? String(item.id) : songmid
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

async function wyPlaylist({ id, token }) {
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

  return {
    list,
    total: pl.trackCount || list.length,
    source: 'wy',
    info: {
      name: cleanHtml(pl.name),
      img: pl.coverImgUrl || '',
      desc: cleanHtml(pl.description || ''),
      author: cleanHtml(pl.creator?.nickname || ''),
      play_count: formatPlayCount(pl.playCount),
    },
  }
}

async function txPlaylist({ id }) {
  const buf = await req('get',
    `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&new_format=1&disstid=${id}&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`,
    null, {
      Referer: `https://y.qq.com/n/yqq/playlist/${id}.html`,
      Origin: 'https://y.qq.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })
  const data = parseJSON(buf)
  const cd = data?.cdlist?.[0]
  if (!cd?.songlist) throw new Error('无法获取 QQ 音乐歌单')

  const list = cd.songlist.map(mapTxSongItem)

  return {
    list,
    total: list.length,
    source: 'tx',
    info: {
      name: cleanHtml(cd.dissname),
      img: cd.logo || '',
      desc: cleanHtml(cd.desc || ''),
      author: cleanHtml(cd.nickname || ''),
      play_count: formatPlayCount(cd.visitnum),
    },
  }
}

function parseKuwoPlaylistBody(raw) {
  const text = raw.toString().trim()
  try {
    return JSON.parse(text)
  } catch {
    return JSON.parse(text.replace(/'/g, '"'))
  }
}

async function kwPlaylist({ id, digestId }) {
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
    const url = `http://nplserver.kuwo.cn/pl.svc?op=getlistinfo&pid=${id}&pn=${page}&rn=1000&encode=utf8&keyset=pl2012&identity=kuwo&pcmp4=1&vipver=MUSIC_9.0.5.0_W1&newver=1`
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
    if (!batch.length || all.length >= total) break
    page += 1
  }

  return { list: all, total: total || all.length, source: 'kw', info: meta }
}

async function mgPlaylist({ id }) {
  const infoBuf = await req('get', `https://c.musicapp.migu.cn/MIGUM3.0/resource/playlist/v2.0?playlistId=${id}`, null, {
    Referer: 'https://music.migu.cn',
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
  })
  const infoData = parseJSON(infoBuf)
  const plInfo = infoData?.data || {}

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
    if (!batch.length || all.length >= total) break
    page += 1
  }

  return {
    list: all,
    total: total || all.length,
    source: 'mg',
    info: {
      name: cleanHtml(plInfo.title),
      img: plInfo.imgItem?.img || plInfo.img || '',
      desc: cleanHtml(plInfo.summary || ''),
      author: cleanHtml(plInfo.ownerName || ''),
      play_count: formatPlayCount(plInfo.opNumItem?.playNum),
    },
  }
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
  const text = Buffer.isBuffer(buf) ? buf.toString() : String(buf || '')
  const match = text.match(/<!--KG_TAG_RES_START-->([\s\S]*?)<!--KG_TAG_RES_END-->/)
  try {
    return JSON.parse(match ? match[1] : text.trim())
  } catch {
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

function kgMobileSongPageUrl(specialId, page, pageSize) {
  return `http://mobilecdn.kugou.com/api/v3/special/song?plat=0&specialid=${specialId}&page=${page}&pagesize=${pageSize}&version=8352&with_res_tag=1`
}

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

async function kgFetchMobilePlaylistPages(specialId, { pageSize = 300, partial = false } = {}) {
  const infoUrl = `http://mobilecdn.kugou.com/api/v3/special/info?specialid=${specialId}`
  const [infoData, firstData] = await Promise.all([
    kgFetchMobileJson(infoUrl).catch(() => null),
    kgFetchMobileJson(kgMobileSongPageUrl(specialId, 1, pageSize)),
  ])
  if (firstData?.status !== 1 || !firstData.data) throw new Error('无法获取酷狗歌单')

  const { batch: firstBatch, total } = kgMapMobileSongPage(firstData)
  if (!firstBatch.length) throw new Error('无法获取酷狗歌单')
  const info = kgMapMobilePlaylistInfo(infoData?.data || {})

  if (partial) {
    return {
      list: firstBatch,
      total,
      source: 'kg',
      info,
      hasMore: total > firstBatch.length,
      partial: true,
    }
  }

  const totalPages = Math.ceil(total / pageSize)
  const pageResults = [firstBatch]
  if (totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) => kgFetchMobileJson(kgMobileSongPageUrl(specialId, i + 2, pageSize))),
    )
    for (const data of rest) {
      if (data?.status === 1 && data.data) {
        pageResults.push(kgMapMobileSongPage(data).batch)
      }
    }
  }

  const list = pageResults.flat()
  return {
    list,
    total: total || list.length,
    source: 'kg',
    info,
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

  const list = listRaw.map(item => {
    if (typeof item === 'string') {
      return mapKgSongItem({ hash: item, SongName: '', SingerName: '' })
    }
    return mapKgSongItem(item)
  }).filter(s => s.hash || s.name)

  return { list, total: list.length, source: 'kg', info }
}

async function kgPlaylistFromSpecial(id, options = {}) {
  try {
    return await kgPlaylistFromMobileApi(id, options)
  } catch {
    if (options.partial) throw new Error('无法获取酷狗歌单')
    return kgPlaylistFromHtml(id)
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

  if (options.partial) {
    return {
      list: firstBatch,
      total: total || firstBatch.length,
      source: 'kg',
      info,
      hasMore: total > firstBatch.length,
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

  const list = batches.flat()
  return { list, total: total || list.length, source: 'kg', info, hasMore: false, partial: false }
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
      total: item.song_ids?.length || 0,
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

async function kgRecommendPlaylists(sort = 'hot', page = 1) {
  const sortMap = { hot: '6', new: '7', recommend: '5' }
  const t = sortMap[sort] || sortMap.recommend
  const buf = await req('get',
    `http://www2.kugou.kugou.com/yueku/v9/special/getSpecial?is_ajax=1&cdn=cdn&t=${t}&c=&p=${page}`,
    null, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' })
  const data = parseJSON(buf)
  if (data?.status !== 1 || !data.special_db) throw new Error('无法获取酷狗推荐歌单')
  return {
    list: data.special_db.map(item => mapRecommendItem({
      id: `id_${item.specialid}`,
      name: item.specialname,
      author: item.nickname || item.singername,
      img: item.imgurl?.replace('{size}', '400') || item.img,
      play_count: formatPlayCount(item.play_count || item.total_play_count),
      total: item.songcount,
      desc: item.intro,
      source: 'kg',
    })),
    total: data.recordcount || data.special_db.length,
    page,
    limit: data.special_db.length,
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

async function mgRecommendPlaylists(_sort = 'hot', page = 1) {
  const buf = await req('get',
    `https://app.c.nf.migu.cn/pc/bmw/page-data/playlist-square-recommend/v1.0?templateVersion=2&pageNo=${page}`,
    null, {
      Referer: 'https://m.music.migu.cn/',
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
    })
  const data = parseJSON(buf)
  if (data?.code !== '000000' || !data.data?.contents) throw new Error('无法获取咪咕推荐歌单')
  const list = extractMgRecommendItems(data.data.contents)
  return { list, total: list.length, page, limit: list.length, source: 'mg' }
}

const recommendMap = {
  wy: wyRecommendPlaylists,
  tx: txRecommendPlaylists,
  kw: kwRecommendPlaylists,
  kg: kgRecommendPlaylists,
  mg: mgRecommendPlaylists,
}

export async function fetchRecommendPlaylists(source, sort = 'hot', page = 1) {
  if (!AVAILABLE_SOURCES[source]) throw new Error(`不支持的平台: ${source}`)
  const fn = recommendMap[source]
  return fn(sort, page)
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
