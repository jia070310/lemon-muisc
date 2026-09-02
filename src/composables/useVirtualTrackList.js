import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const DEFAULT_THRESHOLD = 60
const DESKTOP_ROW_HEIGHT = 49
const MOBILE_ROW_HEIGHT = 76
const OVERSCAN = 8

/**
 * 大列表虚拟滚动：仅渲染可视区域附近的曲目行
 * @param {() => Array<{ item: object, i: number }>} getRows
 */
export function useVirtualTrackList(getRows, { threshold = DEFAULT_THRESHOLD } = {}) {
  const containerRef = ref(null)
  const scrollTop = ref(0)
  const viewportHeight = ref(560)
  const isNarrow = ref(false)

  let narrowMq = null
  let onNarrowChange = null

  const rowHeight = computed(() => (isNarrow.value ? MOBILE_ROW_HEIGHT : DESKTOP_ROW_HEIGHT))

  const allRows = computed(() => getRows() || [])
  const useVirtual = computed(() => allRows.value.length > threshold)

  const slice = computed(() => {
    const rows = allRows.value
    if (!useVirtual.value) {
      return { start: 0, end: rows.length, paddingTop: 0, paddingBottom: 0 }
    }
    const h = rowHeight.value
    const start = Math.max(0, Math.floor(scrollTop.value / h) - OVERSCAN)
    const count = Math.ceil(viewportHeight.value / h) + OVERSCAN * 2
    const end = Math.min(rows.length, start + count)
    return {
      start,
      end,
      paddingTop: start * h,
      paddingBottom: Math.max(0, (rows.length - end) * h),
    }
  })

  const visibleRows = computed(() => {
    const rows = allRows.value
    if (!useVirtual.value) return rows
    return rows.slice(slice.value.start, slice.value.end)
  })

  const paddingTop = computed(() => (useVirtual.value ? slice.value.paddingTop : 0))
  const paddingBottom = computed(() => (useVirtual.value ? slice.value.paddingBottom : 0))

  function measureViewport() {
    viewportHeight.value = containerRef.value?.clientHeight || window.innerHeight * 0.65
  }

  function onScroll() {
    scrollTop.value = containerRef.value?.scrollTop || 0
  }

  function resetScroll() {
    scrollTop.value = 0
    if (containerRef.value) containerRef.value.scrollTop = 0
  }

  watch(allRows, () => {
    resetScroll()
  })

  onMounted(() => {
    narrowMq = window.matchMedia('(max-width: 768px)')
    onNarrowChange = () => { isNarrow.value = narrowMq?.matches ?? false }
    onNarrowChange()
    narrowMq.addEventListener('change', onNarrowChange)
    measureViewport()
    window.addEventListener('resize', measureViewport)
  })

  onUnmounted(() => {
    if (narrowMq && onNarrowChange) narrowMq.removeEventListener('change', onNarrowChange)
    window.removeEventListener('resize', measureViewport)
  })

  return {
    containerRef,
    useVirtual,
    visibleRows,
    paddingTop,
    paddingBottom,
    onScroll,
    resetScroll,
    measureViewport,
  }
}
