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
        singer: cleanHtml(item.ARTIST),
        album: cleanHtml(item.ALBUM),
        interval: formatTime(parseInt(item.DURATION) || 0),
        source: 'kw',
        songId: item.MUSICRID?.replace('MUSIC_', '') || item.DC_TARGETID || '',
      }, types)
    }),
    allPage: Math.ceil((parseInt(data.TOTAL) || 0) / limit),
    total: parseInt(data.TOTAL) || 0,
  }
}

// --- 酷狗 kg ---
async function kgSearch(keyword, page = 1, limit = 30) {
  const url = `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=${limit}&userid=0&clientver=&platform=WebFilter&filter=2&iscorrection=1&privilege_filter=0&area_code=1`
  const buf = await req('get', url)
  const data = parseJSON(buf)
  if (!data?.data?.lists) return { list: [], allPage: 0, total: 0 }
  const total = data.data.total || 0
  return {
    list: data.data.lists.map(item => {
      const types = parseKgTypes(item)
      return withTypes({
        id: item.FileHash || '',
        name: cleanHtml(item.SongName),
        singer: cleanHtml(item.SingerName),
        album: cleanHtml(item.AlbumName),
        interval: formatTime(item.Duration || 0),
        source: 'kg',
        songId: item.FileHash || '',
        hash: item.FileHash || '',
        albumId: item.AlbumID || '',
      }, types)
    }),
    allPage: Math.ceil(total / limit),
    total,
  }
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
    list: data.data.song.list.map(item => {
      const types = parseTxTypes(item)
      return withTypes({
        id: item.songmid || '',
        name: cleanHtml(item.songname),
        singer: cleanHtml((item.singer || []).map(s => s.name).join('/')),
        album: cleanHtml(item.albumname),
        interval: formatTime(item.interval || 0),
        source: 'tx',
        songId: item.songmid || '',
        songmid: item.songmid || '',
        albummid: item.albummid || '',
        picUrl: item.albummid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${item.albummid}.jpg` : '',
      }, types)
    }),
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
        singer: cleanHtml((item.ar || item.artists || []).map(a => a.name).join('/')),
        album: cleanHtml(item.al?.name || item.album?.name),
        interval: formatTime(Math.floor((item.dt || item.duration || 0) / 1000)),
        source: 'wy',
        songId: String(item.id),
        picUrl: item.al?.picUrl || '',
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
        singer: cleanHtml((item.singers || []).map(s => s.name).join('/')),
        album: cleanHtml(item.albums?.[0]?.name),
        interval: '',
        source: 'mg',
        songId: item.copyrightId || item.id || '',
        copyrightId: item.copyrightId || '',
      }, types)
    }),
    allPage: Math.ceil(total / limit),
    total,
  }
}

// --- utils ---
function cleanHtml(str) {
  if (!str) return ''
  let s = String(str).replace(/<[^>]+>/g, '')
  s = s.replace(/&nbsp;/gi, ' ')
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  s = s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  return s.replace(/\s+/g, ' ').trim()
}

function formatSize(bytes) {
  const n = Number(bytes)
  if (!n || n <= 0) return ''
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

function buildTypes(qualityMap) {
  const types = []
  for (const [type, size] of Object.entries(qualityMap)) {
    if (size !== false && size !== 0 && size != null) {
      types.push({ type, size: typeof size === 'string' ? size : formatSize(size) })
    }
  }
  return types
}

function parseKwTypes(item) {
  if (!item.N_MINFO) return []
  const map = {}
  for (const part of item.N_MINFO.split(';')) {
    const m = part.match(/level:(\w+),bitrate:(\d+),format:(\w+),size:([\w.]+)/)
    if (!m) continue
    switch (m[2]) {
      case '4000': map.flac24bit = m[4].toUpperCase(); break
      case '2000': map.flac = m[4].toUpperCase(); break
      case '320': map['320k'] = m[4].toUpperCase(); break
      case '128': map['128k'] = m[4].toUpperCase(); break
    }
  }
  return buildTypes(map)
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
  const s128 = f.size_128mp3 ?? item.size128
  const s320 = f.size_320mp3 ?? item.size320
  const sflac = f.size_flac ?? item.sizeflac
  const shires = f.size_hires ?? item.sizehires
  if (s128) map['128k'] = s128
  if (s320) map['320k'] = s320
  if (sflac) map.flac = sflac
  if (shires) map.flac24bit = shires
  return buildTypes(map)
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

// --- 歌词获取 ---
async function wyLyric(songId) {
  const buf = await req('get', `https://music.163.com/api/song/lyric?id=${songId}&lv=1&tv=1`, null, { Referer: 'https://music.163.com' })
  const data = parseJSON(buf)
  return { lyric: data?.lrc?.lyric || '', tlyric: data?.tlyric?.lyric || '' }
}

async function txLyric(songmid) {
  const buf = await req('get', `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${songmid}&format=json&nobase64=1`, null, { Referer: 'https://y.qq.com' })
  const data = parseJSON(buf)
  return { lyric: data?.lyric || '', tlyric: data?.trans || '' }
}

async function kwLyric(songId) {
  const buf = await req('get', `https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${songId}&httpsStatus=1`, null, { Referer: 'https://kuwo.cn' })
  const data = parseJSON(buf)
  if (!data?.data?.lrclist) return { lyric: '', tlyric: '' }
  const lines = data.data.lrclist.map(l => `[${fmtLrcTime(parseFloat(l.time))}]${l.lineLyric}`).join('\n')
  return { lyric: lines, tlyric: '' }
}

async function kgLyric(hash) {
  const buf = await req('get', `https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=&duration=&hash=${hash}&album_audio_id=`, null)
  const data = parseJSON(buf)
  if (!data?.candidates?.[0]) return { lyric: '', tlyric: '' }
  const c = data.candidates[0]
  const lrcBuf = await req('get', `https://lyrics.kugou.com/download?ver=1&client=pc&id=${c.id}&accesskey=${c.accesskey}&fmt=lrc&charset=utf8`, null)
  const lrcData = parseJSON(lrcBuf)
  if (!lrcData?.content) return { lyric: '', tlyric: '' }
  const lyric = Buffer.from(lrcData.content, 'base64').toString('utf-8')
  return { lyric, tlyric: '' }
}

async function mgLyric(copyrightId) {
  const buf = await req('get', `https://music.migu.cn/v3/api/music/audioPlayer/getLyric?copyrightId=${copyrightId}`, null, { Referer: 'https://music.migu.cn' })
  const data = parseJSON(buf)
  return { lyric: data?.lyric || '', tlyric: data?.translatedLyric || '' }
}

function fmtLrcTime(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`
}

const lyricMap = { wy: wyLyric, tx: txLyric, kw: kwLyric, kg: kgLyric, mg: mgLyric }

export async function getLyric(songId, source) {
  const fn = lyricMap[source]
  if (!fn) return { lyric: '', tlyric: '' }
  try { return await fn(songId) } catch { return { lyric: '', tlyric: '' } }
}
