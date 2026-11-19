import { trimPlayUrlCache, getPlayUrlCacheStats } from './playUrlCache.js'
import { trimAlbumCache, getAlbumCacheStats } from './albumCache.js'
import { trimPlaylistCache, getPlaylistCacheStats } from './playlistCache.js'

function readLimitMb(envKey, fallback) {
  const raw = Number.parseInt(String(process.env[envKey] || ''), 10)
  if (Number.isFinite(raw) && raw >= 128) return raw
  return fallback
}

/**
 * 默认对齐大库实测补丁：软 1536 / 硬 2048，避免 14 万首时常驻 800MB+ 被误清缓存。
 * 仍可用 LEMON_RSS_SOFT_MB / LEMON_RSS_HARD_MB 覆盖。
 */
const RSS_SOFT_LIMIT_MB = readLimitMb('LEMON_RSS_SOFT_MB', 1536)
const RSS_HARD_LIMIT_MB = Math.max(
  RSS_SOFT_LIMIT_MB + 256,
  readLimitMb('LEMON_RSS_HARD_MB', 2048),
)

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
        console.log(`[memory] RSS ${result.rssMB}MB，已清理试听/专辑/歌单缓存（软限 ${RSS_SOFT_LIMIT_MB} / 硬限 ${RSS_HARD_LIMIT_MB}）`)
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
