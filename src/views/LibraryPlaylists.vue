<template>
  <div class="library-playlists-page">
    <div class="page-header-row">
      <button class="btn-ghost btn-sm" @click="$router.back()">← 返回</button>
      <div class="page-title">全部歌单</div>
      <button class="btn-primary btn-sm" @click="openCreate">创建歌单</button>
    </div>

    <div class="playlist-grid">
      <button
        v-for="card in allCards"
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
          <p class="detail-meta">{{ selectedCard.count }} 首</p>
          <div class="detail-actions">
            <button class="btn-primary btn-sm" :disabled="!selectedCard.tracks.length" @click="playAll">播放全部</button>
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
        <div class="track-list">
          <div
            v-for="(song, i) in pagedTracks"
            :key="song.key"
            class="track-row"
            :class="{ active: isPlayingSong(song) }"
            @mouseenter="hoverKey = song.key"
            @mouseleave="hoverKey = ''"
            @dblclick="playOne(song)"
          >
            <span class="track-index">{{ listStart + i + 1 }}</span>
            <button type="button" class="track-cover-btn" @click="playOne(song)">
              <img
                v-if="song.picUrl && !brokenCovers.has(song.key)"
                :src="song.picUrl"
                alt=""
                class="track-cover-img"
                @error="markCoverBroken(song.key)"
              />
              <div v-else class="track-cover-fallback">{{ song.name.slice(0, 1) }}</div>
              <span v-if="hoverKey === song.key || isPlayingSong(song)" class="track-play-overlay">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="7,3 21,12 7,21"/></svg>
              </span>
            </button>
            <div class="track-meta">
              <div class="track-name">{{ song.name }}</div>
              <div class="track-artist">{{ song.singer }}</div>
              <div class="track-tags">{{ formatTrackTags(song) }}</div>
            </div>
            <div class="track-row-actions">
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
            </div>
          </div>
        </div>
        <div class="pager" v-if="trackTotalPages > 1">
          <button class="btn-ghost btn-sm" :disabled="trackPage <= 1" @click="trackPage--">上一页</button>
          <span>{{ trackPage }} / {{ trackTotalPages }}</span>
          <button class="btn-ghost btn-sm" :disabled="trackPage >= trackTotalPages" @click="trackPage++">下一页</button>
        </div>
      </template>
    </section>

    <PlaylistEditModal
      v-if="showCreateModal"
      title="创建歌单"
      @close="showCreateModal = false"
      @save="confirmCreate"
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PlaylistCover from '../components/PlaylistCover.vue'
import PlaylistEditModal from '../components/PlaylistEditModal.vue'
import AddToPlaylistModal from '../components/AddToPlaylistModal.vue'
import PickPlaylistModal from '../components/PickPlaylistModal.vue'
import { playItem, addToQueue, isInQueue, isPlayingItem, isPaused } from '../stores/player.js'
import { formatTrackTags } from '../utils/format.js'
import {
  libraryTracks,
  libraryScanned,
  buildPlaylistCards,
  createPlaylist,
  updatePlaylist,
  removeTrackFromPlaylist,
  deletePlaylist,
  isCustomPlaylist,
  getCustomPlaylist,
  snapshotToPlayTrack,
  scanLibrary,
  isFavorite,
  toggleFavorite,
} from '../stores/library.js'
import { api } from '../api.js'

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
const brokenCovers = ref(new Set())
const hoverKey = ref('')
const pickPlaylistTrack = ref(null)
const pickPlaylistSource = ref('local')
const pickPlaylistExcludeId = ref('')

function markCoverBroken(key) {
  if (!key) return
  const next = new Set(brokenCovers.value)
  next.add(key)
  brokenCovers.value = next
}

const allCards = computed(() => buildPlaylistCards(libraryTracks.value))
const selectedCard = computed(() => allCards.value.find(c => c.id === selectedId.value) || null)
const canEditSelected = computed(() => isCustomPlaylist(selectedId.value))
const editingPlaylist = computed(() => getCustomPlaylist(selectedId.value))

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

watch(selectedId, () => { trackPage.value = 1 })

watch(() => route.query.id, (id) => {
  selectedId.value = id ? String(id) : ''
})

onMounted(async () => {
  const q = route.query.id
  if (q) selectedId.value = String(q)
  if (!libraryScanned.value) {
    try { await scanLibrary(api) } catch {}
  }
})

function selectCard(card) {
  selectedId.value = card.id
}

function trackPayload(song) {
  return snapshotToPlayTrack(song, song.source || (song.localPath ? 'local' : ''))
}

function isPlayingSong(song) {
  return isPlayingItem(trackPayload(song)) && !isPaused.value
}

async function playOne(song) {
  const source = song.source || (song.localPath ? 'local' : '')
  await playItem(trackPayload(song), source)
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

function openCreate() {
  showCreateModal.value = true
}

function confirmCreate(payload) {
  const pl = createPlaylist(payload.name, {
    coverUrl: payload.coverUrl,
    coverMode: payload.coverMode,
  })
  if (!pl) return
  showCreateModal.value = false
  selectedId.value = pl.id
  showToast(`已创建歌单：${pl.name}`, 'success')
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
.track-row.active {
  background: var(--bg-hover);
}
.track-row.active .track-name { color: var(--accent); }
.track-index { width: 28px; color: var(--text-muted); font-size: 14px; flex-shrink: 0; }
.track-cover-btn {
  position: relative;
  width: 52px;
  height: 52px;
  padding: 0;
  border: none;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-elevated);
  cursor: pointer;
}
.track-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.track-cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-muted);
  color: var(--accent);
  font-weight: 700;
}
.track-play-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.42);
  color: #fff;
}
.track-meta { flex: 1; min-width: 0; }
.track-name { font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.track-artist { font-size: 13px; color: var(--text-muted); }
.track-tags { font-size: 12px; color: var(--text-muted); margin-top: 3px; }
.track-row-actions { display: flex; gap: 6px; flex-shrink: 0; }
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
</style>
