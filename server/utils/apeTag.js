import fs from 'fs'
import { normalizeArtistForWrite } from './artistTag.js'

const APE_PREAMBLE = Buffer.from('APETAGEX', 'ascii')
const APE_VERSION = 2000
/** Item contains binary information */
const FLAG_BINARY = 0x02
/** Tag contains a header */
const FLAG_HAS_HEADER = 0x80000000
/** This is the header (not footer) */
const FLAG_IS_HEADER = 0x20000000

/**
 * 写入 Monkey's Audio (.ape) 的 APEv2 标签（封面/歌词/基础字段）
 */
export function writeApeMeta(filePath, meta, { decodePicInput, atomicReplaceFile } = {}) {
  const original = fs.readFileSync(filePath)
  const audio = stripTrailingTags(original)
  if (audio.length < 16) throw new Error('不是有效的 APE 文件')

  const existing = readApeItems(original)
  const items = { ...existing }

  applyText(items, 'Title', meta.title)
  if (meta.artist !== undefined) {
    applyText(items, 'Artist', normalizeArtistForWrite(meta.artist).display)
  }
  applyText(items, 'Album', meta.album)
  applyText(items, 'Year', meta.year != null ? String(meta.year) : undefined)
  applyText(items, 'Genre', meta.genre)
  applyText(items, 'Comment', meta.comment)
  applyText(items, 'Lyrics', meta.lyric)

  const picBuf = decodePicInput ? decodePicInput(meta.pic) : null
  const clearPic = meta.clearPicture === true || meta.pic === ''
  if (clearPic && !picBuf) {
    delete items['Cover Art (Front)']
  } else if (picBuf) {
    const desc = Buffer.from('Cover\0', 'utf8')
    items['Cover Art (Front)'] = {
      flags: FLAG_BINARY,
      value: Buffer.concat([desc, picBuf]),
    }
  }

  const tagBody = buildApeTag(items)
  const rebuilt = Buffer.concat([audio, tagBody])
  if (atomicReplaceFile) atomicReplaceFile(filePath, rebuilt)
  else {
    const tmp = `${filePath}.lemon-ape-tmp`
    fs.writeFileSync(tmp, rebuilt)
    fs.renameSync(tmp, filePath)
  }
}

function applyText(items, key, value) {
  if (value === undefined) return
  const text = value == null ? '' : String(value)
  if (!text) delete items[key]
  else items[key] = { flags: 0, value: Buffer.from(text, 'utf8') }
}

function stripTrailingTags(buf) {
  let end = buf.length
  // ID3v1
  if (end >= 128 && buf.slice(end - 128, end - 125).toString('ascii') === 'TAG') {
    end -= 128
  }
  // APEv2 footer
  if (end >= 32) {
    const foot = buf.slice(end - 32, end)
    if (foot.slice(0, 8).equals(APE_PREAMBLE)) {
      const tagSize = foot.readUInt32LE(12) // includes footer, excludes header
      const flags = foot.readUInt32LE(20)
      let start = end - tagSize
      if (flags & FLAG_HAS_HEADER) start -= 32
      if (start >= 0) end = start
    }
  }
  // Leading APEv2 header (rare) — leave audio start alone; only strip trailing
  return buf.slice(0, end)
}

function readApeItems(buf) {
  const items = {}
  let end = buf.length
  if (end >= 128 && buf.slice(end - 128, end - 125).toString('ascii') === 'TAG') end -= 128
  if (end < 32) return items
  const foot = buf.slice(end - 32, end)
  if (!foot.slice(0, 8).equals(APE_PREAMBLE)) return items
  const tagSize = foot.readUInt32LE(12)
  const itemCount = foot.readUInt32LE(16)
  const flags = foot.readUInt32LE(20)
  let start = end - tagSize
  if (flags & FLAG_HAS_HEADER) start -= 32
  if (start < 0 || start >= end) return items

  // items region: after optional header, before footer
  let off = start
  if (buf.slice(off, off + 8).equals(APE_PREAMBLE)) off += 32
  const itemsEnd = end - 32
  for (let i = 0; i < itemCount && off + 8 < itemsEnd; i++) {
    const valueSize = buf.readUInt32LE(off); off += 4
    const itemFlags = buf.readUInt32LE(off); off += 4
    let keyEnd = off
    while (keyEnd < itemsEnd && buf[keyEnd] !== 0) keyEnd++
    if (keyEnd >= itemsEnd) break
    const key = buf.slice(off, keyEnd).toString('utf8')
    off = keyEnd + 1
    if (off + valueSize > itemsEnd) break
    const value = Buffer.from(buf.slice(off, off + valueSize))
    off += valueSize
    items[key] = { flags: itemFlags, value }
  }
  return items
}

function buildApeTag(itemsMap) {
  const entries = Object.entries(itemsMap)
  const parts = []
  for (const [key, item] of entries) {
    const keyBuf = Buffer.from(key, 'utf8')
    const value = Buffer.isBuffer(item.value) ? item.value : Buffer.from(String(item.value || ''), 'utf8')
    const header = Buffer.alloc(8)
    header.writeUInt32LE(value.length, 0)
    header.writeUInt32LE((item.flags || 0) >>> 0, 4)
    parts.push(header, keyBuf, Buffer.alloc(1), value)
  }
  const itemsBuf = Buffer.concat(parts)
  // tag size = items + footer；不写 header，兼容性更好（多数播放器从文件尾读 footer）
  const tagSize = itemsBuf.length + 32
  const footer = Buffer.alloc(32)
  APE_PREAMBLE.copy(footer, 0)
  footer.writeUInt32LE(APE_VERSION, 8)
  footer.writeUInt32LE(tagSize, 12)
  footer.writeUInt32LE(entries.length, 16)
  footer.writeUInt32LE(0, 20) // no header

  return Buffer.concat([itemsBuf, footer])
}
