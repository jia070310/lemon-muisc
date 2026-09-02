/** 统一读取本地音频文件路径 */
export function getTrackFilePath(item) {
  if (!item) return ''
  const direct = item.localPath || item.filePath || ''
  if (direct) return String(direct)
  const key = item.key || ''
  if (String(key).startsWith('local:')) return String(key).slice(6)
  return ''
}

/** 路径规范化，用于跨来源比较（Windows 斜杠/大小写） */
export function normalizeTrackPath(filePath) {
  if (!filePath) return ''
  return String(filePath).replace(/\\/g, '/').toLowerCase()
}

export function isSameTrackPath(a, b) {
  if (!a || !b) return false
  return normalizeTrackPath(a) === normalizeTrackPath(b)
}

export function isLocalTrack(item, source = '') {
  if (getTrackFilePath(item)) return true
  if (source === 'local' || item?.source === 'local') return true
  return false
}
