import { reactive, ref } from 'vue'

export const discoverState = reactive({
  url: '',
  activeSource: '',
  sources: {},
  results: [],
  playlistInfo: null,
  total: 0,
  loading: false,
  loadingMore: false,
  fetched: false,
  viewMode: 'recommend', // recommend | detail
  recommendList: [],
  recommendLoading: false,
  recommendLoadingMore: false,
  recommendHasMore: false,
  recommendTotal: 0,
  recommendSort: 'new',
  recommendPage: 1,
  // 首页多栏目
  songRegion: '',
  albumRegion: '',
  newSongs: [],
  newSongsRegions: [],
  newSongsLoading: false,
  newSongsError: '',
  newSongsUnsupported: false,
  newAlbums: [],
  newAlbumsRegions: [],
  newAlbumsLoading: false,
  newAlbumsError: '',
  newAlbumsUnsupported: false,
  ranks: [],
  ranksLoading: false,
  ranksError: '',
  ranksUnsupported: false,
  playlistsError: '',
})

export const discoverSourcesLoaded = ref(false)

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

export async function loadDiscoverSources(api, { force = false } = {}) {
  const hasSources = Object.keys(discoverState.sources || {}).length > 0
  if (!force && discoverSourcesLoaded.value && hasSources) return
  try {
    const res = await api.playlist.sources()
    discoverState.sources = res.sources || {}
  } catch {
    discoverState.sources = {}
  }
  syncActiveSourceKey(discoverState)
  discoverSourcesLoaded.value = Object.keys(discoverState.sources).length > 0
}

export function reloadDiscoverSources(api) {
  discoverSourcesLoaded.value = false
  return loadDiscoverSources(api, { force: true })
}

export function resetDiscoverHomeFeed() {
  discoverState.recommendList = []
  discoverState.recommendHasMore = false
  discoverState.recommendTotal = 0
  discoverState.recommendPage = 1
  discoverState.newSongs = []
  discoverState.newAlbums = []
  discoverState.ranks = []
  discoverState.newSongsError = ''
  discoverState.newAlbumsError = ''
  discoverState.ranksError = ''
  discoverState.playlistsError = ''
  discoverState.newSongsUnsupported = false
  discoverState.newAlbumsUnsupported = false
  discoverState.ranksUnsupported = false
  // 立刻进入加载态，发现页各栏先显示骨架框架
  discoverState.recommendLoading = true
  discoverState.newSongsLoading = true
  discoverState.newAlbumsLoading = true
  discoverState.ranksLoading = true
}

export const sourcePlaceholders = {
  kw: '粘贴酷我歌单链接或 ID，如 https://www.kuwo.cn/playlist_detail/2886046289',
  kg: '粘贴酷狗歌单分享链接或官方歌单 ID',
  tx: '粘贴 QQ 音乐歌单链接或 ID，如 https://y.qq.com/n/yqq/playlist/7217720898.html',
  wy: '粘贴网易云歌单链接或 ID；私人歌单：ID###MUSIC_U',
  mg: '粘贴咪咕歌单链接或 ID，如 https://music.migu.cn/v3/music/playlist/161044573',
}

export const recommendSortOptions = [
  { id: 'new', label: '最新' },
  { id: 'hot', label: '最热' },
]

/** 各平台默认地区（空表示无地区 Tab） */
export function defaultSongRegion(source) {
  if (source === 'tx') return 'latest'
  if (source === 'wy') return '0'
  return ''
}

export function defaultAlbumRegion(source) {
  if (source === 'tx') return 'inland'
  if (source === 'wy') return 'ALL'
  return ''
}
