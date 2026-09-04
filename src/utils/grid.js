/** 与 CSS `repeat(auto-fill, minmax(minSize, 1fr))` + gap 对齐的列数估算 */
export function countAutoFillColumns(width, { minSize = 260, gap = 18 } = {}) {
  const w = Number(width) || 0
  if (w <= 0) return 1
  return Math.max(1, Math.floor((w + gap) / (minSize + gap)))
}
