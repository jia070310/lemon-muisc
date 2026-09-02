import { getTrackFilePath } from './trackPath.js'
import { stripStreamAuth } from './streamAuth.js'

const PLAY_URL_TTL_MS = 25 * 60 * 1000
const MAX_ENTRIES = 80

/** @type {Map<string, { url: string, expiresAt: number }>} */
const cache = new Map()

export function playUrlCacheKey(item, source, quality = '128k') {
  const filePath = getTrackFilePath(item)
  if (filePath) return `local:${filePath}:${quality}`
  const songId = item?.songId || item?.songmid || item?.hash || item?.copyrightId || item?.musicId || item?.id || ''
  const src = item?.source || source || ''
  return `${src}:${songId}:${quality}`
}

export function getCachedPlayUrl(item, source, quality = '128k') {
  const key = playUrlCacheKey(item, source, quality)
  const entry = cache.get(key)
  if (!entry) return ''
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return ''
  }
  return entry.url
}

export function setCachedPlayUrl(item, source, quality, url) {
  if (!url) return
  const key = playUrlCacheKey(item, source, quality)
  cache.set(key, { url: stripStreamAuth(url), expiresAt: Date.now() + PLAY_URL_TTL_MS })
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
}

export function rememberLoadedPlayUrl(item, source, url, quality = '128k') {
  if (url) setCachedPlayUrl(item, source, quality, url)
}

export function clearCachedPlayUrl(item, source, quality = '128k') {
  const key = playUrlCacheKey(item, source, quality)
  cache.delete(key)
}
