import { getItemQualities } from './musicPayload.js'

/** 解码 HTML 实体、Unicode 转义并去除标签，用于歌曲名/歌手名等展示 */
export function cleanText(str) {
  if (!str || typeof str !== 'string') return str || ''
  let s = str.replace(/<[^>]+>/g, '')
  // JSON / 脚本里常见的 \\u0026、\u0026
  s = s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  s = s.replace(/&nbsp;/gi, ' ')
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  s = s.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
  return s.replace(/\s+/g, ' ').trim()
}

/** 多歌手展示：统一为「A / B」，便于读写标签与播放器识别 */
export function formatArtists(str) {
  let s = cleanText(str)
  if (!s) return ''
  s = s.replace(/\\&/g, '&')
  // ID3v2.4 NUL 多值
  if (s.includes('\0')) {
    return s.split('\0').map((p) => p.trim()).filter(Boolean).join(' / ')
  }
  const parts = s.split(/(?:\s*\/\s*|\s*[;|]\s*|\s*[&＆]\s*|、|，|,)+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (!parts.length) return s
  // 去重（忽略大小写）
  const seen = new Set()
  const uniq = []
  for (const p of parts) {
    const key = p.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    uniq.push(p)
  }
  return uniq.join(' / ')
}

/** 编辑框保存前：拆成歌手列表 */
export function splitArtists(str) {
  const display = formatArtists(str)
  if (!display) return []
  return display.split(' / ').map((p) => p.trim()).filter(Boolean)
}

export function cleanTrackItem(item) {
  if (!item) return item
  const qualities = getItemQualities(item)
  return {
    ...item,
    name: cleanText(item.name),
    singer: formatArtists(item.singer),
    album: cleanText(item.album || item.albumName),
    albumName: cleanText(item.albumName),
    ...(qualities.length ? { _qualities: qualities } : {}),
  }
}
