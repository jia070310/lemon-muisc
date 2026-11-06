/**
 * 解析 HTTP Range 请求头（仅取第一段）。
 * 支持 `bytes=start-end`、`bytes=start-`、`bytes=-suffix`；
 * 非法或越界返回 null，由调用方回 416。
 * @param {string} rangeHeader
 * @param {number} totalSize
 * @returns {{ start: number, end: number } | null}
 */
export function parseByteRange(rangeHeader, totalSize) {
  const total = Number(totalSize)
  if (!Number.isInteger(total) || total <= 0) return null

  const raw = String(rangeHeader || '').trim()
  const first = raw.replace(/^bytes=/i, '').split(',')[0].trim()
  const m = /^(\d*)-(\d*)$/.exec(first)
  if (!m) return null

  const startRaw = m[1]
  const endRaw = m[2]
  if (!startRaw && !endRaw) return null

  // 后缀范围：bytes=-N 表示文件末尾 N 字节
  if (!startRaw) {
    const suffix = parseInt(endRaw, 10)
    if (Number.isNaN(suffix) || suffix <= 0) return null
    return { start: Math.max(0, total - suffix), end: total - 1 }
  }

  const start = parseInt(startRaw, 10)
  if (Number.isNaN(start) || start >= total) return null
  let end = endRaw ? parseInt(endRaw, 10) : total - 1
  if (Number.isNaN(end)) return null
  end = Math.min(end, total - 1)
  if (start > end) return null
  return { start, end }
}
