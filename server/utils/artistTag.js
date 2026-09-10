/**
 * 多歌手：对内多值，对外统一「A / B」展示。
 * FLAC/Vorbis 可写多条 ARTIST；MP3/WAV/APE 等写展示串（ID3v2.3 约定用 /）。
 */

export const ARTIST_DISPLAY_SEP = ' / '

/** 可拆成多歌手的分隔符（读旧标签 / 用户输入） */
const SPLIT_RE = /(?:\s*\/\s*|\s*[;|]\s*|\s*[&＆]\s*|、|，|,)+/

/**
 * @param {unknown} input 字符串、数组，或含 name 的对象数组
 * @returns {string[]}
 */
export function splitArtists(input) {
  if (input == null) return []
  if (Array.isArray(input)) {
    const out = []
    for (const item of input) {
      if (item == null) continue
      if (typeof item === 'object' && item.name != null) {
        out.push(...splitArtists(item.name))
      } else {
        out.push(...splitArtists(String(item)))
      }
    }
    return dedupeArtists(out)
  }
  let s = String(input).trim()
  if (!s) return []
  // ID3v2.4 多值：NUL 分隔
  if (s.includes('\0')) {
    return dedupeArtists(s.split('\0').map((p) => p.trim()).filter(Boolean))
  }
  s = s.replace(/\\&/g, '&')
  const parts = s.split(SPLIT_RE).map((p) => p.trim()).filter(Boolean)
  return dedupeArtists(parts.length ? parts : [s])
}

function dedupeArtists(list) {
  const seen = new Set()
  const out = []
  for (const a of list) {
    const key = a.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(a)
  }
  return out
}

/** 对外展示：`周杰伦 / 费玉清` */
export function joinArtists(input) {
  const parts = splitArtists(input)
  return parts.join(ARTIST_DISPLAY_SEP)
}

/**
 * 写入前规范化：得到多值列表 + 展示串。
 * @returns {{ artists: string[], display: string }}
 */
export function normalizeArtistForWrite(input) {
  if (input === undefined) return { artists: undefined, display: undefined }
  if (input == null || input === '') return { artists: [], display: '' }
  const artists = splitArtists(input)
  return { artists, display: artists.join(ARTIST_DISPLAY_SEP) }
}
