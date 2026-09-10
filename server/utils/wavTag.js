import fs from 'fs'
import NodeID3 from 'node-id3'
import { detectImageMime } from './fetchPic.js'
import { normalizeArtistForWrite } from './artistTag.js'

/**
 * 写入 WAV 标签：RIFF INFO（标题/歌手等）+ 可选 id3 块（歌词/封面）
 * 使用原子替换，避免半写入损坏文件。
 */
export function writeWavMeta(filePath, meta, { decodePicInput, atomicReplaceFile } = {}) {
  const data = fs.readFileSync(filePath)
  if (data.length < 12 || data.slice(0, 4).toString('ascii') !== 'RIFF' || data.slice(8, 12).toString('ascii') !== 'WAVE') {
    throw new Error('不是有效的 WAV 文件')
  }

  const chunks = parseRiffChunks(data)
  if (!chunks.find((c) => c.id === 'fmt ' || c.id === 'data')) {
    throw new Error('WAV 缺少必要音频块，已取消写入')
  }

  const infoMap = readInfoMap(chunks)
  applyInfoField(infoMap, 'INAM', meta.title)
  if (meta.artist !== undefined) {
    applyInfoField(infoMap, 'IART', normalizeArtistForWrite(meta.artist).display)
  }
  applyInfoField(infoMap, 'IPRD', meta.album)
  applyInfoField(infoMap, 'ICRD', meta.year != null ? String(meta.year) : undefined)
  applyInfoField(infoMap, 'IGNR', meta.genre)
  applyInfoField(infoMap, 'ICMT', meta.comment)

  const keepChunks = chunks.filter((c) => c.id !== 'LIST' || c.listType !== 'INFO')
  // 去掉旧 id3，后面按需重建
  const withoutId3 = keepChunks.filter((c) => c.id !== 'id3 ' && c.id !== 'ID3 ')

  const picBuf = decodePicInput ? decodePicInput(meta.pic) : null
  const clearPic = meta.clearPicture === true || meta.pic === ''
  const wantId3 = meta.lyric != null || picBuf || clearPic || meta.title != null || meta.artist != null
    || meta.album != null || meta.year != null || meta.genre != null

  let id3Chunk = null
  if (wantId3) {
    id3Chunk = buildWavId3Chunk(meta, picBuf, clearPic)
  }

  const infoChunk = buildInfoListChunk(infoMap)
  const ordered = []
  let insertedInfo = false
  for (const c of withoutId3) {
    if (!insertedInfo && (c.id === 'data' || c.id === 'fmt ')) {
      if (infoChunk) ordered.push(infoChunk)
      insertedInfo = true
    }
    ordered.push(c)
  }
  if (!insertedInfo && infoChunk) ordered.push(infoChunk)
  if (id3Chunk) ordered.push(id3Chunk)

  const rebuilt = rebuildRiffWave(ordered)
  if (atomicReplaceFile) atomicReplaceFile(filePath, rebuilt)
  else {
    const tmp = `${filePath}.lemon-wav-tmp`
    fs.writeFileSync(tmp, rebuilt)
    fs.renameSync(tmp, filePath)
  }
}

function applyInfoField(map, key, value) {
  if (value === undefined) return
  const text = value == null ? '' : String(value)
  if (!text) delete map[key]
  else map[key] = text
}

function parseRiffChunks(data) {
  const chunks = []
  let offset = 12
  while (offset + 8 <= data.length) {
    const id = data.slice(offset, offset + 4).toString('ascii')
    const size = data.readUInt32LE(offset + 4)
    const start = offset + 8
    const end = start + size
    if (end > data.length) break
    const body = data.slice(start, end)
    const chunk = { id, size, body, raw: data.slice(offset, end + (size % 2)) }
    if (id === 'LIST' && body.length >= 4) {
      chunk.listType = body.slice(0, 4).toString('ascii')
    }
    chunks.push(chunk)
    offset = end + (size % 2)
  }
  return chunks
}

function readInfoMap(chunks) {
  const map = {}
  for (const c of chunks) {
    if (c.id !== 'LIST' || c.listType !== 'INFO') continue
    let off = 4
    const body = c.body
    while (off + 8 <= body.length) {
      const key = body.slice(off, off + 4).toString('ascii')
      const size = body.readUInt32LE(off + 4)
      const start = off + 8
      const end = start + size
      if (end > body.length) break
      let text = body.slice(start, end).toString('utf8')
      const z = text.indexOf('\0')
      if (z >= 0) text = text.slice(0, z)
      map[key] = text
      off = end + (size % 2)
    }
  }
  return map
}

function buildInfoListChunk(infoMap) {
  const entries = Object.entries(infoMap).filter(([, v]) => v != null && String(v).length)
  if (!entries.length) return null
  const parts = [Buffer.from('INFO', 'ascii')]
  for (const [key, value] of entries) {
    const text = Buffer.from(String(value), 'utf8')
    const payload = Buffer.concat([text, Buffer.alloc(1)]) // NUL
    const size = payload.length
    const header = Buffer.alloc(8)
    header.write(key.slice(0, 4).padEnd(4, ' '), 0, 4, 'ascii')
    header.writeUInt32LE(size, 4)
    parts.push(header, payload)
    if (size % 2) parts.push(Buffer.alloc(1))
  }
  const body = Buffer.concat(parts)
  const header = Buffer.alloc(8)
  header.write('LIST', 0, 4, 'ascii')
  header.writeUInt32LE(body.length, 4)
  const pad = body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)
  return { id: 'LIST', size: body.length, body, listType: 'INFO', raw: Buffer.concat([header, body, pad]) }
}

function buildWavId3Chunk(meta, picBuf, clearPic) {
  const tags = {}
  if (meta.title != null) tags.title = meta.title
  if (meta.artist != null) tags.artist = normalizeArtistForWrite(meta.artist).display
  if (meta.album != null) tags.album = meta.album
  if (meta.year != null) tags.year = String(meta.year)
  if (meta.genre != null) tags.genre = meta.genre
  if (meta.comment != null) tags.comment = { text: meta.comment }
  if (meta.lyric != null) {
    tags.unsynchronisedLyrics = { language: 'chi', text: meta.lyric }
  }
  if (picBuf) {
    tags.image = {
      mime: detectImageMime(picBuf),
      type: { id: 3, name: 'front cover' },
      description: 'Cover',
      imageBuffer: picBuf,
    }
  }
  // clearPic：写入空图不会清干净，省略 image 字段即可；新建 id3 块不含封面
  if (clearPic && !picBuf) {
    // leave without image
  }

  const id3 = NodeID3.create(tags)
  if (!id3?.length) return null
  const header = Buffer.alloc(8)
  header.write('id3 ', 0, 4, 'ascii')
  header.writeUInt32LE(id3.length, 4)
  const pad = id3.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)
  return { id: 'id3 ', size: id3.length, body: id3, raw: Buffer.concat([header, id3, pad]) }
}

function rebuildRiffWave(chunks) {
  const bodies = chunks.map((c) => c.raw || (() => {
    const header = Buffer.alloc(8)
    header.write(c.id, 0, 4, 'ascii')
    header.writeUInt32LE(c.body.length, 4)
    const pad = c.body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)
    return Buffer.concat([header, c.body, pad])
  })())
  const content = Buffer.concat(bodies)
  const out = Buffer.alloc(12 + content.length)
  out.write('RIFF', 0, 4, 'ascii')
  out.writeUInt32LE(4 + content.length, 4)
  out.write('WAVE', 8, 4, 'ascii')
  content.copy(out, 12)
  return out
}
