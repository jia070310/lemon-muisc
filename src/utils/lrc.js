/** 是否含 LRC 时间轴标记 */
export function hasLrcTimestamps(text) {
  return /\[\d{1,2}(?::\d{2}){1,2}(?:\.\d{1,3})?\]/.test(String(text || ''))
}

/** 是否含逐字时间轴（YRC 或增强 LRC） */
export function hasWordTimestamps(text) {
  const s = String(text || '')
  if (/\[\d+,\d+\]\s*\(\d+,\d+/.test(s)) return true
  if (/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\](?:<\d{1,2}:\d{2}(?:\.\d{1,3})?>)+/.test(s)) return true
  return false
}

function parseTimeTag(hours, min, sec, msRaw) {
  const h = hours ? parseInt(String(hours).replace(':', ''), 10) : 0
  const m = parseInt(min, 10)
  const s = parseInt(sec, 10)
  const msPart = msRaw || ''
  const ms = msPart ? parseInt(msPart.padEnd(3, '0').slice(0, 3), 10) : 0
  return h * 3600 + m * 60 + s + ms / 1000
}

/** 解析普通 LRC，支持多时间标签行与 [hh:mm:ss.xx] */
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
    tagRe.lastIndex = 0
    while ((match = tagRe.exec(line)) !== null) {
      tags.push(match)
    }
    if (!tags.length) continue

    const last = tags[tags.length - 1]
    const text = line.slice(last.index + last[0].length).trim()
    if (!text) continue
    // 若正文是增强 LRC 逐字标记，交给 parseEnhancedLrc
    if (/^<\d{1,2}:\d{2}/.test(text)) continue

    for (const m of tags) {
      const time = parseTimeTag(m[1], m[2], m[3], m[4])
      lines.push({ time, text, words: null })
    }
  }

  lines.sort((a, b) => a.time - b.time)
  return lines
}

/**
 * 网易云 YRC：
 * [147,1740](0,240,0)前(240,360,0)端
 * [lineStartMs,lineDurMs](wordOffsetMs,wordDurMs[,x])字
 */
export function parseYrc(yrc) {
  if (!yrc) return []
  const normalized = String(yrc).replace(/\uFEFF/g, '').replace(/\r/g, '')
  const lines = []
  const lineHead = /^\[(\d+)\s*,\s*(\d+)\](.*)$/

  for (const rawLine of normalized.split('\n')) {
    const line = rawLine.trim()
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
      const durMs = Number(wm[2]) || 0
      const text = wm[3] ?? ''
      if (!text && !rawWords.length) continue
      rawWords.push({ stampMs, durMs, text })
    }
    if (!rawWords.length) continue
    // 网易 YRC 字时间为绝对毫秒；酷狗转出来的是相对行首。用首字判断。
    const firstStamp = rawWords[0].stampMs
    const absolute = firstStamp > 200 && firstStamp >= lineStartMs - 80
    const words = rawWords.map((w) => ({
      time: (absolute ? w.stampMs : lineStartMs + w.stampMs) / 1000,
      duration: w.durMs / 1000,
      text: w.text,
    }))
    if (!words.length) continue
    const text = words.map((w) => w.text).join('')
    if (!text.trim()) continue
    lines.push({
      time: lineStartMs / 1000,
      text,
      words,
    })
  }

  lines.sort((a, b) => a.time - b.time)
  return lines
}

/**
 * 增强 LRC（逐字）：
 * [00:12.00]<00:12.00>你<00:12.35>好
 */
export function parseEnhancedLrc(lrc) {
  if (!lrc) return []
  const normalized = String(lrc).replace(/\uFEFF/g, '').replace(/\r/g, '')
  const lines = []
  const lineTagRe = /\[(\d{1,2}:)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g
  const wordTagRe = /<(\d{1,2}:)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?>([^<]*)/g

  for (const rawLine of normalized.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    if (/^\[(?:ti|ar|al|by|offset|id|length|ve):/i.test(line)) continue
    if (!line.includes('<')) continue

    lineTagRe.lastIndex = 0
    const lineTag = lineTagRe.exec(line)
    if (!lineTag) continue
    const afterLine = line.slice(lineTag.index + lineTag[0].length)
    if (!afterLine.includes('<')) continue

    const words = []
    wordTagRe.lastIndex = 0
    let wm
    while ((wm = wordTagRe.exec(afterLine)) !== null) {
      const text = wm[5] ?? ''
      if (!text && !words.length) continue
      words.push({
        time: parseTimeTag(wm[1], wm[2], wm[3], wm[4]),
        duration: 0,
        text,
      })
    }
    if (!words.length) continue
    const text = words.map((w) => w.text).join('')
    if (!text.trim()) continue
    lines.push({
      time: parseTimeTag(lineTag[1], lineTag[2], lineTag[3], lineTag[4]),
      text,
      words,
    })
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
    .map((line) => ({ time: 0, text: line, words: null }))
}

/**
 * 优先 YRC / 增强 LRC 逐字，否则普通 LRC / 纯文本。
 * 若逐字解析行数明显偏少，回退普通 LRC，避免残缺逐字轴盖掉完整歌词。
 */
export function parseLyricRich(lyric, ylyric = '') {
  const plain = parseLyric(lyric)
  const yrcLines = parseYrc(ylyric)
  if (yrcLines.length && !(plain.length > yrcLines.length * 2 && plain.length >= 8)) {
    return yrcLines
  }

  const enhanced = parseEnhancedLrc(lyric)
  if (enhanced.length && !(plain.length > enhanced.length * 2 && plain.length >= 8)) {
    return enhanced
  }

  // 有时 yrc 内容被误放在 lyric 字段
  const yrcInLyric = parseYrc(lyric)
  if (yrcInLyric.length && !(plain.length > yrcInLyric.length * 2 && plain.length >= 8)) {
    return yrcInLyric
  }

  if (plain.length) return plain
  return yrcLines.length ? yrcLines : (enhanced.length ? enhanced : yrcInLyric)
}

/** 是否有可用的行级时间轴（可推算逐字） */
export function lyricHasTiming(lines) {
  return Array.isArray(lines) && lines.some((l) => Number(l?.time) > 0 && String(l?.text || '').trim())
}

/**
 * 当前行逐字占用的结束时间：
 * - 跳过同戳/近戳（翻译行）
 * - 行间空白过长时截断，避免字进度被拉得极慢、看起来像卡在首字
 */
export function getLyricLineEndTime(lines, idx) {
  const line = lines?.[idx]
  const start = Number(line?.time) || 0
  const textLen = Math.max(1, Array.from(String(line?.text || '')).length)
  const fallbackDur = Math.max(2.2, textLen * 0.32)
  let nextDistinct = 0
  if (Array.isArray(lines)) {
    for (let j = idx + 1; j < lines.length; j++) {
      const t = Number(lines[j]?.time) || 0
      if (t > start + 0.18) {
        nextDistinct = t
        break
      }
    }
  }
  const rawDur = nextDistinct > start ? (nextDistinct - start) : fallbackDur
  const cap = Math.max(2.6, Math.min(6.5, textLen * 0.45))
  return start + Math.min(Math.max(0.35, rawDur), cap)
}

/**
 * 无官方逐字轴时，按行起止时间均分到每个字符，用于逐字高亮展示
 */
function hasOfficialWordTimes(words) {
  if (!Array.isArray(words) || !words.length) return false
  if (words.some((w) => w?.synthetic)) return false
  return words.every((w) => Number.isFinite(Number(w?.time)))
}

export function synthesizeWordTimings(lines) {
  if (!Array.isArray(lines) || !lines.length) return []
  return lines.map((line, i) => {
    if (hasOfficialWordTimes(line?.words)) {
      const end = getLyricLineEndTime(lines, i)
      return { ...line, words: inferWordDurations(line.words, end) }
    }
    const text = String(line?.text || '')
    const chars = Array.from(text)
    if (!chars.length) return { ...line, words: null }

    const start = Number(line.time) || 0
    const end = getLyricLineEndTime(lines, i)
    const span = Math.max(0.2, end - start)
    const usable = span * 0.92
    const step = usable / chars.length
    const words = chars.map((ch, wi) => ({
      time: start + step * wi,
      duration: step,
      text: ch,
      synthetic: true,
    }))
    return { ...line, text, words }
  })
}

function inferWordDurations(words, endTime) {
  return words.map((word, i) => {
    const explicit = Number(word?.duration)
    if (explicit > 0.03) return word
    const t0 = Number(word?.time)
    const t1 = i + 1 < words.length ? Number(words[i + 1]?.time) : Number(endTime)
    const duration = Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0 ? t1 - t0 : 0.28
    return { ...word, duration }
  })
}

/** 官方逐字轴：时间可用即可，不因字间隔稍大而整句均分 */
export function isProgressiveWordTiming(words) {
  if (!hasOfficialWordTimes(words)) return false
  if (words.length === 1) return Number(words[0]?.duration) > 0.03 || Number.isFinite(Number(words[0]?.time))
  let prev = Number(words[0]?.time)
  if (!Number.isFinite(prev)) return false
  let advanced = false
  for (let i = 1; i < words.length; i++) {
    const t = Number(words[i]?.time)
    if (!Number.isFinite(t) || t < prev - 0.05) return false
    if (t > prev + 1e-4) advanced = true
    prev = t
  }
  return advanced || words.some((w) => Number(w?.duration) > 0.03)
}

function resolveLineEndTime(line, words, endTime) {
  const start = Number(line?.time) || 0
  if (Number.isFinite(Number(endTime)) && Number(endTime) > start) return Number(endTime)
  return start + Math.max(2.2, (words?.length || 1) * 0.32)
}

function resolveWordDuration(words, wordIndex, endTime) {
  const word = words[wordIndex]
  const t0 = Number(word?.time)
  const explicit = Number(word?.duration)
  if (explicit > 0.03) return explicit
  const t1 = wordIndex + 1 < words.length
    ? Number(words[wordIndex + 1]?.time)
    : Number(endTime)
  if (Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0) return t1 - t0
  return 0.28
}

/**
 * 根据播放时间解析当前字下标。
 * @param endTime 本行逐字结束时间（应用 getLyricLineEndTime）
 */
export function resolveActiveWordIndex(line, words, time, endTime) {
  if (!Array.isArray(words) || !words.length) return -1
  const start = Number(line?.time) || 0
  if (!(time >= start)) return -1

  if (isProgressiveWordTiming(words)) {
    let wi = -1
    for (let j = words.length - 1; j >= 0; j--) {
      const wt = Number(words[j].time)
      if (Number.isFinite(wt) && time >= wt) {
        wi = j
        break
      }
    }
    return wi < 0 ? 0 : wi
  }

  const end = resolveLineEndTime(line, words, endTime)
  const span = Math.max(0.05, end - start)
  const p = (time - start) / span
  if (p <= 0) return 0
  if (p >= 1) return words.length - 1
  return Math.min(words.length - 1, Math.floor(p * words.length))
}

/** 当前字从左到右的填充进度 0–1，用于扫光而不是整字跳变 */
export function getWordFillProgress(line, words, time, endTime, wordIndex) {
  if (!Array.isArray(words) || !words.length) return 0
  const wi = Number(wordIndex)
  if (!Number.isInteger(wi) || wi < 0 || wi >= words.length) return 0
  const start = Number(line?.time) || 0
  if (!(time >= start)) return 0

  if (!isProgressiveWordTiming(words)) {
    const end = resolveLineEndTime(line, words, endTime)
    const span = Math.max(0.05, end - start)
    const exact = ((time - start) / span) * words.length
    if (exact <= wi) return 0
    if (exact >= wi + 1) return 1
    return exact - wi
  }

  const t0 = Number(words[wi].time)
  if (!Number.isFinite(t0) || time < t0) return 0
  const dur = Math.max(0.05, resolveWordDuration(words, wi, resolveLineEndTime(line, words, endTime)))
  return Math.min(1, Math.max(0, (time - t0) / dur))
}

/** 自动识别 LRC 或纯文本歌词（逐行） */
export function parseLyric(text) {
  if (!text) return []
  const lrc = parseLrc(text)
  if (lrc.length) return lrc
  return parsePlainLyric(text)
}

export function lyricHasWords(lines) {
  return Array.isArray(lines) && lines.some((l) => Array.isArray(l?.words) && l.words.length > 0)
}
