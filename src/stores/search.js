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

export async function loadSearchSources(api) {
  if (sourcesLoaded.value && Object.keys(searchState.sources).length) return
  try {
    const res = await api.search.sources()
    searchState.sources = res.sources || {}
  } catch {
    searchState.sources = {
      kw: { name: '酷我' }, kg: { name: '酷狗' }, tx: { name: 'QQ音乐' },
      wy: { name: '网易云' }, mg: { name: '咪咕' },
    }
  }
  const keys = Object.keys(searchState.sources)
  if (!searchState.activeSource && keys.length) {
    searchState.activeSource = keys[0]
  }
  sourcesLoaded.value = true
}
