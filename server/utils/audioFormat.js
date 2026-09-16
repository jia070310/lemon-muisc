import fs from 'fs'

/** 需要真实无损容器的音质（禁止用 MP3 冒充） */
export function isLosslessQuality(quality) {
  const q = String(quality || '').toLowerCase()
  return q.includes('flac')
    || q.includes('hires')
    || q.includes('master')
    || q.includes('atmos')
}

export function createFakeLosslessError(detail = '') {
  const hint = detail ? `（${String(detail).slice(0, 120)}）` : ''
  const err = new Error(`音源返回了假无损文件${hint}，已拒绝保存`)
  err.code = 'FAKE_LOSSLESS'
  return err
}

/**
 * 读取文件头判断容器类型（不解析完整元数据）
 * @returns {'flac'|'mp3'|'ogg'|'wav'|'m4a'|'unknown'}
 */
export function detectAudioContainer(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return 'unknown'
  const buf = Buffer.alloc(256)
  let n = 0
  try {
    const fd = fs.openSync(filePath, 'r')
    try {
      n = fs.readSync(fd, buf, 0, buf.length, 0)
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return 'unknown'
  }
  if (n < 4) return 'unknown'

  return detectAudioContainerFromBuffer(buf.subarray(0, n))
}

/**
 * 从缓冲区识别容器。部分音源会在 FLAC 前塞 ID3，需跳过后再认 fLaC。
 * @returns {'flac'|'mp3'|'ogg'|'wav'|'m4a'|'ape'|'unknown'}
 */
export function detectAudioContainerFromBuffer(buf) {
  if (!buf || buf.length < 4) return 'unknown'

  let offset = 0
  // ID3v2：跳过标签再判（否则带标签的真 FLAC 会被误判成 MP3）
  if (buf.slice(0, 3).toString('ascii') === 'ID3' && buf.length >= 10) {
    const size = ((buf[6] & 0x7f) << 21)
      | ((buf[7] & 0x7f) << 14)
      | ((buf[8] & 0x7f) << 7)
      | (buf[9] & 0x7f)
    const next = 10 + size
    if (next > 0 && next < buf.length) offset = next
  }

  const slice = (start, len) => buf.slice(offset + start, offset + start + len)
  const head = slice(0, 4)
  if (head.length < 4) {
    // 只有 ID3、后面读不到：按 mp3 处理
    if (offset > 0) return 'mp3'
    return 'unknown'
  }

  if (head.toString('ascii') === 'fLaC') return 'flac'
  if (head.toString('ascii') === 'OggS') return 'ogg'
  if (head.toString('ascii') === 'RIFF' && buf.length >= offset + 12 && slice(8, 4).toString('ascii') === 'WAVE') {
    return 'wav'
  }
  if (head.toString('ascii') === 'MAC ') return 'ape'
  if (slice(0, 3).toString('ascii') === 'ID3') return 'mp3'
  // MPEG frame sync
  if (buf[offset] === 0xff && (buf[offset + 1] & 0xe0) === 0xe0) return 'mp3'
  // ISO BMFF (m4a/mp4): ....ftyp
  if (buf.length >= offset + 8 && slice(4, 4).toString('ascii') === 'ftyp') return 'm4a'
  return 'unknown'
}

/**
 * 无损音质落盘后校验：必须是真实 FLAC（或明显的无损容器）。
 * QQ 等音源偶发返回「假 flac」（实为 MP3）却带 .flac 后缀。
 */
export function assertLosslessFile(filePath, quality) {
  if (!isLosslessQuality(quality)) return

  const kind = detectAudioContainer(filePath)
  if (kind === 'flac') {
    // 时长较长却极小：常见假文件/截断（可选加固）
    try {
      const size = fs.statSync(filePath).size
      if (size > 0 && size < 256 * 1024) {
        throw createFakeLosslessError(`文件过小 ${Math.round(size / 1024)}KB，不像完整 FLAC`)
      }
    } catch (e) {
      if (e?.code === 'FAKE_LOSSLESS') throw e
    }
    return
  }

  if (kind === 'mp3') {
    throw createFakeLosslessError('文件头为 MP3/ID3，不是 FLAC')
  }
  if (kind === 'm4a') {
    throw createFakeLosslessError('文件头为 M4A/MP4，不是 FLAC')
  }
  if (kind === 'ogg' || kind === 'wav') {
    // 少数音源用其它无损封装；若用户点的是 flac 档，仍视为不符
    throw createFakeLosslessError(`文件头为 ${kind.toUpperCase()}，不是 FLAC`)
  }
  throw createFakeLosslessError('无法识别为有效 FLAC')
}

/**
 * 响应头粗检：只拦明显不是音频的错误页。
 * 国内 CDN 常把真实 FLAC 标成 audio/mpeg / octet-stream，不能据此判假无损；
 * 真假无损一律等落盘后用 assertLosslessFile 看文件头。
 */
export function assertLosslessContentType(contentType, quality) {
  if (!isLosslessQuality(quality)) return
  const ct = String(contentType || '').toLowerCase().split(';')[0].trim()
  if (!ct) return
  if (/^(text\/|application\/(json|xml|javascript)|image\/)/.test(ct)) {
    throw createFakeLosslessError(`Content-Type=${ct}（像是错误页而非音频）`)
  }
}
