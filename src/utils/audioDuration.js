/**
 * 试听片段检测（前端，与 server/utils/audioDuration.js 规则对齐）
 */

export function parseDurationSeconds(value) {
  if (value == null || value === '') return 0
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) return 0
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

export function detectPreviewClip(actualSec, expectedSec, opts = {}) {
  const actual = Number(actualSec) || 0
  const expected = Number(expectedSec) || 0
  if (actual <= 0) return null

  if (expected >= 90) {
    if (actual <= 60 && actual < expected * 0.45) {
      return {
        isPreview: true,
        actualSec: Math.max(1, Math.round(actual)),
        expectedSec: Math.round(expected),
      }
    }
  } else if (expected >= 60) {
    if (actual <= 40 && actual < expected * 0.5) {
      return {
        isPreview: true,
        actualSec: Math.max(1, Math.round(actual)),
        expectedSec: Math.round(expected),
      }
    }
  }

  // 音源给出的总时长本身只有十多秒（试听源常见）
  if (opts.absoluteShort !== false && actual > 0 && actual <= 35) {
    if (!expected || expected <= 45 || actual < expected * 0.5) {
      return {
        isPreview: true,
        actualSec: Math.max(1, Math.round(actual)),
        expectedSec: expected > 0 ? Math.round(expected) : 0,
      }
    }
  }

  return null
}

export function formatPreviewClipMessage(info) {
  const actual = info?.actualSec || 0
  const expected = info?.expectedSec || 0
  const expectedText = expected > 0 ? `（完整约 ${formatClock(expected)}）` : ''
  return `当前音源仅支持试听约 ${formatClock(actual)}${expectedText}，完整播放请更换或激活其他音源`
}

function formatClock(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0))
  if (s < 60) return `${s} 秒`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r ? `${m} 分 ${r} 秒` : `${m} 分钟`
}
