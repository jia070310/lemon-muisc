<template>
  <div class="discover-page">
    <div class="page-title">发现</div>
    <div class="page-subtitle">输入各平台歌单链接，浏览并试听、下载；可多选后批量下载，不支持所选音质时将自动降档</div>

    <div v-if="playlistPickTarget" class="pick-hint card">
      点击歌曲右侧「加入歌单」添加到「{{ playlistPickTarget.name }}」
    </div>

    <div class="discover-header card">
      <form class="discover-row" @submit.prevent="fetchPlaylistByInput">
        <div class="discover-bar">
          <svg class="discover-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
          <input
            v-model="discoverState.url"
            :placeholder="currentPlaceholder"
            class="discover-input"
            enterkeyhint="go"
          />
        </div>
        <button type="submit" class="btn-primary discover-btn" :disabled="discoverState.loading">
          {{ discoverState.loading ? '加载中...' : '确认' }}
        </button>
      </form>
      <div class="source-tabs">
        <button
          v-for="(info, key) in discoverState.sources" :key="key"
          :class="['tab', { active: discoverState.activeSource === key }]"
          @click="switchSource(key)"
        >{{ platformLabel(key, info) }}</button>
      </div>
      <div v-if="showRecommend" class="sort-tabs">
        <button
          v-for="opt in recommendSortOptions" :key="opt.id"
          :class="['sort-tab', { active: discoverState.recommendSort === opt.id }]"
          @click="changeRecommendSort(opt.id)"
        >{{ opt.label }}</button>
      </div>
    </div>

    <div v-if="showRecommend" class="recommend-section">
      <div v-if="discoverState.recommendLoading && !discoverState.recommendList.length" class="recommend-loading">
        正在加载推荐歌单...
      </div>
      <template v-else>
        <div v-if="discoverState.recommendList.length" class="recommend-grid">
          <button
            v-for="item in discoverState.recommendList" :key="`${item.source}-${item.id}`"
            class="recommend-card"
            @click="openRecommendPlaylist(item)"
          >
            <div class="recommend-cover-wrap">
              <img v-if="item.img" :src="item.img" class="recommend-cover" alt="" loading="lazy" @error="onCoverError" />
              <div v-else class="recommend-cover placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              </div>
            </div>
            <div class="recommend-meta">
              <div class="recommend-name" :title="cleanText(item.name)">{{ cleanText(item.name) }}</div>
              <div class="recommend-author" :title="cleanText(item.author)">{{ cleanText(item.author) || '未知作者' }}</div>
              <div class="recommend-stats">
                <span v-if="item.total"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>{{ item.total }}</span>
                <span v-if="item.play_count"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>{{ item.play_count }}</span>
              </div>
            </div>
          </button>
        </div>
        <div v-else class="empty">暂无推荐歌单</div>
        <div v-if="discoverState.recommendList.length" class="recommend-footer">
          <span v-if="discoverState.recommendTotal" class="recommend-count">
            已显示 {{ discoverState.recommendList.length }}
            <template v-if="discoverState.recommendTotal > discoverState.recommendList.length">
              / {{ discoverState.recommendTotal }}
            </template>
            个歌单
          </span>
          <button
            v-if="discoverState.recommendHasMore"
            type="button"
            class="btn-ghost recommend-more-btn"
            :disabled="discoverState.recommendLoadingMore"
            @click="loadMoreRecommend"
          >
            {{ discoverState.recommendLoadingMore ? '加载中...' : '加载更多歌单' }}
          </button>
        </div>
      </template>
    </div>

    <div v-if="discoverState.viewMode === 'detail' && discoverState.playlistInfo" class="detail-toolbar">
      <button class="btn-ghost btn-sm" @click="backToRecommend">← 返回推荐歌单</button>
    </div>

    <div v-if="discoverState.viewMode === 'detail' && discoverState.playlistInfo" class="playlist-info card">
      <div class="playlist-cover-wrap">
        <img
          v-if="discoverState.playlistInfo.img"
          :src="discoverState.playlistInfo.img"
          class="playlist-cover"
          alt=""
          @error="onCoverError"
        />
        <div v-else class="playlist-cover placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        </div>
      </div>
      <div class="playlist-meta">
        <h2 class="playlist-name">{{ cleanText(discoverState.playlistInfo.name) || '未命名歌单' }}</h2>
        <div class="playlist-tags">
          <span v-if="discoverState.playlistInfo.author">创建者：{{ cleanText(discoverState.playlistInfo.author) }}</span>
          <span v-if="discoverState.playlistInfo.play_count">播放 {{ discoverState.playlistInfo.play_count }}</span>
          <span>共 {{ discoverState.total || discoverState.results.length }} 首</span>
        </div>
        <p v-if="discoverState.playlistInfo.desc" class="playlist-desc">{{ cleanText(discoverState.playlistInfo.desc) }}</p>
      </div>
    </div>

    <div
      v-if="discoverState.viewMode === 'detail' && showPlaylistLoadBar"
      class="playlist-load-bar card"
      role="progressbar"
      :aria-valuenow="playlistLoadProgress"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="playlistLoadLabel"
    >
      <div class="playlist-load-meta">
        <span class="playlist-load-text">{{ playlistLoadLabel }}</span>
        <span v-if="!discoverState.loading || discoverState.results.length" class="playlist-load-percent">{{ playlistLoadProgress }}%</span>
      </div>
      <div class="playlist-load-track" :class="{ indeterminate: discoverState.loading && !discoverState.results.length }">
        <div class="playlist-load-fill" :style="{ width: `${playlistLoadProgress}%` }" />
      </div>
    </div>

    <div class="results card" v-if="discoverState.viewMode === 'detail' && discoverState.results.length">
      <div class="results-toolbar">
        <span class="results-count">
          共 {{ discoverState.total || discoverState.results.length }} 首
          <template v-if="showPagination"> · 第 {{ playlistTrackPage }}/{{ playlistTrackTotalPages }} 页</template>
          <template v-if="discoverState.loadingMore"> · 加载剩余歌曲...</template>
          <template v-if="selectedCount"> · 已选 {{ selectedCount }}</template>
        </span>
        <label class="mobile-select-all">
          <input type="checkbox" :checked="allSelected" :indeterminate.prop="someSelected && !allSelected" @change="toggleSelectAll" />
          全选
        </label>
        <div class="results-actions">
          <div class="dl-wrap batch-dl-wrap">
            <button
              class="btn-primary btn-sm"
              :disabled="!selectedCount || batchDownloading"
              @click.stop="toggleBatchQualityMenu($event)"
            >
              {{ batchDownloading ? '添加中...' : `批量下载${selectedCount ? ` (${selectedCount})` : ''}` }}
            </button>
            <div class="quality-menu" v-if="showBatchQualityMenu" :style="batchMenuStyle" @click.stop>
              <div class="quality-menu-title">批量音质：不支持时将自动降为最接近可用音质</div>
              <button
                v-for="q in batchQualities"
                :key="q"
                class="quality-option"
                @click="downloadSelected(q)"
              >{{ getQualityLabel(q) }}</button>
            </div>
          </div>
          <button class="btn-ghost btn-sm" @click="addAllToQueue">全部加入列表</button>
          <button class="btn-primary btn-sm" @click="playAll">播放全部</button>
        </div>
      </div>
      <div class="result-header">
        <span class="col-check">
          <input type="checkbox" :checked="allSelected" :indeterminate.prop="someSelected && !allSelected" @change="toggleSelectAll" title="全选" />
        </span>
        <span class="col-index">#</span>
        <span class="col-name">歌曲</span>
        <span class="col-singer">歌手</span>
        <span class="col-album">专辑</span>
        <span class="col-duration">时长</span>
        <span class="col-play">试听</span>
        <span class="col-queue">列表</span>
        <span class="col-action">操作</span>
      </div>
      <div
        ref="trackListContainerRef"
        class="result-list-body"
        :class="{ 'is-virtual': trackListUseVirtual }"
        @scroll="onTrackListScroll"
      >
        <div
          class="result-list-spacer"
          :style="{ paddingTop: `${trackListPaddingTop}px`, paddingBottom: `${trackListPaddingBottom}px` }"
        >
      <TrackResultRow
        v-for="{ item, i } in displayRows" :key="trackSelectKey(item, i)"
        :item="item"
        :index="i"
        :selected="isSelected(item, i)"
        :playing="isPlayingItem(item)"
        :paused="isPaused"
        :loading="loadingPlay === item.id"
        :in-queue="isInQueue(item, activeSource)"
        :show-playlist-pick="Boolean(playlistPickTarget)"
        :quality-menu-open="qualityMenuId === trackSelectKey(item, i)"
        :menu-style="menuStyle"
        @toggle-select="toggleSelect(item, i)"
        @toggle-play="togglePlay(item)"
        @add-queue="addOneToQueue(item)"
        @add-playlist="addToPlaylist(item)"
        @toggle-quality-menu="toggleQualityMenu(item, i, $event)"
        @download="downloadOne(item, $event)"
      />
        </div>
      </div>

      <div class="pagination" v-if="showPagination">
        <button class="btn-ghost btn-sm" :disabled="playlistTrackPage <= 1" @click="playlistTrackPage--">上一页</button>
        <span class="page-info">{{ playlistTrackPage }} / {{ playlistTrackTotalPages }}</span>
        <button class="btn-ghost btn-sm" :disabled="playlistTrackPage >= playlistTrackTotalPages" @click="playlistTrackPage++">下一页</button>
      </div>
    </div>

    <div v-else-if="discoverState.viewMode === 'detail' && discoverState.fetched && !discoverState.loading" class="empty">暂无歌曲，请检查歌单链接是否正确</div>

    <div v-if="toast" class="toast" :class="toast.type">{{ toast.text }}</div>

    <BatchQualityDialog
      :plan="batchDialog"
      :preferred-label="batchPreferredLabel"
      :busy="batchDownloading"
      @cancel="closeBatchDialog"
      @confirm="handleBatchConfirm"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import BatchQualityDialog from '../components/BatchQualityDialog.vue'
import TrackResultRow from '../components/TrackResultRow.vue'
import { useBatchDownload, formatBatchDownloadToast } from '../composables/useBatchDownload.js'
import { useTrackListView } from '../composables/useTrackListView.js'
import { api } from '../api.js'
import { discoverState, loadDiscoverSources, reloadDiscoverSources, sourcePlaceholders, recommendSortOptions } from '../stores/discover.js'
import { loadingPlay, isPaused, isPlayingItem, playItem, addToQueue, isInQueue } from '../stores/player.js'
import { getQualityLabel } from '../utils/quality.js'
import { platformLabel } from '../utils/platforms.js'
import { cleanText, cleanTrackItem } from '../utils/text.js'
import {
  trackSelectKey,
  buildDownloadTask,
} from '../utils/musicPayload.js'
import { useQualityMenuPosition } from '../utils/qualityMenu.js'
import { playlistPickTarget, addToPickingPlaylist } from '../stores/library.js'

const toast = ref(null)
const qualityMenuId = ref(null)
const showBatchQualityMenu = ref(false)
const selectedKeys = ref(new Set())
const { menuStyle, positionMenu, clearMenuPosition } = useQualityMenuPosition()
const { menuStyle: batchMenuStyle, positionMenu: positionBatchMenu, clearMenuPosition: clearBatchMenuPosition } = useQualityMenuPosition()

const {
  batchDialog,
  batchDownloading,
  startBatchDownload,
  confirmBatchDialog,
  closeBatchDialog,
  getBatchQualities,
} = useBatchDownload({
  getSource: () => activeSource.value,
  onCompleted: (count, summary) => {
    showToast(formatBatchDownloadToast(count, summary), 'success')
    clearSelection()
  },
  onError: (e) => showToast(e.message, 'error'),
})

const activeSource = computed(() => discoverState.activeSource)
const showRecommend = computed(() => discoverState.viewMode === 'recommend')
const currentPlaceholder = computed(() =>
  sourcePlaceholders[discoverState.activeSource] || '粘贴歌单链接或 ID')

const showPlaylistLoadBar = computed(() =>
  discoverState.viewMode === 'detail' && (discoverState.loading || discoverState.loadingMore))

const playlistLoadProgress = computed(() => {
  const total = discoverState.total || 0
  const loaded = discoverState.results.length
  if (discoverState.loading && !loaded) return 0
  if (!total) return discoverState.loadingMore ? 60 : 100
  const pct = Math.round((loaded / total) * 100)
  if (discoverState.loadingMore) return Math.min(95, Math.max(pct, 8))
  return Math.min(100, pct)
})

const playlistLoadLabel = computed(() => {
  const total = discoverState.total || 0
  const loaded = discoverState.results.length
  if (discoverState.loading && !loaded) return '正在解析歌单...'
  if (discoverState.loadingMore) {
    return total
      ? `已加载 ${loaded} / ${total} 首，继续加载剩余歌曲...`
      : '正在加载剩余歌曲...'
  }
  return '歌单加载完成'
})

const selectedCount = computed(() => selectedKeys.value.size)
const allSelected = computed(() =>
  discoverState.results.length > 0
  && discoverState.results.every((item, i) => selectedKeys.value.has(trackSelectKey(item, i)))
)
const someSelected = computed(() => selectedCount.value > 0)
const selectedItems = computed(() =>
  discoverState.results.filter((item, i) => selectedKeys.value.has(trackSelectKey(item, i)))
)
const batchQualities = computed(() => getBatchQualities(selectedItems.value))
const batchPreferredLabel = computed(() => {
  const q = batchDialog.value?.preferred
  return q ? getQualityLabel(q) : ''
})

const MAX_PLAYLIST_QUEUE = 100
const {
  page: playlistTrackPage,
  totalPages: playlistTrackTotalPages,
  displayRows,
  containerRef: trackListContainerRef,
  useVirtual: trackListUseVirtual,
  paddingTop: trackListPaddingTop,
  paddingBottom: trackListPaddingBottom,
  onScroll: onTrackListScroll,
  resetView: resetPlaylistTrackPage,
  showPagination,
  measureViewport,
} = useTrackListView(() => discoverState.results)

function getSelectedEntries() {
  return discoverState.results
    .map((item, index) => ({ item, key: trackSelectKey(item, index) }))
    .filter(({ key }) => selectedKeys.value.has(key))
}

let discoverSeq = 0
let playlistFetchAbort = null
let recommendAbort = null

function cancelPlaylistFetch() {
  playlistFetchAbort?.abort()
  playlistFetchAbort = null
}

function cancelRecommendFetch() {
  recommendAbort?.abort()
  recommendAbort = null
}

function isAbortedError(e) {
  return e?.aborted || e?.name === 'AbortError' || e?.message === '请求已取消'
}

onMounted(async () => {
  await loadDiscoverSources(api, { force: true })
  loadRecommend()
  document.addEventListener('click', closeMenus)
})

watch(() => discoverState.results.length, () => {
  nextTick(() => measureViewport())
})

watch(() => discoverState.activeSource, () => {
  if (discoverState.viewMode === 'recommend') loadRecommend()
})

function switchSource(key) {
  if (discoverState.activeSource === key) return
  discoverState.activeSource = key
  discoverState.url = ''
  discoverState.viewMode = 'recommend'
  discoverState.fetched = false
  discoverState.results = []
  discoverState.playlistInfo = null
  discoverState.recommendPage = 1
  clearSelection()
  closeMenus()
  loadRecommend()
}

function changeRecommendSort(sort) {
  if (discoverState.recommendSort === sort) return
  discoverState.recommendSort = sort
  discoverState.recommendPage = 1
  loadRecommend()
}

function applyRecommendPage(data, { append = false } = {}) {
  const list = data?.list || []
  const total = Number(data?.total) || 0
  const limit = Number(data?.limit) || list.length || 30

  if (append) {
    const seen = new Set(discoverState.recommendList.map((item) => `${item.source}:${item.id}`))
    for (const item of list) {
      const key = `${item.source}:${item.id}`
      if (seen.has(key)) continue
      discoverState.recommendList.push(item)
      seen.add(key)
    }
  } else {
    discoverState.recommendList = list
  }

  const loaded = discoverState.recommendList.length
  if (!list.length) {
    discoverState.recommendHasMore = false
  } else if (total > loaded) {
    discoverState.recommendHasMore = true
  } else {
    discoverState.recommendHasMore = list.length >= limit
  }
  discoverState.recommendTotal = total > loaded ? total : loaded
}

async function loadRecommend(retrying = false) {
  if (!discoverState.activeSource) return

  cancelRecommendFetch()
  const controller = new AbortController()
  recommendAbort = controller
  const seq = ++discoverSeq
  const source = discoverState.activeSource
  const sort = discoverState.recommendSort

  discoverState.recommendPage = 1
  discoverState.recommendLoading = true
  discoverState.recommendHasMore = false
  try {
    const res = await api.playlist.recommend(source, sort, 1, { signal: controller.signal })
    if (seq !== discoverSeq || source !== discoverState.activeSource) return
    applyRecommendPage(res.data, { append: false })
  } catch (e) {
    if (isAbortedError(e)) return
    if (seq !== discoverSeq) return
    discoverState.recommendList = []
    discoverState.recommendHasMore = false
    discoverState.recommendTotal = 0
    if (!retrying && /不支持的平台/.test(e.message)) {
      const prev = discoverState.activeSource
      await reloadDiscoverSources(api)
      if (discoverState.activeSource !== prev && discoverState.activeSource) {
        discoverState.recommendLoading = false
        return loadRecommend(true)
      }
    }
    showToast(e.message, 'error')
  } finally {
    if (recommendAbort === controller) recommendAbort = null
    if (seq === discoverSeq) discoverState.recommendLoading = false
  }
}

async function loadMoreRecommend() {
  if (!discoverState.activeSource || !discoverState.recommendHasMore || discoverState.recommendLoadingMore) return

  cancelRecommendFetch()
  const controller = new AbortController()
  recommendAbort = controller
  const seq = ++discoverSeq
  const source = discoverState.activeSource
  const sort = discoverState.recommendSort
  const nextPage = discoverState.recommendPage + 1

  discoverState.recommendLoadingMore = true
  try {
    const res = await api.playlist.recommend(source, sort, nextPage, { signal: controller.signal })
    if (seq !== discoverSeq || source !== discoverState.activeSource) return
    const before = discoverState.recommendList.length
    discoverState.recommendPage = nextPage
    applyRecommendPage(res.data, { append: true })
    if (discoverState.recommendList.length === before) {
      discoverState.recommendHasMore = false
    }
  } catch (e) {
    if (isAbortedError(e)) return
    if (seq !== discoverSeq) return
    showToast(e.message, 'error')
  } finally {
    if (recommendAbort === controller) recommendAbort = null
    if (seq === discoverSeq) discoverState.recommendLoadingMore = false
  }
}

function backToRecommend() {
  discoverState.viewMode = 'recommend'
  discoverState.fetched = false
  discoverState.results = []
  discoverState.playlistInfo = null
  discoverState.url = ''
  clearSelection()
  closeMenus()
}

async function openRecommendPlaylist(item) {
  discoverState.url = item.id
  await fetchPlaylist()
}

async function fetchPlaylistByInput() {
  if (!discoverState.url.trim()) {
    backToRecommend()
    return
  }
  await fetchPlaylist()
}

onUnmounted(() => {
  document.removeEventListener('click', closeMenus)
  cancelPlaylistFetch()
  cancelRecommendFetch()
})

function onCoverError(e) {
  e.target.style.display = 'none'
}

function isSelected(item, i) {
  return selectedKeys.value.has(trackSelectKey(item, i))
}

function toggleSelect(item, i) {
  const key = trackSelectKey(item, i)
  const next = new Set(selectedKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selectedKeys.value = next
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedKeys.value = new Set()
    return
  }
  selectedKeys.value = new Set(discoverState.results.map((item, i) => trackSelectKey(item, i)))
}

function clearSelection() {
  selectedKeys.value = new Set()
}

function toggleQualityMenu(item, i, event) {
  showBatchQualityMenu.value = false
  clearBatchMenuPosition()
  const key = trackSelectKey(item, i)
  if (qualityMenuId.value === key) {
    qualityMenuId.value = null
    clearMenuPosition()
    return
  }
  qualityMenuId.value = key
  positionMenu(event?.currentTarget, { align: 'right' })
}

function toggleBatchQualityMenu(event) {
  if (!selectedCount.value) return
  qualityMenuId.value = null
  clearMenuPosition()
  showBatchQualityMenu.value = !showBatchQualityMenu.value
  if (showBatchQualityMenu.value) {
    positionBatchMenu(event?.currentTarget, { align: 'left' })
  } else {
    clearBatchMenuPosition()
  }
}

function closeMenus() {
  qualityMenuId.value = null
  showBatchQualityMenu.value = false
  clearMenuPosition()
  clearBatchMenuPosition()
}

async function togglePlay(item) {
  try {
    await playItem(item, activeSource.value)
  } catch (e) {
    showToast(e.message || '试听失败', 'error')
  }
}

function addOneToQueue(item) {
  if (isInQueue(item, activeSource.value)) {
    showToast('已在试听列表', 'info')
    return
  }
  addToQueue(item, activeSource.value)
  showToast(`已加入列表: ${item.name}`, 'success')
}

function addAllToQueue() {
  let added = 0
  const items = discoverState.results.slice(0, MAX_PLAYLIST_QUEUE)
  for (const item of items) {
    if (!isInQueue(item, activeSource.value)) {
      addToQueue(item, activeSource.value)
      added++
    }
  }
  const tip = discoverState.results.length > MAX_PLAYLIST_QUEUE
    ? `已加入 ${added} 首（仅前 ${MAX_PLAYLIST_QUEUE} 首，共 ${discoverState.results.length} 首）`
    : (added ? `已加入 ${added} 首` : '全部已在列表中')
  showToast(tip, added ? 'success' : 'info')
}

async function playAll() {
  if (!discoverState.results.length) return
  const items = discoverState.results.slice(0, MAX_PLAYLIST_QUEUE)
  for (const item of items) {
    addToQueue(item, activeSource.value)
  }
  try {
    await playItem(items[0], activeSource.value)
    const tip = discoverState.results.length > MAX_PLAYLIST_QUEUE
      ? `开始播放，已加入前 ${MAX_PLAYLIST_QUEUE} 首（共 ${discoverState.results.length} 首）`
      : `开始播放，共 ${items.length} 首`
    showToast(tip, 'success')
  } catch (e) {
    showToast(e.message || '播放失败', 'error')
  }
}

async function fetchPlaylist() {
  const input = discoverState.url.trim()
  if (!input || !discoverState.activeSource) return

  cancelPlaylistFetch()
  const controller = new AbortController()
  playlistFetchAbort = controller
  const seq = ++discoverSeq
  const source = discoverState.activeSource

  discoverState.loading = true
  discoverState.loadingMore = false
  discoverState.fetched = true
  discoverState.viewMode = 'detail'
  discoverState.results = []
  discoverState.playlistInfo = null
  discoverState.total = 0
  resetPlaylistTrackPage()
  clearSelection()
  closeMenus()
  try {
    const partialRes = await api.playlist.fetch(input, source, { partial: true, signal: controller.signal })
    if (seq !== discoverSeq || source !== discoverState.activeSource) return
    const partialData = partialRes.data
    discoverState.results = (partialData.list || []).map(cleanTrackItem)
    discoverState.playlistInfo = partialData.info || null
    discoverState.total = partialData.total || discoverState.results.length
    discoverState.loading = false

    if (partialData.hasMore) {
      discoverState.loadingMore = true
      try {
        const fullRes = await api.playlist.fetch(input, source, { signal: controller.signal })
        if (seq !== discoverSeq || source !== discoverState.activeSource) return
        const fullData = fullRes.data
        discoverState.results = (fullData.list || []).map(cleanTrackItem)
        discoverState.playlistInfo = fullData.info || discoverState.playlistInfo
        discoverState.total = fullData.total || discoverState.results.length
      } catch (e) {
        if (!isAbortedError(e)) showToast(e.message || '剩余歌曲加载失败', 'error')
      } finally {
        if (seq === discoverSeq) discoverState.loadingMore = false
      }
    }

    if (!discoverState.results.length) {
      showToast('歌单为空或解析失败', 'error')
    }
  } catch (e) {
    if (isAbortedError(e)) return
    if (seq !== discoverSeq) return
    discoverState.results = []
    discoverState.playlistInfo = null
    showToast(e.message, 'error')
  } finally {
    if (playlistFetchAbort === controller) playlistFetchAbort = null
    if (seq === discoverSeq) {
      discoverState.loading = false
      discoverState.loadingMore = false
    }
  }
}

async function downloadOne(item, quality) {
  closeMenus()
  try {
    await api.download.add([buildDownloadTask(item, activeSource.value, quality)])
    showToast(`已添加下载: ${item.name} (${getQualityLabel(quality, item.types)})`, 'success')
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function downloadSelected(quality) {
  const entries = getSelectedEntries()
  if (!entries.length) return
  closeMenus()
  await startBatchDownload(entries, quality)
}

async function handleBatchConfirm(payload) {
  await confirmBatchDialog(payload)
}

function addToPlaylist(item) {
  const res = addToPickingPlaylist(item, activeSource.value)
  if (res.ok) showToast(`已加入歌单：${playlistPickTarget.value?.name || ''}`, 'success')
  else if (res.duplicate) showToast('该歌曲已在歌单中', 'info')
  else showToast('请先打开歌单并点击添加歌曲', 'info')
}

function showToast(text, type = 'info') {
  toast.value = { text, type }
  setTimeout(() => { toast.value = null }, 3000)
}
</script>

<style scoped>
.discover-page {
  width: 100%;
  max-width: none;
}

.pick-hint {
  margin-bottom: 16px;
  padding: 12px 16px;
  font-size: 13px;
  color: var(--text-secondary);
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.25);
}
.playlist-add-btn {
  margin-right: 6px;
  white-space: nowrap;
}

.discover-header { padding: 20px 20px 18px; margin-bottom: 16px; overflow: visible; }

.discover-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 16px;
}
.discover-bar {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  background: var(--bg-input);
  border-radius: var(--radius-pill);
  padding: 0 16px;
  border: 1px solid var(--border-light);
}
.discover-bar:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-muted); }
.discover-icon { width: 18px; height: 18px; color: var(--text-muted); flex-shrink: 0; }
.discover-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  font-size: 15px;
  padding: 0;
  background: transparent;
  border: none;
  box-shadow: none;
  border-radius: 0;
}
.discover-input:focus { box-shadow: none; border: none; }
.discover-btn {
  flex-shrink: 0;
  height: 44px;
  border-radius: var(--radius-pill);
  padding: 0 20px;
  white-space: nowrap;
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
}
.tab:hover { background: var(--bg-hover); color: var(--text); }
.tab.active { color: #fff; }

.sort-tabs {
  display: flex;
  gap: 16px;
  padding-top: 4px;
  border-top: 1px solid var(--border-light);
  margin-top: 4px;
  padding-top: 12px;
}
.sort-tab {
  padding: 0 2px 6px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 14px;
  border-bottom: 2px solid transparent;
  border-radius: 0;
}
.sort-tab:hover { color: var(--text); }
.sort-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 500;
}

.recommend-section { margin-bottom: 16px; }
.recommend-loading, .empty {
  text-align: center;
  padding: 48px 0;
  color: var(--text-muted);
  font-size: 14px;
}

.recommend-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px 18px;
}

.recommend-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
  padding: 8px 0 4px;
}

.recommend-count {
  font-size: 13px;
  color: var(--text-muted);
}

.recommend-more-btn {
  min-width: 140px;
}

.recommend-card {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 10px;
  border-radius: var(--radius);
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  text-align: left;
  transition: background 0.15s, border-color 0.15s, transform 0.15s;
  cursor: pointer;
  width: 100%;
}
.recommend-card:hover {
  background: var(--bg-hover);
  border-color: var(--border);
  transform: translateY(-1px);
}

.recommend-cover-wrap { flex-shrink: 0; }
.recommend-cover {
  width: 72px;
  height: 72px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--bg-elevated);
}
.recommend-cover.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  border: 1px solid var(--border-light);
}
.recommend-cover.placeholder svg { width: 28px; height: 28px; opacity: 0.5; }

.recommend-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.recommend-name {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--text);
}
.recommend-author {
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recommend-stats {
  display: flex;
  gap: 12px;
  margin-top: auto;
  font-size: 12px;
  color: var(--text-muted);
}
.recommend-stats span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.detail-toolbar { margin-bottom: 12px; }

.playlist-info {
  display: flex;
  gap: 20px;
  padding: 20px;
  margin-bottom: 16px;
  align-items: flex-start;
}
.playlist-cover-wrap { flex-shrink: 0; }
.playlist-cover {
  width: 140px;
  height: 140px;
  border-radius: 12px;
  object-fit: cover;
  background: var(--bg-elevated);
  box-shadow: var(--shadow);
}
.playlist-cover.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  border: 1px solid var(--border-light);
}
.playlist-cover.placeholder svg { width: 48px; height: 48px; opacity: 0.5; }

.playlist-meta { flex: 1; min-width: 0; }
.playlist-name {
  margin: 0 0 10px;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
  word-break: break-word;
}
.playlist-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 10px;
}
.playlist-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.playlist-load-bar {
  padding: 12px 16px;
  margin-bottom: 12px;
}
.playlist-load-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}
.playlist-load-percent {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
  font-weight: 600;
}
.playlist-load-track {
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--bg-input);
  overflow: hidden;
  border: 1px solid var(--border-light);
}
.playlist-load-track.indeterminate .playlist-load-fill {
  width: 35% !important;
  animation: playlist-load-indeterminate 1.2s ease-in-out infinite;
}
.playlist-load-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--lemon-gradient, linear-gradient(90deg, var(--accent), #f59e0b));
  transition: width 0.35s ease;
}
@keyframes playlist-load-indeterminate {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(320%); }
}

.results { overflow: visible; }

.results-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-elevated);
  flex-wrap: wrap;
  gap: 8px;
}
.results-count { font-size: 13px; color: var(--text-muted); }

.result-list-body.is-virtual {
  max-height: min(70vh, 720px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.result-list-spacer {
  min-height: 0;
}

.mobile-select-all {
  display: none;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}
.mobile-select-all input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
}
.results-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.batch-dl-wrap { display: inline-block; }

.result-header, .result-row {
  display: grid;
  grid-template-columns: 36px 48px minmax(180px, 2.2fr) minmax(120px, 1fr) minmax(120px, 1fr) 64px 44px 44px 44px;
  align-items: center;
  padding: 10px 16px;
  gap: 8px;
  font-size: 13px;
}
.result-header {
  color: var(--text-muted);
  font-size: 12px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-elevated);
}
.result-row {
  border-bottom: 1px solid var(--border-light);
  transition: background 0.15s;
}
.result-row:last-child { border-bottom: none; }
.result-row:hover { background: var(--bg-hover); }
.result-row.playing { background: var(--accent-muted); }
.result-row.selected { background: var(--accent-muted); }

.col-check {
  display: flex;
  align-items: center;
  justify-content: center;
}
.col-check input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
}

.col-name, .col-singer, .col-album {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.col-name { font-weight: 500; }
.col-singer, .col-album { color: var(--text-secondary); }
.col-duration { color: var(--text-muted); text-align: center; }
.col-index { color: var(--text-muted); text-align: center; }
.col-play { text-align: center; }
.col-queue { text-align: center; }
.col-action { text-align: center; position: relative; overflow: visible; }

.queue-add-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.2s;
  border: 1px solid var(--border);
}
.queue-add-btn:hover { color: var(--accent); border-color: var(--accent); background: var(--accent-muted); }
.queue-add-btn.added { color: var(--success); border-color: var(--success); background: rgba(52, 199, 89, 0.1); cursor: default; }

.play-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.2s;
  border: 1px solid var(--border);
}
.play-btn:hover { color: var(--accent); border-color: var(--accent); background: var(--accent-muted); }
.result-row.playing .play-btn { color: var(--accent); border-color: var(--accent); background: var(--accent-muted); }

.dl-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.2s;
  border: 1px solid var(--border);
}
.dl-btn:hover { color: var(--success); border-color: var(--success); background: rgba(52, 199, 89, 0.12); }

.dl-wrap { position: relative; display: inline-block; }
.quality-menu {
  min-width: 160px;
  max-height: min(280px, 50vh);
  overflow-y: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.quality-menu-title {
  padding: 8px 12px;
  font-size: 11px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-light);
}
.quality-option {
  display: block;
  width: 100%;
  padding: 8px 12px;
  text-align: left;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  border: none;
  border-radius: 0;
}
.quality-option:hover { background: var(--bg-hover); color: var(--accent); }
.quality-empty { padding: 10px 12px; font-size: 13px; color: var(--text-muted); }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.empty { text-align: center; padding: 60px 0; color: var(--text-muted); font-size: 14px; }

.toast {
  position: fixed;
  bottom: 80px;
  right: 24px;
  padding: 10px 20px;
  border-radius: var(--radius);
  font-size: 14px;
  z-index: 1000;
  animation: fadeIn 0.2s;
  box-shadow: var(--shadow);
}
.toast.success { background: var(--success); color: #fff; }
.toast.error { background: var(--error); color: #fff; }
.toast.info { background: var(--bg-card); border: 1px solid var(--border); }

@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

@media (max-width: 768px) {
  .discover-header { padding: 12px; }
  .discover-row { gap: 8px; margin-bottom: 12px; }
  .discover-bar { height: 44px; padding: 0 12px; }
  .discover-input { font-size: 16px; }
  .discover-btn { height: 44px; min-width: 72px; padding: 0 14px; }

  .recommend-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .recommend-card { padding: 12px; }
  .recommend-cover { width: 64px; height: 64px; }

  .playlist-info { flex-direction: column; align-items: center; text-align: center; padding: 16px; }
  .playlist-cover { width: 120px; height: 120px; }
  .playlist-tags { justify-content: center; }

  .result-header { display: none; }
  .result-row {
    grid-template-columns: 28px 1fr 36px 36px 36px;
    grid-template-areas: "check name play queue action" "check meta play queue action";
    gap: 2px 8px;
    padding: 12px 14px;
  }
  .col-index, .col-album, .col-duration { display: none; }
  .col-check { grid-area: check; }
  .col-name {
    grid-area: name;
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.35;
  }
  .col-singer { grid-area: meta; font-size: 12px; }
  .col-play { grid-area: play; }
  .col-queue { grid-area: queue; }
  .col-action { grid-area: action; }

  .results-toolbar { flex-wrap: wrap; gap: 8px; }
  .mobile-select-all { display: inline-flex; }
  .results-actions { width: 100%; display: flex; gap: 8px; }
  .results-actions .btn-sm { flex: 1; }
  .batch-dl-wrap { flex: 1 1 100%; }
  .batch-dl-wrap .btn-sm { width: 100%; }

  .toast {
    left: 12px;
    right: 12px;
    bottom: calc(var(--player-height) + var(--mobile-nav-height) + 16px);
  }
}
</style>
