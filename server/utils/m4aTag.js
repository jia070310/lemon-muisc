/**
 * M4A / MP4 / M4B 标签写入（依赖 ffmpeg）。
 * 浏览器与多数播放器认 iTunes ilst 原子；纯 JS 改 MP4 易损坏，故走 ffmpeg -c copy。
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn } from 'child_process'
import { assertFfmpegFeatureReady } from './apePlay.js'
import { detectImageMime } from './fetchPic.js'
import { normalizeArtistForWrite } from './artistTag.js'

export const M4A_WRITE_EXTS = new Set(['.m4a', '.mp4', '.m4b', '.aac'])

export function canWriteM4aExt(ext) {
  return M4A_WRITE_EXTS.has(String(ext || '').toLowerCase())
}

function escapeFfmeta(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\\n')
    .replace(/=/g, '\\=')
    .replace(/;/g, '\\;')
    .replace(/#/g, '\\#')
}

function putFfmeta(lines, key, value) {
  if (value === undefined) return
  if (value == null || value === '') {
    lines.push(`${key}=`)
    return
  }
  lines.push(`${key}=${escapeFfmeta(String(value))}`)
}

async function readExistingCommon(filePath) {
  try {
    const { parseFile } = await import('music-metadata')
    const mm = await parseFile(filePath, { duration: false, skipCovers: true })
    const c = mm?.common || {}
    const lyric = Array.isArray(c.lyrics)
      ? (c.lyrics.map((x) => (typeof x === 'string' ? x : x?.text || '')).filter(Boolean).join('\n') || '')
      : (typeof c.lyrics === 'string' ? c.lyrics : '')
    return {
      title: c.title || '',
      artist: Array.isArray(c.artists) ? c.artists.join(' / ') : (c.artist || ''),
      albumArtist: Array.isArray(c.albumartists) ? c.albumartists.join(' / ') : (c.albumartist || ''),
      album: c.album || '',
      year: c.year ? String(c.year) : '',
      genre: Array.isArray(c.genre) ? (c.genre[0] || '') : (c.genre || ''),
      comment: Array.isArray(c.comment)
        ? (c.comment.map((x) => (typeof x === 'string' ? x : x?.text || '')).filter(Boolean).join('\n') || '')
        : (typeof c.comment === 'string' ? c.comment : ''),
      lyric,
    }
  } catch {
    return {
      title: '', artist: '', albumArtist: '', album: '', year: '', genre: '', comment: '', lyric: '',
    }
  }
}

function mergeField(incoming, existing) {
  if (incoming === undefined) return existing
  if (incoming == null) return ''
  return String(incoming)
}

function buildFfmetadataFile(merged) {
  const lines = [';FFMETADATA1']
  putFfmeta(lines, 'title', merged.title)
  putFfmeta(lines, 'artist', merged.artist)
  putFfmeta(lines, 'album_artist', merged.albumArtist)
  putFfmeta(lines, 'album', merged.album)
  putFfmeta(lines, 'date', merged.year)
  putFfmeta(lines, 'genre', merged.genre)
  putFfmeta(lines, 'comment', merged.comment)
  putFfmeta(lines, 'lyrics', merged.lyric)
  return `${lines.join('\n')}\n`
}

function runFfmpeg(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
    let err = ''
    child.stderr?.on('data', (d) => {
      err += d.toString()
      if (err.length > 6000) err = err.slice(-6000)
    })
    child.on('error', (e) => reject(e))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else {
        const tip = err.split('\n').filter(Boolean).slice(-3).join(' ')
        reject(new Error(`ffmpeg 写入 M4A 标签失败${tip ? `：${tip}` : ''}`))
      }
    })
  })
}

function coverExtFromMime(mime) {
  if (/png/i.test(mime || '')) return '.png'
  if (/webp/i.test(mime || '')) return '.webp'
  if (/gif/i.test(mime || '')) return '.gif'
  return '.jpg'
}

/**
 * @param {string} filePath
 * @param {object} meta
 * @param {{ decodePicInput?: Function }} [helpers]
 */
export async function writeM4aMeta(filePath, meta, { decodePicInput } = {}) {
  const ffmpeg = await assertFfmpegFeatureReady('写入 M4A/MP4 标签')
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) throw new Error('文件不存在')

  const existing = await readExistingCommon(resolved)
  const merged = {
    title: mergeField(meta.title, existing.title),
    artist: meta.artist !== undefined
      ? normalizeArtistForWrite(meta.artist).display
      : existing.artist,
    albumArtist: meta.albumArtist !== undefined
      ? normalizeArtistForWrite(meta.albumArtist).display
      : existing.albumArtist,
    album: mergeField(meta.album, existing.album),
    year: meta.year !== undefined ? (meta.year == null ? '' : String(meta.year)) : existing.year,
    genre: mergeField(meta.genre, existing.genre),
    comment: mergeField(meta.comment, existing.comment),
    lyric: mergeField(meta.lyric, existing.lyric),
  }

  const picBuf = decodePicInput ? decodePicInput(meta.pic) : null
  const clearPic = meta.clearPicture === true || meta.pic === ''

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lemon-m4a-tag-'))
  const ext = path.extname(resolved) || '.m4a'
  const metaFile = path.join(tmpDir, 'ffmeta.txt')
  const outFile = path.join(tmpDir, `out${ext}`)
  let coverFile = ''

  try {
    fs.writeFileSync(metaFile, buildFfmetadataFile(merged), 'utf8')

    const args = ['-y', '-i', resolved]
    if (picBuf?.length) {
      const mime = detectImageMime(picBuf)
      coverFile = path.join(tmpDir, `cover${coverExtFromMime(mime)}`)
      fs.writeFileSync(coverFile, picBuf)
      args.push('-i', coverFile, '-i', metaFile)
      // 0=原音频(+可能旧封面) 1=新封面 2=文本元数据；只保留音轨 + 新封面
      args.push(
        '-map', '0:a',
        '-map', '1',
        '-map_metadata', '2',
        '-c', 'copy',
        '-disposition:v:0', 'attached_pic',
      )
    } else if (clearPic) {
      args.push('-i', metaFile)
      args.push('-map', '0:a', '-map_metadata', '1', '-c', 'copy')
    } else {
      args.push('-i', metaFile)
      // 保留原流（含已有封面），只替换元数据
      args.push('-map', '0', '-map_metadata', '1', '-c', 'copy')
    }

    args.push('-movflags', '+faststart', outFile)
    await runFfmpeg(ffmpeg, args)

    const st = fs.statSync(outFile)
    if (!st.size) throw new Error('写入结果为空，已取消替换以免损坏文件')

    const bak = `${resolved}.lemon-m4a-bak`
    try {
      fs.copyFileSync(resolved, bak)
    } catch {}
    try {
      fs.copyFileSync(outFile, resolved)
      try { fs.unlinkSync(bak) } catch {}
    } catch (e) {
      try {
        if (fs.existsSync(bak)) fs.copyFileSync(bak, resolved)
      } catch {}
      throw e
    }
  } finally {
    try {
      for (const name of fs.readdirSync(tmpDir)) {
        try { fs.unlinkSync(path.join(tmpDir, name)) } catch {}
      }
      fs.rmdirSync(tmpDir)
    } catch {}
  }
}
