<template>
  <div class="library-page">
    <div class="library-topbar">
      <form class="library-search" @submit.prevent="applySearch">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input v-model="keyword" placeholder="搜索歌曲 / 歌手 / 专辑 / 歌单" />
      </form>
      <button type="button" class="btn-ghost btn-sm" :disabled="libraryLoading" @click="refreshLibrary">
        {{ libraryLoading ? '扫描中…' : '刷新库' }}
      </button>
      <button type="button" class="btn-primary btn-sm" @click="openCreatePlaylist">创建歌单</button>
    </div>
    <p v-if="scanSummary" class="library-scan-summary">
      {{ scanSummary }}
      <router-link to="/settings" class="library-scan-link">管理目录</router-link>
    </p>

    <section class="playlist-row-wrap">
      <div class="section-head">
        <h2>歌单</h2>
        <div class="section-head-actions">
          <AppSelect
            v-model="playlistSort"
            :options="playlistSortOptions"
            title="歌单排序"
          />
          <button
            v-if="sortedPlaylistCards.length > playlistPreviewLimit"
            type="button"
            class="section-more"
            @click="showAllPlaylistCards = !showAllPlaylistCards"
          >{{ showAllPlaylistCards ? '收起' : '更多' }}</button>
        </div>
      </div>
      <div class="playlist-row">
        <button
          v-for="card in visiblePlaylistCards"
          :key="card.id"
          class="playlist-card"
          @click="openPlaylist(card)"
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
    </section>

    <section class="album-section" v-if="sortedDisplayAlbums.length">
      <div class="section-head">
        <h2>最近添加专辑</h2>
        <div class="section-head-actions">
          <AppSelect
            v-model="albumSort"
            :options="albumSortOptions"
            title="专辑排序"
          />
          <button
            v-if="sortedDisplayAlbums.length > albumPreviewLimit"
            type="button"
            class="section-more"
            @click="showAllAlbums = !showAllAlbums"
          >{{ showAllAlbums ? '收起' : '更多' }}</button>
        </div>
      </div>
      <div class="album-row">
        <button
          v-for="album in visibleAlbums"
          :key="album.id"
          class="album-card"
          @click="openAlbum(album)"
        >
          <div class="album-cover">
            <img v-if="album.cover && !brokenCovers.has('album:' + album.id)" :src="album.cover" alt="" loading="lazy" @error="markCoverBroken('album:' + album.id)" />
            <div v-else class="album-cover-fallback">{{ album.name.slice(0, 1) }}</div>
          </div>
          <div class="album-name" :title="album.name">{{ album.name }}</div>
          <div class="album-artist" :title="album.artist">{{ album.artist }}</div>
          <div class="album-tags" v-if="formatAlbumTags(album)">{{ formatAlbumTags(album) }}</div>
        </button>
      </div>
    </section>

    <section class="song-section">
      <div class="section-head">
        <h2>歌曲</h2>
        <div class="section-head-actions">
          <AppSelect
            v-model="songSort"
            :options="songSortOptions"
            title="歌曲排序"
          />
          <span class="song-total" v-if="sortedFilteredSongs.length">{{ sortedFilteredSongs.length }} 首</span>
        </div>
      </div>

      <div v-if="libraryLoading" class="library-loading card">正在扫描音乐库… {{ loadProgress }}</div>
      <div v-else-if="!libraryTracks.length" class="empty card">
        <p>暂无本地音乐</p>
        <p class="empty-hint">请先在「设置 → 文件路径」添加音乐库目录</p>
        <router-link to="/settings" class="btn-ghost btn-sm">打开设置</router-link>
      </div>
      <template v-else>
        <div class="song-grid">
          <div
            v-for="song in pagedSongs"
            :key="song.key"
            class="song-item"
            :class="{ active: isPlayingSong(song), hovered: hoverKey === song.key }"
            @mouseenter="hoverKey = song.key"
            @mouseleave="hoverKey = ''"
            @dblclick="playSong(song)"
          >
            <button class="song-cover-btn" @click="playSong(song)">
              <img v-if="song.picUrl && !brokenCovers.has(song.key)" :src="song.picUrl" alt="" loading="lazy" @error="markCoverBroken(song.key)" />
              <div v-else class="song-cover-fallback">{{ song.name.slice(0, 1) }}</div>
              <span class="song-play-overlay" v-if="hoverKey === song.key || isPlayingSong(song)">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="7,3 21,12 7,21"/></svg>
              </span>
            </button>
            <div class="song-meta">
              <div class="song-title" :title="song.name">{{ song.name }}</div>
              <div class="song-artist" :title="song.singer">{{ song.singer }}</div>
              <div class="song-tags" :title="formatTrackTags(song)">{{ formatTrackTags(song) }}</div>
            </div>
            <div class="song-actions">
              <button
                type="button"
                class="icon-action-btn"
                title="加入试听列表"
                @click.stop="addToQueueSong(song)"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <button
                type="button"
                class="icon-action-btn"
                title="加入歌单"
                @click.stop="openPickPlaylist(song)"
              >
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
            </div>
          </div>
        </div>
        <div class="pager" v-if="totalPages > 1">
          <button class="btn-ghost btn-sm" :disabled="page <= 1" @click="page--">上一页</button>
          <span>{{ page }} / {{ totalPages }}</span>
          <button class="btn-ghost btn-sm" :disabled="page >= totalPages" @click="page++">下一页</button>
        </div>
      </template>
    </section>

    <div v-if="toast" class="toast" :class="toast.type">{{ toast.text }}</div>

    <PlaylistEditModal
      v-if="showCreateModal"
      title="创建歌单"
      @close="showCreateModal = false"
      @save="confirmCreatePlaylist"
    />

    <PickPlaylistModal
      v-if="pickPlaylistTrack"
      :track="pickPlaylistTrack"
      source="local"
      @close="pickPlaylistTrack = null"
      @added="onAddedToPlaylist"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import PlaylistCover from '../components/PlaylistCover.vue'
import PlaylistEditModal from '../components/PlaylistEditModal.vue'
import PickPlaylistModal from '../components/PickPlaylistModal.vue'
import AppSelect from '../components/AppSelect.vue'
import { formatTrackTags, formatAlbumTags } from '../utils/format.js'
import { playItem, addToQueue, isInQueue, isPlayingItem, isPaused } from '../stores/player.js'
import {
  libraryTracks, libraryLoading, libraryLoadProgress,
  groupAlbums, createPlaylist, buildPlaylistCards, sortPlaylistCards,
  sortAlbums, sortLibrarySongs,
  PLAYLIST_SORT_OPTIONS, ALBUM_SORT_OPTIONS, SONG_SORT_OPTIONS,
  scanLibrary, isFavorite, toggleFavorite,
} from '../stores/library.js'

const PLAYLIST_SORT_KEY = 'lemon-library-playlist-sort'
const ALBUM_SORT_KEY = 'lemon-library-album-sort'
const SONG_SORT_KEY = 'lemon-library-song-sort'

const router = useRouter()
const keyword = ref('')
const appliedKeyword = ref('')
const page = ref(1)
const pageSize = 20
const hoverKey = ref('')
const toast = ref(null)
const loadProgress = libraryLoadProgress
const showCreateModal = ref(false)
const pickPlaylistTrack = ref(null)
const brokenCovers = ref(new Set())
const scanSummary = ref('')
const showAllPlaylistCards = ref(false)
const playlistPreviewLimit = 9
const playlistSort = ref(localStorage.getItem(PLAYLIST_SORT_KEY) || 'default')
const showAllAlbums = ref(false)
const albumPreviewLimit = 12
const albumSort = ref(localStorage.getItem(ALBUM_SORT_KEY) || 'recent')
const songSort = ref(localStorage.getItem(SONG_SORT_KEY) || 'recent')

function markCoverBroken(key) {
  if (!key) return
  const next = new Set(brokenCovers.value)
  next.add(key)
  brokenCovers.value = next
}

const allAlbums = computed(() => groupAlbums(libraryTracks.value))
const playlistSortOptions = computed(() => PLAYLIST_SORT_OPTIONS.map(o => ({ value: o.id, label: o.label })))
const albumSortOptions = computed(() => ALBUM_SORT_OPTIONS.map(o => ({ value: o.id, label: o.label })))
const songSortOptions = computed(() => SONG_SORT_OPTIONS.map(o => ({ value: o.id, label: o.label })))
const allPlaylistCards = computed(() => buildPlaylistCards(libraryTracks.value))
const sortedPlaylistCards = computed(() => sortPlaylistCards(allPlaylistCards.value, playlistSort.value))
const visiblePlaylistCards = computed(() => (
  showAllPlaylistCards.value
    ? sortedPlaylistCards.value
    : sortedPlaylistCards.value.slice(0, playlistPreviewLimit)
))

const displayAlbums = computed(() => {
  const q = appliedKeyword.value.trim().toLowerCase()
  if (!q) return allAlbums.value
  return allAlbums.value.filter(a =>
    [a.name, a.artist].some(v => String(v || '').toLowerCase().includes(q))
  )
})
const sortedDisplayAlbums = computed(() => sortAlbums(displayAlbums.value, albumSort.value))
const visibleAlbums = computed(() => (
  showAllAlbums.value
    ? sortedDisplayAlbums.value
    : sortedDisplayAlbums.value.slice(0, albumPreviewLimit)
))

const filteredSongs = computed(() => {
  const q = appliedKeyword.value.trim().toLowerCase()
  if (!q) return libraryTracks.value
  return libraryTracks.value.filter(s =>
    [s.name, s.singer, s.album, s.genre, s.year].some(v => String(v || '').toLowerCase().includes(q))
  )
})
const sortedFilteredSongs = computed(() => sortLibrarySongs(filteredSongs.value, songSort.value))

const totalPages = computed(() => Math.max(1, Math.ceil(sortedFilteredSongs.value.length / pageSize)))
const pagedSongs = computed(() => {
  const start = (page.value - 1) * pageSize
  return sortedFilteredSongs.value.slice(start, start + pageSize)
})

watch(appliedKeyword, () => { page.value = 1 })

watch(playlistSort, (value) => {
  try { localStorage.setItem(PLAYLIST_SORT_KEY, value) } catch {}
  showAllPlaylistCards.value = false
})

watch(albumSort, (value) => {
  try { localStorage.setItem(ALBUM_SORT_KEY, value) } catch {}
  showAllAlbums.value = false
})

watch(songSort, (value) => {
  try { localStorage.setItem(SONG_SORT_KEY, value) } catch {}
  page.value = 1
})

async function loadScanSummary() {
  try {
    const res = await api.paths.stats()
    const d = res.data
    if (!d?.musicDirs) {
      scanSummary.value = ''
      return
    }
    if (!d.totalTracks) {
      scanSummary.value = `已配置 ${d.musicDirs} 个音乐库目录，暂未发现音频文件`
      return
    }
    const dirHint = (d.dirs || [])
      .filter(x => x.readable && x.count > 0)
      .map(x => `${shortPath(x.path)} ${x.count} 首`)
      .join('；')
    scanSummary.value = dirHint
      ? `扫描 ${d.musicDirs} 个目录，共 ${d.totalTracks} 首：${dirHint}`
      : `扫描 ${d.musicDirs} 个目录，共 ${d.totalTracks} 首歌曲`
  } catch {
    scanSummary.value = ''
  }
}

function shortPath(p) {
  const s = String(p || '')
  if (s.length <= 36) return s
  return '…' + s.slice(-34)
}

onMounted(() => {
  loadScanSummary()
  scanLibrary(api, { onError: (msg) => showToast(msg, 'error') }).catch(() => {})
})

async function refreshLibrary() {
  try {
    await scanLibrary(api, { force: true })
    await loadScanSummary()
    showToast('音乐库已刷新', 'success')
  } catch {}
}

function applySearch() {
  appliedKeyword.value = keyword.value.trim()
}

function trackPayload(song) {
  return {
    name: song.name,
    singer: song.singer,
    album: song.album,
    localPath: song.localPath,
    source: 'local',
    picUrl: song.picUrl,
    lyric: song.lyric,
  }
}

function isPlayingSong(song) {
  return isPlayingItem(trackPayload(song)) && !isPaused.value
}

async function playSong(song) {
  try {
    await playItem(trackPayload(song), 'local')
  } catch (e) {
    showToast(e.message || '播放失败', 'error')
  }
}

function openAlbum(album) {
  if (!album?.id) return
  router.push({ path: '/library/album', query: { id: album.id } })
}

function addToQueueSong(song) {
  const track = trackPayload(song)
  if (isInQueue(track, 'local')) {
    showToast('已在试听列表', 'info')
    return
  }
  addToQueue(track, 'local')
  showToast(`已加入列表: ${song.name}`, 'success')
}

function openPickPlaylist(song) {
  pickPlaylistTrack.value = trackPayload(song)
}

function onAddedToPlaylist({ playlist, duplicate }) {
  pickPlaylistTrack.value = null
  if (duplicate) showToast('歌曲已在歌单中', 'info')
  else showToast(`已加入歌单：${playlist?.name || ''}`, 'success')
}

function openPlaylist(card) {
  router.push({ path: '/library/playlists', query: { id: card.id } })
}

function openCreatePlaylist() {
  showCreateModal.value = true
}

function confirmCreatePlaylist(payload) {
  const pl = createPlaylist(payload.name, {
    coverUrl: payload.coverUrl,
    coverMode: payload.coverMode,
  })
  if (!pl) {
    showToast('请输入歌单名称', 'info')
    return
  }
  showCreateModal.value = false
  showToast(`已创建歌单：${pl.name}`, 'success')
}

function showToast(text, type = 'info') {
  toast.value = { text, type }
  setTimeout(() => { toast.value = null }, 2800)
}
</script>

<style scoped>
.library-page { width: 100%; max-width: none; }

.library-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.library-scan-summary {
  margin: 0 0 18px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
  word-break: break-all;
}
.library-scan-link {
  margin-left: 8px;
  color: var(--accent);
  text-decoration: none;
}
.library-scan-link:hover { text-decoration: underline; }
.library-search {
  flex: 1;
  min-width: 220px;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 16px;
  border-radius: var(--radius-pill);
  background: var(--bg-input);
  border: 1px solid var(--border-light);
}
.library-search:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-muted);
}
.library-search svg { width: 18px; height: 18px; color: var(--text-muted); flex-shrink: 0; }
.library-search input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  padding: 0;
  box-shadow: none;
  font-size: 15px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.section-head h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
}
.section-head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.section-more {
  font-size: 13px;
  color: var(--text-muted);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
.section-more:hover { color: var(--accent); }

.playlist-row-wrap { margin-bottom: 32px; }
.playlist-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 18px;
}
.playlist-card {
  position: relative;
  padding: 0;
  border: none;
  border-radius: 16px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.playlist-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
}

.album-section { margin-bottom: 32px; }
.album-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
  gap: 22px 18px;
}
.album-card {
  border: none;
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
}
.album-cover {
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-elevated);
  margin-bottom: 12px;
}
.album-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.album-cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34px;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-muted);
}
.album-name, .song-title {
  font-size: 16px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.album-artist, .song-artist {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.album-tags, .song-tags {
  margin-top: 5px;
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.92;
}

.song-section { margin-bottom: 24px; }
.song-total { font-size: 13px; color: var(--text-muted); }
.library-loading, .empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted);
}
.empty-hint { margin: 8px 0 14px; font-size: 13px; }

.song-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 18px;
}
.song-item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 12px;
  transition: background 0.15s ease;
}
.song-item:hover,
.song-item.active {
  background: var(--bg-hover);
}
.song-cover-btn {
  position: relative;
  width: 56px;
  height: 56px;
  padding: 0;
  border: none;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-elevated);
  cursor: pointer;
}
.song-cover-btn img { width: 100%; height: 100%; object-fit: cover; display: block; }
.song-cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
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
}
.song-meta { min-width: 0; flex: 1; }
.song-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 18px;
  font-size: 13px;
  color: var(--text-muted);
}

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
.modal-card {
  width: min(380px, 100%);
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 20px;
}
.modal-card h3 { margin: 0 0 14px; }
.modal-card input { width: 100%; margin-bottom: 14px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; }

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
.toast.info { background: var(--bg-card); border: 1px solid var(--border); }

@media (max-width: 1100px) {
  .song-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 768px) {
  .playlist-row { grid-template-columns: 1fr; }
  .album-row { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
  .song-grid { grid-template-columns: 1fr; }
  .library-topbar { gap: 10px; }
  .toast {
    left: 12px;
    right: 12px;
    bottom: calc(var(--player-height) + var(--mobile-nav-height) + 16px);
  }
}
</style>
