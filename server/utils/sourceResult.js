/** 从音源脚本 musicUrl 返回值中解析可播放/下载链接 */
export function extractMusicUrl(data) {
  if (data == null || data === '') return ''

  if (typeof data === 'string') {
    const trimmed = data.trim()
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/api/play/')) return trimmed
    return ''
  }

  if (typeof data !== 'object') return ''

  const direct = [data.url, data.musicUrl, data.link, data.playUrl, data.src]
    .find((v) => typeof v === 'string' && v.trim())
  if (direct) return direct.trim()

  if (data.data != null) return extractMusicUrl(data.data)
  if (data.body != null) return extractMusicUrl(data.body)

  return ''
}

export function assertMusicUrl(data) {
  const url = extractMusicUrl(data)
  if (!url) throw new Error('未获取到URL')
  return url
}
