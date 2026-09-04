<template>
  <div class="search-page">
    <div class="page-title">搜索</div>
    <div class="page-subtitle">搜索歌曲或专辑，试听、下载；批量下载会一次确认降档策略，多音源时先同音质轮询再降档</div>

    <div v-if="playlistPickTarget" class="pick-hint card">
      点击歌曲右侧「加入歌单」添加到「{{ playlistPickTarget.name }}」
    </div>

    <div class="search-header card">
      <form class="search-row" @submit.prevent="doSearch">
        <ClearableInput
          v-model="searchState.keyword"
          variant="bar"
          show-search-icon
          class="search-bar"
          :placeholder="searchState.searchMode === 'album' ? '搜索专辑名、歌手...' : '搜索歌曲、歌手...'"
          enterkeyhint="search"
        />
        <button type="submit" class="btn-primary search-btn" :disabled="isSearching">
          {{ isSearching ? '搜索中...' : '搜索' }}
        </button>
      </form>
      <div class="mode-tabs">
        <button
          :class="['mode-tab', { active: searchState.searchMode === 'song' }]"
          @click="switchSearchMode('song')"
        >歌曲</button>
        <button
          :class="['mode-tab', { active: searchState.searchMode === 'album' }]"
          @click="switchSearchMode('album')"
        >专辑</button>
      </div>
      <div class="source-tabs">
        <button
          v-for="(info, key) in searchState.sources" :key="key"
          :class="['tab', { active: searchState.activeSource === key }]"
          @click="switchSource(key)"
        >{{ platformLabel(key, info) }}</button>
      </div>
    </div>

    <div v-if="searchState.viewMode === 'album-detail' && searchState.albumInfo" class="album-detail-toolbar">
      <button class="btn-ghost btn-sm" @click="backToAlbumList">← 返回专辑列表</button>
    </div>

    <div v-if="searchState.viewMode === 'album-detail' && searchState.albumInfo" class="album-info card">
      <div class="album-cover-wrap">
        <CoverArt :src="searchState.albumInfo.img" />
      </div>
      <div class="album-meta">
        <h2 class="album-name">{{ cleanText(searchState.albumInfo.name) || '未命名专辑' }}</h2>
        <div class="album-tags">
          <span v-if="searchState.albumInfo.author">歌手：{{ cleanText(searchState.albumInfo.author) }}</span>
          <span v-if="searchState.albumInfo.publishTime">发行：{{ searchState.albumInfo.publishTime }}</span>
          <span>共 {{ searchState.results.length }} 首</span>
        </div>
        <p v-if="searchState.albumInfo.desc" class="album-desc">{{ cleanText(searchState.albumInfo.desc) }}</p>
      </div>
    </div>

    <div v-if="showAlbumGrid" class="album-results card">
      <div v-if="searchState.albumLoading" class="album-loading">正在搜索专辑...</div>
      <template v-else-if="searchState.albumResults.length">
        <div class="album-grid">
          <button
            v-for="item in searchState.albumResults"
            :key="`${item.source}-${item.id}`"
            class="album-card"
            @click="openAlbum(item)"
          >
            <div class="album-card-cover-wrap">
              <CoverArt :src="item.img" />
            </div>
            <div class="album-card-meta">
              <div class="album-card-name" :title="cleanText(item.name)">{{ cleanText(item.name) }}</div>
              <div class="album-card-artist" :title="cleanText(item.artist)">{{ cleanText(item.artist) || '未知歌手' }}</div>
              <div class="album-card-stats">
                <span v-if="item.count">{{ item.count }} 首</span>
                <span v-if="item.publishTime">{{ item.publishTime }}</span>
              </div>
            </div>
          </button>
        </div>
        <div class="pagination" v-if="searchState.totalPages > 1">
          <button class="btn-ghost btn-sm" :disabled="searchState.page <= 1" @click="searchState.page--; doSearch()">上一页</button>
          <span class="page-info">{{ searchState.page }} / {{ searchState.totalPages }}</span>
          <button class="btn-ghost btn-sm" :disabled="searchState.page >= searchState.totalPages" @click="searchState.page++; doSearch()">下一页</button>
        </div>
      </template>
        <div v-else-if="searchState.searched" class="empty">暂无专辑结果</div>
        <div v-else class="empty album-hint">输入专辑名或歌手后搜索</div>
    </div>

    <div class="results card" v-if="showSongResults">
      <div class="results-toolbar">
        <span class="results-count">
          共 {{ searchState.results.length }} 首
          <template v-if="showPagination"> · 第 {{ albumTrackPage }}/{{ albumTrackTotalPages }} 页</template>
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
        :in-queue="isInQueue(item, searchState.activeSource)"
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
        <button class="btn-ghost btn-sm" :disabled="albumTrackPage <= 1" @click="albumTrackPage--">上一页</button>
        <span class="page-info">{{ albumTrackPage }} / {{ albumTrackTotalPages }}</span>
        <button class="btn-ghost btn-sm" :disabled="albumTrackPage >= albumTrackTotalPages" @click="albumTrackPage++">下一页</button>
      </div>

      <div class="pagination" v-if="searchState.totalPages > 1 && searchState.viewMode !== 'album-detail'">
        <button class="btn-ghost btn-sm" :disabled="searchState.page <= 1" @click="searchState.page--; doSearch()">上一页</button>
        <span class="page-info">{{ searchState.page }} / {{ searchState.totalPages }}</span>
        <button class="btn-ghost btn-sm" :disabled="searchState.page >= searchState.totalPages" @click="searchState.page++; doSearch()">下一页</button>
      </div>
    </div>

    <div v-else-if="showSongEmpty" class="empty">暂无搜索结果</div>

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
defineOptions({ name: 'Search' })
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import BatchQualityDialog from '../components/BatchQualityDialog.vue'
import CoverArt from '../components/CoverArt.vue'
import ClearableInput from '../components/ClearableInput.vue'
import TrackResultRow from '../components/TrackResultRow.vue'
import { useBatchDownload, formatBatchDownloadToast } from '../composables/useBatchDownload.js'
import { useTrackListView } from '../composables/useTrackListView.js'
import { api } from '../api.js'
import { assertActiveSourceForDownload } from '../stores/downloadGuard.js'
import { searchState, loadSearchSources } from '../stores/search.js'
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

const MAX_PLAYLIST_QUEUE = 100
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
  getSource: () => searchState.activeSource,
  onCompleted: (count, summary) => {
    showToast(formatBatchDownloadToast(count, summary), 'success')
    clearSelection()
  },
  onError: (e) => showToast(e.message, 'error'),
})

const selectedCount = computed(() => selectedKeys.value.size)
const allSelected = computed(() =>
  searchState.results.length > 0 && searchState.results.every((item, i) => selectedKeys.value.has(trackSelectKey(item, i)))
)
const someSelected = computed(() => selectedCount.value > 0)
const selectedItems = computed(() =>
  searchState.results.filter((item, i) => selectedKeys.value.has(trackSelectKey(item, i)))
)
const batchQualities = computed(() => getBatchQualities(selectedItems.value))
const batchPreferredLabel = computed(() => {
  const q = batchDialog.value?.preferred
  return q ? getQualityLabel(q) : ''
})

const {
  page: albumTrackPage,
  totalPages: albumTrackTotalPages,
  displayRows,
  containerRef: trackListContainerRef,
  useVirtual: trackListUseVirtual,
  paddingTop: trackListPaddingTop,
  paddingBottom: trackListPaddingBottom,
  onScroll: onTrackListScroll,
  resetView: resetAlbumTrackPage,
  showPagination,
  measureViewport,
} = useTrackListView(() => searchState.results, {
  paginateWhen: () => searchState.viewMode === 'album-detail',
})

const isSearching = computed(() =>
  searchState.searchMode === 'album' ? searchState.albumLoading : searchState.loading,
)
const showAlbumGrid = computed(() =>
  searchState.searchMode === 'album' && searchState.viewMode !== 'album-detail',
)
const showSongResults = computed(() =>
  searchState.results.length > 0
  && (searchState.searchMode === 'song' || searchState.viewMode === 'album-detail'),
)
const showSongEmpty = computed(() =>
  searchState.searched
  && !searchState.loading
  && !searchState.albumLoading
  && !showSongResults.value
  && !showAlbumGrid.value,
)

function getSelectedEntries() {
  return searchState.results
    .map((item, index) => ({ item, key: trackSelectKey(item, index) }))
    .filter(({ key }) => selectedKeys.value.has(key))
}

onMounted(async () => {
  await loadSearchSources(api)
  document.addEventListener('click', closeMenus)
})

watch(() => searchState.results.length, () => {
  nextTick(() => measureViewport())
})

onUnmounted(() => {
  document.removeEventListener('click', closeMenus)
  cancelSongSearch()
  cancelAlbumSearch()
  cancelAlbumOpen()
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
  selectedKeys.value = new Set(searchState.results.map((item, i) => trackSelectKey(item, i)))
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
    await playItem(item, searchState.activeSource)
  } catch (e) {
    showToast(e.message || '试听失败', 'error')
  }
}

function addOneToQueue(item) {
  if (isInQueue(item, searchState.activeSource)) {
    showToast('已在试听列表', 'info')
    return
  }
  addToQueue(item, searchState.activeSource)
  showToast(`已加入列表: ${item.name}`, 'success')
}

function addAllToQueue() {
  let added = 0
  const items = searchState.results.slice(0, MAX_PLAYLIST_QUEUE)
  for (const item of items) {
    if (!isInQueue(item, searchState.activeSource)) {
      addToQueue(item, searchState.activeSource)
      added++
    }
  }
  const tip = searchState.results.length > MAX_PLAYLIST_QUEUE
    ? `已加入 ${added} 首（仅前 ${MAX_PLAYLIST_QUEUE} 首，共 ${searchState.results.length} 首）`
    : (added ? `已加入 ${added} 首` : '全部已在列表中')
  showToast(tip, added ? 'success' : 'info')
}

async function playAll() {
  if (!searchState.results.length) return
  const items = searchState.results.slice(0, MAX_PLAYLIST_QUEUE)
  for (const item of items) {
    addToQueue(item, searchState.activeSource)
  }
  try {
    await playItem(items[0], searchState.activeSource)
    const tip = searchState.results.length > MAX_PLAYLIST_QUEUE
      ? `开始播放，已加入前 ${MAX_PLAYLIST_QUEUE} 首（共 ${searchState.results.length} 首）`
      : `开始播放，共 ${items.length} 首`
    showToast(tip, 'success')
  } catch (e) {
    showToast(e.message || '播放失败', 'error')
  }
}

function switchSearchMode(mode) {
  if (searchState.searchMode === mode) return
  searchState.searchMode = mode
  searchState.viewMode = 'list'
  searchState.page = 1
  searchState.results = []
  searchState.albumResults = []
  searchState.albumInfo = null
  searchState.searched = false
  resetAlbumTrackPage()
  clearSelection()
  closeMenus()
}

function switchSource(key) {
  if (searchState.activeSource === key) return
  searchState.activeSource = key
  searchState.page = 1
  searchState.viewMode = 'list'
  searchState.albumInfo = null
  searchState.results = []
  searchState.albumResults = []
  clearSelection()
  closeMenus()
  if (searchState.keyword.trim()) doSearch()
}

let searchSeq = 0
let songSearchAbort = null
let albumSearchAbort = null
let albumOpenAbort = null

function cancelSongSearch() {
  songSearchAbort?.abort()
  songSearchAbort = null
}

function cancelAlbumSearch() {
  albumSearchAbort?.abort()
  albumSearchAbort = null
}

function cancelAlbumOpen() {
  albumOpenAbort?.abort()
  albumOpenAbort = null
}

function isAbortedError(e) {
  return e?.aborted || e?.name === 'AbortError' || e?.message === '请求已取消'
}

async function doSearch() {
  if (!searchState.keyword.trim() || !searchState.activeSource) return
  if (searchState.searchMode === 'album') {
    searchState.viewMode = 'list'
    searchState.albumInfo = null
    searchState.results = []
    return doAlbumSearch()
  }

  cancelSongSearch()
  const controller = new AbortController()
  songSearchAbort = controller
  const seq = ++searchSeq
  const source = searchState.activeSource
  const keyword = searchState.keyword.trim()
  const page = searchState.page

  searchState.loading = true
  searchState.searched = true
  resetAlbumTrackPage()
  clearSelection()
  closeMenus()
  try {
    const res = await api.search.search(keyword, source, page, { signal: controller.signal })
    if (seq !== searchSeq || source !== searchState.activeSource) return
    const data = res.data
    if (Array.isArray(data)) {
      searchState.results = data.map(cleanTrackItem)
      searchState.totalPages = 1
    } else if (data?.list) {
      searchState.results = data.list.map(cleanTrackItem)
      searchState.totalPages = data.allPage || data.totalPage || 1
    } else {
      searchState.results = []
      searchState.totalPages = 1
    }
  } catch (e) {
    if (isAbortedError(e)) return
    if (seq !== searchSeq) return
    searchState.results = []
    searchState.totalPages = 1
    showToast(e.message, 'error')
  } finally {
    if (songSearchAbort === controller) songSearchAbort = null
    if (seq === searchSeq) searchState.loading = false
  }
}

async function doAlbumSearch() {
  if (!searchState.keyword.trim() || !searchState.activeSource) return

  cancelAlbumSearch()
  const controller = new AbortController()
  albumSearchAbort = controller
  const seq = ++searchSeq
  const source = searchState.activeSource
  const keyword = searchState.keyword.trim()
  const page = searchState.page

  searchState.albumLoading = true
  searchState.searched = true
  searchState.viewMode = 'list'
  searchState.albumInfo = null
  searchState.results = []
  closeMenus()
  try {
    const res = await api.search.searchAlbums(keyword, source, page, { signal: controller.signal })
    if (seq !== searchSeq || source !== searchState.activeSource) return
    const data = res.data
    searchState.albumResults = data?.list || []
    searchState.totalPages = data?.allPage || data?.totalPage || 1
  } catch (e) {
    if (isAbortedError(e)) return
    if (seq !== searchSeq) return
    searchState.albumResults = []
    searchState.totalPages = 1
    showToast(e.message, 'error')
  } finally {
    if (albumSearchAbort === controller) albumSearchAbort = null
    if (seq === searchSeq) searchState.albumLoading = false
  }
}

async function openAlbum(item) {
  if (!item?.id) return

  cancelAlbumOpen()
  const controller = new AbortController()
  albumOpenAbort = controller
  const seq = ++searchSeq
  const source = item.source || searchState.activeSource

  searchState.albumLoading = true
  clearSelection()
  closeMenus()
  try {
    const res = await api.search.fetchAlbum(source, item.id, { signal: controller.signal })
    if (seq !== searchSeq) return
    const data = res.data
    searchState.albumInfo = data?.info || {
      name: item.name,
      img: item.img,
      author: item.artist,
      publishTime: item.publishTime,
    }
    searchState.results = (data?.list || []).map(cleanTrackItem)
    searchState.viewMode = 'album-detail'
    resetAlbumTrackPage()
  } catch (e) {
    if (isAbortedError(e)) return
    if (seq !== searchSeq) return
    showToast(e.message, 'error')
  } finally {
    if (albumOpenAbort === controller) albumOpenAbort = null
    if (seq === searchSeq) searchState.albumLoading = false
  }
}

function backToAlbumList() {
  searchState.viewMode = 'list'
  searchState.albumInfo = null
  searchState.results = []
  clearSelection()
  closeMenus()
}

async function downloadOne(item, quality) {
  closeMenus()
  if (!(await assertActiveSourceForDownload())) return
  try {
    await api.download.add([buildDownloadTask(item, searchState.activeSource, quality)])
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
  const res = addToPickingPlaylist(item, searchState.activeSource)
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
.search-page {
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

.search-header { padding: 20px 20px 18px; margin-bottom: 16px; overflow: visible; }

.search-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 16px;
}
.search-bar {
  flex: 1;
  min-width: 0;
}
.search-btn {
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
.mode-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}
.mode-tab {
  padding: 5px 14px;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  border: 1px solid var(--border);
}
.mode-tab:hover { background: var(--bg-hover); color: var(--text); }
.mode-tab.active {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-muted);
}

.album-detail-toolbar {
  margin-bottom: 12px;
}

.album-info {
  display: flex;
  gap: 20px;
  padding: 20px;
  margin-bottom: 16px;
  align-items: flex-start;
}
.album-cover-wrap {
  flex-shrink: 0;
  width: 140px;
  height: 140px;
  border-radius: var(--radius);
  overflow: hidden;
}
.album-meta { min-width: 0; flex: 1; }
.album-name {
  margin: 0 0 10px;
  font-size: 22px;
  line-height: 1.3;
}
.album-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 10px;
}
.album-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.album-results { padding: 16px; margin-bottom: 16px; }
.album-loading {
  text-align: center;
  padding: 40px 0;
  color: var(--text-muted);
  font-size: 14px;
}
.album-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px 18px;
}
.album-card {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 10px;
  border-radius: var(--radius);
  border: 1px solid var(--border-light);
  background: var(--bg-elevated);
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
}
.album-card:hover {
  background: var(--bg-hover);
  border-color: var(--accent);
}
.album-card-cover-wrap {
  flex-shrink: 0;
  width: 72px;
  height: 72px;
  border-radius: 8px;
  overflow: hidden;
}
.album-card-meta { min-width: 0; flex: 1; }
.album-card-name {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.album-card-artist {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.album-card-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-muted);
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

.results { overflow: visible; }

.result-list-body.is-virtual {
  max-height: min(70vh, 720px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.result-list-spacer {
  min-height: 0;
}

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
  gap: 10px;
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

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid var(--border-light);
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
  .search-header { padding: 12px; }
  .album-info {
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 16px;
  }
  .album-tags { justify-content: center; }
  .album-grid { grid-template-columns: 1fr; }
  .search-row {
    gap: 8px;
    margin-bottom: 12px;
  }
  .search-bar {
    padding: 0 12px;
  }
  .search-bar :deep(input) {
    font-size: 16px;
  }
  .search-btn {
    height: 44px;
    width: auto;
    min-width: 72px;
    padding: 0 14px;
  }

  .result-header { display: none; }

  .result-row {
    grid-template-columns: 28px 1fr 36px 36px 36px;
    grid-template-areas:
      "check name play queue action"
      "check meta play queue action";
    gap: 2px 8px;
    padding: 12px 14px;
    align-items: center;
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
  .col-singer {
    grid-area: meta;
    font-size: 12px;
  }
  .col-play { grid-area: play; }
  .col-queue { grid-area: queue; }
  .col-action { grid-area: action; }

  .results-toolbar { flex-wrap: wrap; gap: 8px; }
  .mobile-select-all { display: inline-flex; }
  .results-actions {
    width: 100%;
    display: flex;
    gap: 8px;
  }
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
