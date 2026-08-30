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

export function buildEmbedLyrics(lrcData, settings) {
  if (!lrcData?.lyric) return ''
  const includeT = settings['download.isEmbedLyricT'] === 'true'
  const includeR = settings['download.isEmbedLyricR'] === 'true'

  if (!includeT && !includeR) return lrcData.lyric
  if (!lrcData.tlyric && !lrcData.rlyric) return lrcData.lyric

  const lrcTimeLabels = parseLrcTimeLabel(lrcData.lyric)
  let lrc = lrcData.lyric.trim()
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
