import { AVAILABLE_SOURCES } from '../musicSdk.js'
import { getMergedSettings } from './userSettings.js'
import { getStoredActiveSourceIds } from './activeSources.js'
import { getActiveSources } from '../sourceManager.js'

export const ENABLED_PLATFORMS_KEY = 'source.enabledPlatforms'

/** 固定顺序，与设置页展示一致 */
export const PLATFORM_ORDER = ['tx', 'wy', 'kw', 'kg', 'mg']

export function allPlatformKeys() {
  return PLATFORM_ORDER.filter((k) => AVAILABLE_SOURCES[k])
}

function parseJson(raw, fallback) {
  if (raw == null || raw === '') return fallback
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

/** @returns {Record<string, string[]>} sourceId → enabled platforms */
export function parseSourcePlatformMap(raw) {
  const data = parseJson(raw, null)
  const all = allPlatformKeys()
  const allow = new Set(all)

  // 兼容旧版全局数组 ["tx","wy"]
  if (Array.isArray(data)) {
    const global = [...new Set(data.map(String).filter((k) => allow.has(k)))]
    return { __global__: global }
  }
  if (!data || typeof data !== 'object') return {}

  const out = {}
  for (const [id, list] of Object.entries(data)) {
    if (!id || id === '__global__') continue
    if (!Array.isArray(list)) continue
    out[String(id)] = [...new Set(list.map(String).filter((k) => allow.has(k)))]
  }
  return out
}

export function getSourcePlatformMap(userId = null) {
  if (!userId) return {}
  try {
    const settings = getMergedSettings(userId)
    return parseSourcePlatformMap(settings[ENABLED_PLATFORMS_KEY])
  } catch {
    return {}
  }
}

/** 音源脚本声明的平台；无声明时视为全部 */
export function platformsDeclaredBySource(sourceId) {
  const all = allPlatformKeys()
  try {
    const entry = getActiveSources().find((s) => s.id === sourceId)
    const keys = Object.keys(entry?.sources || {}).filter((k) => AVAILABLE_SOURCES[k])
    if (keys.length) return PLATFORM_ORDER.filter((k) => keys.includes(k))
  } catch {}
  return [...all]
}

/**
 * 某音源对某平台是否允许解析。
 * 未配置时默认开启（脚本声明的全部平台）。
 */
export function isSourcePlatformEnabled(userId, sourceId, platform) {
  const key = String(platform || '').trim()
  if (!key || key === 'local') return true
  if (!AVAILABLE_SOURCES[key]) return true
  const sid = String(sourceId || '').trim()
  if (!sid || !userId) return true

  const map = getSourcePlatformMap(userId)
  if (Object.prototype.hasOwnProperty.call(map, sid)) {
    return map[sid].includes(key)
  }
  // 旧版全局开关：对所有音源生效
  if (Object.prototype.hasOwnProperty.call(map, '__global__')) {
    return map.__global__.includes(key)
  }
  return platformsDeclaredBySource(sid).includes(key) || allPlatformKeys().includes(key)
}

/** 当前用户「至少有一个激活音源允许」的平台并集 */
export function getEnabledPlatforms(userId = null) {
  const all = allPlatformKeys()
  if (!userId) return [...all]
  const activeIds = getStoredActiveSourceIds(userId)
  if (!activeIds.length) return [...all]

  const map = getSourcePlatformMap(userId)
  const enabled = new Set()
  for (const id of activeIds) {
    let list
    if (Object.prototype.hasOwnProperty.call(map, id)) list = map[id]
    else if (Object.prototype.hasOwnProperty.call(map, '__global__')) list = map.__global__
    else list = platformsDeclaredBySource(id)
    for (const p of list) enabled.add(p)
  }
  return PLATFORM_ORDER.filter((k) => enabled.has(k))
}

export function isPlatformEnabled(userId, platform) {
  const key = String(platform || '').trim()
  if (!key || key === 'local') return true
  if (!AVAILABLE_SOURCES[key]) return true
  return getEnabledPlatforms(userId).includes(key)
}

export function serializeSourcePlatformMap(map) {
  const allow = new Set(allPlatformKeys())
  const out = {}
  for (const [id, list] of Object.entries(map || {})) {
    if (!id || id === '__global__') continue
    const ordered = PLATFORM_ORDER.filter((k) => allow.has(k) && (list || []).includes(k))
    out[id] = ordered
  }
  return JSON.stringify(out)
}
