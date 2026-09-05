/** 音质从高到低 */
export const QUALITY_LADDER = [
  'master',
  'atmos_plus',
  'atmos',
  'hires',
  'flac24bit',
  'flac',
  '320k',
  '128k',
]

export const QUALITY_LABELS = {
  '128k': '128K',
  '320k': '320K',
  flac: 'FLAC',
  flac24bit: 'FLAC 24bit',
  hires: 'Hi-Res',
  atmos: '杜比全景声',
  atmos_plus: '杜比全景声 Plus',
  master: '超清母带',
}

export function qualityLabel(q) {
  return QUALITY_LABELS[q] || q || ''
}

/**
 * 在可用音质中找比当前更低的一档；无列表时按标准阶梯降一级。
 * @param {string} current
 * @param {string[]} [available]
 */
export function qualityRank(q) {
  const idx = QUALITY_LADDER.indexOf(String(q || '').trim())
  return idx === -1 ? 999 : idx
}

/** 是否允许使用该音质（不低于最低档；index 越小音质越高） */
export function isQualityWithinFloor(quality, floor) {
  if (!floor) return true
  return qualityRank(quality) <= qualityRank(floor)
}

export function getNextLowerQuality(current, available, floor = '') {
  const cur = String(current || '').trim()
  if (!cur) return ''

  const pool = Array.isArray(available) && available.length
    ? available.map(String)
    : QUALITY_LADDER

  const ordered = QUALITY_LADDER.filter(q => pool.includes(q) || q === cur)
  const idx = ordered.indexOf(cur)
  let next = ''
  if (idx === -1) {
    // 未知音质：尝试直接落到 320k / 128k
    if (pool.includes('320k') && cur !== '320k') next = '320k'
    else if (pool.includes('128k') && cur !== '128k') next = '128k'
    else {
      const ladderIdx = QUALITY_LADDER.indexOf(cur)
      if (ladderIdx >= 0 && ladderIdx < QUALITY_LADDER.length - 1) {
        next = QUALITY_LADDER[ladderIdx + 1]
      }
    }
  } else if (idx < ordered.length - 1) {
    next = ordered[idx + 1] || ''
  }

  if (!next) return ''
  if (floor && !isQualityWithinFloor(next, floor)) return ''
  return next
}

export function formatMissingQualityError(preferred, floor = '', reason = '') {
  const want = qualityLabel(preferred) || preferred || '目标'
  const floorText = floor ? qualityLabel(floor) || floor : ''
  const detail = reason ? `（${String(reason).slice(0, 160)}）` : ''
  if (floorText && floorText !== want) {
    return `无要求的音质：无法获取 ${want}，且不低于 ${floorText} 的音质也不可用${detail}`
  }
  return `无要求的音质：无法获取 ${want}${detail}`
}

export function isRetryableDownloadError(error) {
  const message = error?.message || String(error || '')
  const code = error?.code || ''
  const text = `${message} ${code}`
  if (isNoActiveSourceError(error)) return false
  // 试听片段：换其他激活音源再试同一音质
  if (code === 'PREVIEW_CLIP' || /仅提供约.*试听片段|时长不完整/i.test(message)) return true
  if (/socket hang up|ECONNRESET|ETIMEDOUT|EPIPE|ECONNABORTED|ERR_SOCKET/i.test(text)) return true
  if (/timeout|timed out|请求超时|后端失败/i.test(text) && !/音源初始化超时/i.test(text)) return true
  if (/获取.*音质.*失败|获取播放链接失败|未获取到URL|获取URL失败/i.test(text)) return true
  return false
}

export function isNoActiveSourceError(error) {
  const text = `${error?.message || ''} ${error?.code || ''} ${error || ''}`
  return /没有激活的音源|没有可用的音源|NO_ACTIVE_SOURCE/i.test(text)
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
