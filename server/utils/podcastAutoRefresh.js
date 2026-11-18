/**
 * 后台定时刷新播客 RSS：发现新节目后推送 WS，并更新 unread_count。
 */
import { listPodcastUserIds, refreshAllFeeds } from './podcastStore.js'
import { broadcast } from '../ws.js'

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000
let timer = null
let running = false
let started = false

async function tick() {
  if (running) return
  running = true
  try {
    const userIds = listPodcastUserIds()
    for (const userId of userIds) {
      try {
        const result = await refreshAllFeeds(userId, { concurrency: 2 })
        if (result.updated?.length) {
          broadcast('podcast:updated', {
            feeds: result.updated.map((f) => ({
              id: f.id,
              title: f.title,
              inserted: f.inserted || 0,
              unreadCount: f.unreadCount || 0,
              newestPubDate: f.newestPubDate || 0,
              imageUrl: f.imageUrl || '',
            })),
            at: Date.now(),
          }, userId)
        }
      } catch (e) {
        console.warn('[podcast-auto]', userId, e?.message || e)
      }
    }
  } finally {
    running = false
  }
}

export function startPodcastAutoRefresh(intervalMs = DEFAULT_INTERVAL_MS) {
  if (started) return
  started = true
  const ms = Math.max(10 * 60 * 1000, Number(intervalMs) || DEFAULT_INTERVAL_MS)
  // 启动后错开一段时间再首次刷新，避免开机 IO 高峰
  setTimeout(() => {
    tick().catch(() => {})
    timer = setInterval(() => { tick().catch(() => {}) }, ms)
    timer.unref?.()
  }, 120000).unref?.()
  console.log(`[podcast-auto] 已安排订阅自动刷新（间隔 ${Math.round(ms / 60000)} 分钟）`)
}

export function stopPodcastAutoRefresh() {
  if (timer) clearInterval(timer)
  timer = null
  started = false
}
