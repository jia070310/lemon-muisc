import { computed } from 'vue'
import { usePagedTrackRows } from './usePagedTrackRows.js'
import { useVirtualTrackList } from './useVirtualTrackList.js'

const VIRTUAL_THRESHOLD = 60
const PAGE_SIZE = 50

/**
 * 曲目列表展示：小列表全量渲染；中等列表分页；大列表虚拟滚动
 */
export function useTrackListView(getTracks, { paginateWhen = () => true } = {}) {
  const trackCount = computed(() => getTracks().length)
  const useVirtualMode = computed(() => trackCount.value > VIRTUAL_THRESHOLD)

  const {
    page,
    totalPages,
    displayRows: pagedRows,
    resetPage,
  } = usePagedTrackRows(getTracks, {
    pageSize: PAGE_SIZE,
    enabled: () => paginateWhen() && trackCount.value > PAGE_SIZE && !useVirtualMode.value,
  })

  const {
    containerRef,
    useVirtual,
    visibleRows,
    paddingTop,
    paddingBottom,
    onScroll,
    resetScroll,
    measureViewport,
  } = useVirtualTrackList(() => {
    if (useVirtualMode.value) return getTracks().map((item, i) => ({ item, i }))
    return pagedRows.value
  }, { threshold: VIRTUAL_THRESHOLD })

  const displayRows = computed(() => (
    useVirtualMode.value ? visibleRows.value : pagedRows.value
  ))

  function resetView() {
    resetPage()
    resetScroll()
  }

  return {
    page,
    totalPages,
    displayRows,
    containerRef,
    useVirtual: useVirtualMode,
    paddingTop,
    paddingBottom,
    onScroll,
    resetView,
    measureViewport,
    showPagination: computed(() => !useVirtualMode.value && totalPages.value > 1),
  }
}
