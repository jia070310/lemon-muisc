/**
 * 从文件名推断歌手 / 歌名，并尽量纠正颠倒、噪声前缀。
 * 前端搜索框与后端自动匹配共用同一套启发式。
 */

const SEPARATOR_RE = /\s*[-–—_～~]\s*/

const NOISE_RES = [
  /\[(?:\d{2,3}\s?k(?:bps)?|flac(?:\s*24bit)?|mp3|ape|wav|dsd|hi-?res|atmos|oq|sq|hq)\]/gi,
  /【[^】]*(?:音乐|音质|下载|无损|试听|高品质|环绕)[^】]*】/g,
  /(?:www\.)?[a-z0-9-]+\.(?:com|cn|net|org|cc|vip)/gi,
  /@[\w\u4e00-\u9fff.-]+/g,
  /[\[\(（【]\s*(?:CD|DVD|LP|EP|单曲|专辑)\s*[\]\)）】]/gi,
]

const TRACK_PREFIX = /^(?:\d{1,3}(?:\s*[.\-_、．]|\s+)|\(\s*\d{1,3}\s*\)\s*[-_.]?\s*|【\s*\d{1,3}\s*】\s*|第\s*\d{1,3}\s*[首轨]\s*[-_.]?\s*)/

const TITLE_HINT_RE = /(?:live|remix|mix|cover|inst\.?|instrumental|acoustic|demo|edit|ver\.?|version|伴奏|纯音乐|钢琴曲|弦乐|现场|完整版|正式版|片头曲|片尾曲|插曲|主题曲|宣传曲|推广曲|剧中曲|抖音|热播|\(.*版.*\)|（.*版.*）|DJ\b)/i
const ARTIST_HINT_RE = /(?:feat\.?|ft\.?|featuring|vs\.?|with|&|\/|、|和|与|＆)/i

function stripExt(fileName) {
  return String(fileName || '').replace(/\.[^.\\/]+$/, '').trim()
}

function collapseSpace(s) {
  return String(s || '').replace(/\s+/g, ' ').trim()
}

/** 去掉音质站名等噪声，保留括号里的版本信息 */
export function cleanFilenameNoise(raw) {
  let s = collapseSpace(raw)
  if (!s) return ''
  s = s.replace(TRACK_PREFIX, '')
  for (const re of NOISE_RES) s = s.replace(re, ' ')
  // 残留空括号
  s = s.replace(/[\[\(（【]\s*[\]\)）】]/g, ' ')
  s = collapseSpace(s)
  // 去掉首尾分隔符
  s = s.replace(/^[-–—_～~\s]+|[-–—_～~\s]+$/g, '').trim()
  return s
}

function looksLikeTitle(s) {
  const t = String(s || '').trim()
  if (!t) return 0
  let score = 0
  if (/[《》「」『』]/.test(t)) score += 3
  if (TITLE_HINT_RE.test(t)) score += 3
  const cn = (t.match(/[\u4e00-\u9fff]/g) || []).length
  if (cn >= 5 && !ARTIST_HINT_RE.test(t)) score += 2
  // 两字中文更常是歌名（晴天、泡沫、江南）
  if (cn === 2 && t.length <= 4 && !ARTIST_HINT_RE.test(t)) score += 1
  return score
}

function looksLikeArtist(s) {
  const t = String(s || '').trim()
  if (!t) return 0
  let score = 0
  if (ARTIST_HINT_RE.test(t)) score += 3
  const cn = (t.match(/[\u4e00-\u9fff]/g) || []).length
  // 2–4 字且无版本词：略像歌手，但权重低于明确歌名线索
  if (cn >= 2 && cn <= 4 && t.length <= 12 && !TITLE_HINT_RE.test(t)) score += 1
  if (cn === 3 && t.length <= 6 && !TITLE_HINT_RE.test(t)) score += 1
  return score
}

function guessOrientation(left, right) {
  let scoreArtistTitle = looksLikeArtist(left) + looksLikeTitle(right)
  let scoreTitleArtist = looksLikeTitle(left) + looksLikeArtist(right)

  // 左短右长：略偏向 歌手-歌名
  if (left.length + 2 <= right.length) scoreArtistTitle += 1
  if (right.length + 2 <= left.length) scoreTitleArtist += 1

  if (scoreTitleArtist > scoreArtistTitle) {
    return { artist: right, title: left, usedSwap: true, confidence: scoreTitleArtist - scoreArtistTitle }
  }
  return { artist: left, title: right, usedSwap: false, confidence: scoreArtistTitle - scoreTitleArtist }
}

function parseBookTitle(base) {
  // 歌手《歌名》 / 《歌名》歌手 / 歌名《歌手》少见
  let m = base.match(/^(.+?)\s*[《「『]\s*(.+?)\s*[》」』]\s*$/)
  if (m) {
    const a = collapseSpace(m[1])
    const b = collapseSpace(m[2])
    if (a && b) {
      // 前短后像歌名 → 歌手《歌名》
      if (looksLikeArtist(a) >= looksLikeTitle(a) || a.length <= b.length) {
        return { artist: a, title: b, usedSwap: false }
      }
      return { artist: b, title: a, usedSwap: true }
    }
  }
  m = base.match(/^[《「『]\s*(.+?)\s*[》」』]\s*(.+)$/)
  if (m) {
    const title = collapseSpace(m[1])
    const artist = collapseSpace(m[2])
    if (title && artist) return { artist, title, usedSwap: false }
  }
  return null
}

function parseParenForm(base) {
  // 歌名(歌手) / 歌名（歌手）——括号较短时更像歌手
  const m = base.match(/^(.+?)\s*[\(（]\s*([^）\)]+?)\s*[\)）]\s*$/)
  if (!m) return null
  const outer = collapseSpace(m[1])
  const inner = collapseSpace(m[2])
  if (!outer || !inner) return null
  if (TITLE_HINT_RE.test(inner) && !looksLikeArtist(inner)) {
    // 歌名(Live版) → 整段当歌名
    return null
  }
  if (inner.length <= 16 || looksLikeArtist(inner)) {
    return { artist: inner, title: outer, usedSwap: false }
  }
  return null
}

function buildResult(artist, title, extra = {}) {
  const a = collapseSpace(artist)
  const t = collapseSpace(title)
  const keyword = [a, t].filter(Boolean).join(' ')
  const out = {
    artist: a,
    title: t,
    keyword,
    altKeyword: a && t ? `${t} ${a}` : keyword,
    usedSwap: Boolean(extra.usedSwap),
    confidence: Number(extra.confidence) || 0,
  }
  if (a && t) {
    out.swapped = { title: a, artist: t, keyword: `${t} ${a}` }
  }
  return out
}

/** 解析文件名 → { artist, title, keyword, altKeyword, swapped?, usedSwap } */
export function parseFilename(fileName) {
  const rawBase = stripExt(fileName)
  const base = cleanFilenameNoise(rawBase)
  if (!base) return buildResult('', '')

  const book = parseBookTitle(base)
  if (book) return buildResult(book.artist, book.title, book)

  const paren = parseParenForm(base)
  if (paren) return buildResult(paren.artist, paren.title, paren)

  // 只按「第一个」主分隔符切成两段，避免歌名里再含 -
  const parts = base.split(SEPARATOR_RE).map(collapseSpace).filter(Boolean)
  if (parts.length >= 2) {
    const left = parts[0]
    const right = parts.slice(1).join(' - ')
    const oriented = guessOrientation(left, right)
    return buildResult(oriented.artist, oriented.title, oriented)
  }

  return buildResult('', base)
}

function isSameAsFilename(value, fileName) {
  const v = collapseSpace(value).toLowerCase()
  if (!v) return false
  const base = cleanFilenameNoise(stripExt(fileName)).toLowerCase()
  const raw = stripExt(fileName).toLowerCase()
  return v === base || v === raw
}

function isUsefulTagField(value, fileName) {
  const v = collapseSpace(value)
  if (!v) return false
  if (/^(unknown|unknow|未知|未知歌手|未知艺人|未知标题|track\s*\d+)$/i.test(v)) return false
  if (fileName && isSameAsFilename(v, fileName)) return false
  return true
}

/**
 * 决定填入「网络获取」搜索框的歌手 / 歌名：
 * 1) 优先用内嵌标签（有意义时）
 * 2) 缺的一侧用文件名补
 * 3) 两侧都无标签时用文件名智能解析（含颠倒判断）
 */
export function resolveSearchArtistTitle({
  artist = '',
  title = '',
  fileName = '',
  parsedArtist = '',
  parsedTitle = '',
} = {}) {
  const tagArtist = collapseSpace(artist)
  const tagTitle = collapseSpace(title)
  const parsed = parseFilename(fileName || '')

  const useTagArtist = isUsefulTagField(tagArtist, fileName)
  const useTagTitle = isUsefulTagField(tagTitle, fileName)

  let outArtist = useTagArtist ? tagArtist : ''
  let outTitle = useTagTitle ? tagTitle : ''

  // 预扫描里的 parsed* 可作次优先
  if (!outArtist && isUsefulTagField(parsedArtist, fileName)) outArtist = collapseSpace(parsedArtist)
  if (!outTitle && isUsefulTagField(parsedTitle, fileName)) outTitle = collapseSpace(parsedTitle)

  if (!outArtist) outArtist = parsed.artist
  if (!outTitle) outTitle = parsed.title

  // 标签两侧都空但文件名解析出颠倒结果时，已在 parse 里处理
  // 若只有整段 title、无 artist，再尝试从 title 里二次拆分
  if (!outArtist && outTitle && SEPARATOR_RE.test(outTitle)) {
    const again = parseFilename(`${outTitle}.mp3`)
    if (again.artist && again.title) {
      outArtist = again.artist
      outTitle = again.title
    }
  }

  if (!outArtist && !outTitle) {
    outTitle = cleanFilenameNoise(stripExt(fileName)) || stripExt(fileName)
  }

  return {
    artist: outArtist,
    title: outTitle,
    parsed,
    fromTag: { artist: useTagArtist, title: useTagTitle },
  }
}

function scoreOne(item, parsed) {
  const name = (item.name || '').toLowerCase()
  const singer = (item.singer || '').toLowerCase()
  const title = (parsed.title || '').toLowerCase()
  const artist = (parsed.artist || '').toLowerCase()
  let score = 0

  if (title && name.includes(title)) score += 3
  if (artist && singer.includes(artist)) score += 3
  if (title && name === title) score += 2
  if (artist && singer === artist) score += 2
  if (title && artist && name.includes(title) && singer.includes(artist)) score += 4

  const keyword = (parsed.keyword || '').toLowerCase()
  if (keyword && `${name} ${singer}`.includes(keyword.replace(/\s+/g, ' '))) score += 2

  return score
}

export function scoreMatch(item, parsed) {
  let score = scoreOne(item, parsed)
  if (parsed?.swapped) {
    score = Math.max(score, scoreOne(item, parsed.swapped))
  }
  return score
}
