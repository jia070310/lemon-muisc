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
    const words = []
    const wordRe = /\((\d+)\s*,\s*(\d+)(?:\s*,\s*-?\d+)?\)([^(]*)/g
    let wm
    while ((wm = wordRe.exec(rest)) !== null) {
      const offsetMs = Number(wm[1]) || 0
      const durMs = Number(wm[2]) || 0
      const text = wm[3] ?? ''
      if (!text && !words.length) continue
      words.push({
        time: (lineStartMs + offsetMs) / 1000,
        duration: durMs / 1000,
        text,
      })
    }
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
 * 优先 YRC / 增强 LRC 逐字，否则普通 LRC / 纯文本
 * @returns {{ time: number, text: string, words: null | { time: number, duration: number, text: string }[] }[]}
 */
export function parseLyricRich(lyric, ylyric = '') {
  const yrcLines = parseYrc(ylyric)
  if (yrcLines.length) return yrcLines

  const enhanced = parseEnhancedLrc(lyric)
  if (enhanced.length) return enhanced

  // 有时 yrc 内容被误放在 lyric 字段
  const yrcInLyric = parseYrc(lyric)
  if (yrcInLyric.length) return yrcInLyric

  return parseLyric(lyric)
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
export function synthesizeWordTimings(lines) {
  if (!Array.isArray(lines) || !lines.length) return []
  return lines.map((line, i) => {
    if (isProgressiveWordTiming(line?.words)) return line
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

/** 字时间是否单调不减且间隔合理（否则视为不可用，改走行内进度） */
export function isProgressiveWordTiming(words) {
  if (!Array.isArray(words) || words.length < 2) return false
  // 推算轴已带 synthetic，走统一的行进度逻辑更稳
  if (words.some((w) => w?.synthetic)) return false
  let prev = Number(words[0]?.time)
  if (!Number.isFinite(prev)) return false
  let advanced = false
  for (let i = 1; i < words.length; i++) {
    const t = Number(words[i]?.time)
    if (!Number.isFinite(t) || t < prev - 1e-4) return false
    // 允许 0 时长占位（酷狗 KRC 常见），但不能倒退
    if (t > prev + 1e-4) advanced = true
    // 正常逐字很少超过 1.5s；更大间隔基本是坏轴
    if (t - prev > 1.5) return false
    prev = t
  }
  return advanced
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

  const end = Number.isFinite(Number(endTime)) && Number(endTime) > start
    ? Number(endTime)
    : start + Math.max(2.2, words.length * 0.32)
  const span = Math.max(0.05, end - start)
  const p = (time - start) / span
  if (p <= 0) return 0
  if (p >= 1) return words.length - 1
  return Math.min(words.length - 1, Math.floor(p * words.length))
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
