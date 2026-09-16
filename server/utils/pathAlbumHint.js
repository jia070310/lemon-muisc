import path from 'path'
import { splitArtists } from './artistTag.js'

/** 不宜当作专辑名的父目录（音乐库根、格式目录等） */
const SKIP_FOLDER_NAMES = new Set([
  'music', 'musics', 'music library', 'musiclibrary', 'media', 'audio',
  'download', 'downloads', '下载', '音乐', '音乐库', '曲库', '我的音乐',
  'flac', 'mp3', 'wav', 'ape', 'dsd', 'alac', 'aac', 'ogg', 'm4a',
  'lossless', 'lossy', 'hi-res', 'hires', 'cd', 'vinyl',
  'artist', 'artists', 'album', 'albums', '歌手', '专辑',
])

const DISC_PREFIX_RE = /^(?:CD|Disc|Disk|DISC|碟)\s*[-_.]?\s*\d+\s*[-–—:：]?\s*/i
const DISC_TOKEN_RE = /\b(?:CD|Disc|Disk|DISC)\s*[-_.]?\s*\d+\b/gi
const DISC_CN_RE = /碟\s*\d+/g

/**
 * 从文件路径推断专辑名候选（父文件夹，去掉 Disc/CD 等盘符前缀）
 * @param {string} filePath
 * @returns {string}
 */
export function albumHintFromFilePath(filePath) {
  const fp = String(filePath || '').trim()
  if (!fp) return ''
  const parent = path.basename(path.dirname(path.resolve(fp)))
  return normalizeFolderAlbumHint(parent)
}

export function normalizeFolderAlbumHint(raw) {
  let s = String(raw || '').trim()
  if (!s) return ''
  const lower = s.toLowerCase()
  if (SKIP_FOLDER_NAMES.has(lower)) return ''
  if (/^\d{1,3}$/.test(s)) return ''

  const stripped = s
    .replace(DISC_PREFIX_RE, '')
    .replace(DISC_TOKEN_RE, ' ')
    .replace(DISC_CN_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (stripped) s = stripped

  if (!s || SKIP_FOLDER_NAMES.has(s.toLowerCase())) return ''
  if (s.length > 120) s = s.slice(0, 120)
  return s
}

/**
 * 路径中可用于校验歌手的片段（父、祖父目录名拆分后的词）
 */
export function artistHintTokensFromPath(filePath) {
  const fp = String(filePath || '').trim()
  if (!fp) return []
  const dir = path.dirname(path.resolve(fp))
  const segments = []
  let cur = dir
  for (let i = 0; i < 3; i++) {
    const base = path.basename(cur)
    if (!base || base === path.parse(cur).root) break
    if (!SKIP_FOLDER_NAMES.has(base.toLowerCase()) && !/^\d{1,3}$/.test(base)) {
      segments.push(base)
    }
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  const out = []
  for (const seg of segments) {
    const parts = splitArtists(seg)
    if (parts.length) out.push(...parts)
    else out.push(seg)
  }
  return [...new Set(out.map((x) => String(x).trim()).filter(Boolean))]
}

function norm(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, '')
}

/**
 * 网络匹配歌手是否与本地标签/路径足够相关
 */
export function isMatchArtistAcceptable(matchSinger, localArtist, filePath) {
  const localTokens = [
    ...splitArtists(localArtist),
    ...artistHintTokensFromPath(filePath),
  ].map(norm).filter(Boolean)
  if (!localTokens.length) return true

  const singerParts = splitArtists(matchSinger).map(norm).filter(Boolean)
  const singerJoined = norm(matchSinger)
  if (!singerJoined) return true

  for (const token of localTokens) {
    if (token.length < 1) continue
    if (singerJoined.includes(token)) return true
    if (singerParts.some((p) => p.includes(token) || token.includes(p))) return true
  }
  return false
}

const TEXT_KEYS = ['title', 'artist', 'albumArtist', 'album', 'year', 'genre', 'comment', 'lyric']

/**
 * 仅补全本地空字段，避免刮削覆盖已有正确信息
 */
export function mergeMatchMetaFillMissing(existing = {}, incoming = {}) {
  const out = { ...incoming }
  for (const key of TEXT_KEYS) {
    const local = String(existing[key] || '').trim()
    if (local) out[key] = existing[key]
  }
  const hasLocalCover = Boolean(
    existing.hasPicture
    || existing.pictureBase64
    || (existing.picUrl && String(existing.picUrl).includes('/api/tag/cover')),
  )
  if (hasLocalCover) {
    delete out.pic
    if (existing.picUrl) out.picUrl = existing.picUrl
    else delete out.picUrl
  }
  if (String(existing.lyric || '').trim()) {
    out.lyric = existing.lyric
  }
  return out
}
