/**
 * 试听片段 / 不完整音轨检测
 * 试听源返回的音频「总时长」本身常为 10–30 秒，可据此在落盘前拦截。
 */
import needle from 'needle'

export function parseDurationSeconds(value) {
  if (value == null || value === '') return 0
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) return 0
    // 大于 10000 多半是毫秒
    return value > 10000 ? value / 1000 : value
  }
  const str = String(value).trim()
  if (!str) return 0
  if (/^\d+(\.\d+)?$/.test(str)) {
    const n = Number(str)
    if (!Number.isFinite(n) || n <= 0) return 0
    return n > 10000 ? n / 1000 : n
  }
  const parts = str.split(':').map((p) => Number(p))
  if (!parts.length || parts.some((p) => !Number.isFinite(p))) return 0
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}

/**
 * @param {number} actualSec 音源/文件给出的总时长
 * @param {number} expectedSec 曲目录入的完整时长（搜索结果等）
 * @param {{ absoluteShort?: boolean }} [opts] absoluteShort：下载场景下，音源总时长本身很短也视为试听
 * @returns {{ isPreview: true, actualSec: number, expectedSec: number } | null}
 */
export function detectPreviewClip(actualSec, expectedSec, opts = {}) {
  const actual = Number(actualSec) || 0
  const expected = Number(expectedSec) || 0
  if (actual <= 0) return null

  // 已知完整时长：实际明显偏短
  if (expected >= 90) {
    if (actual <= 60 && actual < expected * 0.45) {
      return pack(actual, expected)
    }
  } else if (expected >= 60) {
    if (actual <= 40 && actual < expected * 0.5) {
      return pack(actual, expected)
    }
  }

  // 下载：音源给出的「总时长」本身就只有十多秒（常见 VIP 试听）
  // 完整曲目搜索时长缺失或也被标成短时长时，仍拦截半分钟内的资源
  if (opts.absoluteShort && actual > 0 && actual <= 35) {
    if (!expected || expected <= 45 || actual < expected * 0.5) {
      return pack(actual, expected)
    }
  }

  return null
}

function pack(actual, expected) {
  return {
    isPreview: true,
    actualSec: Math.max(1, Math.round(actual)),
    expectedSec: expected > 0 ? Math.round(expected) : 0,
  }
}

export function formatPreviewClipMessage(info, { forDownload = false } = {}) {
  const actual = info?.actualSec || 0
  const expected = info?.expectedSec || 0
  const expectedText = expected > 0 ? `（完整约 ${formatClock(expected)}）` : ''
  if (forDownload) {
    return `当前音源仅提供约 ${formatClock(actual)} 试听片段${expectedText}，时长不完整，已取消下载。请更换音源后重试`
  }
  return `当前音源仅支持试听约 ${formatClock(actual)}${expectedText}，完整播放请更换或激活其他音源`
}

function formatClock(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0))
  if (s < 60) return `${s} 秒`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r ? `${m} 分 ${r} 秒` : `${m} 分钟`
}

export async function probeFileDurationSeconds(filePath) {
  if (!filePath) return 0
  try {
    const { parseFile } = await import('music-metadata')
    const metadata = await parseFile(filePath, { duration: true })
    const d = Number(metadata?.format?.duration) || 0
    return d > 0 ? d : 0
  } catch {
    return 0
  }
}

/**
 * 落盘前探测远程音频自带的总时长（Range 拉头部解析，不完整下载）
 */
export async function probeRemoteAudioDurationSeconds(url, { timeoutMs = 12000, maxBytes = 512 * 1024 } = {}) {
  if (!url || typeof url !== 'string') return 0
  if (!/^https?:\/\//i.test(url)) return 0

  try {
    const resp = await needle('get', url, null, {
      headers: {
        Range: `bytes=0-${Math.max(64 * 1024, maxBytes) - 1}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: '*/*',
      },
      follow_max: 5,
      open_timeout: timeoutMs,
      response_timeout: timeoutMs,
      read_timeout: timeoutMs,
      parse_response: false,
      compressed: true,
    })

    const status = resp.statusCode || 0
    if (status !== 200 && status !== 206) return 0

    let buf = Buffer.isBuffer(resp.body)
      ? resp.body
      : Buffer.from(resp.body == null ? '' : String(resp.body))
    if (!buf.length) return 0
    if (buf.length > maxBytes) buf = buf.subarray(0, maxBytes)

    const { parseBuffer } = await import('music-metadata')
    const metadata = await parseBuffer(buf, {
      mimeType: guessMimeFromUrl(url, resp.headers?.['content-type']),
      size: buf.length,
      duration: true,
    })
    const d = Number(metadata?.format?.duration) || 0
    return d > 0 ? d : 0
  } catch {
    return 0
  }
}

function guessMimeFromUrl(url, contentType) {
  const ct = String(contentType || '').split(';')[0].trim()
  if (ct && /^audio\//i.test(ct)) return ct
  const lower = String(url).toLowerCase()
  if (lower.includes('.flac')) return 'audio/flac'
  if (lower.includes('.m4a') || lower.includes('.mp4')) return 'audio/mp4'
  if (lower.includes('.ogg') || lower.includes('.opus')) return 'audio/ogg'
  if (lower.includes('.wav')) return 'audio/wav'
  if (lower.includes('.aac')) return 'audio/aac'
  return 'audio/mpeg'
}

/** 统一判定：优先远程/文件给出的总时长 */
export function assertNotPreviewClip(actualSec, expectedSec, { forDownload = false } = {}) {
  const preview = detectPreviewClip(actualSec, expectedSec, {
    absoluteShort: forDownload,
  })
  if (!preview) return null
  const err = new Error(formatPreviewClipMessage(preview, { forDownload }))
  err.code = 'PREVIEW_CLIP'
  err.preview = preview
  return err
}
