import path from 'path'
import { searchAlbums, fetchAlbum, AVAILABLE_SOURCES } from '../musicSdk.js'
import { getDisplaySources } from './displaySources.js'
import { probeLocalFileQuality } from './downloadExist.js'
import { qualityLabel, qualityRank, QUALITY_LADDER } from './downloadQuality.js'

/** 标题规范化：去括号/feat/空白，便于本地与在线匹配 */
export function normalizeTrackTitle(raw) {
  let s = String(raw || '')
  s = s.replace(/[\u3000\s]+/g, ' ').trim().toLowerCase()
  // 全角转半角数字字母常见符
  s = s.replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  s = s.replace(/（/g, '(').replace(/）/g, ')').replace(/【/g, '[').replace(/】/g, ']')
  // 去掉括号内容、feat 段
  s = s.replace(/\([^)]*\)/g, ' ')
  s = s.replace(/\[[^\]]*\]/g, ' ')
  s = s.replace(/\s*[-–—]\s*(feat\.?|ft\.?|featuring)\b.*$/i, ' ')
  s = s.replace(/\b(feat\.?|ft\.?|featuring)\b.*$/i, ' ')
  s = s.replace(/[^\w\u4e00-\u9fff]+/g, '')
  return s.trim()
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

function bestAvailableQuality(item, preferred) {
  const available = pickOnlineQualities(item)
  const want = String(preferred || 'flac').trim() || 'flac'
  if (available.length) {
    if (available.includes(want)) return want
    // 就近取列表里不低于本地可比的最高档
    const ordered = QUALITY_LADDER.filter((q) => available.includes(q))
    return ordered[0] || want
  }
  return want
}

/**
 * 在用户可用平台上搜索在线专辑候选
 */
export async function searchOnlineAlbumsForSync({ artist, album, userId, limitPerSource = 8 } = {}) {
  const artistName = String(artist || '').trim()
  const albumName = String(album || '').trim()
  if (!albumName && !artistName) throw new Error('缺少专辑或歌手名')

  const keyword = [artistName, albumName].filter(Boolean).join(' ').trim()
  const platforms = Object.keys(getDisplaySources(userId) || {}).filter((k) => AVAILABLE_SOURCES[k])
  if (!platforms.length) throw new Error('当前没有可用音源平台，请先在设置中激活音源')

  const candidates = []
  const errors = []
  await Promise.all(platforms.map(async (source) => {
    try {
      const res = await searchAlbums(keyword, source, 1, limitPerSource)
      const list = Array.isArray(res?.list) ? res.list : []
      for (const item of list.slice(0, limitPerSource)) {
        candidates.push({
          id: String(item.id),
          name: item.name || '',
          artist: item.artist || '',
          img: item.img || '',
          publishTime: item.publishTime || '',
          count: Number(item.count) || 0,
          source,
          sourceLabel: AVAILABLE_SOURCES[source]?.name || source,
        })
      }
    } catch (e) {
      errors.push({ source, error: e?.message || String(e) })
    }
  }))

  // 优先：专辑名更接近、歌手命中
  const albumKey = normalizeTrackTitle(albumName)
  const artistKey = normalizeTrackTitle(artistName)
  candidates.sort((a, b) => {
    const aAlbum = normalizeTrackTitle(a.name) === albumKey ? 0 : 1
    const bAlbum = normalizeTrackTitle(b.name) === albumKey ? 0 : 1
    if (aAlbum !== bAlbum) return aAlbum - bAlbum
    const aArt = artistKey && normalizeTrackTitle(a.artist).includes(artistKey) ? 0 : 1
    const bArt = artistKey && normalizeTrackTitle(b.artist).includes(artistKey) ? 0 : 1
    if (aArt !== bArt) return aArt - bArt
    return (b.count || 0) - (a.count || 0)
  })

  return { keyword, candidates, errors, platforms }
}

/**
 * 对比本地轨与在线专辑：缺曲 + 可升级
 */
export async function diffAlbumSync({
  source,
  onlineAlbumId,
  localTracks = [],
  preferredQuality = 'flac',
} = {}) {
  const src = String(source || '').trim()
  const id = String(onlineAlbumId || '').trim()
  if (!src || !id) throw new Error('请选择在线专辑')

  const albumData = await fetchAlbum(src, id)
  const albumArtist = String(albumData?.info?.author || '').trim()
  const albumName = String(albumData?.info?.name || '').trim()
  const onlineList = (Array.isArray(albumData?.list) ? albumData.list : []).map((item) => {
    const next = { ...item }
    if (!String(next.singer || '').trim() && albumArtist) next.singer = albumArtist
    if (!String(next.album || next.albumName || '').trim() && albumName) {
      next.album = albumName
      next.albumName = albumName
    }
    return next
  })
  const preferred = String(preferredQuality || 'flac').trim() || 'flac'

  // 本地：同标题可能多文件，取品质最好的代表
  const localByTitle = new Map()
  for (const t of Array.isArray(localTracks) ? localTracks : []) {
    const name = String(t.name || t.title || '').trim()
    const filePath = String(t.filePath || t.localPath || '').trim()
    if (!name) continue
    const key = normalizeTrackTitle(name)
    if (!key) continue
    let probed = null
    if (filePath) {
      try {
        probed = await probeLocalFileQuality(filePath)
      } catch {
        probed = null
      }
    }
    const entry = {
      name,
      singer: String(t.singer || t.artist || '').trim(),
      filePath,
      format: probed?.format || t.format || (filePath ? path.extname(filePath).slice(1) : ''),
      localQuality: probed?.quality || '',
      localLabel: probed?.label || '',
      size: probed?.size || 0,
    }
    const prev = localByTitle.get(key)
    if (!prev) {
      localByTitle.set(key, entry)
    } else {
      const better = qualityRank(entry.localQuality) < qualityRank(prev.localQuality)
        || (qualityRank(entry.localQuality) === qualityRank(prev.localQuality) && entry.size > prev.size)
      if (better) localByTitle.set(key, entry)
    }
  }

  const missing = []
  const upgradable = []
  const matched = []

  for (let i = 0; i < onlineList.length; i++) {
    const online = onlineList[i]
    const onlineName = String(online?.name || '').trim()
    if (!onlineName) continue
    const key = normalizeTrackTitle(onlineName)
    const local = key ? localByTitle.get(key) : null
    const targetQuality = bestAvailableQuality(online, preferred)
    const onlineQualities = pickOnlineQualities(online)
    const payload = {
      index: i,
      onlineKey: key,
      onlineName,
      onlineSinger: String(online?.singer || albumArtist || '').trim(),
      onlineItem: online,
      targetQuality,
      targetLabel: qualityLabel(targetQuality) || targetQuality,
      onlineQualities,
    }

    if (!local) {
      missing.push(payload)
      continue
    }

    matched.push({ ...payload, local })
    const localQ = local.localQuality
    // 目标音质明显优于本地 → 可升级；本地未知品质且目标为无损也建议升级
    const canUpgrade = localQ
      ? qualityRank(targetQuality) < qualityRank(localQ)
      : qualityRank(targetQuality) <= qualityRank('flac')
    if (canUpgrade) {
      upgradable.push({
        ...payload,
        localName: local.name,
        localSinger: local.singer,
        filePath: local.filePath,
        localQuality: localQ,
        localLabel: local.localLabel || qualityLabel(localQ) || '未知音质',
        format: local.format,
      })
    }
  }

  return {
    onlineAlbum: {
      id,
      source: src,
      sourceLabel: AVAILABLE_SOURCES[src]?.name || src,
      name: albumData?.info?.name || '',
      artist: albumData?.info?.author || '',
      img: albumData?.info?.img || '',
      trackCount: onlineList.length,
    },
    preferredQuality: preferred,
    missing,
    upgradable,
    matchedCount: matched.length,
    onlineCount: onlineList.length,
    localCount: localByTitle.size,
  }
}
