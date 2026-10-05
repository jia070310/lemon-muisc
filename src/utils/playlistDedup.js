import { cleanText } from './text.js'
import { isLocalPlaylistTrack } from './trackMatch.js'

/** 规范化歌名，用于判断「同曲」；忽略歌手差异 */
export function normalizeSongTitle(name) {
  return cleanText(String(name || ''))
    .toLowerCase()
    .replace(/[\s\-—–_·•~·\.\,\!\?\'\"\`\:\;\/\\\|（）()\[\]【】「」『』《》<>]/g, '')
    .replace(/^(?:歌曲|单曲)/, '')
}

export function isPlaylistTrackLocal(track) {
  return Boolean(track?.isLocal) || isLocalPlaylistTrack(track)
}

/**
 * 按歌名分组找出重复曲目（不同歌手也算一组）。
 * @returns {{ title: string, titleKey: string, items: { track: object, index: number }[] }[]}
 */
export function findPlaylistDuplicateGroups(tracks = []) {
  const byTitle = new Map()
  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index]
    const titleKey = normalizeSongTitle(track?.name)
    if (!titleKey || !track?.key) continue
    if (!byTitle.has(titleKey)) byTitle.set(titleKey, [])
    byTitle.get(titleKey).push({ track, index })
  }
  return [...byTitle.values()]
    .filter((items) => items.length > 1)
    .map((items) => ({
      title: items[0].track.name || '未知歌曲',
      titleKey: normalizeSongTitle(items[0].track.name),
      items,
    }))
}

/** keep-first | keep-last | prefer-local | prefer-online */
export function pickKeepKeyForGroup(group, policy = 'prefer-local') {
  const items = group?.items || []
  if (!items.length) return ''
  if (policy === 'keep-last') return items[items.length - 1].track.key
  if (policy === 'prefer-local') {
    const local = items.find((item) => isPlaylistTrackLocal(item.track))
    return (local || items[0]).track.key
  }
  if (policy === 'prefer-online') {
    const online = items.find((item) => !isPlaylistTrackLocal(item.track))
    return (online || items[0]).track.key
  }
  return items[0].track.key
}

export function buildKeepKeysFromPolicy(groups, policy = 'prefer-local') {
  const keep = new Map()
  for (const group of groups) {
    const key = pickKeepKeyForGroup(group, policy)
    if (key) keep.set(group.titleKey, key)
  }
  return keep
}

/** 计算应删除的 key；未出现在重复组中的曲目一律保留 */
export function collectKeysToRemove(tracks, groups, keepByTitleKey) {
  const remove = []
  for (const group of groups) {
    const keepKey = keepByTitleKey.get(group.titleKey)
    for (const { track } of group.items) {
      if (track.key && track.key !== keepKey) remove.push(track.key)
    }
  }
  return remove
}
