/** 平台 key → 界面显示名 */
export const PLATFORM_LABELS = {
  kw: '酷我',
  kg: '酷狗',
  tx: 'QQ音乐',
  wy: '网易云',
  mg: '咪咕',
}

/** 设置页平台开关顺序 */
export const PLATFORM_ORDER = ['tx', 'wy', 'kw', 'kg', 'mg']

export const ENABLED_PLATFORMS_KEY = 'source.enabledPlatforms'

/** 优先标准中文名；音源脚本 name 为 key 或空时回退 */
export function platformLabel(key, info = {}) {
  const custom = String(info?.name || '').trim()
  if (custom && custom !== key) return custom
  return PLATFORM_LABELS[key] || key
}

/** 歌单导入平台选项（API 无数据时的兜底，应与已激活音源一致） */
export const PLAYLIST_PLATFORM_OPTIONS = PLATFORM_ORDER
  .filter((value) => PLATFORM_LABELS[value])
  .map((value) => ({ value, label: PLATFORM_LABELS[value] }))

/** @returns {Record<string, string[]>} */
export function parseSourcePlatformMap(raw) {
  const all = [...PLATFORM_ORDER]
  const allow = new Set(all)
  if (raw == null || raw === '') return {}
  let data = raw
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw) } catch { return {} }
  }
  // 旧版全局数组
  if (Array.isArray(data)) {
    return { __global__: [...new Set(data.map(String).filter((k) => allow.has(k)))] }
  }
  if (!data || typeof data !== 'object') return {}
  const out = {}
  for (const [id, list] of Object.entries(data)) {
    if (!id) continue
    if (!Array.isArray(list)) continue
    out[String(id)] = [...new Set(list.map(String).filter((k) => allow.has(k)))]
  }
  return out
}

export function serializeSourcePlatformMap(map) {
  const out = {}
  for (const [id, list] of Object.entries(map || {})) {
    if (!id || id === '__global__') continue
    out[id] = PLATFORM_ORDER.filter((k) => (list || []).includes(k))
  }
  return JSON.stringify(out)
}

/** 音源声明的平台列表 */
export function platformsOfSource(source) {
  const keys = Object.keys(source?.sources || {}).filter((k) => PLATFORM_LABELS[k])
  if (keys.length) return PLATFORM_ORDER.filter((k) => keys.includes(k))
  return [...PLATFORM_ORDER]
}
