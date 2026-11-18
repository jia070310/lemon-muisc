/**
 * 首屏/二屏本地缓存 + 按屏滑动预取辅助。
 * 策略：先画缓存 → 显示后再后台替换；静置最多预取到第 3 屏，滑到第 2 屏再拉第 4 屏。
 */

/** 软过期：仍可展示，显示后再静默更新 */
export const SCREEN_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000

export function cacheUserPart(user) {
  const id = user?.id ?? user?.userId ?? ''
  return id ? String(id) : 'anon'
}

export function buildCacheKey(base, parts = []) {
  const rest = (Array.isArray(parts) ? parts : [parts])
    .map((p) => String(p ?? '').trim())
    .filter(Boolean)
  return rest.length ? `${base}:${rest.join(':')}` : base
}

export function readScreenCache(key) {
  if (!key) return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null
    return data
  } catch {
    return null
  }
}

export function writeScreenCache(key, payload) {
  if (!key || !payload || typeof payload !== 'object') return false
  try {
    localStorage.setItem(key, JSON.stringify({ ...payload, savedAt: Date.now() }))
    return true
  } catch {
    // 配额满时尝试清掉同前缀旧项再写一次
    try {
      const prefix = String(key).split(':')[0]
      const doomed = []
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i)
        if (k && k.startsWith(prefix) && k !== key) doomed.push(k)
      }
      for (const k of doomed.slice(0, 8)) localStorage.removeItem(k)
      localStorage.setItem(key, JSON.stringify({ ...payload, savedAt: Date.now() }))
      return true
    } catch {
      return false
    }
  }
}

export function isCacheFresh(savedAt, maxAgeMs = SCREEN_CACHE_MAX_AGE_MS) {
  const t = Number(savedAt) || 0
  return t > 0 && Date.now() - t < maxAgeMs
}

/** 首帧绘制后再跑，避免和解析/布局抢主线程 */
export function runAfterPaint(fn) {
  if (typeof fn !== 'function') return
  const kick = () => {
    try { fn() } catch { /* ignore */ }
  }
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      requestAnimationFrame(kick)
    })
    return
  }
  setTimeout(kick, 0)
}

export function runIdle(fn, timeoutMs = 1800) {
  if (typeof fn !== 'function') return
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => {
      try { fn() } catch { /* ignore */ }
    }, { timeout: timeoutMs })
    return
  }
  setTimeout(() => {
    try { fn() } catch { /* ignore */ }
  }, Math.min(400, timeoutMs))
}

/**
 * 需要缓存/预取的条目数。
 * - pageIndex 0（首屏）：覆盖 idleMax 屏（默认 3）
 * - 滑到第 2 屏（index>=1）：再向前 lookahead 屏（默认再保 2 → 合计到第 4 屏）
 */
export function itemsNeededForScreens(pageIndex, pageSize, {
  idleMaxScreens = 3,
  lookaheadScreens = 2,
} = {}) {
  const size = Math.max(1, Number(pageSize) || 1)
  const idx = Math.max(0, Number(pageIndex) || 0)
  const screens = idx <= 0
    ? idleMaxScreens
    : Math.max(idleMaxScreens, idx + 1 + lookaheadScreens)
  return screens * size
}

/** 是否该触发「再拉一页」：当前列表不足以覆盖目标屏窗 */
export function shouldPrefetchMore({
  pageIndex,
  pageSize,
  listLength,
  hasMore,
  idleMaxScreens = 3,
  lookaheadScreens = 2,
} = {}) {
  if (!hasMore) return false
  const need = itemsNeededForScreens(pageIndex, pageSize, { idleMaxScreens, lookaheadScreens })
  return (Number(listLength) || 0) < need
}
