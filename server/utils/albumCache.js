/** 专辑详情内存缓存（减少重复拉取大专辑） */
const ALBUM_TTL_MS = 12 * 60 * 1000
const MAX_ENTRIES = 40

/** @type {Map<string, { data: object, expiresAt: number }>} */
const cache = new Map()
/** @type {Map<string, Promise<object>>} */
const inflight = new Map()

export function buildAlbumCacheKey(source, id) {
  return `${source || ''}:${id || ''}`
}

export function getCachedAlbum(key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.data
}

export function setCachedAlbum(key, data, ttlMs = ALBUM_TTL_MS) {
  if (!key || !data) return
  cache.set(key, { data, expiresAt: Date.now() + ttlMs })
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
}

/** 合并并发请求：同一专辑只拉取一次 */
export async function getOrFetchAlbum(key, fetcher) {
  const cached = getCachedAlbum(key)
  if (cached) return cached

  const pending = inflight.get(key)
  if (pending) return pending

  const promise = Promise.resolve()
    .then(fetcher)
    .then((data) => {
      setCachedAlbum(key, data)
      return data
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, promise)
  return promise
}

export function trimAlbumCache(keepEntries = 20) {
  if (keepEntries <= 0) {
    cache.clear()
    return
  }
  while (cache.size > keepEntries) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
}

export function getAlbumCacheStats() {
  return { size: cache.size, maxEntries: MAX_ENTRIES, inflight: inflight.size }
}
