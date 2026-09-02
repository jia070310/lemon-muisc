/** 试听链接内存缓存（平台 CDN 链接通常有时效，默认 25 分钟） */
const PLAY_URL_TTL_MS = 25 * 60 * 1000
const MAX_ENTRIES = 120

/** @type {Map<string, { url: string, expiresAt: number }>} */
const cache = new Map()
/** @type {Map<string, Promise<string>>} */
const inflightFetches = new Map()

export function buildPlayUrlCacheKey(source, songId, quality = '128k') {
  return `${source || ''}:${songId || ''}:${quality || '128k'}`
}

export function getCachedPlayUrl(key) {
  const entry = cache.get(key)
  if (!entry) return ''
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return ''
  }
  return entry.url
}

export function setCachedPlayUrl(key, url, ttlMs = PLAY_URL_TTL_MS) {
  if (!key || !url) return
  cache.set(key, { url, expiresAt: Date.now() + ttlMs })
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
}

export function clearCachedPlayUrl(key) {
  if (key) cache.delete(key)
}

export function trimPlayUrlCache(keepEntries = 40) {
  if (keepEntries <= 0) {
    cache.clear()
    return
  }
  while (cache.size > keepEntries) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
}

export function getPlayUrlCacheStats() {
  return { size: cache.size, maxEntries: MAX_ENTRIES, inflight: inflightFetches.size }
}

/** 合并同一首歌的并发取链请求 */
export async function getOrFetchPlayUrl(key, fetcher) {
  const cached = getCachedPlayUrl(key)
  if (cached) return cached

  const pending = inflightFetches.get(key)
  if (pending) return pending

  const promise = Promise.resolve()
    .then(fetcher)
    .then((url) => {
      if (url) setCachedPlayUrl(key, url)
      return url || ''
    })
    .finally(() => {
      inflightFetches.delete(key)
    })

  inflightFetches.set(key, promise)
  return promise
}
