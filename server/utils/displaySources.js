import { AVAILABLE_SOURCES } from '../musicSdk.js'
import { getMergedSources, hasActiveSource } from '../sourceManager.js'
import { getStoredActiveSourceIds } from './activeSources.js'

function resolveSourceDisplayName(key, scriptName) {
  const fallback = AVAILABLE_SOURCES[key]?.name || key
  const custom = String(scriptName || '').trim()
  if (!custom || custom === key) return fallback
  return custom
}

function allAvailableSources() {
  return { ...AVAILABLE_SOURCES }
}

/** 搜索/发现/歌单页展示的平台：按当前用户已激活音源过滤；无可用平台时回退全部 */
export function getDisplaySources(userId = null) {
  const allowedIds = userId ? getStoredActiveSourceIds(userId) : null

  // 未激活任何音源，或激活的音源尚未加载：展示全部平台（搜索走 SDK）
  if (!Array.isArray(allowedIds) || !allowedIds.length || !hasActiveSource(allowedIds)) {
    return allAvailableSources()
  }

  const merged = getMergedSources(allowedIds)
  const keys = Object.keys(merged).filter((key) => AVAILABLE_SOURCES[key])
  if (!keys.length) {
    // 激活了音源但未声明平台能力时，不能返回空（否则搜索/发现无平台 Tab）
    return allAvailableSources()
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
