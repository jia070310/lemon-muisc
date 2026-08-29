import { QUALITY_ORDER, DEFAULT_QUALITIES, sortQualities } from './quality.js'

function pickField(...values) {
  for (const value of values) {
    if (value != null && value !== '') return value
  }
  return ''
}

export function getItemQualities(item) {
  const list = item?.qualitys || item?.types?.map(t => t.type) || item?.meta?.qualitys || []
  return sortQualities(list)
}

/** 批量下载：取所选歌曲可用音质的并集；下载时按单曲自动降档 */
export function getBatchQualities(items) {
  if (!items?.length) return [...DEFAULT_QUALITIES]
  const union = new Set()
  for (const item of items) {
    for (const q of getItemQualities(item)) union.add(q)
  }
  if (union.size) return sortQualities([...union])
  return [...DEFAULT_QUALITIES]
}

/** 分析批量下载：区分支持目标音质与需另选音质的歌曲 */
export function prepareBatchDownload(entries, preferred) {
  const list = Array.isArray(entries) ? entries : []
  const matched = []
  const rows = []
  for (const entry of list) {
    const item = entry?.item ?? entry
    const key = entry?.key ?? trackSelectKey(item)
    const available = getItemQualities(item)
    if (preferred && available.includes(preferred)) {
      matched.push({ key, item, quality: preferred })
    } else {
      rows.push({
        key,
        item,
        available,
        selected: available.length
          ? resolveItemQuality(item, preferred)
          : (preferred || '128k'),
      })
    }
  }
  return {
    preferred,
    entries: list.map(e => ({ item: e?.item ?? e, key: e?.key ?? trackSelectKey(e?.item ?? e) })),
    matched,
    rows,
    needsConfirm: rows.length > 0,
  }
}

export function buildBatchDownloadTasks(entries, source, qualityMap) {
  const list = Array.isArray(entries) ? entries : []
  return list.map((entry) => {
    const item = entry?.item ?? entry
    const key = entry?.key ?? trackSelectKey(item)
    const quality = qualityMap?.[key] ?? '128k'
    return buildDownloadTask(item, source, quality)
  })
}

/** 为单曲解析实际音质：优先指定，否则顺延更低档，再否则取可用最高 */
export function resolveItemQuality(item, preferred) {
  const available = getItemQualities(item)
  if (!available.length) return preferred || '128k'
  if (preferred && available.includes(preferred)) return preferred
  if (preferred) {
    const start = QUALITY_ORDER.indexOf(preferred)
    if (start !== -1) {
      for (let i = start + 1; i < QUALITY_ORDER.length; i++) {
        if (available.includes(QUALITY_ORDER[i])) return QUALITY_ORDER[i]
      }
    }
  }
  return available[0]
}

export function trackSelectKey(item, index = 0) {
  return String(item?.id ?? item?.songmid ?? item?.hash ?? item?.songId ?? item?.copyrightId ?? `idx-${index}`)
}

/** 构建下载任务 payload */
export function buildDownloadTask(item, source, quality) {
  const q = resolveItemQuality(item, quality)
  const albumMid = pickField(item.albumMid, item.albummid, item.albumId)
  return {
    name: item.name,
    singer: item.singer,
    source: item.source || source,
    album: item.album || item.albumName || '',
    interval: item.interval || '',
    quality: q,
    songId: item.songId ?? item.songmid ?? item.hash ?? item.copyrightId ?? item.id,
    hash: item.hash || '',
    songmid: item.songmid || '',
    strMediaMid: item.strMediaMid || '',
    copyrightId: item.copyrightId || '',
    albumAudioId: item.albumAudioId || '',
    duration: item.duration || '',
    musicId: item.musicId || '',
    rid: item.rid || '',
    dcTargetId: item.dcTargetId || '',
    albumId: item.albumId || albumMid || '',
    albumMid: albumMid || '',
    albummid: albumMid || '',
    id: item.id,
    img: item.img || item.picUrl || item.meta?.picUrl || '',
    picUrl: item.picUrl || item.img || item.meta?.picUrl || '',
    types: item.types || [],
    qualitys: item.qualitys || item.types?.map(t => t.type) || item.meta?.qualitys || [],
  }
}

/** 构建播放/歌词请求所需的完整歌曲信息（对齐落雪 Scheme URL / musicInfo 结构） */
export function buildPlayPayload(item, source, quality = '128k', extra = {}) {
  const src = pickField(item.source, source)
  const cover = pickField(item.img, item.picUrl)
  const albumMid = pickField(item.albumMid, item.albummid, item.albumId)
  const songId = pickField(item.songId, item.songmid, item.hash, item.copyrightId, item.id)
  const songmid = pickField(item.songmid, item.songId, item.hash, item.copyrightId, item.id)
  const musicId = pickField(item.musicId, item.songId, item.songmid, item.hash, item.copyrightId, item.id)

  return {
    ...item,
    source: src,
    name: item.name,
    singer: item.singer,
    album: item.album || item.albumName || '',
    albumName: item.albumName || item.album || '',
    quality,
    songId,
    songmid,
    strMediaMid: pickField(item.strMediaMid),
    hash: pickField(item.hash),
    copyrightId: pickField(item.copyrightId),
    albumAudioId: item.albumAudioId || '',
    albumId: pickField(item.albumId, albumMid),
    albumMid,
    albummid: albumMid,
    musicId,
    rid: item.rid || '',
    dcTargetId: item.dcTargetId || '',
    duration: item.duration || '',
    interval: item.interval || '',
    img: cover,
    picUrl: cover,
    types: item.types || [],
    qualitys: item.qualitys || [],
    localPath: item.localPath || '',
    ...extra,
  }
}
