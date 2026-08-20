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

export const QUALITY_ORDER = ['master', 'atmos_plus', 'atmos', 'hires', 'flac24bit', 'flac', '320k', '128k']

export const DEFAULT_QUALITIES = ['128k', '320k', 'flac', 'flac24bit']

export function sortQualities(list) {
  return [...list].sort((a, b) => {
    const ia = QUALITY_ORDER.indexOf(a)
    const ib = QUALITY_ORDER.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
}

export function getQualityLabel(q) {
  return QUALITY_LABELS[q] || q
}

export function getQualityDisplay(q, types) {
  const info = types?.find(t => t.type === q)
  const label = getQualityLabel(q)
  return info?.size ? `${label} (${info.size})` : label
}
