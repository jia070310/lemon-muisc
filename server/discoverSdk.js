/**
 * 发现页：新歌 / 新碟 / 排行榜
 * 某平台栏目不可用时返回 unsupported，前端分栏空态，不拖垮整页。
 */
import needle from 'needle'
import { AVAILABLE_SOURCES, attachSongTypes } from './musicSdk.js'
import { mapWithConcurrency } from './utils/asyncPool.js'
import { joinArtists } from './utils/artistTag.js'

const req = (method, url, body, headers = {}) => needle(method, url, body, {
  headers,
  follow_max: 5,
  parse_response: false,
  timeout: 15000,
  ...(method === 'post' && body && typeof body === 'object' ? { json: true } : {}),
}).then((resp) => resp.body)

const parseJSON = (buf) => {
  if (buf == null) return null
  let text = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf)
  text = text.replace(/^\uFEFF/, '').trim()
  if (!text) return null
  try { return JSON.parse(text) } catch {}
  const start = text.search(/[\[{]/)
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'))
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)) } catch {}
  }
  return null
}

function cleanHtml(str) {
  return String(str || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim()
}

function formatArtists(s) {
  return joinArtists(cleanHtml(String(s || '')))
}

function formatTime(seconds) {
  const n = Number(seconds) || 0
  if (n <= 0) return ''
  const m = Math.floor(n / 60)
  const s = Math.floor(n % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function emptyPage(page = 1, extra = {}) {
  return { list: [], total: 0, page, allPage: 0, ...extra }
}

function unsupported(page = 1, regions = []) {
  return { ...emptyPage(page, { regions }), unsupported: true }
}

function pageSlice(list, page, limit) {
  const total = list.length
  const start = (page - 1) * limit
  return {
    list: list.slice(start, start + limit),
    total,
    page,
    allPage: Math.max(1, Math.ceil(total / limit) || 0),
  }
}

const TX_HEADERS = {
  Referer: 'https://y.qq.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

const WY_HEADERS = {
  Referer: 'https://music.163.com',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

const KW_HEADERS = {
  Referer: 'https://www.kuwo.cn/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

async function txMusicu(payload) {
  const url = `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(JSON.stringify(payload))}`
  return parseJSON(await req('get', url, null, TX_HEADERS))
}

/** 部分 QQ 接口（如新碟）仅 POST JSON 可用 */
async function txMusicuPost(payload) {
  const { comm, ...rest } = payload || {}
  return parseJSON(await req('post', 'https://u.y.qq.com/cgi-bin/musicu.fcg', {
    comm: {
      ct: 24,
      cv: 0,
      format: 'json',
      platform: 'yqq.json',
      uin: '0',
      g_tk: 5381,
      needNewCode: 1,
      ...(comm || {}),
    },
    ...rest,
  }, {
    ...TX_HEADERS,
    Origin: 'https://y.qq.com',
    'Content-Type': 'application/json',
  }))
}

function dedupeAlbums(items) {
  const map = new Map()
  for (const item of items) {
    const id = String(item?.id || '').trim()
    const name = String(item?.name || '').trim()
    if (!id || id === '0' || id === 'undefined' || !name || map.has(id)) continue
    map.set(id, item)
  }
  return [...map.values()]
}

function mapTxSong(item) {
  const albumMid = item.album?.mid || item.albummid || ''
  const albumName = cleanHtml(item.album?.name || item.albumname || '')
  const songmid = item.mid || item.songmid || ''
  const songId = item.id != null && item.id !== '' ? String(item.id) : songmid
  const img = albumMid && String(albumMid) !== '0'
    ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumMid}.jpg`
    : ''
  return attachSongTypes('tx', item, {
    id: songmid,
    name: cleanHtml(item.title || item.songname || item.name || ''),
    singer: formatArtists(
      Array.isArray(item.singer) ? item.singer.map((s) => s.name).join('/') : (item.singername || ''),
    ),
    album: albumName,
    albumName,
    interval: formatTime(item.interval || 0),
    source: 'tx',
    songId,
    songmid,
    strMediaMid: item.file?.media_mid || item.strMediaMid || '',
    musicId: songId,
    albumId: albumMid,
    albumMid,
    albummid: albumMid,
    img,
    picUrl: img,
  })
}

function mapWySong(item) {
  const pic = item.al?.picUrl || item.album?.picUrl || ''
  return attachSongTypes('wy', item, {
    id: String(item.id),
    name: cleanHtml(item.name),
    singer: formatArtists((item.ar || item.artists || []).map((a) => a.name).join('/')),
    album: cleanHtml(item.al?.name || item.album?.name || ''),
    albumName: cleanHtml(item.al?.name || item.album?.name || ''),
    albumId: String(item.al?.id || item.album?.id || ''),
    interval: formatTime(Math.floor((item.dt || item.duration || 0) / 1000)),
    source: 'wy',
    songId: String(item.id),
    musicId: String(item.id),
    img: pic,
    picUrl: pic,
  })
}

function mapKwSong(item) {
  return attachSongTypes('kw', item, {
    id: String(item.rid || item.id || ''),
    name: cleanHtml(item.name),
    singer: formatArtists(item.artist),
    album: cleanHtml(item.album),
    albumName: cleanHtml(item.album),
    interval: formatTime(item.duration),
    source: 'kw',
    songId: String(item.rid || item.id || ''),
    musicId: String(item.rid || item.id || ''),
    rid: String(item.rid || item.id || ''),
    img: item.pic || item.albumpic || '',
    picUrl: item.pic || item.albumpic || '',
  })
}

function mapKgSong(item) {
  const parts = String(item.filename || '').split(' - ')
  const singer = parts.length > 1 ? parts[0] : (item.singername || '')
  const name = parts.length > 1 ? parts.slice(1).join(' - ') : (item.songname || item.filename || '')
  const cover = (item.album_sizable_cover || item.imgurl || '').replace('{size}', '400')
  return attachSongTypes('kg', item, {
    id: item.hash || item.album_audio_id,
    name: cleanHtml(name),
    singer: formatArtists(singer),
    album: cleanHtml(item.album_name || ''),
    interval: formatTime(item.duration),
    source: 'kg',
    hash: item.hash,
    songId: item.hash,
    albumAudioId: item.album_audio_id,
    img: cover,
    picUrl: cover,
  })
}

function mapMgSong(item) {
  const o = item?.objectInfo || item
  return attachSongTypes('mg', o, {
    id: o.copyrightId || o.songId,
    name: cleanHtml(o.songName || o.name),
    singer: formatArtists((o.singerList || o.singers || []).map((s) => s.name).join('/') || o.singer),
    album: cleanHtml(o.album || ''),
    source: 'mg',
    songId: o.copyrightId || o.songId,
    copyrightId: o.copyrightId || '',
    img: o.albumImg || o.img1 || '',
    picUrl: o.albumImg || o.img1 || '',
    interval: '',
  })
}

function mapAlbum({ id, name, artist, img, publishTime, count, source }) {
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

function mapRankCard({ id, name, cover, color, songs, source, updateTime }) {
  return {
    id: String(id),
    name: cleanHtml(name),
    cover: cover || '',
    color: color || '',
    updateTime: updateTime || '',
    source,
    songs: (songs || []).slice(0, 3).map((s) => ({
      name: cleanHtml(s.name || s.title || ''),
      singer: formatArtists(s.singer || s.author || s.artist || ''),
    })).filter((s) => s.name || s.singer),
  }
}

/** 列表接口不含预览曲时，并发补全各榜前 3 首 */
async function fillRankPreviewSongs(cards, fetchPreview, concurrency = 8) {
  if (!cards.length) return cards
  await mapWithConcurrency(cards, concurrency, async (card) => {
    if ((card.songs || []).length) return card
    try {
      const songs = await fetchPreview(card.id)
      if (songs?.length) {
        card.songs = songs.slice(0, 3).map((s) => ({
          name: cleanHtml(s.name || ''),
          singer: formatArtists(s.singer || ''),
        })).filter((s) => s.name || s.singer)
      }
    } catch {}
    return card
  })
  return cards
}

/** ---------- QQ ---------- */
export const TX_SONG_REGIONS = [
  { id: 'latest', label: '最新' },
  { id: 'inland', label: '内地' },
  { id: 'hktw', label: '港台' },
  { id: 'eu', label: '欧美' },
  { id: 'korea', label: '韩国' },
  { id: 'japan', label: '日本' },
]

const TX_SONG_TYPE = { latest: 0, inland: 1, hktw: 2, eu: 3, korea: 4, japan: 5 }

export const TX_ALBUM_REGIONS = [
  { id: 'inland', label: '内地' },
  { id: 'hktw', label: '港台' },
  { id: 'eu', label: '欧美' },
  { id: 'korea', label: '韩国' },
  { id: 'japan', label: '日本' },
]

const TX_ALBUM_TYPE = { inland: 1, hktw: 2, eu: 3, korea: 4, japan: 5 }

async function txNewSongs(region = 'latest', page = 1, limit = 27) {
  const type = TX_SONG_TYPE[region] ?? 0
  const data = await txMusicu({
    comm: { ct: 24, cv: 0 },
    new_song: {
      module: 'newsong.NewSongServer',
      method: 'get_new_song_info',
      param: { type },
    },
  })
  let songs = data?.new_song?.data?.songlist
    || data?.new_song?.data?.song_list
    || data?.new_song?.data?.list
    || []
  if (!songs.length) {
    const fallback = await txMusicu({
      comm: { ct: 24 },
      new_song: {
        module: 'QQMusic.MusichallServer',
        method: 'GetNewSong',
        param: { type },
      },
    })
    songs = fallback?.new_song?.data?.song_list
      || fallback?.new_song?.data?.list
      || []
  }
  const mapped = songs.map(mapTxSong).filter((s) => s.songmid || s.id)
  return { ...pageSlice(mapped, page, limit), regions: TX_SONG_REGIONS, region, source: 'tx' }
}

async function txNewAlbums(region = 'inland', page = 1, limit = 20) {
  const area = TX_ALBUM_TYPE[region] ?? 1
  const sin = Math.max(0, (page - 1) * limit)
  const data = await txMusicuPost({
    new_album: {
      module: 'newalbum.NewAlbumServer',
      method: 'get_new_album_info',
      param: { area, sin, num: limit },
    },
  })
  let list = data?.new_album?.data?.albums || []
  let total = data?.new_album?.data?.total || list.length

  // 兼容旧 Musichall 接口（字段为 album_list）
  if (!list.length) {
    const legacy = await txMusicu({
      comm: { ct: 24 },
      new_album: {
        module: 'QQMusic.MusichallServer',
        method: 'GetNewAlbum',
        param: {
          type: area,
          category: '-1',
          genre: 0,
          year: 1,
          company: -1,
          sort: 1,
          start: sin,
          end: sin + limit - 1,
        },
      },
    })
    const raw = legacy?.new_album?.data?.album_list
      || legacy?.new_album?.data?.list
      || legacy?.new_album?.data?.albums
      || []
    list = raw.map((item) => {
      const album = item.album || item
      const authors = item.author || item.singers || []
      return {
        mid: album.mid || album.album_mid || album.albumMID || '',
        id: album.id || album.album_id,
        name: album.name || album.title || album.album_name,
        singers: Array.isArray(authors) ? authors : [],
        release_time: album.time_public || album.public_time || album.pub_time || '',
        song_count: album.song_count || 0,
      }
    })
    total = legacy?.new_album?.data?.size || legacy?.new_album?.data?.total || list.length
  }

  return {
    list: list.map((item) => {
      const mid = item.mid || item.album_mid || item.albumMID || ''
      return mapAlbum({
        id: mid || item.id || item.album_id,
        name: item.name || item.album_name || item.title,
        artist: Array.isArray(item.singers)
          ? item.singers.map((s) => s.name || s.title).join('/')
          : (item.singer_name || item.singerName || ''),
        img: item.album_pic
          || (mid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${mid}.jpg` : ''),
        publishTime: item.release_time || item.public_time || item.pub_time || '',
        count: item.song_count || 0,
        source: 'tx',
      })
    }),
    total,
    page,
    allPage: Math.max(1, Math.ceil((total || list.length) / limit) || 0),
    regions: TX_ALBUM_REGIONS,
    region: region || 'inland',
    source: 'tx',
  }
}

async function txToplists() {
  const data = await txMusicu({
    comm: { ct: 24, cv: 0 },
    toplist: {
      module: 'musicToplist.ToplistInfoServer',
      method: 'GetAll',
      param: {},
    },
  })
  let groups = data?.toplist?.data?.group || data?.toplist?.data?.list || []
  if (!groups.length) {
    const legacy = await txMusicu({
      comm: { ct: 24 },
      toplist: {
        module: 'music.web_toplist_svr',
        method: 'get_toplist_index',
        param: {},
      },
    })
    const raw = legacy?.toplist?.data?.topList || legacy?.toplist?.data?.group || []
    groups = Array.isArray(raw) ? [{ groupName: '', toplist: raw }] : []
  }

  const cards = []
  for (const g of groups) {
    const items = g.toplist || g.list || g.group_top_list || []
    for (const item of items) {
      const id = item.topId || item.id || item.topID
      if (!id) continue
      const songs = (item.song || item.songlist || item.songs || []).map((s) => ({
        name: s.title || s.songname || s.name,
        singer: Array.isArray(s.singer) ? s.singer.map((x) => x.name).join('/') : (s.singerName || s.singername || ''),
      }))
      cards.push(mapRankCard({
        id,
        name: item.title || item.name || item.topTitle,
        cover: item.headPicUrl || item.frontPicUrl || item.picUrl || item.cover || '',
        color: item.color || item.title_shared_color || '',
        songs,
        source: 'tx',
        updateTime: item.updateTime || item.update_time || '',
      }))
    }
  }
  return { list: cards, total: cards.length, source: 'tx' }
}

async function txToplistDetail(id, page = 1, limit = 50) {
  const data = await txMusicu({
    comm: { ct: 24, cv: 0 },
    detail: {
      module: 'musicToplist.ToplistInfoServer',
      method: 'GetDetail',
      param: {
        topId: Number(id) || id,
        offset: (page - 1) * limit,
        num: limit,
        period: '',
      },
    },
  })
  const detail = data?.detail?.data
  const songs = detail?.songInfoList || detail?.data?.song || detail?.songlist || []
  const info = detail?.data || detail || {}
  return {
    info: {
      id: String(id),
      name: cleanHtml(info.title || info.topTitle || info.name || '排行榜'),
      cover: info.headPicUrl || info.frontPicUrl || info.picUrl || '',
      updateTime: info.updateTime || '',
      source: 'tx',
    },
    list: songs.map(mapTxSong),
    total: detail?.totalNum || songs.length,
    page,
    source: 'tx',
  }
}

/** ---------- 网易云 ---------- */
export const WY_SONG_REGIONS = [
  { id: '0', label: '全部' },
  { id: '7', label: '华语' },
  { id: '96', label: '欧美' },
  { id: '8', label: '日本' },
  { id: '16', label: '韩国' },
]

export const WY_ALBUM_REGIONS = [
  { id: 'ALL', label: '全部' },
  { id: 'ZH', label: '华语' },
  { id: 'EA', label: '欧美' },
  { id: 'KR', label: '韩国' },
  { id: 'JP', label: '日本' },
]

async function wyNewSongs(region = '0', page = 1, limit = 27) {
  const type = region || '0'
  const buf = await req('get', `https://music.163.com/api/v1/discovery/new/songs?areaId=${type}&total=true&limit=100`, null, WY_HEADERS)
  const data = parseJSON(buf)
  const songs = data?.data || data?.songList || []
  const mapped = songs.map(mapWySong)
  return { ...pageSlice(mapped, page, limit), regions: WY_SONG_REGIONS, region: type, source: 'wy' }
}

async function wyNewAlbums(region = 'ALL', page = 1, limit = 20) {
  const valid = new Set(WY_ALBUM_REGIONS.map((r) => r.id))
  const area = valid.has(region) ? region : 'ALL'
  const offset = (page - 1) * limit
  const buf = await req('get',
    `https://music.163.com/api/album/new?area=${encodeURIComponent(area)}&limit=${limit}&offset=${offset}`,
    null, WY_HEADERS)
  const data = parseJSON(buf)
  const list = data?.albums || []
  const total = data?.total || list.length
  return {
    list: list.map((item) => mapAlbum({
      id: item.id,
      name: item.name,
      artist: (item.artists || []).map((a) => a.name).join('/') || item.artist?.name,
      img: item.picUrl,
      publishTime: item.publishTime ? new Date(item.publishTime).toISOString().slice(0, 10) : '',
      count: item.size,
      source: 'wy',
    })),
    total,
    page,
    allPage: Math.max(1, Math.ceil(total / limit)),
    regions: WY_ALBUM_REGIONS,
    region: area,
    source: 'wy',
  }
}

async function wyFetchRankPreview(id) {
  const buf = await req('get',
    `https://music.163.com/api/v6/playlist/detail?id=${id}&n=3&s=8`,
    null, WY_HEADERS)
  const tracks = parseJSON(buf)?.playlist?.tracks || []
  return tracks.slice(0, 3).map((t) => ({
    name: cleanHtml(t.name),
    singer: formatArtists((t.ar || []).map((a) => a.name).join('/')),
  }))
}

async function wyToplists() {
  const buf = await req('get', 'https://music.163.com/api/toplist', null, WY_HEADERS)
  const data = parseJSON(buf)
  const list = (data?.list || []).map((item) => mapRankCard({
    id: item.id,
    name: item.name,
    cover: item.coverImgUrl,
    // 新版 toplist 接口 tracks 常为 null，需另拉详情补预览
    songs: (item.tracks || []).slice(0, 3).map((t) => ({
      name: t.first || t.name,
      singer: t.second || (t.ar || []).map((a) => a.name).join('/'),
    })),
    source: 'wy',
    updateTime: item.updateFrequency || '',
  }))
  await fillRankPreviewSongs(list, wyFetchRankPreview, 8)
  return {
    list,
    total: list.length,
    source: 'wy',
  }
}

async function wyToplistDetail(id, page = 1, limit = 50) {
  const buf = await req('get',
    `https://music.163.com/api/v6/playlist/detail?id=${id}&n=100000&s=8`,
    null, WY_HEADERS)
  const data = parseJSON(buf)
  const pl = data?.playlist
  if (!pl) throw new Error('无法获取网易云榜单')
  const tracks = pl.tracks || []
  const sliced = pageSlice(tracks.map(mapWySong), page, limit)
  return {
    info: {
      id: String(id),
      name: cleanHtml(pl.name),
      cover: pl.coverImgUrl || '',
      updateTime: '',
      source: 'wy',
    },
    ...sliced,
    source: 'wy',
  }
}

/** ---------- 酷我 ---------- */
async function kwNewSongs(_region = '', page = 1, limit = 27) {
  const pn = page
  const buf = await req('get',
    `http://wapi.kuwo.cn/api/www/bang/bang/musicList?bangId=17&pn=${pn}&rn=${limit}&httpsStatus=1`,
    null, KW_HEADERS)
  const data = parseJSON(buf)
  const list = data?.data?.musicList || []
  const total = data?.data?.num || list.length
  return {
    list: list.map(mapKwSong),
    total,
    page,
    allPage: Math.max(1, Math.ceil(total / limit)),
    regions: [],
    region: '',
    source: 'kw',
  }
}

async function kwNewAlbums(_region = '', page = 1, limit = 20) {
  const collected = []
  const pushSongAlbum = (item) => {
    collected.push(mapAlbum({
      id: item.albumid || item.ALBUMID || item.albumId,
      name: item.album || item.ALBUM || item.albumname,
      artist: item.artist || item.ARTIST || item.singer,
      img: item.albumpic || item.pic || item.img || '',
      publishTime: item.releaseDate || item.pub || '',
      count: 0,
      source: 'kw',
    }))
  }

  // 优先 kbang（与 wapi 限流池不同）；失败再回退 wapi 新歌榜
  const bangAttempts = [
    `http://kbangserver.kuwo.cn/ksong.s?from=pc&fmt=json&pn=0&rn=${Math.min(100, Math.max(40, limit * 4))}&type=bang&data=content&id=17&show_copyright_off=0&pcmp4=1&isbang=1&userid=0`,
    `http://wapi.kuwo.cn/api/www/bang/bang/musicList?bangId=17&pn=1&rn=${Math.min(100, Math.max(40, limit * 4))}&httpsStatus=1`,
  ]
  for (const url of bangAttempts) {
    if (collected.length) break
    try {
      const data = parseJSON(await req('get', url, null, KW_HEADERS))
      const songs = data?.data?.musicList || data?.musiclist || data?.list || []
      for (const item of songs) pushSongAlbum(item)
    } catch {}
  }

  if (!collected.length) {
    try {
      const data = parseJSON(await req('get',
        'http://wapi.kuwo.cn/openapi/v1/pc/disc/shelves?pn=1&rn=40',
        null, KW_HEADERS))
      for (const item of data?.data?.albumList || data?.data?.list || []) {
        collected.push(mapAlbum({
          id: item.albumid || item.id,
          name: item.album || item.name,
          artist: item.artist,
          img: item.pic || item.img,
          publishTime: item.releaseDate || '',
          count: item.musiccnt || item.total || 0,
          source: 'kw',
        }))
      }
    } catch {}
  }

  const list = dedupeAlbums(collected)
  return {
    ...pageSlice(list, page, limit),
    regions: [],
    region: '',
    source: 'kw',
  }
}

async function kwFetchRankPreview(id) {
  const buf = await req('get',
    `http://wapi.kuwo.cn/api/www/bang/bang/musicList?bangId=${id}&pn=1&rn=3&httpsStatus=1`,
    null, KW_HEADERS)
  const list = parseJSON(buf)?.data?.musicList || []
  return list.slice(0, 3).map((item) => ({
    name: cleanHtml(item.name),
    singer: formatArtists(item.artist),
  }))
}

async function kwToplists() {
  const buf = await req('get',
    'http://wapi.kuwo.cn/api/www/bang/bang/bangMenu?httpsStatus=1',
    null, KW_HEADERS)
  const data = parseJSON(buf)
  const groups = data?.data || []
  const cards = []
  for (const g of groups) {
    for (const item of g.list || []) {
      cards.push(mapRankCard({
        id: item.sourceid || item.id,
        name: item.name,
        cover: item.pic || item.img,
        songs: [],
        source: 'kw',
        updateTime: item.pub || '',
      }))
    }
  }
  await fillRankPreviewSongs(cards, kwFetchRankPreview, 8)
  return { list: cards, total: cards.length, source: 'kw' }
}

async function kwToplistDetail(id, page = 1, limit = 50) {
  const buf = await req('get',
    `http://wapi.kuwo.cn/api/www/bang/bang/musicList?bangId=${id}&pn=${page}&rn=${limit}&httpsStatus=1`,
    null, KW_HEADERS)
  const data = parseJSON(buf)
  const list = data?.data?.musicList || []
  const total = data?.data?.num || list.length
  return {
    info: {
      id: String(id),
      name: cleanHtml(data?.data?.name || '排行榜'),
      cover: data?.data?.pic || '',
      updateTime: '',
      source: 'kw',
    },
    list: list.map(mapKwSong),
    total,
    page,
    source: 'kw',
  }
}

/** ---------- 酷狗 ---------- */
async function kgNewSongs(_region = '', page = 1, limit = 27) {
  const buf = await req('get',
    `http://mobilecdn.kugou.com/api/v3/rank/song?version=9108&rankid=8888&page=${page}&pagesize=${limit}&area_code=1`,
    null, { 'User-Agent': 'Mozilla/5.0' })
  const data = parseJSON(buf)
  const list = data?.data?.info || []
  const total = data?.data?.total || list.length
  return {
    list: list.map(mapKgSong),
    total,
    page,
    allPage: Math.max(1, Math.ceil(total / limit)),
    regions: [],
    region: '',
    source: 'kg',
  }
}

async function kgNewAlbums(_region = '', page = 1, limit = 20) {
  const collected = []

  try {
    const buf = await req('get',
      'http://service.mobile.kugou.com/v1/yueku/recommend?plat=0&type=8&operator=2&version=8352',
      null, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' })
    const data = parseJSON(buf)
    for (const item of data?.data?.info?.album || []) {
      collected.push(mapAlbum({
        id: item.albumid || item.album_id,
        name: item.albumname || item.album_name,
        artist: item.singername || item.author_name,
        img: (item.imgurl || item.sizable_cover || '').replace('{size}', '400'),
        publishTime: item.publishtime || '',
        count: item.songcount || 0,
        source: 'kg',
      }))
    }
  } catch {}

  // 乐库 tip 通常很少：单次拉取新歌榜按 album_id 去重补齐（避免多页触发限流）
  if (collected.length < Math.max(limit, 12)) {
    try {
      const buf = await req('get',
        'http://mobilecdn.kugou.com/api/v3/rank/song?version=9108&rankid=8888&page=1&pagesize=50&area_code=1',
        null, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' })
      const data = parseJSON(buf)
      for (const item of data?.data?.info || []) {
        const id = item.album_id || item.albumid
        if (!id) continue
        const parts = String(item.filename || '').split(' - ')
        const singer = parts.length > 1 ? parts[0] : (item.authors?.[0]?.author_name || item.singername || '')
        collected.push(mapAlbum({
          id,
          name: item.album_name || item.albumname || item.remark || item.songname || '',
          artist: singer,
          img: (item.album_sizable_cover || item.imgurl || '').replace('{size}', '400'),
          publishTime: String(item.addtime || item.rank_id_publish_date || '').slice(0, 10),
          count: 0,
          source: 'kg',
        }))
      }
    } catch {}
  }

  const list = dedupeAlbums(collected)
  return {
    ...pageSlice(list, page, limit),
    regions: [],
    region: '',
    source: 'kg',
  }
}

function mapKgRankPreviewSongs(songinfo = []) {
  return (songinfo || []).slice(0, 3).map((s) => {
    if (!s || typeof s !== 'object') return { name: '', singer: '' }
    // 新接口：name=歌名, author=歌手, songname="歌手 - 歌名"
    // 旧接口：filename="歌手 - 歌名"
    let name = cleanHtml(s.name || s.title || '')
    let singer = formatArtists(s.author || s.singer || s.singername || s.artist || '')
    const combined = s.songname || s.filename || ''
    if ((!name || !singer) && combined) {
      const parts = String(combined).split(' - ')
      if (parts.length > 1) {
        if (!singer) singer = formatArtists(parts[0])
        if (!name) name = cleanHtml(parts.slice(1).join(' - '))
      } else if (!name) {
        name = cleanHtml(combined)
      }
    }
    return { name, singer }
  }).filter((s) => s.name || s.singer)
}

async function kgToplists() {
  const buf = await req('get',
    'http://mobilecdn.kugou.com/api/v3/rank/list?version=9108&apiver=6&withsong=1',
    null, { 'User-Agent': 'Mozilla/5.0' })
  const data = parseJSON(buf)
  const list = data?.data?.info || []
  return {
    list: list.map((item) => mapRankCard({
      id: item.rankid || item.rank_id || item.id,
      name: item.rankname || item.rank_name,
      cover: (item.imgurl || item.img_9 || item.bannerurl || '').replace('{size}', '400'),
      songs: mapKgRankPreviewSongs(item.songinfo),
      source: 'kg',
      updateTime: item.update_frequency || '',
    })),
    total: list.length,
    source: 'kg',
  }
}

async function kgToplistDetail(id, page = 1, limit = 50) {
  const buf = await req('get',
    `http://mobilecdn.kugou.com/api/v3/rank/song?version=9108&rankid=${id}&page=${page}&pagesize=${limit}&area_code=1`,
    null, { 'User-Agent': 'Mozilla/5.0' })
  const data = parseJSON(buf)
  const list = data?.data?.info || []
  const total = data?.data?.total || list.length
  return {
    info: {
      id: String(id),
      name: '排行榜',
      cover: '',
      updateTime: '',
      source: 'kg',
    },
    list: list.map(mapKgSong),
    total,
    page,
    source: 'kg',
  }
}

/** ---------- 咪咕 ---------- */
async function mgNewSongs(_region = '', page = 1, limit = 27) {
  const buf = await req('get',
    `https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/querycontentbyId.do?columnId=27553319&needAll=0`,
    null, {
      Referer: 'https://m.music.migu.cn/',
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      channel: '0146951',
    })
  const data = parseJSON(buf)
  const contents = data?.columnInfo?.contents || data?.data?.contents || []
  const songs = []
  for (const c of contents) {
    const o = c.objectInfo || c
    if (!o?.copyrightId && !o?.songId) continue
    songs.push(mapMgSong(o))
  }
  if (!songs.length) return unsupported(page)
  return { ...pageSlice(songs, page, limit), regions: [], region: '', source: 'mg' }
}

async function mgNewAlbums(_region = '', page = 1, limit = 20) {
  // 咪咕新碟栏目不稳定：从新歌栏目按专辑名去重兜底
  try {
    const songsRes = await mgNewSongs('', 1, 100)
    if (songsRes?.unsupported) return unsupported(page)
    const collected = []
    for (const s of songsRes.list || []) {
      const name = cleanHtml(s.album || '')
      if (!name) continue
      const id = s.albumId || s.albumid || name
      collected.push(mapAlbum({
        id,
        name,
        artist: s.singer,
        img: s.img || s.picUrl,
        publishTime: '',
        count: 0,
        source: 'mg',
      }))
    }
    const list = dedupeAlbums(collected)
    if (!list.length) return unsupported(page)
    return { ...pageSlice(list, page, limit), regions: [], region: '', source: 'mg' }
  } catch {
    return unsupported(page)
  }
}

async function mgToplists() {
  const buf = await req('get',
    'https://app.c.nf.migu.cn/MIGUM3.0/bmw/billboard/home/v1.0',
    null, {
      Referer: 'https://m.music.migu.cn/',
      'User-Agent': 'Mozilla/5.0',
      channel: '0146951',
    })
  const data = parseJSON(buf)
  const columns = data?.data?.columnInfo?.contents || data?.data?.contents || []
  const cards = []
  for (const c of columns) {
    const o = c.objectInfo || c
    const id = o.columnId || o.id || o.billboardId
    if (!id) continue
    cards.push(mapRankCard({
      id,
      name: o.title || o.columnTitle || o.name,
      cover: o.imageUrl || o.img || '',
      songs: [],
      source: 'mg',
    }))
  }
  if (!cards.length) return { list: [], total: 0, source: 'mg', unsupported: true }
  return { list: cards, total: cards.length, source: 'mg' }
}

async function mgToplistDetail(id, page = 1, limit = 50) {
  const buf = await req('get',
    `https://app.c.nf.migu.cn/MIGUM3.0/bmw/billboard/home/list/v1.0?columnId=${encodeURIComponent(id)}`,
    null, {
      Referer: 'https://m.music.migu.cn/',
      'User-Agent': 'Mozilla/5.0',
      channel: '0146951',
    })
  const data = parseJSON(buf)
  const contents = data?.data?.columnInfo?.contents || data?.data?.contents || []
  const songs = []
  for (const c of contents) {
    const o = c.objectInfo || c
    if (!o?.copyrightId && !o?.songId) continue
    songs.push(mapMgSong(o))
  }
  return {
    info: { id: String(id), name: '排行榜', cover: '', updateTime: '', source: 'mg' },
    ...pageSlice(songs, page, limit),
    source: 'mg',
  }
}

const newSongMap = { tx: txNewSongs, wy: wyNewSongs, kw: kwNewSongs, kg: kgNewSongs, mg: mgNewSongs }
const newAlbumMap = { tx: txNewAlbums, wy: wyNewAlbums, kw: kwNewAlbums, kg: kgNewAlbums, mg: mgNewAlbums }
const toplistMap = { tx: txToplists, wy: wyToplists, kw: kwToplists, kg: kgToplists, mg: mgToplists }
const toplistDetailMap = {
  tx: txToplistDetail,
  wy: wyToplistDetail,
  kw: kwToplistDetail,
  kg: kgToplistDetail,
  mg: mgToplistDetail,
}

export function getDiscoverRegions(source, kind) {
  if (kind === 'songs') {
    if (source === 'tx') return TX_SONG_REGIONS
    if (source === 'wy') return WY_SONG_REGIONS
    return []
  }
  if (kind === 'albums') {
    if (source === 'tx') return TX_ALBUM_REGIONS
    if (source === 'wy') return WY_ALBUM_REGIONS
    return []
  }
  return []
}

export async function fetchNewSongs(source, region = '', page = 1, limit = 27) {
  if (!AVAILABLE_SOURCES[source]) throw new Error(`不支持的平台: ${source}`)
  const fn = newSongMap[source]
  if (!fn) return unsupported(page)
  try {
    return await fn(region, page, limit)
  } catch (e) {
    const err = new Error(e.message || '获取新歌失败')
    err.cause = e
    throw err
  }
}

export async function fetchNewAlbums(source, region = '', page = 1, limit = 20) {
  if (!AVAILABLE_SOURCES[source]) throw new Error(`不支持的平台: ${source}`)
  const fn = newAlbumMap[source]
  if (!fn) return unsupported(page)
  try {
    return await fn(region, page, limit)
  } catch (e) {
    throw new Error(e.message || '获取新碟失败')
  }
}

export async function fetchToplists(source) {
  if (!AVAILABLE_SOURCES[source]) throw new Error(`不支持的平台: ${source}`)
  const fn = toplistMap[source]
  if (!fn) return { list: [], total: 0, source, unsupported: true }
  try {
    return await fn()
  } catch (e) {
    throw new Error(e.message || '获取排行榜失败')
  }
}

export async function fetchToplistDetail(source, id, page = 1, limit = 100) {
  if (!AVAILABLE_SOURCES[source]) throw new Error(`不支持的平台: ${source}`)
  if (!id) throw new Error('缺少榜单 ID')
  const fn = toplistDetailMap[source]
  if (!fn) throw new Error('该平台暂不支持榜单详情')
  return fn(id, page, limit)
}
