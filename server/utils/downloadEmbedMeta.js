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

/**
 * 解析下载内嵌用的专辑级字段（专辑艺术家 / 年份 / 风格）。
 * 任务里已有的优先；缺省时按 albumId 拉专辑详情补全（失败不阻断下载）。
 */
export async function resolveDownloadEmbedMeta(task, meta = {}, { timeoutMs = 8000 } = {}) {
  const m = meta && typeof meta === 'object' ? meta : {}
  let year = normalizeTagYear(m.year || task?.year || m.publishTime || task?.publishTime)
  let genre = String(m.genre || task?.genre || '').trim()
  const hadExplicitAlbumArtist = Boolean(String(task?.albumArtist || m.albumArtist || '').trim())
  let albumArtist = joinArtists(task?.albumArtist || m.albumArtist || task?.singer || '')
  let album = String(task?.album || m.album || '').trim()

  const needFetch = !year || !genre || !hadExplicitAlbumArtist || !album
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
      if (!genre) genre = String(info.genre || '').trim()
      if (!hadExplicitAlbumArtist && info.author) {
        albumArtist = joinArtists(info.author) || albumArtist
      }
      if (!album && info.name) album = String(info.name).trim()
    } catch {
      // 专辑详情失败不影响下载与已有标签写入
    }
  }

  return { year, genre, albumArtist, album }
}
