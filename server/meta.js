import NodeID3 from 'node-id3'
import fs from 'fs'
import { detectImageMime } from './utils/fetchPic.js'
import { normalizeLyricText, pickBestLyricText } from './utils/lyric.js'

export async function writeMeta(filePath, ext, meta) {
  if (ext === '.mp3') return writeMp3Meta(filePath, meta)
  if (ext === '.flac') return writeFlacMeta(filePath, meta)
  throw new Error(`暂不支持 ${ext} 格式写入标签`)
}

function decodePicInput(pic) {
  if (!pic) return null
  if (Buffer.isBuffer(pic)) return pic
  if (typeof pic === 'string') {
    const m = pic.match(/^data:[^;]+;base64,(.+)$/)
    if (m) return Buffer.from(m[1], 'base64')
    return Buffer.from(pic, 'base64')
  }
  return null
}

function writeMp3Meta(filePath, meta) {
  const tags = {}
  if (meta.title != null) tags.title = meta.title
  if (meta.artist != null) tags.artist = meta.artist
  if (meta.album != null) tags.album = meta.album
  if (meta.year != null) tags.year = String(meta.year)
  if (meta.genre != null) tags.genre = meta.genre
  if (meta.comment != null) tags.comment = { text: meta.comment }

  const picBuf = decodePicInput(meta.pic)
  if (picBuf) {
    tags.image = {
      mime: detectImageMime(picBuf),
      type: { id: 3, name: 'front cover' },
      description: 'Cover',
      imageBuffer: picBuf,
    }
  }

  if (meta.lyric != null) {
    tags.unsynchronisedLyrics = {
      language: 'chi',
      text: meta.lyric,
    }
  }

  const ok = NodeID3.write(tags, filePath)
  if (!ok) throw new Error(typeof ok === 'object' ? JSON.stringify(ok) : 'MP3 标签写入失败')
}

async function writeFlacMeta(filePath, meta) {
  const data = fs.readFileSync(filePath)
  if (data.slice(0, 4).toString() !== 'fLaC') throw new Error('不是有效的 FLAC 文件')

  const comments = []
  if (meta.title != null) comments.push(`TITLE=${meta.title}`)
  if (meta.artist != null) comments.push(`ARTIST=${meta.artist}`)
  if (meta.album != null) comments.push(`ALBUM=${meta.album}`)
  if (meta.year != null) comments.push(`DATE=${meta.year}`)
  if (meta.genre != null) comments.push(`GENRE=${meta.genre}`)
  if (meta.comment != null) comments.push(`COMMENT=${meta.comment}`)
  if (meta.lyric != null) comments.push(`LYRICS=${meta.lyric}`)

  const picBuf = decodePicInput(meta.pic)
  if (comments.length === 0 && !picBuf) return

  const parsed = parseFlacBlocks(data)
  const newFile = rebuildFlacBlocks(parsed, comments, picBuf)
  fs.writeFileSync(filePath, newFile)
}

function parseFlacBlocks(data) {
  const blocks = []
  let offset = 4
  let isLast = false

  while (!isLast && offset < data.length) {
    const header = data[offset]
    isLast = (header & 0x80) !== 0
    const type = header & 0x7f
    const length = (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]
    offset += 4
    blocks.push({ type, data: data.slice(offset, offset + length) })
    offset += length
  }

  return { blocks, audioData: data.slice(offset) }
}

function buildVorbisCommentBlock(comments) {
  const vendor = Buffer.from('lx-music-nas')
  const parts = [Buffer.alloc(4), vendor, Buffer.alloc(4)]
  parts[0].writeUInt32LE(vendor.length)
  parts[2].writeUInt32LE(comments.length)

  for (const comment of comments) {
    const cb = Buffer.from(comment, 'utf-8')
    const cl = Buffer.alloc(4)
    cl.writeUInt32LE(cb.length)
    parts.push(cl, cb)
  }

  return { type: 4, data: Buffer.concat(parts) }
}

function buildPictureBlock(pic) {
  const picBuf = Buffer.isBuffer(pic) ? pic : Buffer.from(pic)
  const mime = Buffer.from(detectImageMime(picBuf))
  const desc = Buffer.from('')

  const header = Buffer.alloc(32 + mime.length + desc.length)
  let off = 0
  header.writeUInt32BE(3, off); off += 4
  header.writeUInt32BE(mime.length, off); off += 4
  mime.copy(header, off); off += mime.length
  header.writeUInt32BE(desc.length, off); off += 4
  header.writeUInt32BE(0, off); off += 4
  header.writeUInt32BE(0, off); off += 4
  header.writeUInt32BE(24, off); off += 4
  header.writeUInt32BE(0, off); off += 4
  header.writeUInt32BE(picBuf.length, off); off += 4

  return { type: 6, data: Buffer.concat([header, picBuf]) }
}

function rebuildFlacBlocks(parsed, comments, pic) {
  let { blocks, audioData } = parsed

  blocks = blocks.filter(b => b.type !== 4 && b.type !== 6)

  if (comments.length > 0) {
    blocks.push(buildVorbisCommentBlock(comments))
  }

  if (pic) {
    blocks.push(buildPictureBlock(pic))
  }

  const parts = [Buffer.from('fLaC')]
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    const isLast = i === blocks.length - 1
    const header = Buffer.alloc(4)
    header[0] = (isLast ? 0x80 : 0) | b.type
    header[1] = (b.data.length >> 16) & 0xff
    header[2] = (b.data.length >> 8) & 0xff
    header[3] = b.data.length & 0xff
    parts.push(header, b.data)
  }
  parts.push(audioData)

  return Buffer.concat(parts)
}

function extractCommentText(comments) {
  if (!comments?.length) return ''
  const c = comments[0]
  if (typeof c === 'string') return normalizeTagText(c)
  return normalizeTagText(c?.text || '')
}

/** 修复 ID3 等标签 UTF-8 被误读为 Latin-1 的乱码 */
export function normalizeTagText(value) {
  if (value == null) return ''
  let s = String(value).trim()
  if (!s) return ''
  if (/[\u4e00-\u9fff]/.test(s)) return s
  if (/[ÃÂÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýÿ]/.test(s)) {
    try {
      const fixed = Buffer.from(s, 'latin1').toString('utf8').trim()
      if (fixed && !fixed.includes('\uFFFD') && /[\u4e00-\u9fff]/.test(fixed)) return fixed
    } catch {}
  }
  return s
}

function normalizeMetaFields(meta, { keepAlbumSameAsTitle = false } = {}) {
  const title = normalizeTagText(meta.title)
  let album = normalizeTagText(meta.album)
  const artist = normalizeTagText(meta.artist)
  const genre = normalizeTagText(meta.genre)
  const comment = normalizeTagText(meta.comment)
  // 仅在没有明确 ALBUM 标签、且专辑疑似由标题回填时清空
  if (!keepAlbumSameAsTitle && album && title && album === title) album = ''
  return {
    ...meta,
    title,
    artist,
    album,
    genre,
    comment,
  }
}

function formatFromPath(filePath, container = '') {
  const ext = (filePath || '').match(/\.([^.]+)$/)?.[1]
  if (ext) return ext.toUpperCase()
  const c = String(container || '').trim()
  return c ? c.toUpperCase() : ''
}

function extractLyricText(metadata, filePath) {
  const parts = []
  for (const item of metadata.common.lyrics || []) {
    if (typeof item === 'string') parts.push(item)
    else if (item?.text) parts.push(item.text)
    else if (Array.isArray(item?.syncText) && item.syncText.length) {
      parts.push(item.syncText.map(s => {
        if (typeof s === 'string') return s
        const text = s?.text || ''
        const time = Number(s?.time)
        if (!text || !Number.isFinite(time)) return text
        const total = Math.max(0, time)
        const min = Math.floor(total / 60)
        const sec = Math.floor(total % 60)
        const ms = Math.round((total % 1) * 1000)
        const stamp = ms
          ? `[${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0').slice(0, 2)}]`
          : `[${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}]`
        return `${stamp}${text}`
      }).join('\n'))
    }
  }
  let lyric = parts.join('\n').trim()

  if (!lyric && filePath.toLowerCase().endsWith('.mp3')) {
    try {
      const tags = NodeID3.read(filePath)
      const unsync = tags?.unsynchronisedLyrics
      if (typeof unsync === 'string') lyric = unsync
      else if (unsync?.text) lyric = unsync.text
      if (!lyric) {
        const sync = tags?.synchronisedLyrics
        const syncText = typeof sync === 'string' ? sync : sync?.text
        if (syncText) lyric = syncText
      }
    } catch {}
  }

  if (filePath.toLowerCase().endsWith('.flac')) {
    const native = readFlacNativeTags(filePath)
    lyric = pickBestLyricText(lyric, native?.lyric)
  }

  if (!lyric) {
    const lrcPath = filePath.replace(/\.[^.]+$/, '.lrc')
    if (lrcPath !== filePath && fs.existsSync(lrcPath)) {
      try { lyric = fs.readFileSync(lrcPath, 'utf-8').trim() } catch {}
    }
  }

  return normalizeLyricText(lyric)
}

function syncsafeSize(buf, start) {
  return ((buf[start] & 0x7f) << 21)
    | ((buf[start + 1] & 0x7f) << 14)
    | ((buf[start + 2] & 0x7f) << 7)
    | (buf[start + 3] & 0x7f)
}

/** 一次扫描 MP3 ID3 标签，检测 APIC / USLT / SYLT 等帧 */
function scanMp3Id3Frames(filePath) {
  const result = { hasApic: false, hasUslt: false }
  const fd = fs.openSync(filePath, 'r')
  try {
    const header = Buffer.alloc(10)
    if (fs.readSync(fd, header, 0, 10, 0) < 10) return result
    if (header.toString('ascii', 0, 3) !== 'ID3') return result
    const versionMajor = header[3]
    const tagSize = syncsafeSize(header, 6)
    const toRead = Math.min(tagSize, 2 * 1024 * 1024)
    const tagData = Buffer.alloc(toRead)
    const read = fs.readSync(fd, tagData, 0, toRead, 10)
    let offset = 0
    while (offset + 10 <= read) {
      const frameId = tagData.toString('ascii', offset, offset + 4)
      if (!/^[A-Z0-9]{4}$/.test(frameId)) break
      const frameSize = versionMajor === 4
        ? syncsafeSize(tagData, offset + 4)
        : tagData.readUInt32BE(offset + 4)
      if (frameId === 'APIC' && frameSize > 0) result.hasApic = true
      if ((frameId === 'USLT' || frameId === 'SYLT') && frameSize > 0) result.hasUslt = true
      if (result.hasApic && result.hasUslt) break
      const next = offset + 10 + frameSize
      if (frameSize <= 0 || next > read) break
      offset = next
    }
    return result
  } catch {
    return result
  } finally {
    fs.closeSync(fd)
  }
}

/** @deprecated 使用 scanMp3Id3Frames */
function mp3HasPictureFrame(filePath) {
  return scanMp3Id3Frames(filePath).hasApic
}

/** 轻量检测 FLAC 是否含 PICTURE 元数据块 */
function flacHasPictureBlock(filePath) {
  try {
    const stat = fs.statSync(filePath)
    const readLen = Math.min(stat.size, 512 * 1024)
    const data = Buffer.alloc(readLen)
    const fd = fs.openSync(filePath, 'r')
    try {
      fs.readSync(fd, data, 0, readLen, 0)
    } finally {
      fs.closeSync(fd)
    }
    if (data.slice(0, 4).toString() !== 'fLaC') return false
    const parsed = parseFlacBlocks(data)
    return parsed.blocks.some((b) => b.type === 6 && b.data.length > 0)
  } catch {
    return false
  }
}

/**
 * 同步检测是否含内嵌封面；返回 null 表示需走 music-metadata 回退
 * @returns {boolean | null}
 */
function hasEmbeddedPictureSync(filePath) {
  const ext = filePath.match(/\.[^.]+$/)?.[0]?.toLowerCase() || ''
  if (ext === '.mp3') return mp3HasPictureFrame(filePath)
  if (ext === '.flac') return flacHasPictureBlock(filePath)
  return null
}

async function hasEmbeddedPicture(filePath) {
  const quick = hasEmbeddedPictureSync(filePath)
  if (quick !== null) return quick
  const { parseFile } = await import('music-metadata')
  const metadata = await parseFile(filePath, { duration: false })
  return Boolean(metadata.common.picture?.[0]?.data?.length)
}

function hasExternalLrc(filePath) {
  const lrcPath = filePath.replace(/\.[^.]+$/, '.lrc')
  if (lrcPath === filePath) return false
  try {
    return fs.existsSync(lrcPath) && fs.statSync(lrcPath).size > 0
  } catch {
    return false
  }
}

function parseVorbisCommentBlock(blockData) {
  const tags = {}
  if (!blockData?.length || blockData.length < 8) return tags
  try {
    let offset = 0
    const vendorLen = blockData.readUInt32LE(offset)
    offset += 4 + vendorLen
    if (offset + 4 > blockData.length) return tags
    const count = blockData.readUInt32LE(offset)
    offset += 4
    for (let i = 0; i < count && offset + 4 <= blockData.length; i++) {
      const len = blockData.readUInt32LE(offset)
      offset += 4
      if (len <= 0 || offset + len > blockData.length) break
      const raw = blockData.toString('utf-8', offset, offset + len)
      offset += len
      const eq = raw.indexOf('=')
      if (eq <= 0) continue
      const key = raw.slice(0, eq).toUpperCase()
      const val = raw.slice(eq + 1).trim()
      if (val && !tags[key]) tags[key] = val
    }
  } catch {}
  return tags
}

function readFlacNativeTags(filePath) {
  try {
    const stat = fs.statSync(filePath)
    const readLen = Math.min(stat.size, 1024 * 1024)
    const data = Buffer.alloc(readLen)
    const fd = fs.openSync(filePath, 'r')
    try {
      fs.readSync(fd, data, 0, readLen, 0)
    } finally {
      fs.closeSync(fd)
    }
    if (data.slice(0, 4).toString() !== 'fLaC') return null
    const parsed = parseFlacBlocks(data)
    const commentBlock = parsed.blocks.find(b => b.type === 4)
    const tags = commentBlock ? parseVorbisCommentBlock(commentBlock.data) : {}
    const lyricKeyOrder = ['SYNCEDLYRICS', 'LYRICS', 'LYRIC', 'LRC', 'UNSYNCEDLYRICS', 'DESCRIPTION']
    const rawLyric = lyricKeyOrder.map(k => tags[k]).find(Boolean) || ''
    const lyric = normalizeLyricText(rawLyric)
    return {
      title: normalizeTagText(tags.TITLE),
      artist: normalizeTagText(tags.ARTIST),
      album: normalizeTagText(tags.ALBUM),
      year: normalizeTagText(tags.DATE || tags.YEAR),
      genre: normalizeTagText(tags.GENRE),
      comment: normalizeTagText(tags.COMMENT || tags.DESCRIPTION),
      lyric,
      hasPicture: parsed.blocks.some(b => b.type === 6 && b.data.length > 0),
      hasLyrics: Boolean(lyric) || hasExternalLrc(filePath),
    }
  } catch {
    return null
  }
}

function readMp3NativeTags(filePath) {
  try {
    const tags = NodeID3.read(filePath)
    if (!tags || typeof tags !== 'object') return null
    const unsync = tags.unsynchronisedLyrics
    const lyricText = typeof unsync === 'string' ? unsync : (unsync?.text || '')
    const syncLyric = tags.synchronisedLyrics
    const syncText = typeof syncLyric === 'string' ? syncLyric : (syncLyric?.text || '')
    const lyric = (lyricText || syncText || '').trim()
    const frames = scanMp3Id3Frames(filePath)
    const hasPicture = Boolean(tags.image?.imageBuffer?.length) || frames.hasApic
    const hasLyrics = Boolean(lyric) || frames.hasUslt || hasExternalLrc(filePath)
    return {
      title: normalizeTagText(tags.title),
      artist: normalizeTagText(tags.artist),
      album: normalizeTagText(tags.album),
      year: tags.year != null ? String(tags.year) : '',
      genre: normalizeTagText(tags.genre),
      comment: normalizeTagText(tags.comment?.text || tags.comment),
      lyric,
      hasPicture,
      hasLyrics,
    }
  } catch {
    return null
  }
}

function mergeNativeMeta(base, native, { lite = false } = {}) {
  if (!native) return base
  const pick = (primary, fallback) => (primary || fallback || '')
  const lyric = lite ? (base.lyric || '') : (base.lyric || native.lyric || '')
  return {
    ...base,
    title: pick(base.title, native.title),
    artist: pick(base.artist, native.artist),
    album: pick(base.album, native.album),
    year: base.year || native.year || '',
    genre: pick(base.genre, native.genre),
    comment: pick(base.comment, native.comment),
    lyric,
    hasPicture: Boolean(base.hasPicture || native.hasPicture),
    hasLyrics: Boolean(base.hasLyrics || native.hasLyrics || (!lite && lyric)),
  }
}

function probeLyricText(filePath, metadata) {
  const ext = filePath.match(/\.[^.]+$/)?.[0]?.toLowerCase() || ''
  let lyric = ''
  if (metadata) lyric = extractLyricText(metadata, filePath)
  if (!lyric && ext === '.mp3') {
    try {
      const tags = NodeID3.read(filePath)
      const unsync = tags?.unsynchronisedLyrics
      const text = typeof unsync === 'string' ? unsync : (unsync?.text || '')
      if (text?.trim()) lyric = normalizeLyricText(text)
    } catch {}
  }
  if (ext === '.flac') {
    const native = readFlacNativeTags(filePath)
    lyric = pickBestLyricText(lyric, native?.lyric)
  }
  return lyric
}

async function resolveEmbeddedAssets(base, filePath, metadata, { lite = false } = {}) {
  if (lite) {
    if (!base.hasPicture) {
      try { base.hasPicture = await hasEmbeddedPicture(filePath) } catch {}
    }
    if (!base.hasLyrics) {
      if (metadata) {
        const flags = detectEmbeddedFlagsLite(metadata, filePath)
        base.hasLyrics = flags.hasLyrics
      }
      if (!base.hasLyrics) base.hasLyrics = hasExternalLrc(filePath)
    }
    base.lyric = ''
    base.pictureBase64 = ''
    base.pictureMime = ''
    return
  }

  const lyricText = base.lyric?.trim() || probeLyricText(filePath, metadata)
  base.hasLyrics = Boolean(base.hasLyrics || lyricText || hasExternalLrc(filePath))
  if (!lite && lyricText) base.lyric = lyricText

  if (!base.hasPicture) {
    try { base.hasPicture = await hasEmbeddedPicture(filePath) } catch {}
  }
  if (!base.hasPicture || (!lite && !base.pictureBase64)) {
    try {
      const cover = await readEmbeddedCover(filePath)
      if (cover?.buffer?.length) {
        base.hasPicture = true
        if (!lite) {
          base.pictureMime = cover.mime
          base.pictureBase64 = `data:${cover.mime};base64,${cover.buffer.toString('base64')}`
        }
      }
    } catch {}
  }
}

function readNativeTags(filePath) {
  const ext = filePath.match(/\.[^.]+$/)?.[0]?.toLowerCase() || ''
  if (ext === '.mp3') return readMp3NativeTags(filePath)
  if (ext === '.flac') return readFlacNativeTags(filePath)
  return null
}

async function parseFileWithRetry(filePath, options = {}, retries = 2) {
  const { parseFile } = await import('music-metadata')
  let lastErr = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await parseFile(filePath, options)
    } catch (e) {
      lastErr = e
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 80 * (attempt + 1)))
      }
    }
  }
  throw lastErr
}

function buildMetaFromParsed(metadata, filePath, { includeContent = false } = {}) {
  const lyric = includeContent ? extractLyricText(metadata, filePath) : ''
  const { pictureBase64, pictureMime } = includeContent ? extractPicture(metadata) : { pictureBase64: '', pictureMime: '' }
  const pic = metadata.common.picture?.[0]
  const flags = detectEmbeddedFlagsLite(metadata, filePath)
  let hasPicture = flags.hasPicture
  if (!hasPicture && includeContent) hasPicture = Boolean(pic?.data?.length)

  return {
    title: metadata.common.title || '',
    artist: metadata.common.artist || '',
    album: metadata.common.album || '',
    year: metadata.common.year || '',
    genre: metadata.common.genre?.[0] || '',
    comment: extractCommentText(metadata.common.comment),
    track: metadata.common.track?.no || '',
    duration: metadata.format.duration || 0,
    bitrate: metadata.format.bitrate || 0,
    sampleRate: metadata.format.sampleRate || 0,
    bitsPerSample: metadata.format.bitsPerSample || 0,
    format: formatFromPath(filePath, metadata.format.container),
    hasPicture,
    hasLyrics: includeContent ? Boolean(lyric) : flags.hasLyrics,
    lyric,
    pictureBase64,
    pictureMime,
  }
}

function buildEmptyMeta(filePath) {
  return {
    title: '',
    artist: '',
    album: '',
    year: '',
    genre: '',
    comment: '',
    track: '',
    duration: 0,
    bitrate: 0,
    sampleRate: 0,
    bitsPerSample: 0,
    format: formatFromPath(filePath, ''),
    hasPicture: false,
    hasLyrics: false,
    lyric: '',
    pictureBase64: '',
    pictureMime: '',
  }
}

async function readMetaCore(filePath, { lite = false } = {}) {
  const ext = filePath.match(/\.[^.]+$/)?.[0]?.toLowerCase() || ''
  let base = buildEmptyMeta(filePath)
  let metadata = null
  let native = null

  try {
    metadata = await parseFileWithRetry(filePath, {
      skipCovers: lite,
      duration: true,
    })
    base = buildMetaFromParsed(metadata, filePath, { includeContent: !lite })
  } catch {
    // music-metadata 失败时走原生解析回退
  }

  if (ext === '.mp3' || ext === '.flac') {
    native = readNativeTags(filePath)
    base = mergeNativeMeta(base, native, { lite })
  }

  await resolveEmbeddedAssets(base, filePath, metadata, { lite })

  const keepAlbumSameAsTitle = Boolean(native?.album) || Boolean(metadata?.common?.album)
  const result = normalizeMetaFields(base, { keepAlbumSameAsTitle })
  if (lite) {
    result.lyric = ''
    result.pictureBase64 = ''
    result.pictureMime = ''
  }
  return result
}

function detectEmbeddedFlagsLite(metadata, filePath) {
  const ext = filePath.match(/\.[^.]+$/)?.[0]?.toLowerCase() || ''
  let hasPicture = Boolean(metadata.common.picture?.length)
  let hasLyrics = Boolean(metadata.common.lyrics?.length)

  if (ext === '.mp3') {
    const frames = scanMp3Id3Frames(filePath)
    hasPicture = hasPicture || frames.hasApic
    hasLyrics = hasLyrics || frames.hasUslt
    const native = readMp3NativeTags(filePath)
    if (native) {
      hasPicture = hasPicture || native.hasPicture
      hasLyrics = hasLyrics || native.hasLyrics
    }
  } else if (ext === '.flac') {
    hasPicture = hasPicture || flacHasPictureBlock(filePath)
    const native = readFlacNativeTags(filePath)
    if (native) {
      hasPicture = hasPicture || native.hasPicture
      hasLyrics = hasLyrics || native.hasLyrics
    }
  }

  if (!hasLyrics) hasLyrics = hasExternalLrc(filePath)
  return { hasPicture, hasLyrics }
}

function extractPicture(metadata) {
  const pic = metadata.common.picture?.[0]
  if (!pic?.data?.length) return { pictureBase64: '', pictureMime: '' }
  const picBuffer = Buffer.isBuffer(pic.data) ? pic.data : Buffer.from(pic.data)
  const pictureMime = pic.format || detectImageMime(picBuffer)
  return {
    pictureMime,
    pictureBase64: `data:${pictureMime};base64,${picBuffer.toString('base64')}`,
    buffer: picBuffer,
  }
}

/** 读取内嵌封面（用于 /api/tag/cover） */
export async function readEmbeddedCover(filePath) {
  try {
    const { parseFile } = await import('music-metadata')
    const metadata = await parseFileWithRetry(filePath, { duration: false })
    const extracted = extractPicture(metadata)
    if (extracted.buffer?.length) {
      return {
        buffer: extracted.buffer,
        mime: extracted.pictureMime || 'image/jpeg',
      }
    }
  } catch {}

  const ext = filePath.match(/\.[^.]+$/)?.[0]?.toLowerCase() || ''
  if (ext === '.mp3') {
    try {
      const tags = NodeID3.read(filePath)
      const buf = tags?.image?.imageBuffer
      if (buf?.length) {
        const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
        return { buffer, mime: detectImageMime(buffer) }
      }
    } catch {}
  }

  if (ext === '.flac') {
    try {
      const stat = fs.statSync(filePath)
      const readLen = Math.min(stat.size, 1024 * 1024)
      const data = Buffer.alloc(readLen)
      const fd = fs.openSync(filePath, 'r')
      try { fs.readSync(fd, data, 0, readLen, 0) } finally { fs.closeSync(fd) }
      const parsed = parseFlacBlocks(data)
      const picBlock = parsed.blocks.find(b => b.type === 6 && b.data.length > 32)
      if (picBlock) {
        const block = picBlock.data
        let off = 4
        const mimeLen = block.readUInt32BE(off); off += 4 + mimeLen
        const descLen = block.readUInt32BE(off); off += 4 + descLen
        off += 16
        if (off + 4 <= block.length) {
          const picLen = block.readUInt32BE(off); off += 4
          if (picLen > 0 && off + picLen <= block.length) {
            const buffer = block.slice(off, off + picLen)
            if (buffer.length) return { buffer, mime: detectImageMime(buffer) }
          }
        }
      }
    } catch {}
  }

  return null
}

/** 列表视图用的轻量读取：跳过封面/歌词内容，但会检测是否含内嵌封面与歌词 */
export async function readMetaLite(filePath) {
  return readMetaCore(filePath, { lite: true })
}

export async function readMeta(filePath) {
  return readMetaCore(filePath, { lite: false })
}

export async function batchWriteMeta(files) {
  const results = []
  for (const f of files) {
    try {
      const ext = f.filePath.match(/\.[^.]+$/)?.[0]?.toLowerCase() || ''
      await writeMeta(f.filePath, ext, f.meta)
      results.push({ filePath: f.filePath, ok: true })
    } catch (e) {
      results.push({ filePath: f.filePath, ok: false, error: e.message })
    }
  }
  return results
}
