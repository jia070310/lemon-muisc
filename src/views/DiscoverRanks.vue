<template>
  <div class="discover-more-page">
    <div class="more-toolbar">
      <button type="button" class="btn-ghost btn-sm" @click="onBack">← {{ detailId ? '返回榜单' : '返回发现' }}</button>
      <h1 class="more-title">{{ detailId ? detailTitle : (detailInfo?.name || '排行榜') }}</h1>
    </div>

    <div v-if="!detailId" class="more-filters card">
      <div class="source-tabs">
        <button
          v-for="(info, key) in sources"
          :key="key"
          type="button"
          class="tab"
          :class="{ active: source === key }"
          @click="onSourceChange(key)"
        >{{ platformLabel(key, info) }}</button>
      </div>
    </div>

    <div
      v-if="showLoadBar"
      class="rank-load-bar card"
      role="progressbar"
      :aria-valuenow="loadProgress"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="loadLabel"
    >
      <div class="rank-load-meta">
        <span class="rank-load-text">{{ loadLabel }}</span>
        <span class="rank-load-percent">{{ loadProgress }}%</span>
      </div>
      <div class="rank-load-track" :class="{ indeterminate: loadIndeterminate }">
        <div class="rank-load-fill" :style="{ width: `${loadProgress}%` }" />
      </div>
    </div>

    <template v-if="!detailId">
      <div v-if="loading && !list.length" class="state">正在加载排行榜...</div>
      <div v-else-if="unsupported" class="state">当前平台暂不支持</div>
      <div v-else-if="error && !list.length" class="state error">{{ error }}</div>
      <div v-else-if="!list.length" class="state">暂无排行榜</div>
      <div v-else class="rank-grid">
        <button
          v-for="(item, idx) in list"
          :key="`${item.source}-${item.id}`"
          type="button"
          class="rank-card"
          :style="cardStyle(item, idx)"
          @click="openDetail(item)"
        >
          <div class="rank-name">{{ cleanText(item.name) }}</div>
          <ol class="rank-songs">
            <li v-for="(song, i) in previewSongs(item)" :key="i">
              {{ i + 1 }}. {{ song.name }}<template v-if="song.singer"> - {{ song.singer }}</template>
            </li>
            <li v-if="!previewSongs(item).length">点击查看榜单</li>
          </ol>
        </button>
      </div>
    </template>

    <template v-else>
      <div v-if="detailLoading && !detailTracks.length" class="state">正在加载榜单歌曲...</div>
      <div v-else-if="detailError && !detailTracks.length" class="state error">{{ detailError }}</div>
      <div v-else-if="!detailTracks.length" class="state">暂无歌曲，请稍后重试或换其他榜单</div>
      <div v-else class="song-list card">
        <div class="detail-actions">
          <button type="button" class="btn-primary btn-sm" :disabled="!detailTracks.length" @click="playAll">播放全部</button>
        </div>
        <div class="song-grid">
          <DiscoverSongItem
            v-for="(item, i) in detailTracks"
            :key="`${item.songmid || item.hash || item.id}-${i}`"
            :item="item"
            :index="i + 1"
            :playing="isPlayingItem(item)"
            :paused="isPaused"
            :loading="loadingPlay === item.id"
            :eager-cover="i < 40"
            @play="playOne(item)"
          >
            <template #actions>
              <DiscoverSongActions
                :item="item"
                :source="item.source || source"
                @toast="onToast"
              />
            </template>
          </DiscoverSongItem>
        </div>
      </div>
    </template>

    <div v-if="toast" class="toast" :class="toast.type">{{ toast.text }}</div>
  </div>
</template>

<script setup>
defineOptions({ name: 'DiscoverRanks' })
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DiscoverSongItem from '../components/discover/DiscoverSongItem.vue'
import DiscoverSongActions from '../components/discover/DiscoverSongActions.vue'
import { useProgressiveTrackCovers } from '../composables/useProgressiveTrackCovers.js'
import { api } from '../api.js'
import { discoverState, loadDiscoverSources } from '../stores/discover.js'
import { playItem, addToQueue, isPlayingItem, isPaused, loadingPlay } from '../stores/player.js'
import { platformLabel } from '../utils/platforms.js'
import { cleanText } from '../utils/text.js'

const route = useRoute()
const router = useRouter()
const sources = ref({})
const source = ref(String(route.query.source || discoverState.activeSource || 'tx'))
const list = ref([])
const loading = ref(false)
const error = ref('')
const unsupported = ref(false)
const toast = ref(null)
let toastTimer = 0

function onToast({ text, type }) {
  toast.value = { text, type: type || 'info' }
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toast.value = null }, 2800)
}

const detailId = computed(() => String(route.query.id || ''))
const detailInfo = ref(null)
const detailTracks = ref([])
const detailLoading = ref(false)
const detailError = ref('')

const detailTitle = computed(() => {
  return detailInfo.value?.name
    || String(route.query.name || '').trim()
    || '排行榜'
})

useProgressiveTrackCovers(() => detailTracks.value, {
  getSource: () => source.value,
  enabled: () => Boolean(detailId.value),
})

const loadProgress = ref(0)
const loadVisible = ref(false)
const loadPhase = ref('idle') // idle | lists | detail | done
let progressTimer = null
let hideTimer = null

const showLoadBar = computed(() => loadVisible.value && (loading.value || detailLoading.value || loadPhase.value === 'done'))
const loadIndeterminate = computed(() => loadProgress.value < 8 && (loading.value || detailLoading.value))
const loadLabel = computed(() => {
  if (loadPhase.value === 'detail' || detailLoading.value) {
    const n = detailTracks.value.length
    return n ? `已加载 ${n} 首` : '正在加载榜单详情…'
  }
  if (loadPhase.value === 'lists' || loading.value) {
    return list.value.length ? `已加载 ${list.value.length} 个榜单` : '正在加载排行榜…'
  }
  return detailTracks.value.length
    ? `加载完成，共 ${detailTracks.value.length} 首`
    : '加载完成'
})

const PALETTE = [
  'linear-gradient(160deg, #e8a0b0, #c45c7a)',
  'linear-gradient(160deg, #c45c7a, #8b3a55)',
  'linear-gradient(160deg, #8fa3b5, #5a6f82)',
  'linear-gradient(160deg, #7ec8b5, #3d8f7c)',
  'linear-gradient(160deg, #5a8f8a, #2f5e5a)',
]

function cardStyle(item, idx) {
  return {
    background: item.color || PALETTE[idx % PALETTE.length],
  }
}

/** 过滤空预览，并兼容 author/songname 等字段 */
function previewSongs(item) {
  return (item?.songs || [])
    .map((s) => {
      if (!s || typeof s !== 'object') return null
      let name = cleanText(s.name || s.title || '')
      let singer = cleanText(s.singer || s.author || s.artist || '')
      const combined = cleanText(s.songname || s.filename || '')
      if ((!name || !singer) && combined) {
        const parts = combined.split(/\s*-\s*/)
        if (parts.length > 1) {
          if (!singer) singer = parts[0]
          if (!name) name = parts.slice(1).join(' - ')
        } else if (!name) {
          name = combined
        }
      }
      if (!name && !singer) return null
      return { name: name || '未知歌曲', singer }
    })
    .filter(Boolean)
    .slice(0, 3)
}

function clearProgressTimers() {
  if (progressTimer) {
    clearInterval(progressTimer)
    progressTimer = null
  }
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

function startProgress(phase) {
  clearProgressTimers()
  loadPhase.value = phase
  loadVisible.value = true
  loadProgress.value = 6
  progressTimer = setInterval(() => {
    if (loadProgress.value >= 92) return
    const step = loadProgress.value < 40 ? 7 : loadProgress.value < 70 ? 4 : 2
    loadProgress.value = Math.min(92, loadProgress.value + step)
  }, 180)
}

function finishProgress() {
  clearProgressTimers()
  loadProgress.value = 100
  loadPhase.value = 'done'
  hideTimer = setTimeout(() => {
    loadVisible.value = false
    loadPhase.value = 'idle'
    loadProgress.value = 0
    hideTimer = null
  }, 420)
}

function onBack() {
  if (detailId.value) {
    router.replace({ path: '/discover/ranks', query: { source: source.value } })
    return
  }
  router.push('/discover')
}

function openDetail(item) {
  router.push({
    path: '/discover/ranks',
    query: {
      source: item.source || source.value,
      id: String(item.id),
      name: item.name ? String(item.name) : undefined,
    },
  })
}

async function onSourceChange(key) {
  if (source.value === key) return
  source.value = key
  list.value = []
  await loadLists()
}

async function loadLists() {
  loading.value = true
  error.value = ''
  unsupported.value = false
  startProgress('lists')
  try {
    const res = await api.discover.toplists(source.value)
    const data = res.data || {}
    list.value = (data.list || []).map((item) => ({
      ...item,
      songs: previewSongs(item),
    }))
    unsupported.value = Boolean(data.unsupported)
  } catch (e) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
    finishProgress()
  }
}

async function loadDetail() {
  if (!detailId.value) return
  detailLoading.value = true
  detailError.value = ''
  detailTracks.value = []
  const queryName = String(route.query.name || '').trim()
  if (queryName) detailInfo.value = { name: queryName }
  startProgress('detail')
  try {
    const pageSize = 100
    let page = 1
    let total = Infinity
    const all = []
    let info = { name: queryName || '排行榜' }
    while (all.length < total) {
      const res = await api.discover.toplist(source.value, detailId.value, page, pageSize)
      const data = res.data || {}
      if (data.info) {
        info = {
          ...data.info,
          name: data.info.name && data.info.name !== '排行榜'
            ? data.info.name
            : (info.name || queryName || '排行榜'),
        }
      }
      const batch = data.list || []
      all.push(...batch)
      total = Number(data.total) || all.length
      detailInfo.value = info
      // 第一页到手就展示，后续页追加，封面可立即出现
      detailTracks.value = all.slice()
      if (page === 1) detailLoading.value = false
      if (!batch.length || batch.length < pageSize || all.length >= total) break
      page += 1
      if (page > 30) break
    }
    detailInfo.value = info
    detailTracks.value = all
    if (!all.length) {
      detailError.value = '榜单暂无歌曲或接口暂时不可用，请稍后重试'
    }
  } catch (e) {
    detailError.value = e.message || '加载榜单失败'
  } finally {
    detailLoading.value = false
    finishProgress()
  }
}

async function playOne(item) {
  try {
    await playItem(item, item.source || source.value)
  } catch (e) {
    detailError.value = e.message || '播放失败'
  }
}

async function playAll() {
  if (!detailTracks.value.length) return
  for (const item of detailTracks.value.slice(0, 100)) {
    addToQueue(item, item.source || source.value)
  }
  try {
    await playItem(detailTracks.value[0], detailTracks.value[0].source || source.value)
  } catch (e) {
    detailError.value = e.message || '播放失败'
  }
}

watch(detailId, async (id) => {
  if (id) {
    await loadDetail()
    return
  }
  detailInfo.value = null
  detailTracks.value = []
  if (!list.value.length) await loadLists()
})

onMounted(async () => {
  await loadDiscoverSources(api)
  sources.value = discoverState.sources
  if (!sources.value[source.value]) source.value = Object.keys(sources.value)[0] || source.value
  if (detailId.value) await loadDetail()
  else await loadLists()
})

onUnmounted(() => {
  clearProgressTimers()
})
</script>

<style scoped>
.discover-more-page { padding-bottom: 24px; }
.more-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.more-title {
  margin: 0; font-size: 20px; font-weight: 700;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.more-filters {
  display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
  padding: 12px 14px; margin-bottom: 16px;
}
.source-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.tab {
  padding: 5px 14px;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  border: 1px solid var(--border);
  cursor: pointer;
}
.tab:hover { background: var(--bg-hover); color: var(--text); }
.tab.active {
  color: #fff;
  background: var(--accent);
  border-color: var(--accent);
}
.rank-load-bar {
  padding: 12px 16px;
  margin-bottom: 14px;
}
.rank-load-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}
.rank-load-percent {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
  font-weight: 600;
}
.rank-load-track {
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--bg-input);
  overflow: hidden;
  border: 1px solid var(--border-light);
}
.rank-load-track.indeterminate .rank-load-fill {
  width: 35% !important;
  animation: rank-load-indeterminate 1.2s ease-in-out infinite;
}
.rank-load-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--lemon-gradient, linear-gradient(90deg, var(--accent), #f59e0b));
  transition: width 0.28s ease;
}
@keyframes rank-load-indeterminate {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(320%); }
}
.state { text-align: center; padding: 40px 8px; color: var(--text-muted); }
.state.error { color: var(--error); }
.rank-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}
.rank-card {
  min-height: 220px; border: none; border-radius: 12px; padding: 16px 14px;
  color: #fff; text-align: left; cursor: pointer;
}
.rank-name { font-size: 18px; font-weight: 700; margin-bottom: 12px; }
.rank-songs { margin: 0; padding-left: 0; list-style: none; font-size: 12px; opacity: 0.95; }
.rank-songs li {
  margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.song-list { padding: 8px; }
.detail-actions { margin-bottom: 8px; }
.song-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 12px;
}
.song-list :deep(.discover-song-item) {
  border-radius: 10px;
}
@media (max-width: 960px) {
  .song-list :deep(.song-time) { display: none; }
}

.toast {
  position: fixed;
  bottom: 80px;
  right: 24px;
  padding: 10px 20px;
  border-radius: var(--radius);
  font-size: 14px;
  z-index: 1000;
  box-shadow: var(--shadow);
}
.toast.success { background: var(--success); color: #fff; }
.toast.error { background: var(--error); color: #fff; }
.toast.info { background: var(--bg-card); border: 1px solid var(--border); color: var(--text); }

@media (max-width: 640px) {
  .song-grid {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}
</style>
