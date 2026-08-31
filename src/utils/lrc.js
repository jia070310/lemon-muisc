/** 是否含 LRC 时间轴标记 */
export function hasLrcTimestamps(text) {
  return /\[\d{1,2}(?::\d{2}){1,2}(?:\.\d{1,3})?\]/.test(String(text || ''))
}

/** 解析 LRC，支持多时间标签行与 [hh:mm:ss.xx] */
export function parseLrc(lrc) {
  if (!lrc) return []
  const normalized = String(lrc).replace(/\uFEFF/g, '').replace(/\r/g, '')
  const lines = []
  const tagRe = /\[(\d{1,2}:)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g

  for (const rawLine of normalized.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    if (/^\[(?:ti|ar|al|by|offset|id|length|ve):/i.test(line)) continue

    const tags = []
    let match
    while ((match = tagRe.exec(line)) !== null) {
      tags.push(match)
    }
    if (!tags.length) continue

    const last = tags[tags.length - 1]
    const text = line.slice(last.index + last[0].length).trim()
    if (!text) continue

    for (const m of tags) {
      const hours = m[1] ? parseInt(m[1].replace(':', ''), 10) : 0
      const min = parseInt(m[2], 10)
      const sec = parseInt(m[3], 10)
      const msRaw = m[4] || ''
      const ms = msRaw ? parseInt(msRaw.padEnd(3, '0').slice(0, 3), 10) : 0
      const time = hours * 3600 + min * 60 + sec + ms / 1000
      lines.push({ time, text })
    }
  }

  lines.sort((a, b) => a.time - b.time)
  return lines
}

/** 无时间轴的纯文本歌词（如 MP3 USLT） */
export function parsePlainLyric(text) {
  return String(text).replace(/\uFEFF/g, '').replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^\[(?:ti|ar|al|by|offset|id|length|ve):/i.test(line))
    .map((line) => ({ time: 0, text: line }))
}

/** 自动识别 LRC 或纯文本歌词 */
export function parseLyric(text) {
  if (!text) return []
  const lrc = parseLrc(text)
  if (lrc.length) return lrc
  return parsePlainLyric(text)
}
