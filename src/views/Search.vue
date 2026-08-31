<template>
  <div class="search-page">
    <div class="page-title">搜索</div>
    <div class="page-subtitle">搜索歌曲或专辑，试听、下载；可多选后批量下载，不支持所选音质的歌曲会提示确认</div>

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
        <img
          v-if="searchState.albumInfo.img"
          :src="searchState.albumInfo.img"
          class="album-cover"
          alt=""
          @error="onCoverError"
        />
        <div v-else class="album-cover placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
        </div>
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
              <img v-if="item.img" :src="item.img" class="album-card-cover" alt="" loading="lazy" @error="onCoverError" />
              <div v-else class="album-card-cover placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
              </div>
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
              <div class="quality-menu-title">批量音质：不支持所选音质的歌曲将弹出确认</div>
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
        v-for="(item, i) in searchState.results" :key="trackSelectKey(item, i)"
        class="result-row"
        :class="{ playing: isPlayingItem(item), selected: isSelected(item, i) }"
      >
        <span class="col-check" @click.stop>
          <input type="checkbox" :checked="isSelected(item, i)" @change="toggleSelect(item, i)" />
        </span>
        <span class="col-index">{{ i + 1 }}</span>
        <span class="col-name" :title="cleanText(item.name)">{{ cleanText(item.name) }}</span>
        <span class="col-singer" :title="formatArtists(item.singer)">{{ formatArtists(item.singer) }}</span>
        <span class="col-album" :title="cleanText(item.album || item.albumName)">{{ cleanText(item.album || item.albumName) || '-' }}</span>
        <span class="col-duration">{{ item.interval || '-' }}</span>
        <span class="col-play">
          <button class="play-btn" @click="togglePlay(item)" :title="isPlayingItem(item) && !isPaused ? '暂停' : '试听'">
            <svg v-if="isPlayingItem(item) && !isPaused" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            <svg v-else-if="loadingPlay === item.id" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10" stroke-dasharray="50" stroke-dashoffset="20"/></svg>
            <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
          </button>
        </span>
        <span class="col-queue">
          <button
            class="queue-add-btn"
            :class="{ added: isInQueue(item, searchState.activeSource) }"
            @click="addOneToQueue(item)"
            :title="isInQueue(item, searchState.activeSource) ? '已在列表' : '加入试听列表'"
          >
            <svg v-if="isInQueue(item, searchState.activeSource)" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2" fill="none"/></svg>
            <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </span>
        <span class="col-action">
          <button
            v-if="playlistPickTarget"
            class="btn-sm btn-ghost playlist-add-btn"
            @click="addToPlaylist(item)"
            title="加入歌单"
          >加入歌单</button>
          <div class="dl-wrap">
            <button class="dl-btn" @click.stop="toggleQualityMenu(item, i, $event)" title="下载">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <div class="quality-menu" v-if="qualityMenuId === trackSelectKey(item, i)" :style="menuStyle" @click.stop>
              <div class="quality-menu-title">选择音质</div>
              <template v-if="getItemQualities(item).length">
                <button
                  v-for="q in getItemQualities(item)"
                  :key="q"
                  class="quality-option"
                  @click="downloadOne(item, q)"
                >{{ getQualityDisplay(q, item.types) }}</button>
              </template>
              <div v-else class="quality-empty">暂无可用音质</div>
            </div>
          </div>
        </span>
      </div>

      <div class="pagination" v-if="searchState.totalPages > 1">
        <button class="btn-ghost btn-sm" :disabled="searchState.page <= 1" @click="searchState.page--; doSearch()">上一页</button>
        <span class="page-info">{{ searchState.page }} / {{ searchState.totalPages }}</span>
        <button class="btn-ghost btn-sm" :disabled="searchState.page >= searchState.totalPages" @click="searchState.page++; doSearch()">下一页</button>
      </div>
    </div>

    <div v-else-if="showSongEmpty" class="empty">暂无搜索结果</div>

    <div v-if="toast" class="toast" :class="toast.type">{{ toast.text }}</div>

    <BatchQualityDialog
      :plan="batchDialog"
      :selections="rowSelections"
      :bulk-quality="bulkQuality"
      :bulk-options="bulkQualityOptions"
      :preferred-label="batchPreferredLabel"
      :busy="batchDownloading"
      @cancel="closeBatchDialog"
      @confirm="handleBatchConfirm"
      @apply-bulk="applyBulkQuality"
      @update:bulk-quality="bulkQuality = $event"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import BatchQualityDialog from '../components/BatchQualityDialog.vue'
import ClearableInput from '../components/ClearableInput.vue'
import { useBatchDownload } from '../composables/useBatchDownload.js'
import { api } from '../api.js'
import { searchState, loadSearchSources } from '../stores/search.js'
import { loadingPlay, isPaused, isPlayingItem, playItem, addToQueue, isInQueue } from '../stores/player.js'
import { getQualityLabel, getQualityDisplay } from '../utils/quality.js'
import { platformLabel } from '../utils/platforms.js'
import { cleanText, formatArtists, cleanTrackItem } from '../utils/text.js'
import {
  getItemQualities,
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
  rowSelections,
  bulkQuality,
  bulkQualityOptions,
  batchDownloading,
  startBatchDownload,
  confirmBatchDialog,
  closeBatchDialog,
  applyBulkQuality,
  getBatchQualities,
} = useBatchDownload({
  getSource: () => searchState.activeSource,
  onCompleted: (count) => {
    showToast(`已添加 ${count} 首到下载队列`, 'success')
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
  await loadSearchSources(api, { force: true })
  document.addEventListener('click', closeMenus)
})

onUnmounted(() => {
  document.removeEventListener('click', closeMenus)
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
  for (const item of searchState.results) {
    if (!isInQueue(item, searchState.activeSource)) {
      addToQueue(item, searchState.activeSource)
      added++
    }
  }
  showToast(added ? `已加入 ${added} 首` : '全部已在列表中', added ? 'success' : 'info')
}

async function playAll() {
  if (!searchState.results.length) return
  for (const item of searchState.results) {
    addToQueue(item, searchState.activeSource)
  }
  try {
    await playItem(searchState.results[0], searchState.activeSource)
    showToast(`开始播放，共 ${searchState.results.length} 首`, 'success')
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

function onCoverError(e) {
  e.target.style.display = 'none'
}

async function doSearch() {
  if (!searchState.keyword.trim() || !searchState.activeSource) return
  if (searchState.searchMode === 'album') {
    searchState.viewMode = 'list'
    searchState.albumInfo = null
    searchState.results = []
    return doAlbumSearch()
  }
  if (searchState.loading) return
  searchState.loading = true
  searchState.searched = true
  clearSelection()
  closeMenus()
  try {
    const res = await api.search.search(searchState.keyword, searchState.activeSource, searchState.page)
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
    searchState.results = []
    searchState.totalPages = 1
    showToast(e.message, 'error')
  } finally {
    searchState.loading = false
  }
}

async function doAlbumSearch() {
  if (!searchState.keyword.trim() || !searchState.activeSource || searchState.albumLoading) return
  searchState.albumLoading = true
  searchState.searched = true
  searchState.viewMode = 'list'
  searchState.albumInfo = null
  searchState.results = []
  closeMenus()
  try {
    const res = await api.search.searchAlbums(searchState.keyword, searchState.activeSource, searchState.page)
    const data = res.data
    searchState.albumResults = data?.list || []
    searchState.totalPages = data?.allPage || data?.totalPage || 1
  } catch (e) {
    searchState.albumResults = []
    searchState.totalPages = 1
    showToast(e.message, 'error')
  } finally {
    searchState.albumLoading = false
  }
}

async function openAlbum(item) {
  if (!item?.id || searchState.albumLoading) return
  searchState.albumLoading = true
  clearSelection()
  closeMenus()
  try {
    const res = await api.search.fetchAlbum(item.source || searchState.activeSource, item.id)
    const data = res.data
    searchState.albumInfo = data?.info || {
      name: item.name,
      img: item.img,
      author: item.artist,
      publishTime: item.publishTime,
    }
    searchState.results = (data?.list || []).map(cleanTrackItem)
    searchState.viewMode = 'album-detail'
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    searchState.albumLoading = false
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

async function handleBatchConfirm() {
  await confirmBatchDialog()
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
.album-cover-wrap { flex-shrink: 0; }
.album-cover {
  width: 140px;
  height: 140px;
  border-radius: var(--radius);
  object-fit: cover;
  background: var(--bg-input);
}
.album-cover.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}
.album-cover.placeholder svg { width: 48px; height: 48px; }
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
.album-card-cover-wrap { flex-shrink: 0; }
.album-card-cover {
  width: 72px;
  height: 72px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--bg-input);
}
.album-card-cover.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}
.album-card-cover.placeholder svg { width: 28px; height: 28px; }
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
