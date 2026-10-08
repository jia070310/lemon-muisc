import { fetchAlbum } from '../musicSdk.js'
import { buildAlbumCacheKey, getOrFetchAlbum } from './albumCache.js'
import { withTimeout } from './asyncLimit.js'
import { joinArtists } from './artistTag.js'

/** 从发行日期/年份字段提取四位年份 */
export function normalizeTagYear(value) {
  const s = String(value || '').trim()
  if (!s) return ''
  const m = s.match(/(19|20)\d{2}/)
  return m ? m[0] : ''
}

function cleanHtml(str) {
  if (!str) return ''
  return String(str).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

/** 扁平化平台返回的风格字段（字符串 / 数组 / {name} 对象） */
function flattenGenreValue(value) {
  if (value == null || value === '') return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    return value.map((item) => flattenGenreValue(item)).filter(Boolean).join('/')
  }
  if (typeof value === 'object') {
    return flattenGenreValue(value.name || value.tagName || value.title || value.text || value.value || '')
  }
  return ''
}

const NON_GENRE_LABEL = /^(single|ep|lp|album|ost|soundtrack|live|digital|录音室专辑|精选集|合辑|现场|演唱会|原声带|数字专辑|单曲)$/i

function normalizeGenre(value) {
  const s = cleanHtml(flattenGenreValue(value))
  if (!s || NON_GENRE_LABEL.test(s)) return ''
  return s.split(/[,，/|、;；]/)[0].trim()
}

function pickGenreFromInfo(info = {}) {
  for (const c of [
    info.genre,
    info.genreNew,
    info.genre_name,
    info.genreName,
    info.tags,
    info.tag,
    info.style,
    info.category,
    info.language,
    info.lang,
  ]) {
    const g = normalizeGenre(c)
    if (g) return g
  }
  return ''
}

/** 描述写入 COMMENT：过长截断，避免撑爆部分播放器标签面板 */
function truncateComment(text, max = 1000) {
  const s = cleanHtml(text)
  if (!s) return ''
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

function pickComment(...candidates) {
  for (const c of candidates) {
    const text = truncateComment(c)
    if (text) return text
  }
  return ''
}

/**
 * 解析下载内嵌用的专辑级字段（专辑艺术家 / 年份 / 风格 / 描述）。
 * 任务里已有的优先；缺省时按 albumId 拉专辑详情补全（失败不阻断下载）。
 */
export async function resolveDownloadEmbedMeta(task, meta = {}, { timeoutMs = 8000 } = {}) {
  const m = meta && typeof meta === 'object' ? meta : {}
  let year = normalizeTagYear(m.year || task?.year || m.publishTime || task?.publishTime)
  let genre = normalizeGenre(m.genre || task?.genre || m.genreNew || m.language || m.lang)
  let comment = pickComment(
    m.comment,
    task?.comment,
    m.desc,
    task?.desc,
    m.description,
    task?.description,
  )
  const hadExplicitAlbumArtist = Boolean(String(task?.albumArtist || m.albumArtist || '').trim())
  let albumArtist = joinArtists(task?.albumArtist || m.albumArtist || task?.singer || '')
  let album = String(task?.album || m.album || '').trim()

  const needFetch = !year || !genre || !comment || !hadExplicitAlbumArtist || !album
  const albumId = String(m.albumId || m.albumMid || m.albummid || task?.albumId || task?.albumMid || '').trim()
  const source = String(m.source || task?.source || '').trim()

  if (needFetch && albumId && source) {
    try {
      const key = buildAlbumCacheKey(source, albumId)
      const data = await withTimeout(
        getOrFetchAlbum(key, () => fetchAlbum(source, albumId)),
        timeoutMs,
        '获取专辑信息超时',
      )
      const info = data?.info || {}
      if (!year) year = normalizeTagYear(info.publishTime)
      if (!genre) genre = pickGenreFromInfo(info)
      if (!comment) comment = pickComment(info.desc, info.description, info.intro)
      if (!hadExplicitAlbumArtist && info.author) {
        albumArtist = joinArtists(info.author) || albumArtist
      }
      if (!album && info.name) album = String(info.name).trim()
    } catch {
      // 专辑详情失败不影响下载与已有标签写入
    }
  }

  // 仍无风格时：用语种兜底（多数华语曲目专辑详情有 language）
  if (!genre) {
    genre = normalizeGenre(m.language || m.lang || task?.language)
  }

  return { year, genre, comment, albumArtist, album }
}
