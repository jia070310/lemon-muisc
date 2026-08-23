import { reactive, ref } from 'vue'

export const discoverState = reactive({
  url: '',
  activeSource: '',
  sources: {},
  results: [],
  playlistInfo: null,
  total: 0,
  loading: false,
  fetched: false,
  viewMode: 'recommend', // recommend | detail
  recommendList: [],
  recommendLoading: false,
  recommendSort: 'hot',
  recommendPage: 1,
})

export const discoverSourcesLoaded = ref(false)

export async function loadDiscoverSources(api) {
  if (discoverSourcesLoaded.value && Object.keys(discoverState.sources).length) return
  try {
    const res = await api.playlist.sources()
    discoverState.sources = res.sources || {}
  } catch {
    discoverState.sources = {
      kw: { name: '酷我' }, kg: { name: '酷狗' }, tx: { name: 'QQ音乐' },
      wy: { name: '网易云' }, mg: { name: '咪咕' },
    }
  }
  const keys = Object.keys(discoverState.sources)
  if (!discoverState.activeSource && keys.length) {
    discoverState.activeSource = keys[0]
  }
  discoverSourcesLoaded.value = true
}

export const sourcePlaceholders = {
  kw: '粘贴酷我歌单链接或 ID，如 https://www.kuwo.cn/playlist_detail/2886046289',
  kg: '粘贴酷狗歌单分享链接或官方歌单 ID',
  tx: '粘贴 QQ 音乐歌单链接或 ID，如 https://y.qq.com/n/yqq/playlist/7217720898.html',
  wy: '粘贴网易云歌单链接或 ID；私人歌单：ID###MUSIC_U',
  mg: '粘贴咪咕歌单链接或 ID，如 https://music.migu.cn/v3/music/playlist/161044573',
}

export const recommendSortOptions = [
  { id: 'hot', label: '最热' },
  { id: 'new', label: '最新' },
]
