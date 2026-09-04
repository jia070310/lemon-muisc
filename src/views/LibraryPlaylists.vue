<template>
  <div class="library-playlists-page">
    <div class="page-header-row">
      <button class="btn-ghost btn-sm" @click="$router.back()">← 返回</button>
      <div class="page-title">全部歌单</div>
      <button
        v-if="showPlaylistMoreBtn"
        type="button"
        class="btn-ghost btn-sm"
        @click="showAllPlaylistCards = !showAllPlaylistCards"
      >
        {{ showAllPlaylistCards ? '收起' : '更多' }}
      </button>
      <button class="btn-primary btn-sm" @click="openCreate">创建歌单</button>
    </div>

    <div ref="playlistGridEl" class="playlist-grid">
      <button
        v-for="card in gridCards"
        :key="card.id"
        class="playlist-card-btn"
        :class="{ active: selectedId === card.id }"
        @click="selectCard(card)"
      >
        <PlaylistCover
          size="row"
          :cover-style="card.coverStyle"
          :cover-url="card.coverUrl"
          :gradient="card.gradient"
          :icon="card.icon"
          :name="card.name"
          :count="card.count"
          show-meta
        />
      </button>
    </div>

    <section v-if="selectedCard" class="detail card">
      <div class="detail-hero">
        <PlaylistCover
          v-if="!isNarrow"
          size="lg"
          :cover-style="selectedCard.coverStyle"
          :cover-url="selectedCard.coverUrl"
          :gradient="selectedCard.gradient"
          :icon="selectedCard.icon"
          :name="selectedCard.name"
          :count="selectedCard.count"
        />
        <div class="detail-info">
          <h2>{{ selectedCard.name }}</h2>
          <p class="detail-meta">
            {{ selectedCard.count }} 首
            <template v-if="canEditSelected && isImportedSelected">
              · 本地 {{ trackOrigins.local }} / 网络 {{ trackOrigins.online }}
              <template v-if="lastRemoteSyncLabel"> · {{ lastRemoteSyncLabel }}</template>
            </template>
          </p>
          <div class="detail-actions">
            <button class="btn-primary btn-sm" :disabled="!selectedCard.tracks.length" @click="playAll">播放全部</button>
            <button
              v-if="canEditSelected && isImportedSelected"
              class="btn-ghost btn-sm"
              :disabled="syncingRemote"
              @click="syncRemote"
            >
              {{ syncingRemote ? '更新中…' : '更新歌单' }}
            </button>
            <button
              v-if="canEditSelected && isImportedSelected"
              class="btn-ghost btn-sm"
              :disabled="syncingLocal"
              @click="syncLocal"
            >
              {{ syncingLocal ? '同步中…' : '同步本地' }}
            </button>
            <div
              v-if="isImportedSelected && onlineTrackCount"
              class="dl-wrap batch-dl-wrap"
            >
              <button
                class="btn-ghost btn-sm"
                :disabled="!batchDownloadCount || batchDownloading"
                @click.stop="toggleBatchQualityMenu($event)"
              >
                {{ batchDownloading ? '添加中…' : `批量下载${batchDownloadCount ? ` (${batchDownloadCount})` : ''}` }}
              </button>
              <div class="quality-menu" v-if="showBatchQualityMenu" :style="batchMenuStyle" @click.stop>
                <div class="quality-menu-title">批量音质：不支持时将自动降为最接近可用音质</div>
                <button
                  v-for="q in batchQualities"
                  :key="q"
                  class="quality-option"
                  @click="downloadBatch(q)"
                >{{ getQualityLabel(q) }}</button>
              </div>
            </div>
            <button v-if="canEditSelected" class="btn-ghost btn-sm" @click="openEdit">编辑歌单</button>
            <button v-if="canEditSelected" class="btn-ghost btn-sm" @click="showAddModal = true">添加歌曲</button>
            <button v-if="canEditSelected" class="btn-ghost btn-sm btn-danger-hover" @click="openDeletePlaylistModal">删除歌单</button>
          </div>
        </div>
      </div>

      <div v-if="!selectedCard.tracks.length" class="detail-empty">
        <p>暂无歌曲</p>
        <button v-if="canEditSelected" class="btn-primary btn-sm" @click="showAddModal = true">添加歌曲</button>
      </div>
      <template v-else>
        <div v-if="isImportedSelected && onlineTrackCount" class="track-list-toolbar">
          <label class="batch-select-all">
            <input
              type="checkbox"
              :checked="allOnlineSelected"
              :indeterminate.prop="someOnlineSelected && !allOnlineSelected"
              @change="toggleSelectAllOnline"
            />
            全选网络歌曲
          </label>
          <span v-if="selectedDownloadCount" class="batch-count">已选 {{ selectedDownloadCount }}</span>
        </div>
        <div class="track-list">
          <div
            v-for="(song, i) in pagedTracks"
            :key="song.key"
            class="track-row"
            :class="{ active: isPlayingSong(song), hovered: hoverKey === song.key }"
            @mouseenter="hoverKey = song.key"
            @mouseleave="hoverKey = ''"
            @dblclick="playOne(song)"
          >
            <label
              v-if="isImportedSelected && !song.isLocal"
              class="track-check"
              @click.stop
            >
              <input
                type="checkbox"
                :checked="selectedDownloadKeys.has(song.key)"
                @change="toggleSelectOnline(song)"
              />
            </label>
            <span v-else-if="isImportedSelected && song.isLocal" class="track-check-placeholder" />
            <span class="track-index">{{ listStart + i + 1 }}</span>
            <button
              type="button"
              class="song-cover-btn"
              :class="{ rippling: tappingSongKey === song.key }"
              @click="onTrackCoverClick(song)"
            >
              <div class="song-cover-media">
                <CoverArt :src="song.picUrl" />
              </div>
              <span class="song-cover-ripple" aria-hidden="true" />
              <span
                v-if="showCoverOverlay(song)"
                class="song-play-overlay"
              >
                <svg v-if="isCoverPauseIcon(song)" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="5" width="4" height="14" rx="1"/>
                  <rect x="14" y="5" width="4" height="14" rx="1"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <polygon points="7,3 21,12 7,21"/>
                </svg>
              </span>
            </button>
            <div class="track-meta">
              <div class="track-name-row">
                <span class="track-name">{{ song.name }}</span>
                <span v-if="song.isLocal" class="track-origin-badge local">本地</span>
                <span v-else class="track-origin-badge online">{{ onlineBadgeLabel(song) }}</span>
              </div>
              <div class="track-artist">{{ song.singer }}</div>
              <div class="track-tags">{{ formatTrackTags(song) }}</div>
            </div>
            <MobileRowActions
              :open="actionsOpenKey === song.key"
              @toggle="toggleRowActions(song.key)"
              @close="actionsOpenKey = ''"
            >
              <button type="button" class="icon-action-btn" title="加入试听列表" @click.stop="queueOne(song)">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <button type="button" class="icon-action-btn" title="加入歌单" @click.stop="openPickPlaylist(song)">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15V6"/><path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/><path d="M12 12H3"/><path d="M16 6H3"/><path d="M12 18H3"/></svg>
              </button>
              <button
                type="button"
                class="icon-action-btn"
                :class="{ 'fav-active': isFavorite(song) }"
                :title="isFavorite(song) ? '取消收藏' : '收藏'"
                @click.stop="toggleFavorite(song)"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" :fill="isFavorite(song) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
              </button>
              <button
                v-if="canEditSelected"
                type="button"
                class="icon-action-btn danger"
                title="从歌单移除"
                @click.stop="removeSong(song)"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
              <div v-if="!song.isLocal" class="dl-wrap">
                <button
                  type="button"
                  class="icon-action-btn dl-btn"
                  title="下载"
                  @click.stop="toggleQualityMenu(song, $event)"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
                <div class="quality-menu" v-if="qualityMenuKey === song.key" :style="menuStyle" @click.stop>
                  <div class="quality-menu-title">选择音质</div>
                  <template v-if="getItemQualities(trackPayload(song)).length">
                    <button
                      v-for="q in getItemQualities(trackPayload(song))"
                      :key="q"
                      class="quality-option"
                      @click="downloadOne(song, q)"
                    >{{ getQualityDisplay(q, song.types) }}</button>
                  </template>
                  <div v-else class="quality-empty">暂无可用音质</div>
                </div>
              </div>
            </MobileRowActions>
          </div>
        </div>
        <div class="pager" v-if="trackTotalPages > 1">
          <button class="btn-ghost btn-sm" :disabled="trackPage <= 1" @click="trackPage--">上一页</button>
          <span>{{ trackPage }} / {{ trackTotalPages }}</span>
          <button class="btn-ghost btn-sm" :disabled="trackPage >= trackTotalPages" @click="trackPage++">下一页</button>
        </div>
      </template>
    </section>

    <CreatePlaylistModal
      v-if="showCreateModal"
      :api="api"
      @close="showCreateModal = false"
      @created="onPlaylistCreated"
      @imported="onPlaylistImported"
    />

    <PlaylistEditModal
      v-if="showEditModal && editingPlaylist"
      title="编辑歌单"
      :playlist="editingPlaylist"
      @close="showEditModal = false"
      @save="confirmEdit"
    />

    <AddToPlaylistModal
      v-if="showAddModal && canEditSelected"
      :playlist-id="selectedId"
      :playlist-name="selectedCard?.name || ''"
      :existing-keys="selectedCard?.playlist?.trackKeys || []"
      @close="showAddModal = false"
      @added="onSongsAdded"
    />

    <PickPlaylistModal
      v-if="pickPlaylistTrack"
      :track="pickPlaylistTrack"
      :source="pickPlaylistSource"
      :exclude-playlist-id="pickPlaylistExcludeId"
      @close="pickPlaylistTrack = null"
      @added="onAddedToPlaylist"
    />

    <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal = false">
      <div class="confirm-modal card" role="dialog" aria-labelledby="delete-playlist-title">
        <h3 id="delete-playlist-title">删除歌单</h3>
        <p class="confirm-text">{{ deleteConfirmMessage }}</p>
        <div class="confirm-actions">
          <button type="button" class="btn-ghost btn-sm" @click="showDeleteModal = false">取消</button>
          <button type="button" class="btn-danger btn-sm" @click="doDeletePlaylist">删除</button>
        </div>
      </div>
    </div>

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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PlaylistCover from '../components/PlaylistCover.vue'
import CoverArt from '../components/CoverArt.vue'
import MobileRowActions from '../components/MobileRowActions.vue'
import PlaylistEditModal from '../components/PlaylistEditModal.vue'
import CreatePlaylistModal from '../components/CreatePlaylistModal.vue'
import AddToPlaylistModal from '../components/AddToPlaylistModal.vue'
import PickPlaylistModal from '../components/PickPlaylistModal.vue'
import BatchQualityDialog from '../components/BatchQualityDialog.vue'
import { useBatchDownload, formatBatchDownloadToast } from '../composables/useBatchDownload.js'
import { platformLabel } from '../utils/platforms.js'
import { getQualityLabel, getQualityDisplay } from '../utils/quality.js'
import { buildDownloadTask, getItemQualities } from '../utils/musicPayload.js'
import { useQualityMenuPosition } from '../utils/qualityMenu.js'
import { playItem, addToQueue, isInQueue, isPlayingItem, isPaused } from '../stores/player.js'
import { formatTrackTags } from '../utils/format.js'
import { countAutoFillColumns } from '../utils/grid.js'
import {
  libraryTracks,
  libraryScanned,
  buildPlaylistCards,
  SMART_PLAYLIST_IDS,
  updatePlaylist,
  removeTrackFromPlaylist,
  deletePlaylist,
  isCustomPlaylist,
  isImportedPlaylist,
  getCustomPlaylist,
  syncPlaylistLocalTracks,
  refreshImportedPlaylistFromNetwork,
  countPlaylistTrackOrigins,
  snapshotToPlayTrack,
  scanLibrary,
  isFavorite,
  toggleFavorite,
} from '../stores/library.js'
import { api } from '../api.js'
import { assertActiveSourceForDownload } from '../stores/downloadGuard.js'

const route = useRoute()
const router = useRouter()
const selectedId = ref('')
const trackPage = ref(1)
const trackPageSize = 20
const showCreateModal = ref(false)
const showEditModal = ref(false)
const showAddModal = ref(false)
const showDeleteModal = ref(false)
const toast = ref(null)
const hoverKey = ref('')
const actionsOpenKey = ref('')
const tappingSongKey = ref('')

function toggleRowActions(key) {
  actionsOpenKey.value = actionsOpenKey.value === key ? '' : key
}
const coverPendingPauseKey = ref('')
const isNarrow = ref(false)
const showAllPlaylistCards = ref(false)
const playlistGridEl = ref(null)
const playlistCols = ref(4)
/** 全部歌单页桌面端只预览一行；音乐库首页仍为两行 */
const PLAYLIST_GRID_ROWS = 1
const playlistPreviewLimit = computed(() => Math.max(PLAYLIST_GRID_ROWS, playlistCols.value * PLAYLIST_GRID_ROWS))
const pickPlaylistTrack = ref(null)
const pickPlaylistSource = ref('local')
const pickPlaylistExcludeId = ref('')
const syncingLocal = ref(false)
const syncingRemote = ref(false)
const qualityMenuKey = ref('')
const showBatchQualityMenu = ref(false)
const selectedDownloadKeys = ref(new Set())
const { menuStyle, positionMenu, clearMenuPosition } = useQualityMenuPosition()
const { menuStyle: batchMenuStyle, positionMenu: positionBatchMenu, clearMenuPosition: clearBatchMenuPosition } = useQualityMenuPosition()
let narrowMq = null
let playlistGridRo = null

function updatePlaylistCols() {
  const w = playlistGridEl.value?.clientWidth || 0
  playlistCols.value = countAutoFillColumns(w, { minSize: 260, gap: 18 })
}

const playlistSource = computed(() => editingPlaylist.value?.importSource || '')

const {
  batchDialog,
  batchDownloading,
  startBatchDownload,
  confirmBatchDialog,
  closeBatchDialog,
  getBatchQualities,
} = useBatchDownload({
  getSource: () => playlistSource.value,
  onCompleted: (count, summary) => {
    showToast(formatBatchDownloadToast(count, summary), 'success')
    selectedDownloadKeys.value = new Set()
  },
  onError: (e) => showToast(e.message || '下载失败', 'error'),
})

function updateNarrow() {
  isNarrow.value = narrowMq?.matches ?? window.innerWidth <= 768
}

const allCards = computed(() => buildPlaylistCards(libraryTracks.value))
const customCards = computed(() => allCards.value.filter((c) => !SMART_PLAYLIST_IDS.has(c.id)))
const smartCards = computed(() => allCards.value.filter((c) => SMART_PLAYLIST_IDS.has(c.id)))
/** 有自定义/导入歌单时只展示这些；没有时才展示最近添加 / 收藏 / 最近播放 */
const sourceCards = computed(() => (
  customCards.value.length ? customCards.value : smartCards.value
))
const gridCards = computed(() => {
  if (isNarrow.value || showAllPlaylistCards.value) return sourceCards.value
  return sourceCards.value.slice(0, playlistPreviewLimit.value)
})
const showPlaylistMoreBtn = computed(() => (
  !isNarrow.value && sourceCards.value.length > playlistPreviewLimit.value
))
const selectedCard = computed(() => allCards.value.find(c => c.id === selectedId.value) || null)
const canEditSelected = computed(() => isCustomPlaylist(selectedId.value))
const isImportedSelected = computed(() => isImportedPlaylist(editingPlaylist.value))
const editingPlaylist = computed(() => getCustomPlaylist(selectedId.value))
const trackOrigins = computed(() => countPlaylistTrackOrigins(selectedCard.value?.tracks || []))
const lastRemoteSyncLabel = computed(() => {
  const ts = editingPlaylist.value?.lastRemoteSyncedAt || editingPlaylist.value?.lastSyncedAt
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return `上次更新 ${d.toLocaleDateString('zh-CN')}`
})

const deleteConfirmMessage = computed(() => {
  if (!selectedCard.value) return ''
  const name = selectedCard.value.name
  const count = selectedCard.value.count || 0
  if (count > 0) {
    return `歌单「${name}」内有 ${count} 首歌曲。删除后歌曲仍保留在音乐库中，确定要删除这个歌单吗？`
  }
  return `确定删除歌单「${name}」吗？此操作不可恢复。`
})

const trackTotalPages = computed(() => Math.max(1, Math.ceil((selectedCard.value?.tracks.length || 0) / trackPageSize)))
const listStart = computed(() => (trackPage.value - 1) * trackPageSize)
const pagedTracks = computed(() => {
  const tracks = selectedCard.value?.tracks || []
  return tracks.slice(listStart.value, listStart.value + trackPageSize)
})

const allOnlineTracks = computed(() => (selectedCard.value?.tracks || []).filter(s => !s.isLocal))
const onlineTrackCount = computed(() => allOnlineTracks.value.length)
const selectedDownloadCount = computed(() => selectedDownloadKeys.value.size)
const selectedOnlineTracks = computed(() =>
  allOnlineTracks.value.filter(s => selectedDownloadKeys.value.has(s.key))
)
const batchDownloadCount = computed(() =>
  selectedDownloadCount.value || onlineTrackCount.value
)
const batchDownloadItems = computed(() =>
  selectedOnlineTracks.value.length
    ? selectedOnlineTracks.value.map(trackPayload)
    : allOnlineTracks.value.map(trackPayload)
)
const batchQualities = computed(() => getBatchQualities(batchDownloadItems.value))
const batchPreferredLabel = computed(() => {
  const q = batchDialog.value?.preferred
  return q ? getQualityLabel(q) : ''
})
const allOnlineSelected = computed(() =>
  allOnlineTracks.value.length > 0
  && allOnlineTracks.value.every(s => selectedDownloadKeys.value.has(s.key))
)
const someOnlineSelected = computed(() => selectedDownloadCount.value > 0)

watch(selectedId, () => {
  trackPage.value = 1
  selectedDownloadKeys.value = new Set()
  closeMenus()
})

watch(() => route.query.id, (id) => {
  selectedId.value = id ? String(id) : ''
})

watch([selectedId, playlistPreviewLimit, sourceCards], () => {
  if (isNarrow.value || showAllPlaylistCards.value || !selectedId.value) return
  const idx = sourceCards.value.findIndex((c) => c.id === selectedId.value)
  if (idx >= playlistPreviewLimit.value) showAllPlaylistCards.value = true
})

onMounted(async () => {
  narrowMq = window.matchMedia('(max-width: 768px)')
  updateNarrow()
  narrowMq.addEventListener('change', updateNarrow)
  document.addEventListener('click', closeMenus)
  if (typeof ResizeObserver !== 'undefined') {
    playlistGridRo = new ResizeObserver(() => updatePlaylistCols())
    if (playlistGridEl.value) playlistGridRo.observe(playlistGridEl.value)
  }
  updatePlaylistCols()
  const q = route.query.id
  if (q) selectedId.value = String(q)
  if (!libraryScanned.value) {
    try { await scanLibrary(api) } catch {}
  }
})

onUnmounted(() => {
  narrowMq?.removeEventListener('change', updateNarrow)
  document.removeEventListener('click', closeMenus)
  playlistGridRo?.disconnect()
  playlistGridRo = null
})

function selectCard(card) {
  selectedId.value = card.id
}

function trackPayload(song) {
  return snapshotToPlayTrack(song, song.source || playlistSource.value || (song.localPath ? 'local' : ''))
}

function songDownloadSource(song) {
  return song.source || playlistSource.value
}

function toggleSelectOnline(song) {
  if (song.isLocal) return
  const next = new Set(selectedDownloadKeys.value)
  if (next.has(song.key)) next.delete(song.key)
  else next.add(song.key)
  selectedDownloadKeys.value = next
}

function toggleSelectAllOnline() {
  if (allOnlineSelected.value) {
    selectedDownloadKeys.value = new Set()
    return
  }
  selectedDownloadKeys.value = new Set(allOnlineTracks.value.map(s => s.key))
}

function toggleQualityMenu(song, event) {
  showBatchQualityMenu.value = false
  clearBatchMenuPosition()
  if (qualityMenuKey.value === song.key) {
    qualityMenuKey.value = ''
    clearMenuPosition()
    return
  }
  qualityMenuKey.value = song.key
  positionMenu(event?.currentTarget, { align: 'right' })
}

function toggleBatchQualityMenu(event) {
  if (!batchDownloadCount.value) return
  qualityMenuKey.value = ''
  clearMenuPosition()
  showBatchQualityMenu.value = !showBatchQualityMenu.value
  if (showBatchQualityMenu.value) {
    positionBatchMenu(event?.currentTarget, { align: 'left' })
  } else {
    clearBatchMenuPosition()
  }
}

function closeMenus() {
  qualityMenuKey.value = ''
  showBatchQualityMenu.value = false
  clearMenuPosition()
  clearBatchMenuPosition()
}

function getBatchEntries() {
  const list = selectedOnlineTracks.value.length ? selectedOnlineTracks.value : allOnlineTracks.value
  return list.map(song => ({ item: trackPayload(song), key: song.key }))
}

async function downloadOne(song, quality) {
  closeMenus()
  const item = trackPayload(song)
  const source = songDownloadSource(song)
  if (!(await assertActiveSourceForDownload())) return
  try {
    await api.download.add([buildDownloadTask(item, source, quality)])
    showToast(`已添加下载: ${song.name}`, 'success')
  } catch (e) {
    showToast(e.message || '下载失败', 'error')
  }
}

async function downloadBatch(quality) {
  const entries = getBatchEntries()
  if (!entries.length) return
  closeMenus()
  await startBatchDownload(entries, quality)
}

async function handleBatchConfirm(payload) {
  await confirmBatchDialog(payload)
}

function isPlayingSong(song) {
  return isPlayingItem(trackPayload(song)) && !isPaused.value
}

function isCurrentSong(song) {
  return isPlayingItem(trackPayload(song))
}

function showCoverOverlay(song) {
  return isNarrow.value || hoverKey.value === song.key || isCurrentSong(song)
}

function isCoverPauseIcon(song) {
  if (coverPendingPauseKey.value === song.key) return true
  if (!isCurrentSong(song)) return false
  return !isPaused.value
}

async function playOne(song) {
  const source = song.source || (song.localPath ? 'local' : '')
  try {
    await playItem(trackPayload(song), source)
  } catch (e) {
    showToast(e.message || '播放失败', 'error')
  }
}

async function onTrackCoverClick(song) {
  const key = song?.key || ''
  tappingSongKey.value = key
  setTimeout(() => {
    if (tappingSongKey.value === key) tappingSongKey.value = ''
  }, 560)

  if (isCurrentSong(song) && !isPaused.value) {
    coverPendingPauseKey.value = ''
  } else {
    coverPendingPauseKey.value = key
  }

  try {
    await playOne(song)
  } finally {
    if (coverPendingPauseKey.value === key) coverPendingPauseKey.value = ''
  }
}

async function playAll() {
  const list = selectedCard.value?.tracks || []
  if (!list.length) return
  for (const s of list) {
    const source = s.source || (s.localPath ? 'local' : '')
    addToQueue(trackPayload(s), source)
  }
  const first = list[0]
  await playItem(trackPayload(first), first.source || (first.localPath ? 'local' : ''))
}

function queueOne(song) {
  const source = song.source || (song.localPath ? 'local' : '')
  const track = trackPayload(song)
  if (isInQueue(track, source)) {
    showToast('已在试听列表', 'info')
    return
  }
  addToQueue(track, source)
  showToast(`已加入列表: ${song.name}`, 'success')
}

function openPickPlaylist(song) {
  const source = song.source || (song.localPath ? 'local' : '')
  pickPlaylistTrack.value = trackPayload(song)
  pickPlaylistSource.value = source
  pickPlaylistExcludeId.value = canEditSelected.value ? selectedId.value : ''
}

function onAddedToPlaylist({ playlist, duplicate }) {
  pickPlaylistTrack.value = null
  if (duplicate) showToast('歌曲已在歌单中', 'info')
  else showToast(`已加入歌单：${playlist?.name || ''}`, 'success')
}

function onlineBadgeLabel(song) {
  const label = platformLabel(song.source || '')
  return label && label !== song.source ? label : '网络'
}

function onPlaylistCreated({ playlist }) {
  showCreateModal.value = false
  selectedId.value = playlist.id
  showToast(`已创建歌单：${playlist.name}`, 'success')
}

function onPlaylistImported({ playlist, total, localMatched }) {
  showCreateModal.value = false
  selectedId.value = playlist?.id || ''
  const localText = localMatched > 0 ? `，已匹配本地 ${localMatched} 首` : ''
  showToast(`已导入 ${total} 首歌曲${localText}`, 'success')
}

async function syncLocal() {
  if (!canEditSelected.value || syncingLocal.value) return
  syncingLocal.value = true
  try {
    if (!libraryScanned.value) {
      await scanLibrary(api)
    }
    const { matched } = syncPlaylistLocalTracks(selectedId.value)
    if (matched > 0) showToast(`已匹配本地 ${matched} 首`, 'success')
    else showToast('未发现新的本地匹配', 'info')
  } catch (e) {
    showToast(e.message || '同步失败', 'error')
  } finally {
    syncingLocal.value = false
  }
}

async function syncRemote() {
  if (!canEditSelected.value || syncingRemote.value) return
  syncingRemote.value = true
  try {
    const { added, matched } = await refreshImportedPlaylistFromNetwork(api, selectedId.value)
    if (added > 0) {
      const localText = matched > 0 ? `，已匹配本地 ${matched} 首` : ''
      showToast(`网络歌单新增 ${added} 首${localText}`, 'success')
    } else {
      showToast('网络歌单暂无新增歌曲', 'info')
    }
  } catch (e) {
    showToast(e.message || '更新失败', 'error')
  } finally {
    syncingRemote.value = false
  }
}

function openCreate() {
  showCreateModal.value = true
}

function openEdit() {
  if (!canEditSelected.value) return
  showEditModal.value = true
}

function confirmEdit(payload) {
  const pl = updatePlaylist(selectedId.value, payload)
  if (!pl) return
  showEditModal.value = false
  showToast('歌单已更新', 'success')
}

function removeSong(song) {
  removeTrackFromPlaylist(selectedId.value, song.key)
  showToast('已从歌单移除', 'info')
}

function openDeletePlaylistModal() {
  if (!canEditSelected.value || !selectedCard.value) return
  showDeleteModal.value = true
}

function doDeletePlaylist() {
  const id = selectedId.value
  if (!deletePlaylist(id)) return
  showDeleteModal.value = false
  router.push('/library')
}

function onSongsAdded(res) {
  if (res.added > 0) showToast(`已添加 ${res.added} 首`, 'success')
  else showToast('所选歌曲已在歌单中', 'info')
}

function showToast(text, type = 'info') {
  toast.value = { text, type }
  setTimeout(() => { toast.value = null }, 2800)
}
</script>

<style scoped>
.library-playlists-page { width: 100%; }
.page-header-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.page-title { font-size: 22px; font-weight: 600; flex: 1; }
.playlist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 18px;
  margin-bottom: 24px;
}
.playlist-card-btn {
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 16px;
  overflow: hidden;
  text-align: left;
  min-width: 0;
}
.playlist-card-btn.active { outline: 2px solid var(--accent); outline-offset: 2px; }
.detail { padding: 18px; }
.detail-hero {
  display: flex;
  gap: 22px;
  margin-bottom: 22px;
  flex-wrap: wrap;
}
.detail-info { flex: 1; min-width: 220px; }
.detail-info h2 { margin: 0 0 10px; font-size: 24px; }
.detail-meta { margin: 0 0 16px; color: var(--text-muted); font-size: 15px; }
.detail-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.detail-empty {
  color: var(--text-muted);
  font-size: 14px;
  padding: 20px 0;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.track-list-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  padding: 0 4px;
  flex-wrap: wrap;
}
.batch-select-all {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}
.batch-select-all input { accent-color: var(--accent); }
.batch-count { font-size: 13px; color: var(--text-muted); }
.track-check {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  width: 20px;
}
.track-check input { accent-color: var(--accent); }
.track-check-placeholder { width: 20px; flex-shrink: 0; }
.track-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.track-row {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 12px;
  transition: background 0.15s ease;
}
.track-row:hover,
.track-row.active,
.track-row.hovered {
  background: var(--bg-hover);
}
.track-row.active .track-name { color: var(--accent); }
.track-index { width: 28px; color: var(--text-muted); font-size: 14px; flex-shrink: 0; }
.song-cover-btn {
  position: relative;
  width: 52px;
  height: 52px;
  padding: 0;
  border: none;
  border-radius: 10px;
  overflow: visible;
  flex-shrink: 0;
  background: var(--bg-elevated);
  cursor: pointer;
}
.song-cover-media {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  background: var(--bg-elevated);
}
.song-cover-ripple {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 68%;
  height: 68%;
  border-radius: 50%;
  transform: translate(-50%, -50%) scale(0.3);
  border: 2px solid rgba(125, 211, 252, 0.95);
  box-shadow:
    0 0 0 0 rgba(125, 211, 252, 0.5),
    0 0 18px rgba(125, 211, 252, 0.28);
  background: rgba(125, 211, 252, 0.18);
  opacity: 0;
  pointer-events: none;
  z-index: 3;
}
.song-cover-btn.rippling .song-cover-ripple {
  animation: song-cover-ripple 0.65s cubic-bezier(0.2, 0.7, 0.2, 1);
}
@keyframes song-cover-ripple {
  0% {
    transform: translate(-50%, -50%) scale(0.35);
    opacity: 0.95;
  }
  100% {
    transform: translate(-50%, -50%) scale(2.2);
    opacity: 0;
  }
}
.song-cover-btn img { width: 100%; height: 100%; object-fit: cover; display: block; }
.song-cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  color: var(--accent);
}
.song-play-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.42);
  color: #fff;
  z-index: 4;
  transition: background 0.18s ease, backdrop-filter 0.18s ease;
  backdrop-filter: saturate(1);
}
.song-play-overlay svg {
  transition: transform 0.22s ease, opacity 0.18s ease;
}
.song-cover-btn.rippling .song-play-overlay {
  background: color-mix(in srgb, var(--accent) 48%, rgba(0, 0, 0, 0.26));
  backdrop-filter: saturate(1.35);
}
.song-cover-btn.rippling .song-play-overlay svg {
  transform: scale(1.28);
}
.track-meta { flex: 1; min-width: 0; }
.track-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.track-name { font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
.track-origin-badge {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 999px;
  font-weight: 600;
}
.track-origin-badge.local {
  color: #15803d;
  background: rgba(34, 197, 94, 0.14);
}
.track-origin-badge.online {
  color: var(--accent);
  background: var(--accent-muted);
}
.track-artist { font-size: 13px; color: var(--text-muted); }
.track-tags { font-size: 12px; color: var(--text-muted); margin-top: 3px; }
.track-row-actions,
.mobile-row-actions { display: flex; gap: 6px; flex-shrink: 0; align-items: center; }
.dl-wrap { position: relative; display: inline-block; }
.dl-btn:hover { color: var(--success); }
.quality-menu {
  position: fixed;
  z-index: 1100;
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
.batch-dl-wrap { display: inline-block; }
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
  font-size: 13px;
  color: var(--text-muted);
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
.toast.info { background: var(--bg-card); border: 1px solid var(--border); }

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.confirm-modal {
  width: min(420px, 100%);
  padding: 22px;
}
.confirm-modal h3 {
  margin: 0 0 12px;
  font-size: 18px;
}
.confirm-text {
  margin: 0 0 20px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 768px) {
  .detail { padding: 12px; }
  .detail-hero { gap: 0; margin-bottom: 14px; }
  .detail-info h2 { font-size: 20px; margin-bottom: 6px; }
  .detail-meta { margin-bottom: 12px; font-size: 13px; }
  .song-cover-btn {
    width: 48px;
    height: 48px;
    border-radius: 8px;
  }
  .track-tags { display: none; }
}
</style>
