import { unref, watch } from 'vue'
import { api } from '../api.js'

/**
 * 首屏/当前页歌曲封面渐进补全：有数据就先展示，再陆续换成真实封面。
 */
export function useProgressiveTrackCovers(getRows, {
  getSource = () => '',
  concurrency = 4,
  enabled = () => true,
} = {}) {
  let seq = 0
  const inflight = new Set()

  async function fillOne(item) {
    if (!item || inflight.has(item)) return
    const key = `${item.source || ''}:${item.songmid || item.hash || item.id || item.name}`
    if (inflight.has(key)) return
    if (item.picUrl && item.img && !item.coverFallback) return
    inflight.add(key)
    try {
      const source = item.source || unref(getSource) || ''
      const payload = { ...item, source }
      if (item.coverFallback) {
        payload.picUrl = ''
        payload.img = ''
        payload.cover = ''
        payload.coverFallback = true
      }
      const res = await api.play.getCover(payload)
      const url = res?.url || res?.data?.url || ''
      if (!url) return
      item.picUrl = url
      item.img = url
      item.coverFallback = false
    } catch {
      /* ignore */
    } finally {
      inflight.delete(key)
    }
  }

  async function run() {
    if (!enabled()) return
    const my = ++seq
    const rows = unref(typeof getRows === 'function' ? getRows() : getRows) || []
    const items = rows
      .map((row) => (row?.item != null ? row.item : row))
      .filter((item) => item && (item.coverFallback || !(item.picUrl || item.img)))
    if (!items.length) return

    let cursor = 0
    const workers = Math.min(concurrency, items.length)
    await Promise.all(Array.from({ length: workers }, async () => {
      while (cursor < items.length) {
        if (my !== seq) return
        const item = items[cursor++]
        await fillOne(item)
      }
    }))
  }

  watch(
    () => {
      const rows = unref(typeof getRows === 'function' ? getRows() : getRows) || []
      return rows.map((row) => {
        const item = row?.item != null ? row.item : row
        return `${item?.id || ''}:${item?.picUrl || ''}:${item?.coverFallback ? 1 : 0}`
      }).join('|')
    },
    () => { run() },
    { flush: 'post' },
  )

  return { refreshCovers: run }
}
