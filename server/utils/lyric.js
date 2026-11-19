const timeFieldExp = /^(?:\[[\d:.]+\])+/g
const timeExp = /\d{1,3}(:\d{1,3}){0,2}(?:\.\d{1,3})/g

export function hasLrcTimestamps(text) {
  return /\[\d{1,2}(?::\d{2}){1,2}(?:\.\d{1,3})?\]/.test(String(text || ''))
}

export function normalizeLyricText(text) {
  if (!text) return ''
  return String(text)
    .replace(/\uFEFF/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\\n/g, '\n')
    .trim()
}

/** 优先保留带时间轴的 LRC 文本 */
export function pickBestLyricText(primary, fallback) {
  const a = normalizeLyricText(primary)
  const b = normalizeLyricText(fallback)
  if (!a) return b
  if (!b) return a
  const aHas = hasLrcTimestamps(a)
  const bHas = hasLrcTimestamps(b)
  if (bHas && !aHas) return b
  if (aHas && !bHas) return a
  return b.length > a.length ? b : a
}

function formatTimeLabel(label) {
  return label
    .replace(/^0+(\d+)/, '$1')
    .replace(/:0+(\d+)/g, ':$1')
    .replace(/\.0+(\d+)/, '.$1')
}

function parseLrcTimeLabel(lrc) {
  const linesSet = new Set()
  for (const line of lrc.split(/\r\n|\n|\r/)) {
    const result = timeFieldExp.exec(line.trim())
    if (!result) continue
    const text = line.trim().replace(timeFieldExp, '').trim()
    if (!text) continue
    const times = result[0].match(timeExp)
    if (!times) continue
    for (const time of times) linesSet.add(formatTimeLabel(time))
  }
  return linesSet
}

function filterExtendedLyricLabel(lrcTimeLabels, extendedLyric) {
  const lines = []
  for (const line of extendedLyric.split(/\r\n|\n|\r/)) {
    const trimmed = line.trim()
    const result = timeFieldExp.exec(trimmed)
    if (!result) continue
    const timeField = result[0]
    const text = trimmed.replace(timeFieldExp, '').trim()
    if (!text) continue
    const times = timeField.match(timeExp)
    if (!times) continue
    const newTimes = times.filter(time => lrcTimeLabels.has(formatTimeLabel(time)))
    if (!newTimes.length) continue
    lines.push(`[${newTimes.join('][')}]${text}`)
  }
  return lines.join('\n')
}

/** 下载内嵌 / 落盘歌词样式：line=逐行（默认） word=逐词 */
export function preferDownloadWordLyric(settings = {}) {
  return String(settings['download.lyricStyle'] || 'line').toLowerCase() === 'word'
}

function pad2(n) {
  return String(Math.max(0, Math.floor(Number(n) || 0))).padStart(2, '0')
}

/** 秒 → mm:ss.xx（增强 LRC 时间戳） */
function formatEnhancedStamp(sec) {
  const s = Math.max(0, Number(sec) || 0)
  const m = Math.floor(s / 60)
  const rem = s - m * 60
  const whole = Math.floor(rem)
  const frac = Math.round((rem - whole) * 100)
  return `${pad2(m)}:${pad2(whole)}.${pad2(Math.min(99, frac))}`
}

/**
 * 网易 YRC / 酷狗逐字 → 增强 LRC：
 * [00:12.00]<00:12.00>你<00:12.35>好
 * 便于内嵌与同名 .lrc；播放器端 parseLyricRich 可识别。
 */
export function ylyricToEnhancedLrc(ylyric) {
  const text = normalizeLyricText(ylyric)
  if (!text) return ''
  // 已是增强 LRC 则原样返回
  if (/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]\s*<\d/.test(text)) return text

  const out = []
  const lineHead = /^\[(\d+)\s*,\s*(\d+)\](.*)$/
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (/^\[(?:ti|ar|al|by|offset|id|length|ve):/i.test(line)) continue
    const head = line.match(lineHead)
    if (!head) continue
    const lineStartMs = Number(head[1]) || 0
    const rest = head[3] || ''
    const rawWords = []
    const wordRe = /\((\d+)\s*,\s*(\d+)(?:\s*,\s*-?\d+)?\)([^(]*)/g
    let wm
    while ((wm = wordRe.exec(rest)) !== null) {
      const stampMs = Number(wm[1]) || 0
      const textPart = wm[3] ?? ''
      if (!textPart && !rawWords.length) continue
      rawWords.push({ stampMs, text: textPart })
    }
    if (!rawWords.length) continue
    const firstStamp = rawWords[0].stampMs
    const absolute = firstStamp > 200 && firstStamp >= lineStartMs - 80
    const lineSec = lineStartMs / 1000
    const parts = [`[${formatEnhancedStamp(lineSec)}]`]
    for (const w of rawWords) {
      const t = (absolute ? w.stampMs : lineStartMs + w.stampMs) / 1000
      parts.push(`<${formatEnhancedStamp(t)}>${w.text}`)
    }
    const joined = parts.join('')
    if (!joined.replace(/\[[^\]]+\]|<[^>]+>/g, '').trim()) continue
    out.push(joined)
  }
  return out.join('\n')
}

/** 按设置挑选写入正文：逐词优先 ylyric→增强 LRC，否则逐行 lyric */
export function pickDownloadLyricBody(lrcData, settings = {}) {
  const line = normalizeLyricText(lrcData?.lyric)
  if (preferDownloadWordLyric(settings)) {
    const enhanced = ylyricToEnhancedLrc(lrcData?.ylyric)
    if (enhanced) return enhanced
    if (line.includes('<') && /<\d/.test(line)) return line
  }
  return line
}

export function buildEmbedLyrics(lrcData, settings) {
  const body = pickDownloadLyricBody(lrcData, settings)
  if (!body) return ''
  const includeT = settings['download.isEmbedLyricT'] === 'true'
  const includeR = settings['download.isEmbedLyricR'] === 'true'

  if (!includeT && !includeR) return body
  if (!lrcData.tlyric && !lrcData.rlyric) return body

  // 翻译/罗马音仍按逐行时间轴对齐
  const labelSource = normalizeLyricText(lrcData.lyric) || body
  const lrcTimeLabels = parseLrcTimeLabel(labelSource)
  let lrc = body.trim()
  if (includeT && lrcData.tlyric) {
    lrc += `\n\n${filterExtendedLyricLabel(lrcTimeLabels, lrcData.tlyric)}\n`
  }
  if (includeR && lrcData.rlyric) {
    lrc += `\n\n${filterExtendedLyricLabel(lrcTimeLabels, lrcData.rlyric)}\n`
  }
  return lrc
}

export function fixKgLyric(lrc) {
  if (!lrc) return lrc
  return /\[00:\d\d:\d\d.\d+\]/.test(lrc) ? lrc.replace(/(?:\[00:(\d\d:\d\d.\d+\]))/gm, '[$1') : lrc
}
