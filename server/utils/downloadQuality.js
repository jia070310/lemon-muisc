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
export function getNextLowerQuality(current, available) {
  const cur = String(current || '').trim()
  if (!cur) return ''

  const pool = Array.isArray(available) && available.length
    ? available.map(String)
    : QUALITY_LADDER

  const ordered = QUALITY_LADDER.filter(q => pool.includes(q) || q === cur)
  const idx = ordered.indexOf(cur)
  if (idx === -1) {
    // 未知音质：尝试直接落到 320k / 128k
    if (pool.includes('320k') && cur !== '320k') return '320k'
    if (pool.includes('128k') && cur !== '128k') return '128k'
    const ladderIdx = QUALITY_LADDER.indexOf(cur)
    if (ladderIdx >= 0 && ladderIdx < QUALITY_LADDER.length - 1) {
      return QUALITY_LADDER[ladderIdx + 1]
    }
    return ''
  }
  if (idx >= ordered.length - 1) return ''
  return ordered[idx + 1] || ''
}

export function isRetryableDownloadError(error) {
  const message = error?.message || String(error || '')
  const code = error?.code || ''
  const text = `${message} ${code}`
  if (/socket hang up|ECONNRESET|ETIMEDOUT|EPIPE|ECONNABORTED|ERR_SOCKET/i.test(text)) return true
  if (/timeout|timed out|请求超时|后端失败/i.test(text) && !/音源初始化超时/i.test(text)) return true
  if (/获取.*音质.*失败|获取播放链接失败|未获取到URL|获取URL失败/i.test(text)) return true
  return false
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
