import { reactive, ref } from 'vue'

export const searchState = reactive({
  keyword: '',
  activeSource: '',
  sources: {},
  searchMode: 'song', // song | album
  viewMode: 'list', // list | album-detail
  results: [],
  albumResults: [],
  albumInfo: null,
  page: 1,
  totalPages: 0,
  loading: false,
  albumLoading: false,
  searched: false,
})

export const sourcesLoaded = ref(false)

function syncActiveSourceKey(state) {
  const keys = Object.keys(state.sources)
  if (!keys.length) {
    state.activeSource = ''
    return
  }
  if (!keys.includes(state.activeSource)) {
    state.activeSource = keys[0]
  }
}

export async function loadSearchSources(api, { force = false } = {}) {
  if (!force && sourcesLoaded.value && Object.keys(searchState.sources).length) return
  try {
    const res = await api.search.sources()
    searchState.sources = res.sources || {}
  } catch {
    searchState.sources = {}
  }
  syncActiveSourceKey(searchState)
  // 只有拿到平台列表才标记已加载，避免空结果被永久缓存
  sourcesLoaded.value = Object.keys(searchState.sources).length > 0
}

export function reloadSearchSources(api) {
  sourcesLoaded.value = false
  return loadSearchSources(api, { force: true })
}
