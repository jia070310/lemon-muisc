export const QUALITY_LABELS = {
  '128k': '128K',
  '320k': '320K',
  flac: 'FLAC',
  flac24bit: 'FLAC 24bit',
  hires: 'Hi-Res',
  atmos: '杜比全景声',
  atmos_plus: '杜比全景声 Plus',
  master: '超清母带',
}

/** 常见音质对应封装格式（无源数据时的默认） */
export const QUALITY_FORMATS = {
  '128k': 'MP3',
  '320k': 'MP3',
  flac: 'FLAC',
  flac24bit: 'FLAC',
  hires: 'FLAC',
  atmos: 'M4A',
  atmos_plus: 'M4A',
  master: 'FLAC',
}

export const QUALITY_ORDER = ['master', 'atmos_plus', 'atmos', 'hires', 'flac24bit', 'flac', '320k', '128k']

export const DEFAULT_QUALITIES = ['128k', '320k', 'flac', 'flac24bit']

export function sortQualities(list) {
  return [...list].sort((a, b) => {
    const ia = QUALITY_ORDER.indexOf(a)
    const ib = QUALITY_ORDER.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
}

export function getQualityFormat(q, types) {
  const info = types?.find(t => t.type === q)
  if (info?.format) {
    return String(info.format).replace(/^\./, '').toUpperCase()
  }
  return QUALITY_FORMATS[q] || ''
}

export function getQualityLabel(q, types) {
  const base = QUALITY_LABELS[q] || q
  const fmt = getQualityFormat(q, types)
  if (!fmt) return base
  // FLAC / FLAC 24bit 本身已是格式名，不再重复
  if (String(base).toUpperCase().includes(fmt)) return base
  return `${base} · ${fmt}`
}

export function getQualityDisplay(q, types) {
  const info = types?.find(t => t.type === q)
  const label = getQualityLabel(q, types)
  return info?.size ? `${label} (${info.size})` : label
}
