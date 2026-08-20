/** 解码 HTML 实体并去除标签，用于歌曲名/歌手名等展示 */
export function cleanText(str) {
  if (!str || typeof str !== 'string') return str || ''
  let s = str.replace(/<[^>]+>/g, '')
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

export function cleanTrackItem(item) {
  if (!item) return item
  return {
    ...item,
    name: cleanText(item.name),
    singer: cleanText(item.singer),
    album: cleanText(item.album || item.albumName),
    albumName: cleanText(item.albumName),
  }
}
