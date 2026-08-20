import NodeID3 from 'node-id3'
import fs from 'fs'
import { detectImageMime } from './utils/fetchPic.js'

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
  if (typeof c === 'string') return c
  return c?.text || ''
}

function extractLyricText(metadata, filePath) {
  const parts = []
  for (const item of metadata.common.lyrics || []) {
    if (typeof item === 'string') parts.push(item)
    else if (item?.text) parts.push(item.text)
  }
  let lyric = parts.join('\n').trim()

  if (!lyric && filePath.toLowerCase().endsWith('.mp3')) {
    try {
      const tags = NodeID3.read(filePath)
      const unsync = tags?.unsynchronisedLyrics
      if (typeof unsync === 'string') lyric = unsync
      else if (unsync?.text) lyric = unsync.text
    } catch {}
  }

  // 尝试读取同目录下的 .lrc 文件
  if (!lyric) {
    const lrcPath = filePath.replace(/\.[^.]+$/, '.lrc')
    if (lrcPath !== filePath && fs.existsSync(lrcPath)) {
      try { lyric = fs.readFileSync(lrcPath, 'utf-8').trim() } catch {}
    }
  }

  return lyric
}

function extractPicture(metadata) {
  const pic = metadata.common.picture?.[0]
  if (!pic?.data?.length) return { pictureBase64: '', pictureMime: '' }
  const pictureMime = pic.format || detectImageMime(pic.data)
  return {
    pictureMime,
    pictureBase64: `data:${pictureMime};base64,${pic.data.toString('base64')}`,
  }
}

/** 列表视图用的轻量读取：跳过封面/歌词内容，显著加快大目录扫描 */
export async function readMetaLite(filePath) {
  const { parseFile } = await import('music-metadata')
  const metadata = await parseFile(filePath, { skipCovers: true, duration: true })

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
    format: metadata.format.container || '',
    hasPicture: Boolean(metadata.common.picture?.length),
    hasLyrics: Boolean(metadata.common.lyrics?.length),
    lyric: '',
    pictureBase64: '',
    pictureMime: '',
  }
}

export async function readMeta(filePath) {
  const { parseFile } = await import('music-metadata')
  const metadata = await parseFile(filePath)

  const lyric = extractLyricText(metadata, filePath)
  const { pictureBase64, pictureMime } = extractPicture(metadata)
  const pic = metadata.common.picture?.[0]

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
    format: metadata.format.container || '',
    hasPicture: Boolean(pic?.data?.length),
    hasLyrics: Boolean(lyric),
    lyric,
    pictureBase64,
    pictureMime,
  }
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
