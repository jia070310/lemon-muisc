import { getTrackFilePath } from './trackPath.js'
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

/** 批量下载：取所选歌曲可用音质的并集 */
export function getBatchQualities(items) {
  if (!items?.length) return [...DEFAULT_QUALITIES]
  const union = new Set()
  for (const item of items) {
    for (const q of getItemQualities(item)) union.add(q)
  }
  if (union.size) return sortQualities([...union])
  return [...DEFAULT_QUALITIES]
}

function qualityRank(q) {
  const idx = QUALITY_ORDER.indexOf(String(q || ''))
  return idx === -1 ? 999 : idx
}

/** 列表是否声明了不低于 floor 的音质（未知列表视为可能可用） */
export function itemMeetsQualityFloor(item, preferred, floor) {
  const available = getItemQualities(item)
  if (!available.length) return true
  const floorRank = qualityRank(floor || preferred)
  return available.some((q) => qualityRank(q) <= floorRank)
}

/** 分析批量下载：统计未标明支持目标音质的歌曲 */
export function prepareBatchDownload(entries, preferred) {
  const list = Array.isArray(entries) ? entries : []
  const normalized = list.map((entry) => ({
    item: entry?.item ?? entry,
    key: entry?.key ?? trackSelectKey(entry?.item ?? entry),
  }))
  let unsupportedCount = 0
  for (const { item } of normalized) {
    const available = getItemQualities(item)
    if (available.length && preferred && !available.includes(preferred)) unsupportedCount += 1
  }
  return {
    preferred: preferred || '320k',
    entries: normalized,
    unsupportedCount,
  }
}

/**
 * 按策略生成批量下载任务
 * @returns {{ tasks: object[], skippedCount: number }}
 */
export function buildBatchDownloadTasks(entries, source, {
  preferredQuality = '320k',
  strategy = 'cascade',
  floorQuality = '',
} = {}) {
  const list = Array.isArray(entries) ? entries : []
  const preferred = preferredQuality || '320k'
  const policy = ['cascade', 'floor', 'none'].includes(strategy) ? strategy : 'cascade'
  const floor = policy === 'floor' ? (floorQuality || preferred) : ''

  const tasks = []
  let skippedCount = 0
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  for (const entry of list) {
    const item = entry?.item ?? entry
    if (policy === 'floor' && !itemMeetsQualityFloor(item, preferred, floor)) {
      skippedCount += 1
      continue
    }
    tasks.push(buildDownloadTask(item, source, preferred, {
      qualityPolicy: policy,
      qualityFloor: floor,
      preferredQuality: preferred,
      autoCascade: policy === 'cascade',
      deferExistAsk: true,
      batchId,
    }))
  }

  return { tasks, skippedCount }
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
export function buildDownloadTask(item, source, quality, extra = {}) {
  const preferred = quality || '320k'
  // 批量策略任务固定用目标音质入队，由服务端按策略再降档；单曲仍可按列表可用音质就近
  const q = extra.qualityPolicy ? preferred : resolveItemQuality(item, preferred)
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
    qualityPolicy: extra.qualityPolicy || '',
    qualityFloor: extra.qualityFloor || '',
    preferredQuality: extra.preferredQuality || preferred,
    autoCascade: Boolean(extra.autoCascade),
    deferExistAsk: Boolean(extra.deferExistAsk),
    batchId: extra.batchId || '',
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
    localPath: getTrackFilePath(item) || extra.localPath || '',
    key: item.key || '',
    ...extra,
  }
}
