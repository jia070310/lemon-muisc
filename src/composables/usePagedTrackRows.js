import { ref, computed } from 'vue'

/** 大列表分页展示，避免一次渲染过多 DOM 行 */
export function usePagedTrackRows(getTracks, { pageSize = 50, enabled = () => true } = {}) {
  const page = ref(1)

  const totalPages = computed(() => {
    if (!enabled()) return 1
    const total = getTracks().length
    return Math.max(1, Math.ceil(total / pageSize))
  })

  const displayRows = computed(() => {
    const tracks = getTracks()
    if (!enabled() || tracks.length <= pageSize) {
      return tracks.map((item, i) => ({ item, i }))
    }
    const start = (page.value - 1) * pageSize
    return tracks
      .slice(start, start + pageSize)
      .map((item, offset) => ({ item, i: start + offset }))
  })

  function resetPage() {
    page.value = 1
  }

  return { page, totalPages, displayRows, resetPage, pageSize }
}
