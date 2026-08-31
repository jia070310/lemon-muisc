/** 平台 key → 界面显示名 */
export const PLATFORM_LABELS = {
  kw: '酷我',
  kg: '酷狗',
  tx: 'QQ音乐',
  wy: '网易云',
  mg: '咪咕',
}

/** 优先标准中文名；音源脚本 name 为 key 或空时回退 */
export function platformLabel(key, info = {}) {
  const custom = String(info?.name || '').trim()
  if (custom && custom !== key) return custom
  return PLATFORM_LABELS[key] || key
}

/** 歌单导入/发现页平台选项（内置 SDK 支持的全部平台） */
export const PLAYLIST_PLATFORM_OPTIONS = Object.entries(PLATFORM_LABELS).map(([value, label]) => ({
  value,
  label,
}))
