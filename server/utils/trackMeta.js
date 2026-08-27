import { requestSource, hasActiveSource } from '../sourceManager.js'
import { getLyric, searchMusic } from '../musicSdk.js'
import { lyricLookupExtra } from './musicInfo.js'
import { resolveCoverCandidates } from './cover.js'
import { fetchPicBuffer } from './fetchPic.js'
import { fixKgLyric } from './lyric.js'

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
} = {}) {
  const merged = { ...musicInfo, ...meta, ...task, source: source || musicInfo.source || meta.source }
  const src = merged.source || source
  const id = pickLyricSongId(src, songId || merged.songId || merged.songmid || merged.hash || merged.copyrightId, merged)
  const extra = lyricLookupExtra(merged)

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

  if (src && hasActiveSource()) {
    try {
      const fromSource = await requestSource(src, 'lyric', { musicInfo: merged })
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
    const keyword = [merged.name || task?.name, merged.singer || task?.singer].filter(Boolean).join(' ')
    if (!keyword) return null
    const allowOther = useOtherSource && settings?.['download.isUseOtherSource'] !== 'false'
    const fallbackSources = allowOther ? ['wy', 'tx', 'kw', 'kg', 'mg'] : [src].filter(Boolean)
    const seen = new Set()
    for (const trySrc of fallbackSources) {
      if (!trySrc || seen.has(trySrc)) continue
      seen.add(trySrc)
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
} = {}) {
  const merged = { ...musicInfo, ...meta, ...task, source: source || musicInfo.source || meta.source }
  const src = merged.source || source
  const candidates = resolveCoverCandidates(merged)

  if (asBuffer) {
    for (const url of candidates) {
      const pic = await fetchPicBuffer(url)
      if (pic) return pic
    }
  } else if (candidates[0]) {
    return candidates[0]
  }

  if (src && hasActiveSource()) {
    try {
      const picResult = await requestSource(src, 'pic', { musicInfo: merged })
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
    const allowOther = useOtherSource
    const fallbackSources = allowOther ? [src, 'wy', 'tx', 'kw', 'kg', 'mg'].filter(Boolean) : [src].filter(Boolean)
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
