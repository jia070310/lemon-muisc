import { reactive, ref } from 'vue'

export const searchState = reactive({
  keyword: '',
  activeSource: '',
  sources: {},
  results: [],
  page: 1,
  totalPages: 0,
  loading: false,
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
    searchState.sources = {
      kw: { name: '酷我' }, kg: { name: '酷狗' }, tx: { name: 'QQ音乐' },
      wy: { name: '网易云' }, mg: { name: '咪咕' },
    }
  }
  syncActiveSourceKey(searchState)
  sourcesLoaded.value = true
}

export function reloadSearchSources(api) {
  sourcesLoaded.value = false
  return loadSearchSources(api, { force: true })
}
