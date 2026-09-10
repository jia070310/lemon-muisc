<template>
  <div class="discover-page">
    <div class="page-title">发现</div>
    <div class="page-subtitle">输入各平台歌单链接，浏览并试听、下载；批量下载会一次确认降档策略，多音源时先同音质轮询再降档</div>

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
          v-for="(info, key) in discoverState.sources"
          :key="key"
          type="button"
          :class="['tab', { active: discoverState.activeSource === key }]"
          @click="switchSource(key)"
        >{{ platformLabel(key, info) }}</button>
      </div>
    </div>

    <div v-if="showRecommend" class="home-feed">
      <DiscoverPlaylistSection
        :list="discoverState.recommendList"
        :loading="discoverState.recommendLoading"
        :error="discoverState.playlistsError"
        :sort="discoverState.recommendSort"
        :sort-options="recommendSortOptions"
        :has-more="discoverState.recommendHasMore"
        @update:sort="changeRecommendSort"
        @open="openRecommendPlaylist"
        @more="goPlaylistsMore"
        @need-more="loadRecommendMore"
      />
      <DiscoverNewSongsSection
        :list="discoverState.newSongs"
        :loading="discoverState.newSongsLoading"
        :error="discoverState.newSongsError"
        :unsupported="discoverState.newSongsUnsupported"
        :region="discoverState.songRegion"
        :regions="discoverState.newSongsRegions"
        @update:region="changeSongRegion"
        @play="playHomeSong"
        @play-all="playHomeSongs"
        @more="goNewSongsMore"
      />
      <DiscoverNewAlbumsSection
        :list="discoverState.newAlbums"
        :loading="discoverState.newAlbumsLoading"
        :error="discoverState.newAlbumsError"
        :unsupported="discoverState.newAlbumsUnsupported"
        :region="discoverState.albumRegion"
        :regions="discoverState.newAlbumsRegions"
        @update:region="changeAlbumRegion"
        @open="openHomeAlbum"
        @more="goNewAlbumsMore"
      />
      <DiscoverRanksSection
        :list="discoverState.ranks"
        :loading="discoverState.ranksLoading"
        :error="discoverState.ranksError"
        :unsupported="discoverState.ranksUnsupported"
        @open="openHomeRank"
        @more="goRanksMore"
      />
    </div>

    <div v-if="discoverState.viewMode === 'detail'" class="detail-toolbar">
      <button class="btn-ghost btn-sm" @click="backToRecommend">← 返回发现</button>
    </div>

    <div v-if="discoverState.viewMode === 'detail' && discoverState.playlistInfo" class="playlist-info card">
      <div class="playlist-cover-wrap">
        <CoverArt :src="discoverState.playlistInfo.img" />
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
            <Teleport to="body">
              <div
                class="quality-menu discover-batch-quality-menu"
                v-if="showBatchQualityMenu"
                :style="batchMenuStyle"
                @click.stop
              >
                <div class="quality-menu-title">批量音质：仅列出所选歌曲实际支持的音质</div>
                <template v-if="batchQualities.length">
                  <button
                    v-for="q in batchQualities"
                    :key="q"
                    class="quality-option"
                    @click="downloadSelected(q)"
                  >{{ getQualityLabel(q) }}</button>
                </template>
                <div v-else class="quality-empty">所选歌曲暂无可用音质信息</div>
              </div>
            </Teleport>
          </div>
          <button
            class="btn-ghost btn-sm"
            :disabled="!discoverState.results.length || discoverState.loading || discoverState.loadingMore || importingPlaylist"
            @click="importCurrentPlaylistToLibrary"
          >
            {{ importingPlaylist ? '导入中...' : '导入到音乐库' }}
          </button>
          <button class="btn-ghost btn-sm" @click="addAllToQueue">全部加入列表</button>
          <button class="btn-primary btn-sm" @click="playAll">播放全部</button>
        </div>
      </div>
      <div class="result-header song-list-header">
        <label class="header-select-all">
          <input type="checkbox" :checked="allSelected" :indeterminate.prop="someSelected && !allSelected" @change="toggleSelectAll" />
          全选本页
        </label>
      </div>
      <div
        ref="trackListContainerRef"
        class="result-list-body song-list-body"
        @scroll="onTrackListScroll"
      >
        <div class="playlist-song-grid">
          <DiscoverSongItem
            v-for="{ item, i } in displayRows" :key="trackSelectKey(item, i)"
            :item="item"
            :index="i + 1"
            :selectable="true"
            :selected="isSelected(item, i)"
            :playing="isPlayingItem(item)"
            :paused="isPaused"
            :loading="loadingPlay === item.id"
            :show-album="true"
            :eager-cover="i < 60"
            @toggle-select="toggleSelect(item, i)"
            @play="togglePlay(item)"
          >
            <template #actions>
              <DiscoverSongActions
                :item="item"
                :source="item.source || activeSource"
                @toast="({ text, type }) => showToast(text, type)"
              />
            </template>
          </DiscoverSongItem>
        </div>
      </div>
    </div>

    <div class="pager" v-if="discoverState.viewMode === 'detail' && showPagination">
      <button class="btn-ghost btn-sm" :disabled="playlistTrackPage <= 1" @click="playlistTrackPage--">上一页</button>
      <span class="page-info">第 {{ playlistTrackPage }} / {{ playlistTrackTotalPages }} 页</span>
      <button class="btn-ghost btn-sm" :disabled="playlistTrackPage >= playlistTrackTotalPages" @click="playlistTrackPage++">下一页</button>
    </div>

    <div
      v-if="discoverState.viewMode === 'detail' && discoverState.fetched && !discoverState.loading && !discoverState.results.length"
      class="empty"
    >暂无歌曲，请检查歌单链接是否正确</div>

    <div v-if="toast" class="toast" :class="toast.type">{{ toast.text }}</div>

    <ConfirmModal
      :open="Boolean(importConfirm)"
      title="导入到音乐库歌单"
      :message="importConfirm?.message || ''"
      :hint="importConfirm?.hint || ''"
      :cover="importConfirm?.cover || ''"
      confirm-text="导入"
      :busy="importingPlaylist"
      busy-text="导入中…"
      @cancel="closeImportConfirm"
      @confirm="confirmImportPlaylist"
    />

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
defineOptions({ name: 'Discover' })
import { ref, computed, onMounted, onActivated, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BatchQualityDialog from '../components/BatchQualityDialog.vue'
import ConfirmModal from '../components/ConfirmModal.vue'
import CoverArt from '../components/CoverArt.vue'
import DiscoverSongItem from '../components/discover/DiscoverSongItem.vue'
import DiscoverSongActions from '../components/discover/DiscoverSongActions.vue'
import DiscoverPlaylistSection from '../components/discover/DiscoverPlaylistSection.vue'
import DiscoverNewSongsSection from '../components/discover/DiscoverNewSongsSection.vue'
import DiscoverNewAlbumsSection from '../components/discover/DiscoverNewAlbumsSection.vue'
import DiscoverRanksSection from '../components/discover/DiscoverRanksSection.vue'
import { useBatchDownload, formatBatchDownloadToast } from '../composables/useBatchDownload.js'
import { useTrackListView } from '../composables/useTrackListView.js'
import { useProgressiveTrackCovers } from '../composables/useProgressiveTrackCovers.js'
import { api } from '../api.js'
import {
  discoverState,
  loadDiscoverSources,
  reloadDiscoverSources,
  sourcePlaceholders,
  recommendSortOptions,
  resetDiscoverHomeFeed,
  defaultSongRegion,
  defaultAlbumRegion,
} from '../stores/discover.js'
import { loadingPlay, isPaused, isPlayingItem, playItem, addToQueue, isInQueue } from '../stores/player.js'
import { getQualityLabel } from '../utils/quality.js'
import { platformLabel } from '../utils/platforms.js'
import { cleanText, cleanTrackItem } from '../utils/text.js'
import {
  trackSelectKey,
} from '../utils/musicPayload.js'
import { useQualityMenuPosition } from '../utils/qualityMenu.js'
import { playlistPickTarget, importPlaylistFromLoaded } from '../stores/library.js'

const router = useRouter()
const route = useRoute()
const toast = ref(null)
const importingPlaylist = ref(false)
const importConfirm = ref(null)
const showBatchQualityMenu = ref(false)
const selectedKeys = ref(new Set())
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
  onScroll: onTrackListScroll,
  resetView: resetPlaylistTrackPage,
  showPagination,
  measureViewport,
} = useTrackListView(() => discoverState.results, {
  enableVirtual: false,
  pageSize: 50,
})

useProgressiveTrackCovers(() => displayRows.value, {
  getSource: () => activeSource.value,
  enabled: () => discoverState.viewMode === 'detail',
})

function getSelectedEntries() {
  return discoverState.results
    .map((item, index) => ({ item, key: trackSelectKey(item, index) }))
    .filter(({ key }) => selectedKeys.value.has(key))
}

let discoverSeq = 0
let playlistFetchAbort = null
let recommendAbort = null
let homeFeedAbort = null

function cancelPlaylistFetch() {
  playlistFetchAbort?.abort()
  playlistFetchAbort = null
}

function cancelRecommendFetch() {
  recommendAbort?.abort()
  recommendAbort = null
}

function cancelHomeFeed() {
  homeFeedAbort?.abort()
  homeFeedAbort = null
}

function isAbortedError(e) {
  return e?.aborted || e?.name === 'AbortError' || e?.message === '请求已取消'
}

let bootPromise = null

onMounted(() => {
  bootPromise = (async () => {
    await loadDiscoverSources(api)
    if (!discoverState.songRegion) discoverState.songRegion = defaultSongRegion(discoverState.activeSource)
    if (!discoverState.albumRegion) discoverState.albumRegion = defaultAlbumRegion(discoverState.activeSource)

    const q = route.query
    if (q.source && discoverState.sources[q.source]) {
      discoverState.activeSource = String(q.source)
    }
    // keep-alive：深链在 onActivated 处理；首次无深链时再拉首页
    if (!q.openPlaylist && !q.openAlbum) {
      loadHomeFeed()
    }
  })()
  document.addEventListener('click', closeMenus)
})

/** Discover 被 keep-alive 缓存，从更多页带回 openAlbum/openPlaylist 时只会触发 activated */
async function handleDiscoverDeepLink() {
  if (bootPromise) await bootPromise
  const q = route.query
  if (!q.openPlaylist && !q.openAlbum) return

  if (q.source && discoverState.sources[q.source]) {
    discoverState.activeSource = String(q.source)
  }

  const openPlaylist = q.openPlaylist ? String(q.openPlaylist) : ''
  const openAlbum = q.openAlbum
    ? {
        id: String(q.openAlbum),
        source: String(q.source || discoverState.activeSource),
        name: String(q.albumName || ''),
        artist: String(q.albumArtist || ''),
        img: String(q.albumImg || ''),
      }
    : null

  // 先清 query，避免 onMounted+onActivated 或重复激活时二次打开
  await router.replace({ path: '/discover' })

  if (openPlaylist) {
    discoverState.url = openPlaylist
    await fetchPlaylist()
  } else if (openAlbum) {
    await openHomeAlbum(openAlbum)
  }
}

onActivated(() => {
  handleDiscoverDeepLink()
})

watch(() => discoverState.results.length, () => {
  nextTick(() => measureViewport())
})

function switchSource(key) {
  if (!key || discoverState.activeSource === key) return
  discoverState.activeSource = key
  discoverState.url = ''
  discoverState.viewMode = 'recommend'
  discoverState.fetched = false
  discoverState.results = []
  discoverState.playlistInfo = null
  discoverState.recommendPage = 1
  discoverState.songRegion = defaultSongRegion(key)
  discoverState.albumRegion = defaultAlbumRegion(key)
  resetDiscoverHomeFeed()
  clearSelection()
  closeMenus()
  loadHomeFeed()
}

function changeRecommendSort(sort) {
  if (discoverState.recommendSort === sort) return
  discoverState.recommendSort = sort
  discoverState.recommendPage = 1
  discoverState.recommendList = []
  discoverState.recommendHasMore = false
  discoverState.recommendLoading = true
  loadRecommend()
}

function changeSongRegion(region) {
  if (discoverState.songRegion === region) return
  discoverState.songRegion = region
  discoverState.newSongs = []
  discoverState.newSongsLoading = true
  loadNewSongs()
}

function changeAlbumRegion(region) {
  if (discoverState.albumRegion === region) return
  discoverState.albumRegion = region
  discoverState.newAlbums = []
  discoverState.newAlbumsLoading = true
  loadNewAlbums()
}

function applyRecommendPage(data, { append = false } = {}) {
  const list = data?.list || []
  const total = Number(data?.total) || 0
  const limit = Number(data?.limit) || list.length || 30
  const page = Number(data?.page) || discoverState.recommendPage || 1

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
  if (typeof data?.hasMore === 'boolean') {
    discoverState.recommendHasMore = data.hasMore
  } else if (!list.length) {
    discoverState.recommendHasMore = false
  } else if (total > loaded) {
    discoverState.recommendHasMore = true
  } else {
    discoverState.recommendHasMore = list.length >= limit
  }
  discoverState.recommendTotal = total > loaded ? total : loaded
  if (!append) discoverState.recommendPage = page
}

function loadHomeFeed() {
  if (!discoverState.activeSource) return
  cancelHomeFeed()
  const controller = new AbortController()
  homeFeedAbort = controller
  // 无数据时先亮骨架，避免短暂空白
  if (!discoverState.recommendList.length) discoverState.recommendLoading = true
  if (!discoverState.newSongs.length) discoverState.newSongsLoading = true
  if (!discoverState.newAlbums.length) discoverState.newAlbumsLoading = true
  if (!discoverState.ranks.length) discoverState.ranksLoading = true
  loadRecommend({ signal: controller.signal })
  loadNewSongs({ signal: controller.signal })
  loadNewAlbums({ signal: controller.signal })
  loadRanks({ signal: controller.signal })
}

async function loadRecommend(opts = {}) {
  if (!discoverState.activeSource) return

  cancelRecommendFetch()
  const controller = opts.signal ? null : new AbortController()
  if (controller) recommendAbort = controller
  const signal = opts.signal || controller.signal
  const seq = ++discoverSeq
  const source = discoverState.activeSource
  const sort = discoverState.recommendSort

  discoverState.recommendPage = 1
  discoverState.recommendLoading = true
  discoverState.recommendHasMore = false
  discoverState.playlistsError = ''
  try {
    const res = await api.playlist.recommend(source, sort, 1, 30, { signal })
    if (seq !== discoverSeq || source !== discoverState.activeSource) return
    applyRecommendPage(res.data, { append: false })
  } catch (e) {
    if (isAbortedError(e)) return
    if (seq !== discoverSeq) return
    discoverState.recommendList = []
    discoverState.recommendHasMore = false
    discoverState.recommendTotal = 0
    discoverState.playlistsError = e.message || '获取歌单失败'
    if (/不支持的平台/.test(e.message || '')) {
      const prev = discoverState.activeSource
      await reloadDiscoverSources(api)
      if (discoverState.activeSource !== prev && discoverState.activeSource) {
        discoverState.recommendLoading = false
        return loadHomeFeed()
      }
    }
  } finally {
    if (controller && recommendAbort === controller) recommendAbort = null
    if (seq === discoverSeq) discoverState.recommendLoading = false
  }
}

let recommendMoreBusy = false
async function loadRecommendMore() {
  if (!discoverState.activeSource || !discoverState.recommendHasMore || recommendMoreBusy) return
  if (discoverState.recommendLoading) return
  recommendMoreBusy = true
  const source = discoverState.activeSource
  const sort = discoverState.recommendSort
  const nextPage = (discoverState.recommendPage || 1) + 1
  try {
    const res = await api.playlist.recommend(source, sort, nextPage, 30)
    if (source !== discoverState.activeSource || sort !== discoverState.recommendSort) return
    discoverState.recommendPage = nextPage
    applyRecommendPage(res.data, { append: true })
  } catch {
    // 预取失败不打断当前页浏览
  } finally {
    recommendMoreBusy = false
  }
}

async function loadNewSongs(opts = {}) {
  if (!discoverState.activeSource) return
  const source = discoverState.activeSource
  const region = discoverState.songRegion || defaultSongRegion(source)
  discoverState.newSongsLoading = true
  discoverState.newSongsError = ''
  discoverState.newSongsUnsupported = false
  try {
    const res = await api.discover.newSongs(source, region, 1, 54, { signal: opts.signal })
    if (source !== discoverState.activeSource) return
    const data = res.data || {}
    discoverState.newSongs = data.list || []
    discoverState.newSongsRegions = data.regions || []
    discoverState.newSongsUnsupported = Boolean(data.unsupported)
    if (data.region != null && data.region !== '') discoverState.songRegion = String(data.region)
  } catch (e) {
    if (isAbortedError(e)) return
    if (source !== discoverState.activeSource) return
    discoverState.newSongs = []
    discoverState.newSongsError = e.message || '获取新歌失败'
  } finally {
    if (source === discoverState.activeSource) discoverState.newSongsLoading = false
  }
}

async function loadNewAlbums(opts = {}) {
  if (!discoverState.activeSource) return
  const source = discoverState.activeSource
  const region = discoverState.albumRegion || defaultAlbumRegion(source)
  discoverState.newAlbumsLoading = true
  discoverState.newAlbumsError = ''
  discoverState.newAlbumsUnsupported = false
  try {
    const res = await api.discover.newAlbums(source, region, 1, 30, { signal: opts.signal })
    if (source !== discoverState.activeSource) return
    const data = res.data || {}
    discoverState.newAlbums = data.list || []
    discoverState.newAlbumsRegions = data.regions || []
    discoverState.newAlbumsUnsupported = Boolean(data.unsupported)
    if (data.region != null && data.region !== '') discoverState.albumRegion = String(data.region)
  } catch (e) {
    if (isAbortedError(e)) return
    if (source !== discoverState.activeSource) return
    discoverState.newAlbums = []
    discoverState.newAlbumsError = e.message || '获取新碟失败'
  } finally {
    if (source === discoverState.activeSource) discoverState.newAlbumsLoading = false
  }
}

async function loadRanks(opts = {}) {
  if (!discoverState.activeSource) return
  const source = discoverState.activeSource
  discoverState.ranksLoading = true
  discoverState.ranksError = ''
  discoverState.ranksUnsupported = false
  try {
    const res = await api.discover.toplists(source, { signal: opts.signal })
    if (source !== discoverState.activeSource) return
    const data = res.data || {}
    discoverState.ranks = (data.list || []).map((item) => ({
      ...item,
      songs: (item.songs || []).filter((s) => s?.name || s?.singer || s?.author).slice(0, 3),
    }))
    discoverState.ranksUnsupported = Boolean(data.unsupported)
  } catch (e) {
    if (isAbortedError(e)) return
    if (source !== discoverState.activeSource) return
    discoverState.ranks = []
    discoverState.ranksError = e.message || '获取排行榜失败'
  } finally {
    if (source === discoverState.activeSource) discoverState.ranksLoading = false
  }
}

function goPlaylistsMore() {
  router.push({
    path: '/discover/playlists',
    query: { source: discoverState.activeSource, sort: discoverState.recommendSort },
  })
}

function goNewSongsMore() {
  router.push({
    path: '/discover/new-songs',
    query: { source: discoverState.activeSource, region: discoverState.songRegion || undefined },
  })
}

function goNewAlbumsMore() {
  router.push({
    path: '/discover/new-albums',
    query: { source: discoverState.activeSource, region: discoverState.albumRegion || undefined },
  })
}

function goRanksMore() {
  router.push({
    path: '/discover/ranks',
    query: { source: discoverState.activeSource },
  })
}

let homePlayLock = false

async function playHomeSong(item) {
  if (!item || homePlayLock) return
  homePlayLock = true
  try {
    await playItem(item, item.source || activeSource.value)
  } catch (e) {
    showToast(e.message || '试听失败', 'error')
  } finally {
    homePlayLock = false
  }
}

async function playHomeSongs(items) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return
  const source = list[0].source || activeSource.value
  for (const item of list) addToQueue(item, item.source || source)
  try {
    await playItem(list[0], source)
    showToast(`开始播放，共 ${list.length} 首`, 'success')
  } catch (e) {
    showToast(e.message || '播放失败', 'error')
  }
}

async function openHomeAlbum(item) {
  if (!item?.id) return
  const source = item.source || activeSource.value
  cancelPlaylistFetch()
  const controller = new AbortController()
  playlistFetchAbort = controller
  discoverState.loading = true
  discoverState.loadingMore = false
  discoverState.viewMode = 'detail'
  discoverState.results = []
  discoverState.playlistInfo = {
    name: item.name,
    author: item.artist,
    img: item.img,
    desc: '',
  }
  discoverState.total = 0
  clearSelection()
  try {
    const res = await api.search.fetchAlbum(source, item.id, { signal: controller.signal })
    const data = res.data || res
    const list = (data.list || data.songs || []).map((t) => cleanTrackItem({ ...t, source: t.source || source }))
    discoverState.results = list
    discoverState.total = Number(data.total) || list.length
    discoverState.playlistInfo = {
      name: data.info?.name || data.name || item.name,
      author: data.info?.artist || data.artist || item.artist,
      img: data.info?.img || data.img || item.img,
      desc: data.info?.desc || '',
      play_count: '',
    }
    discoverState.fetched = true
    resetPlaylistTrackPage()
  } catch (e) {
    if (isAbortedError(e)) return
    showToast(e.message || '获取专辑失败', 'error')
    backToRecommend()
  } finally {
    if (playlistFetchAbort === controller) playlistFetchAbort = null
    discoverState.loading = false
  }
}

function openHomeRank(item) {
  if (!item?.id) return
  router.push({
    path: '/discover/ranks',
    query: {
      source: item.source || discoverState.activeSource,
      id: String(item.id),
    },
  })
}

function backToRecommend() {
  cancelPlaylistFetch()
  discoverState.loading = false
  discoverState.loadingMore = false
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
  cancelHomeFeed()
})

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

function toggleBatchQualityMenu(event) {
  if (!selectedCount.value) return
  showBatchQualityMenu.value = !showBatchQualityMenu.value
  if (showBatchQualityMenu.value) {
    positionBatchMenu(event?.currentTarget, { align: 'left', zIndex: 120 })
  } else {
    clearBatchMenuPosition()
  }
}

function closeMenus() {
  showBatchQualityMenu.value = false
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

async function importCurrentPlaylistToLibrary() {
  if (discoverState.viewMode !== 'detail') return
  if (discoverState.loading || discoverState.loadingMore) {
    showToast('歌单仍在加载，请稍后再导入', 'info')
    return
  }
  if (!discoverState.results.length) {
    showToast('歌单为空，无法导入', 'info')
    return
  }
  if (importingPlaylist.value || importConfirm.value) return

  const info = discoverState.playlistInfo || {}
  const name = cleanText(info.name) || '导入的歌单'
  importConfirm.value = {
    name,
    info,
    cover: info.img || '',
    message: `将「${name}」共 ${discoverState.results.length} 首导入到音乐库歌单？`,
    hint: '导入后可在「音乐库 → 歌单」中查看，并支持同步本地 / 网络更新。',
  }
}

function closeImportConfirm() {
  if (importingPlaylist.value) return
  importConfirm.value = null
}

async function confirmImportPlaylist() {
  const pending = importConfirm.value
  if (!pending || importingPlaylist.value) return

  importingPlaylist.value = true
  try {
    const result = importPlaylistFromLoaded({
      name: pending.name,
      source: discoverState.activeSource,
      url: String(discoverState.url || '').trim(),
      tracks: discoverState.results,
      info: pending.info,
    })
    importConfirm.value = null
    const localText = result.localMatched
      ? `（已匹配本地 ${result.localMatched} 首）`
      : ''
    showToast(`已导入「${result.playlist?.name || pending.name}」${result.total} 首${localText}`, 'success')
    if (result.playlist?.id) {
      router.push({ path: '/library/playlists', query: { id: result.playlist.id } })
    }
  } catch (e) {
    showToast(e.message || '导入失败', 'error')
  } finally {
    importingPlaylist.value = false
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

async function downloadSelected(quality) {
  const entries = getSelectedEntries()
  if (!entries.length) return
  closeMenus()
  await startBatchDownload(entries, quality)
}

async function handleBatchConfirm(payload) {
  await confirmBatchDialog(payload)
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

.discover-header { padding: 20px 20px 18px; margin-bottom: 16px; overflow: visible; }

.discover-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 20px;
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
  padding-top: 2px;
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

.home-feed {
  margin-bottom: 24px;
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

.recommend-cover-wrap {
  flex-shrink: 0;
  width: 72px;
  height: 72px;
  border-radius: 8px;
  overflow: hidden;
}

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
.playlist-cover-wrap {
  flex-shrink: 0;
  width: 140px;
  height: 140px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--shadow);
}

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

/* 歌单详情曲目：双列封面播放行 */
.result-header.song-list-header {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  color: var(--text-muted);
  font-size: 12px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-elevated);
}
.header-select-all {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.header-select-all input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
}

.playlist-song-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 12px;
  padding: 8px 12px 12px;
}
.song-list-body :deep(.discover-song-item) {
  padding-left: 8px;
  padding-right: 8px;
  border-radius: 10px;
  border-bottom: none;
}
.song-list-body :deep(.discover-song-item:last-child) {
  border-bottom: none;
}
@media (max-width: 960px) {
  .song-list-body :deep(.song-time) { display: none; }
}

@media (max-width: 640px) {
  .playlist-song-grid {
    grid-template-columns: 1fr;
    gap: 2px;
    padding: 6px 8px 10px;
  }
}

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
.col-name { font-weight: 500; }

.dl-wrap { position: relative; display: inline-block; }
.quality-menu,
.discover-batch-quality-menu {
  min-width: 160px;
  max-height: min(280px, 50vh);
  overflow-y: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.quality-menu-title,
.discover-batch-quality-menu .quality-menu-title {
  padding: 8px 12px;
  font-size: 11px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-light);
}
.quality-option,
.discover-batch-quality-menu .quality-option {
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
.quality-option:hover,
.discover-batch-quality-menu .quality-option:hover { background: var(--bg-hover); color: var(--accent); }
.quality-empty { padding: 10px 12px; font-size: 13px; color: var(--text-muted); }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.pager {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
}
.page-info { font-size: 13px; color: var(--text-muted); }

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
  .discover-row { gap: 8px; margin-bottom: 18px; }
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
