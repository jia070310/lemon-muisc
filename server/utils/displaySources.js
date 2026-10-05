import { AVAILABLE_SOURCES } from '../musicSdk.js'
import { getMergedSources, hasActiveSource } from '../sourceManager.js'
import { getStoredActiveSourceIds } from './activeSources.js'
import { getEnabledPlatforms, isSourcePlatformEnabled } from './enabledPlatforms.js'
import { getActiveSources } from '../sourceManager.js'

function resolveSourceDisplayName(key, scriptName) {
  const fallback = AVAILABLE_SOURCES[key]?.name || key
  const custom = String(scriptName || '').trim()
  if (!custom || custom === key) return fallback
  return custom
}

function allAvailableSources() {
  return { ...AVAILABLE_SOURCES }
}

function filterByEnabledPlatforms(sources, userId) {
  if (!userId || !sources || typeof sources !== 'object') return sources
  const enabled = new Set(getEnabledPlatforms(userId))
  const result = {}
  for (const [key, info] of Object.entries(sources)) {
    if (enabled.has(key)) result[key] = info
  }
  return result
}

/** 按用户平台开关裁剪合并后的音源能力 */
export function getMergedSourcesForUser(userId, allowedSourceIds = null) {
  const allow = Array.isArray(allowedSourceIds)
    ? new Set(allowedSourceIds.map(String))
    : null
  const merged = {}
  for (const entry of getActiveSources()) {
    if (allow && !allow.has(entry.id)) continue
    for (const [key, info] of Object.entries(entry.sources || {})) {
      if (!AVAILABLE_SOURCES[key]) continue
      if (userId && !isSourcePlatformEnabled(userId, entry.id, key)) continue
      if (!merged[key]) {
        merged[key] = {
          name: info.name || key,
          type: info.type || 'music',
          actions: [...(info.actions || [])],
          qualitys: [...(info.qualitys || [])],
        }
        continue
      }
      const cur = merged[key]
      for (const a of info.actions || []) {
        if (!cur.actions.includes(a)) cur.actions.push(a)
      }
      for (const q of info.qualitys || []) {
        if (!cur.qualitys.includes(q)) cur.qualitys.push(q)
      }
    }
  }
  return merged
}

/** 搜索/发现/歌单页展示的平台：按当前用户已激活音源 + 各音源平台开关过滤 */
export function getDisplaySources(userId = null) {
  const allowedIds = userId ? getStoredActiveSourceIds(userId) : null
  let base

  if (!Array.isArray(allowedIds) || !allowedIds.length || !hasActiveSource(allowedIds)) {
    base = allAvailableSources()
  } else {
    const merged = userId
      ? getMergedSourcesForUser(userId, allowedIds)
      : getMergedSources(allowedIds)
    const keys = Object.keys(merged).filter((key) => AVAILABLE_SOURCES[key])
    if (!keys.length) {
      // 全部平台被关掉时返回空，搜索 Tab 为空；避免误显示已关闭平台
      return {}
    }
    base = {}
    for (const key of keys) {
      const info = merged[key] || {}
      base[key] = {
        ...AVAILABLE_SOURCES[key],
        name: resolveSourceDisplayName(key, info.name),
        qualitys: info.qualitys || [],
        actions: info.actions || [],
      }
    }
  }

  return filterByEnabledPlatforms(base, userId)
}
