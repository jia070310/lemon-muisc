/**
 * 音乐库音质升级：扫描低于目标档的本地文件 → 在线匹配 → 循序下载覆盖。
 * 支持有损升无损，也支持 FLAC → Hi-Res / 母带 等更高无损档。
 */
import path from 'path'
import { getAllCachedTracks } from './libraryCache.js'
import { getMusicPathsForUser } from './filePaths.js'
import { inferQualityFromAudioMeta } from './downloadExist.js'
import { qualityLabel, qualityRank, QUALITY_LADDER } from './downloadQuality.js'
import { isLosslessQuality } from './audioFormat.js'
import {
  findCrossPlatformMatch,
  listOnlinePlatforms,
} from './crossPlatformMatch.js'
import { getMergedSources } from '../sourceManager.js'
import { getStoredActiveSourceIds } from './activeSources.js'

export const QUALITY_UPGRADE_PLAYLIST_ID = 'quality-upgrade'

/** 本地格式筛选组（含有损与无损） */
export const FORMAT_GROUPS = {
  all: {
    id: 'all',
    label: '全部可升级',
    exts: ['mp3', 'm4a', 'aac', 'mp4', 'ogg', 'opus', 'wma', 'flac', 'wav', 'aiff', 'ape', 'wv', 'dsf', 'dff'],
  },
  lossy: {
    id: 'lossy',
    label: '全部有损',
    exts: ['mp3', 'm4a', 'aac', 'mp4', 'ogg', 'opus', 'wma'],
  },
  mp3: {
    id: 'mp3',
    label: '仅 MP3',
    exts: ['mp3'],
  },
  aac: {
    id: 'aac',
    label: '仅 AAC / M4A',
    exts: ['m4a', 'aac', 'mp4'],
  },
  ogg: {
    id: 'ogg',
    label: '仅 OGG / Opus',
    exts: ['ogg', 'opus'],
  },
  wma: {
    id: 'wma',
    label: '仅 WMA',
    exts: ['wma'],
  },
  flac: {
    id: 'flac',
    label: '仅 FLAC',
    exts: ['flac'],
  },
  wav: {
    id: 'wav',
    label: '仅 WAV',
    exts: ['wav', 'aiff'],
  },
  ape: {
    id: 'ape',
    label: '仅 APE',
    exts: ['ape', 'wv'],
  },
}

/** @deprecated 兼容旧引用 */
export const LOSSY_FORMAT_GROUPS = FORMAT_GROUPS

/** 升级目标可选档 */
export const UPGRADE_TARGET_QUALITIES = [
  'flac',
  'flac24bit',
  'hires',
  'master',
]

const LOSSY_EXTS = new Set(FORMAT_GROUPS.lossy.exts)
const LOSSLESS_EXTS = new Set(['flac', 'wav', 'aiff', 'ape', 'dsf', 'dff', 'wv'])

function trackExt(track) {
  const fromFormat = String(track?.format || '')
    .toLowerCase()
    .replace(/^\./, '')
  if (fromFormat) return fromFormat
  return path.extname(String(track?.filePath || track?.fileName || ''))
    .toLowerCase()
    .replace(/^\./, '')
}

function resolveTitleArtist(track) {
  const title = String(
    track?.title || track?.parsedTitle || track?.name || '',
  ).trim()
  const artist = String(
    track?.artist || track?.parsedArtist || track?.singer || track?.albumArtist || '',
  ).trim()
  return { title, artist }
}

function quickLocalQuality(track) {
  const format = trackExt(track)
  const br = Number(track?.bitrate) || 0
  return inferQualityFromAudioMeta(
    {
      format,
      bitrate: br,
      sampleRate: track?.sampleRate,
      bitsPerSample: track?.bitsPerSample,
    },
    track?.filePath || '',
  )
}

/**
 * 本地音质档位：优先探测结果；无损扩展名但探测为空时，按扩展名给保守基线，
 * 以便 FLAC → Hi-Res / 母带 仍可被识别为可升级。
 */
function resolveLocalQuality(track) {
  const inferred = quickLocalQuality(track)
  if (inferred.quality) {
    return {
      quality: inferred.quality,
      label: inferred.label || qualityLabel(inferred.quality) || '',
      format: trackExt(track) || inferred.format || '',
    }
  }
  const ext = trackExt(track)
  if (ext === 'flac') return { quality: 'flac', label: 'FLAC', format: ext }
  if (ext === 'wav' || ext === 'aiff') return { quality: 'hires', label: ext.toUpperCase(), format: ext }
  if (ext === 'ape' || ext === 'wv') return { quality: 'flac', label: ext.toUpperCase(), format: ext }
  if (ext === 'dsf' || ext === 'dff') return { quality: 'hires', label: 'DSD', format: ext }
  if (LOSSY_EXTS.has(ext)) {
    return { quality: '320k', label: ext.toUpperCase(), format: ext }
  }
  return { quality: '', label: ext ? ext.toUpperCase() : '未知', format: ext }
}

function normalizeFormatFilter(raw) {
  const id = String(raw || 'all').trim().toLowerCase() || 'all'
  if (FORMAT_GROUPS[id]) return id
  // 动态扩展名芯片：mp3 / flac / ...
  if (/^[a-z0-9]{1,8}$/.test(id)) return id
  return 'all'
}

function formatMatchesFilter(ext, formatFilter) {
  const id = normalizeFormatFilter(formatFilter)
  const group = FORMAT_GROUPS[id]
  if (group) {
    if (id === 'all') return true
    return group.exts.includes(ext)
  }
  return String(ext || '').toLowerCase() === id
}

/** 本地是否已达目标音质（或不需要升级） */
export function isAlreadyAtOrAbove(localQuality, preferred = 'flac') {
  const want = String(preferred || 'flac').trim() || 'flac'
  const local = String(localQuality || '').trim()
  if (!local) return false
  return qualityRank(local) <= qualityRank(want)
}

/** 是否低于目标档，可作为升级候选（含有损与较低无损） */
export function canUpgradeToPreferred(track, preferred = 'flac') {
  const want = String(preferred || 'flac').trim() || 'flac'
  const ext = trackExt(track)
  if (!ext && !track?.filePath) return false
  const local = resolveLocalQuality(track)
  if (!local.quality) {
    if (LOSSY_EXTS.has(ext)) return true
    if (LOSSLESS_EXTS.has(ext)) return qualityRank(want) < qualityRank('flac')
    return false
  }
  return qualityRank(want) < qualityRank(local.quality)
}

/** @deprecated 使用 canUpgradeToPreferred */
export function isLossyCandidate(track, preferred = 'flac') {
  return canUpgradeToPreferred(track, preferred)
}

function pickOnlineQualities(item) {
  const fromTypes = Array.isArray(item?.types)
    ? item.types.map((t) => (typeof t === 'string' ? t : t?.type)).filter(Boolean)
    : []
  const fromList = Array.isArray(item?.qualitys) ? item.qualitys.filter(Boolean) : []
  const raw = fromTypes.length ? fromTypes : fromList
  const set = new Set(raw.map(String))
  return QUALITY_LADDER.filter((q) => set.has(q))
}

function pickTargetQuality(item, preferred, { exact = true } = {}) {
  const want = String(preferred || 'flac').trim() || 'flac'
  const available = pickOnlineQualities(item)
  if (available.includes(want)) return want
  if (!available.length) return want
  if (exact) return ''
  const betterOrEqual = available.filter((q) => qualityRank(q) <= qualityRank(want))
  if (betterOrEqual.length) return betterOrEqual[0]
  if (isLosslessQuality(want)) return want
  return available[0] || want
}

/** 当前激活音源对各目标音质的声明支持情况（仅作提示，非硬限制） */
export function getUpgradeTargetSourceSupport(userId) {
  const allowed = getStoredActiveSourceIds(userId)
  const merged = getMergedSources(allowed)
  const byQuality = {}
  for (const q of UPGRADE_TARGET_QUALITIES) {
    byQuality[q] = {
      quality: q,
      label: qualityLabel(q) || q,
      available: false,
      platforms: [],
      sourceCount: 0,
      hint: '',
    }
  }

  const platformHits = new Map()
  for (const [plat, info] of Object.entries(merged || {})) {
    const qs = Array.isArray(info?.qualitys) ? info.qualitys : []
    const name = info?.name || plat
    for (const q of qs) {
      if (!byQuality[q]) continue
      if (!platformHits.has(q)) platformHits.set(q, new Set())
      platformHits.get(q).add(name)
    }
  }

  for (const q of UPGRADE_TARGET_QUALITIES) {
    const plats = [...(platformHits.get(q) || [])]
    byQuality[q].available = plats.length > 0
    byQuality[q].platforms = plats
    byQuality[q].sourceCount = plats.length
    byQuality[q].hint = plats.length
      ? `已激活音源声明支持：${plats.join('、')}`
      : '当前激活音源未声明此音质（仍可尝试，以实际匹配为准）'
  }

  return {
    targets: UPGRADE_TARGET_QUALITIES.map((q) => byQuality[q]),
    formatGroups: Object.values(FORMAT_GROUPS).map((g) => ({
      id: g.id,
      label: g.label,
      exts: g.exts,
    })),
  }
}

/**
 * 扫描音乐库：格式芯片按「库内实际存在的格式」展示；
 * 候选列表再按目标音质过滤「还能往上升」的曲目。
 */
export function scanLossyLibraryTracks(userId, {
  preferredQuality = 'flac',
  formatFilter = 'all',
  limit = 2000,
} = {}) {
  const dirs = getMusicPathsForUser(userId)
  const tracks = getAllCachedTracks(dirs) || []
  const preferred = String(preferredQuality || 'flac').trim() || 'flac'
  const filterId = normalizeFormatFilter(formatFilter)
  const max = Math.min(Math.max(1, Number(limit) || 2000), 5000)

  /** 库内全部格式统计（不论目标） */
  const libraryFormatCounts = {}
  const allByFormat = []
  const upgradable = []
  let alreadyOkCount = 0
  let skippedNoTitle = 0

  for (const t of tracks) {
    const ext = trackExt(t) || 'other'
    const local = resolveLocalQuality(t)
    const { title, artist } = resolveTitleArtist(t)
    libraryFormatCounts[ext] = (libraryFormatCounts[ext] || 0) + 1

    if (!title) {
      skippedNoTitle += 1
      continue
    }

    const entry = {
      filePath: t.filePath,
      fileName: t.fileName || path.basename(t.filePath || ''),
      title,
      artist,
      album: String(t.album || '').trim(),
      format: ext,
      localQuality: local.quality || '',
      localLabel: local.label || (ext ? ext.toUpperCase() : '未知'),
      size: Number(t.size) || 0,
      isLossless: LOSSLESS_EXTS.has(ext),
    }
    allByFormat.push(entry)

    if (!canUpgradeToPreferred(t, preferred)) {
      if (local.quality && isAlreadyAtOrAbove(local.quality, preferred)) {
        alreadyOkCount += 1
      }
      continue
    }
    upgradable.push(entry)
  }

  const filtered = upgradable.filter((c) => formatMatchesFilter(c.format, filterId))
  const candidates = filtered.slice(0, max)

  // 芯片数量 = 库内该格式总数（每种扩展名只计一次，避免翻倍）
  const libraryGroupCounts = {
    all: tracks.length,
    lossy: 0,
  }
  for (const [ext, count] of Object.entries(libraryFormatCounts)) {
    const n = Number(count) || 0
    libraryGroupCounts[ext] = n
    if (LOSSY_EXTS.has(ext)) libraryGroupCounts.lossy += n
  }
  // 多扩展名旧分组（如 aac=m4a+aac）按并集汇总，不覆盖单扩展名字段
  for (const [id, group] of Object.entries(FORMAT_GROUPS)) {
    if (id === 'all' || id === 'lossy') continue
    if (group.exts.length === 1 && group.exts[0] === id) continue
    libraryGroupCounts[id] = group.exts.reduce((sum, e) => sum + (libraryFormatCounts[e] || 0), 0)
  }

  // 相对当前目标，各格式还可升级多少（提示用）
  const upgradeGroupCounts = { all: upgradable.length, lossy: 0 }
  for (const c of upgradable) {
    upgradeGroupCounts[c.format] = (upgradeGroupCounts[c.format] || 0) + 1
    if (LOSSY_EXTS.has(c.format)) upgradeGroupCounts.lossy += 1
  }
  for (const [id, group] of Object.entries(FORMAT_GROUPS)) {
    if (id === 'all' || id === 'lossy') continue
    if (group.exts.length === 1 && group.exts[0] === id) continue
    upgradeGroupCounts[id] = group.exts.reduce((sum, e) => sum + (upgradeGroupCounts[e] || 0), 0)
  }

  // 动态格式列表：全部 + 全部有损（若有）+ 库里出现的每种扩展名
  const formatGroups = [
    { id: 'all', label: '全部格式', exts: Object.keys(libraryFormatCounts) },
  ]
  if (libraryGroupCounts.lossy > 0) {
    formatGroups.push({
      id: 'lossy',
      label: '全部有损',
      exts: [...LOSSY_EXTS],
    })
  }
  const sortedExts = Object.keys(libraryFormatCounts).sort((a, b) => {
    const ca = libraryFormatCounts[b] - libraryFormatCounts[a]
    if (ca !== 0) return ca
    return a.localeCompare(b)
  })
  for (const ext of sortedExts) {
    if (!ext || ext === 'other') continue
    formatGroups.push({
      id: ext,
      label: ext.toUpperCase(),
      exts: [ext],
    })
  }
  if (libraryFormatCounts.other) {
    formatGroups.push({ id: 'other', label: '其它', exts: ['other'] })
  }

  const support = getUpgradeTargetSourceSupport(userId)
  const filteredLibrary = allByFormat.filter((c) => formatMatchesFilter(c.format, filterId))

  return {
    preferredQuality: preferred,
    formatFilter: filterId,
    totalTracked: tracks.length,
    losslessCount: alreadyOkCount,
    alreadyOkCount,
    skippedNoTitle,
    truncated: filtered.length > max,
    candidateCount: candidates.length,
    filteredLibraryCount: filteredLibrary.length,
    allLossyCount: libraryGroupCounts.lossy || 0,
    allUpgradableCount: upgradable.length,
    formatCounts: libraryFormatCounts,
    libraryFormatCounts,
    /** 芯片显示用：库内格式数量 */
    groupCounts: libraryGroupCounts,
    libraryGroupCounts,
    /** 相对当前目标可升级数量 */
    upgradeGroupCounts,
    candidates,
    targetSupport: support.targets,
    formatGroups,
  }
}

async function mapPool(items, concurrency, fn) {
  const list = Array.isArray(items) ? items : []
  const results = new Array(list.length)
  let cursor = 0
  const workers = Math.max(1, Math.min(concurrency, list.length || 1))
  await Promise.all(Array.from({ length: workers }, async () => {
    while (true) {
      const idx = cursor++
      if (idx >= list.length) break
      results[idx] = await fn(list[idx], idx)
    }
  }))
  return results
}

/**
 * 将本地曲目匹配到在线可下载的目标（或更高）音质。
 */
export async function matchQualityUpgradeTracks({
  tracks = [],
  preferredQuality = 'flac',
  userId = null,
  concurrency = 2,
  exactQuality = true,
} = {}) {
  const preferred = String(preferredQuality || 'flac').trim() || 'flac'
  const platforms = listOnlinePlatforms(userId)
  if (!platforms.length) {
    const err = new Error('当前没有可用音源平台，请先在设置中激活音源')
    err.code = 'NO_ACTIVE_SOURCE'
    throw err
  }

  const matched = []
  const unmatched = []
  const wantLabel = qualityLabel(preferred) || preferred

  await mapPool(tracks, concurrency, async (raw) => {
    const filePath = String(raw?.filePath || '').trim()
    const title = String(raw?.title || raw?.name || '').trim()
    const artist = String(raw?.artist || raw?.singer || '').trim()
    const localQuality = String(raw?.localQuality || '').trim()
    const localLabel = String(raw?.localLabel || '').trim()

    if (!filePath || !title) {
      unmatched.push({
        filePath,
        title,
        artist,
        reason: '缺少歌名或路径',
      })
      return
    }

    let bestItem = null
    let bestTarget = ''
    let sawMatchButNoQuality = false

    for (const plat of platforms) {
      try {
        const item = await findCrossPlatformMatch({
          name: title,
          singer: artist,
          artist,
          platform: plat,
        })
        if (!item) continue
        const target = pickTargetQuality(item, preferred, { exact: exactQuality })
        if (!target) {
          sawMatchButNoQuality = true
          continue
        }
        const better = localQuality
          ? qualityRank(target) < qualityRank(localQuality)
          : isLosslessQuality(target)
        if (!better) {
          sawMatchButNoQuality = true
          continue
        }
        bestItem = item
        bestTarget = target
        break
      } catch {
        // try next platform
      }
    }

    if (!bestItem || !bestTarget) {
      unmatched.push({
        filePath,
        title,
        artist,
        localQuality,
        localLabel,
        reason: sawMatchButNoQuality
          ? `已找到同名曲，但未提供优于本地的目标音质 ${wantLabel}`
          : `未匹配到可升级为 ${wantLabel} 的在线资源`,
      })
      return
    }

    const declared = pickOnlineQualities(bestItem)
    matched.push({
      filePath,
      title,
      artist,
      localQuality,
      localLabel,
      targetQuality: bestTarget,
      targetLabel: qualityLabel(bestTarget) || bestTarget,
      source: bestItem.source || '',
      onlineQualities: declared,
      qualityDeclared: declared.includes(bestTarget),
      onlineItem: bestItem,
    })
  })

  return { preferredQuality: preferred, matched, unmatched }
}

/** 生成可交给 download enqueue / playlist job 的任务对象 */
export function buildUpgradeDownloadTasks(matchedRows, {
  preferredQuality = 'flac',
  strategy = 'none',
  floorQuality = '',
} = {}) {
  const preferred = String(preferredQuality || 'flac').trim() || 'flac'
  const policy = strategy === 'cascade' || strategy === 'floor' ? 'cascade' : 'none'
  const tasks = []

  for (const row of matchedRows || []) {
    const item = row.onlineItem || {}
    const target = String(row.targetQuality || preferred).trim() || preferred
    const source = item.source || row.source || ''
    const songId = item.songId ?? item.songmid ?? item.hash ?? item.copyrightId ?? item.id
    tasks.push({
      name: item.name || row.title,
      singer: item.singer || row.artist || '',
      source,
      album: item.album || item.albumName || '',
      albumArtist: item.albumArtist || item.singer || row.artist || '',
      interval: item.interval || '',
      quality: target,
      songId,
      hash: item.hash || '',
      songmid: item.songmid || '',
      strMediaMid: item.strMediaMid || '',
      copyrightId: item.copyrightId || '',
      albumAudioId: item.albumAudioId || '',
      duration: item.duration || '',
      musicId: item.musicId || '',
      rid: item.rid || '',
      dcTargetId: item.dcTargetId || '',
      albumId: item.albumId || item.albumMid || item.albummid || '',
      albumMid: item.albumMid || item.albummid || item.albumId || '',
      albummid: item.albummid || item.albumMid || item.albumId || '',
      id: item.id,
      img: item.img || item.picUrl || '',
      picUrl: item.picUrl || item.img || '',
      types: item.types || [],
      qualitys: item.qualitys || item.types?.map((t) => t.type) || [],
      preferredQuality: preferred,
      qualityPolicy: policy,
      qualityFloor: strategy === 'floor' ? (floorQuality || '') : '',
      autoCascade: policy === 'cascade',
      replacePath: row.filePath,
      forceOverwrite: true,
      listName: '音质升级',
    })
  }
  return tasks
}
