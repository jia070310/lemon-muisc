import { requestSource, hasActiveSource } from '../sourceManager.js'
import { getStoredActiveSourceIds } from './activeSources.js'
import { getLyric, searchMusic, kgResolveAlbumCover } from '../musicSdk.js'
import { lyricLookupExtra } from './musicInfo.js'
import { resolveCoverCandidates } from './cover.js'
import { fetchPicBuffer } from './fetchPic.js'
import { fixKgLyric } from './lyric.js'

function normalizeLyricSearchName(name) {
  if (!name) return ''
  return String(name)
    .replace(/[《》「」『』【】[\]()（）]/g, ' ')
    .replace(/\s*(国语|粤语|英语|伴奏|纯音乐|DJ|Live|live|版|合唱版|低频公益版|3D环绕版)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function lyricSearchKeywords(merged = {}, task = {}) {
  const rawName = merged.name || task?.name || ''
  const singer = merged.singer || task?.singer || ''
  const normalized = normalizeLyricSearchName(rawName)
  const keywords = []
  if (rawName && singer) keywords.push(`${rawName} ${singer}`)
  if (normalized && singer) keywords.push(`${normalized} ${singer}`)
  if (rawName) keywords.push(rawName)
  if (normalized) keywords.push(normalized)
  return [...new Set(keywords.filter(Boolean))]
}

function isOnlineSource(source) {
  const src = String(source || '')
  return Boolean(src && src !== 'local')
}

/** 各平台获取歌词时优先使用的 ID */
export function pickLyricSongId(source, songId, extra = {}) {
  switch (source) {
    case 'tx':
      return extra.songmid || extra.strMediaMid || songId || ''
    case 'kg':
      return extra.hash || songId || ''
    case 'mg':
      return extra.copyrightId || songId || ''
    case 'kw':
      return extra.musicId || extra.rid || extra.dcTargetId || songId || ''
    case 'wy':
      return songId || extra.songId || extra.songmid || ''
    default:
      return songId || ''
  }
}

/**
 * 试听 / 下载共用的歌词获取：
 * 1) 内置 SDK（按平台正确 ID）
 * 2) 音源脚本 lyric
 * 3) 按歌名搜索补全（可跨平台）
 */
export async function fetchTrackLyric({
  source,
  songId,
  musicInfo = {},
  meta = {},
  task = {},
  settings = {},
  useOtherSource = true,
  userId = null,
  allowedSourceIds = null,
} = {}) {
  const merged = { ...musicInfo, ...meta, ...task, source: source || musicInfo.source || meta.source }
  const src = isOnlineSource(merged.source || source) ? (merged.source || source) : ''
  const id = pickLyricSongId(src, songId || merged.songId || merged.songmid || merged.hash || merged.copyrightId, merged)
  const extra = lyricLookupExtra(merged)
  const allowIds = allowedSourceIds || (userId ? getStoredActiveSourceIds(userId) : null)

  if (id && src) {
    try {
      const lrc = await getLyric(id, src, { ...extra, ...merged })
      if (lrc?.lyric) {
        if (src === 'kg') lrc.lyric = fixKgLyric(lrc.lyric)
        return lrc
      }
    } catch (e) {
      console.warn('SDK 获取歌词失败:', e?.message || e)
    }
  }

  if (src && hasActiveSource(allowIds)) {
    try {
      const fromSource = await requestSource(src, 'lyric', { musicInfo: merged }, { allowedSourceIds: allowIds })
      if (fromSource?.lyric) {
        return {
          lyric: src === 'kg' ? fixKgLyric(fromSource.lyric) : fromSource.lyric,
          tlyric: fromSource.tlyric || '',
          rlyric: fromSource.rlyric || '',
        }
      }
    } catch (e) {
      console.warn('音源获取歌词失败:', e?.message || e)
    }
  }

  try {
    const keywords = lyricSearchKeywords(merged, task)
    if (!keywords.length) return null
    const allowOther = !src || (useOtherSource && settings?.['download.isUseOtherSource'] !== 'false')
    const fallbackSources = (allowOther ? ['wy', 'tx', 'kw', 'kg', 'mg'] : [src]).filter(isOnlineSource)
    const seen = new Set()
    for (const keyword of keywords) {
      for (const trySrc of fallbackSources) {
        if (!trySrc || seen.has(`${keyword}:${trySrc}`)) continue
        seen.add(`${keyword}:${trySrc}`)
        const result = await searchMusic(keyword, trySrc, 1, 8)
        for (const hit of result.list || []) {
          const hitId = pickLyricSongId(hit.source || trySrc, hit.songmid || hit.hash || hit.songId || hit.copyrightId || hit.id, hit)
          if (!hitId) continue
          const lrc = await getLyric(hitId, hit.source || trySrc, lyricLookupExtra(hit))
          if (lrc?.lyric) {
            if ((hit.source || trySrc) === 'kg') lrc.lyric = fixKgLyric(lrc.lyric)
            return lrc
          }
        }
      }
    }
  } catch (e) {
    console.warn('搜索补歌词失败:', e?.message || e)
  }

  return null
}

/**
 * 试听 / 下载共用封面：
 * 1) 已有 URL / 平台推导
 * 2) 音源脚本 pic
 * 3) 按歌名搜索补封面
 * @param {{ asBuffer?: boolean }} opts  asBuffer=true 返回 Buffer，否则返回 URL
 */
export async function fetchTrackCover({
  source,
  musicInfo = {},
  meta = {},
  task = {},
  asBuffer = false,
  useOtherSource = true,
  userId = null,
  allowedSourceIds = null,
} = {}) {
  const merged = { ...musicInfo, ...meta, ...task, source: source || musicInfo.source || meta.source }
  const src = isOnlineSource(merged.source || source) ? (merged.source || source) : ''
  const candidates = resolveCoverCandidates(merged)
  const allowIds = allowedSourceIds || (userId ? getStoredActiveSourceIds(userId) : null)

  // 酷狗曲目常只有 albumId：按专辑接口补封面
  if (!candidates.length && src === 'kg' && merged.albumId) {
    try {
      const albumCover = await kgResolveAlbumCover(merged.albumId)
      if (albumCover) candidates.push(albumCover)
    } catch {}
  }

  // 酷我榜单回退源常无封面字段：用 musicInfo 补
  if (!candidates.length && src === 'kw') {
    const mid = merged.rid || merged.musicId || merged.songId || merged.id
    if (mid) {
      try {
        const { default: needle } = await import('needle')
        const resp = await needle('get',
          `http://wapi.kuwo.cn/api/www/music/musicInfo?mid=${encodeURIComponent(String(mid))}&httpsStatus=1`,
          {
            headers: {
              Referer: 'https://www.kuwo.cn/',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            parse_response: false,
            timeout: 12000,
          },
        )
        const text = Buffer.isBuffer(resp.body) ? resp.body.toString('utf8') : String(resp.body || '')
        const json = JSON.parse(text.replace(/^\uFEFF/, '').trim() || '{}')
        const pic = json?.data?.pic || json?.data?.albumpic || ''
        if (pic) candidates.push(String(pic).replace(/\/120\//, '/500/'))
      } catch {}
    }
  }

  if (asBuffer) {
    for (const url of candidates) {
      const pic = await fetchPicBuffer(url)
      if (pic) return pic
    }
  } else if (candidates[0]) {
    return candidates[0]
  }

  if (src && hasActiveSource(allowIds)) {
    try {
      const picResult = await requestSource(src, 'pic', { musicInfo: merged }, { allowedSourceIds: allowIds })
      const picUrl = typeof picResult === 'string' ? picResult : (picResult?.url || picResult?.picUrl)
      if (picUrl) {
        if (asBuffer) {
          const pic = await fetchPicBuffer(picUrl)
          if (pic) return pic
        } else {
          return picUrl
        }
      }
    } catch (e) {
      console.warn('音源获取封面失败:', e?.message || e)
    }
  }

  try {
    const keyword = [merged.name || task?.name, merged.singer || task?.singer].filter(Boolean).join(' ')
    if (!keyword) return asBuffer ? null : ''
    const allowOther = !src || useOtherSource
    const fallbackSources = (allowOther ? [src, 'wy', 'tx', 'kw', 'kg', 'mg'] : [src]).filter(isOnlineSource)
    const seen = new Set()
    for (const trySrc of fallbackSources) {
      if (seen.has(trySrc)) continue
      seen.add(trySrc)
      const result = await searchMusic(keyword, trySrc, 1, 5)
      for (const hit of result.list || []) {
        const urls = resolveCoverCandidates({ ...hit, source: hit.source || trySrc })
        for (const url of urls) {
          if (asBuffer) {
            const pic = await fetchPicBuffer(url)
            if (pic) return pic
          } else if (url) {
            return url
          }
        }
      }
    }
  } catch (e) {
    console.warn('搜索补封面失败:', e?.message || e)
  }

  return asBuffer ? null : ''
}
