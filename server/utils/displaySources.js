import { AVAILABLE_SOURCES } from '../musicSdk.js'
import { getMergedSources, hasActiveSource } from '../sourceManager.js'

function resolveSourceDisplayName(key, scriptName) {
  const fallback = AVAILABLE_SOURCES[key]?.name || key
  const custom = String(scriptName || '').trim()
  if (!custom || custom === key) return fallback
  return custom
}

/** 搜索/发现/歌单页展示的平台：有激活音源时仅显示其支持项，否则显示全部 */
export function getDisplaySources() {
  if (!hasActiveSource()) {
    return { ...AVAILABLE_SOURCES }
  }

  const merged = getMergedSources()
  const keys = Object.keys(merged).filter((key) => AVAILABLE_SOURCES[key])
  if (!keys.length) {
    return {}
  }

  const result = {}
  for (const key of keys) {
    const base = AVAILABLE_SOURCES[key]
    const info = merged[key] || {}
    result[key] = {
      ...base,
      name: resolveSourceDisplayName(key, info.name),
      qualitys: info.qualitys || [],
      actions: info.actions || [],
    }
  }
  return result
}

