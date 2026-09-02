import { trimPlayUrlCache, getPlayUrlCacheStats } from './playUrlCache.js'
import { trimAlbumCache, getAlbumCacheStats } from './albumCache.js'
import { trimPlaylistCache, getPlaylistCacheStats } from './playlistCache.js'

const RSS_SOFT_LIMIT_MB = 384
const RSS_HARD_LIMIT_MB = 512

const guardState = {
  lastCheckAt: null,
  lastTrimAt: null,
  trimCount: 0,
  lastTrimRssMB: 0,
}

export function getMemoryGuardStatus() {
  const rssMB = Math.round(process.memoryUsage().rss / 1048576)
  return {
    rssMB,
    rssSoftLimitMB: RSS_SOFT_LIMIT_MB,
    rssHardLimitMB: RSS_HARD_LIMIT_MB,
    nearLimit: rssMB >= RSS_SOFT_LIMIT_MB,
    lastCheckAt: guardState.lastCheckAt,
    lastTrimAt: guardState.lastTrimAt,
    trimCount: guardState.trimCount,
    lastTrimRssMB: guardState.lastTrimRssMB,
    caches: {
      playUrl: getPlayUrlCacheStats(),
      album: getAlbumCacheStats(),
      playlist: getPlaylistCacheStats(),
    },
  }
}

export function runMemoryGuard() {
  const rssMB = Math.round(process.memoryUsage().rss / 1048576)
  guardState.lastCheckAt = new Date().toISOString()
  if (rssMB < RSS_SOFT_LIMIT_MB) return { trimmed: false, rssMB }

  trimPlayUrlCache(50)
  trimAlbumCache(15)
  trimPlaylistCache(8)

  if (rssMB >= RSS_HARD_LIMIT_MB) {
    trimPlayUrlCache(0)
    trimAlbumCache(0)
    trimPlaylistCache(0)
  }

  guardState.lastTrimAt = new Date().toISOString()
  guardState.trimCount += 1
  guardState.lastTrimRssMB = rssMB

  return { trimmed: true, rssMB }
}

export function startMemoryGuard(intervalMs = 5 * 60 * 1000) {
  const tick = () => {
    try {
      const result = runMemoryGuard()
      if (result.trimmed) {
        console.log(`[memory] RSS ${result.rssMB}MB，已清理试听/专辑/歌单缓存`)
      }
    } catch (e) {
      console.warn('[memory] guard failed:', e.message)
    }
  }
  tick()
  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  return timer
}
