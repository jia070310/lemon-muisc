<template>
  <div class="library-page">
    <div class="library-topbar">
      <form class="library-search-form" @submit.prevent="applySearch">
        <ClearableInput
          v-model="keyword"
          variant="pill"
          show-search-icon
          placeholder="搜索歌曲 / 歌手 / 专辑 / 歌单"
          @clear="clearSearch"
        />
      </form>
      <button type="button" class="btn-ghost btn-sm" :disabled="libraryScanning" @click="refreshLibrary">
        {{ scanButtonLabel }}
      </button>
      <button type="button" class="btn-primary btn-sm" @click="openCreatePlaylist">创建歌单</button>
    </div>
    <div v-if="scanSummary || showScanStatus" class="library-scan-summary">
      <span v-if="scanSummary" class="library-scan-summary-main">
        {{ scanSummary }}
        <router-link to="/settings" class="library-scan-link">管理目录</router-link>
      </span>
      <span
        v-if="showScanStatus"
        class="library-scan-status"
        role="status"
        :aria-label="scanStatusHint"
      >{{ scanStatusHint }}</span>
    </div>

    <section class="playlist-row-wrap">
      <div class="section-head">
        <h2>歌单</h2>
        <div class="section-head-actions">
          <AppSelect
            v-model="playlistSort"
            :options="playlistSortOptions"
            title="歌单排序"
            size="sm"
          />
          <button
            v-if="showPlaylistMoreBtn"
            type="button"
            class="section-more-btn"
            :class="{ expanded: showAllPlaylistCards }"
            @click="showAllPlaylistCards = !showAllPlaylistCards"
          >
            <span>{{ showAllPlaylistCards ? '收起' : '更多' }}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <button
            v-else-if="isNarrow && sortedPlaylistCards.length"
            type="button"
            class="section-more-btn"
            @click="openAllPlaylists"
          >
            <span>全部</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
      <div class="horizontal-scroll playlist-scroll">
        <div class="playlist-row">
          <button
            v-for="card in visiblePlaylistCards"
            :key="card.id"
            class="playlist-card"
            @click="openPlaylist(card)"
          >
            <PlaylistCover
              :size="isNarrow ? 'compact' : 'row'"
              :cover-style="card.coverStyle"
              :cover-url="card.coverUrl"
              :gradient="card.gradient"
              :icon="card.icon"
              :name="card.name"
              :count="card.count"
              :show-meta="!isNarrow"
            />
          </button>
        </div>
      </div>
    </section>

    <section class="genre-section" v-if="visibleGenres.length">
      <div class="section-head">
        <h2>音乐风格</h2>
        <button
          v-if="allGenres.length > visibleGenres.length"
          type="button"
          class="section-more-btn"
          @click="openAllGenres"
        >
          <span>全部</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div class="horizontal-scroll genre-scroll">
        <div class="genre-pill-row">
          <button
            v-for="genre in visibleGenres"
            :key="genre.id"
            type="button"
            class="genre-pill"
            :style="genrePillStyle(genre)"
            @click="openGenre(genre)"
          >
            <span class="genre-pill-name">{{ genre.name }}</span>
            <span class="genre-pill-play" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>
            </span>
          </button>
        </div>
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
            size="sm"
          />
          <button
            v-if="showAlbumMoreBtn"
            type="button"
            class="section-more-btn"
            @click="openAllAlbums"
          >
            <span>更多</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <button
            v-else-if="isNarrow && sortedDisplayAlbums.length"
            type="button"
            class="section-more-btn"
            @click="openAllAlbums"
          >
            <span>全部</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
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
            size="sm"
          />
          <span class="song-total" v-if="sortedFilteredSongs.length">{{ sortedFilteredSongs.length }} 首</span>
        </div>
      </div>

      <div v-if="libraryLoading && !libraryTracks.length" class="library-loading card">正在扫描音乐库… {{ loadProgress }}</div>
      <div v-else-if="!libraryTracks.length" class="empty card">
        <p>暂无本地音乐</p>
        <p class="empty-hint">请先在「设置 → 文件路径」添加音乐库目录</p>
        <router-link to="/settings" class="btn-ghost btn-sm">打开设置</router-link>
      </div>
      <template v-else>
        <div v-if="libraryMetaLoading" class="library-meta-loading">
          <span>{{ loadProgress || '正在更新标签…' }}</span>
          <span v-if="libraryScanTotal > 0" class="library-meta-loading-pct">{{ libraryScanPercent }}%</span>
        </div>
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
            <button
              class="song-cover-btn"
              :class="{ rippling: tappingSongKey === song.key }"
              @click="onSongCoverClick(song)"
            >
              <div class="song-cover-media">
                <img v-if="song.picUrl && !brokenCovers.has(song.key)" :src="song.picUrl" alt="" loading="lazy" @error="markCoverBroken(song.key)" />
                <div v-else class="song-cover-fallback">{{ song.name.slice(0, 1) }}</div>
              </div>
              <span class="song-cover-ripple" aria-hidden="true" />
              <span
                class="song-play-overlay"
                v-if="showCoverOverlay(song)"
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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import PlaylistCover from '../components/PlaylistCover.vue'
import PlaylistEditModal from '../components/PlaylistEditModal.vue'
import PickPlaylistModal from '../components/PickPlaylistModal.vue'
import AppSelect from '../components/AppSelect.vue'
import ClearableInput from '../components/ClearableInput.vue'
import { formatTrackTags, formatAlbumTags } from '../utils/format.js'
import { playItem, addToQueue, isInQueue, isPlayingItem, isPaused } from '../stores/player.js'
import {
  libraryTracks, libraryLoading, libraryMetaLoading, libraryLoadProgress,
  libraryScanning, libraryScanPhase, libraryScanCurrent, libraryScanTotal, libraryScanPercent,
  groupAlbums, groupGenres, getGenreTheme, createPlaylist, buildPlaylistCards, sortPlaylistCards,
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
const tappingSongKey = ref('')
const coverPendingPauseKey = ref('')
const toast = ref(null)
const loadProgress = libraryLoadProgress
const scanButtonLabel = computed(() => {
  if (!libraryScanning.value) return '刷新库'
  if (libraryScanPhase.value === 'tags' && libraryScanTotal.value > 0) {
    return `扫描中 ${libraryScanCurrent.value}/${libraryScanTotal.value}`
  }
  return '扫描中…'
})
const scanStatusHint = computed(() => {
  if (libraryScanPhase.value === 'tags' && libraryScanTotal.value > 0) {
    return `读取标签 ${libraryScanCurrent.value}/${libraryScanTotal.value}（${libraryScanPercent.value}%）`
  }
  return loadProgress.value || ''
})
const showScanStatus = computed(() => libraryScanning.value && !!scanStatusHint.value)

function notifyScanComplete(result, { force = false } = {}) {
  if (!result) return
  const total = result.totalTracks || 0
  if (force) {
    showToast(total ? `音乐库已刷新，共 ${total} 首` : '音乐库已刷新', 'success')
    return
  }
  if (result.hadPending) {
    showToast(total ? `扫描完成，共 ${total} 首` : '扫描完成', 'success')
  }
}
const showCreateModal = ref(false)
const pickPlaylistTrack = ref(null)
const brokenCovers = ref(new Set())
const scanSummary = ref('')
const showAllPlaylistCards = ref(false)
const playlistPreviewLimit = 9
const playlistSort = ref(localStorage.getItem(PLAYLIST_SORT_KEY) || 'default')
const albumPreviewLimit = 12
const albumPreviewLimitMobile = 4
const albumSort = ref(localStorage.getItem(ALBUM_SORT_KEY) || 'recent')
const songSort = ref(localStorage.getItem(SONG_SORT_KEY) || 'recent')
const isNarrow = ref(false)
let narrowMq = null

function updateNarrow() {
  isNarrow.value = narrowMq?.matches ?? window.innerWidth <= 768
}

function markCoverBroken(key) {
  if (!key) return
  const next = new Set(brokenCovers.value)
  next.add(key)
  brokenCovers.value = next
}

const genrePreviewLimit = 16

const allGenres = computed(() => (
  groupGenres(libraryTracks.value).filter(g => g.name !== '未知风格')
))
const visibleGenres = computed(() => allGenres.value.slice(0, genrePreviewLimit))

const allAlbums = computed(() => groupAlbums(libraryTracks.value))
const playlistSortOptions = computed(() => PLAYLIST_SORT_OPTIONS.map(o => ({ value: o.id, label: o.label })))
const albumSortOptions = computed(() => ALBUM_SORT_OPTIONS.map(o => ({ value: o.id, label: o.label })))
const songSortOptions = computed(() => SONG_SORT_OPTIONS.map(o => ({ value: o.id, label: o.label })))
const allPlaylistCards = computed(() => buildPlaylistCards(libraryTracks.value))
const sortedPlaylistCards = computed(() => sortPlaylistCards(allPlaylistCards.value, playlistSort.value))
const visiblePlaylistCards = computed(() => {
  if (isNarrow.value) return sortedPlaylistCards.value
  return showAllPlaylistCards.value
    ? sortedPlaylistCards.value
    : sortedPlaylistCards.value.slice(0, playlistPreviewLimit)
})
const showPlaylistMoreBtn = computed(() => (
  !isNarrow.value && sortedPlaylistCards.value.length > playlistPreviewLimit
))

const displayAlbums = computed(() => {
  const q = appliedKeyword.value.trim().toLowerCase()
  if (!q) return allAlbums.value
  return allAlbums.value.filter(a =>
    [a.name, a.artist].some(v => String(v || '').toLowerCase().includes(q))
  )
})
const sortedDisplayAlbums = computed(() => sortAlbums(displayAlbums.value, albumSort.value))
const visibleAlbums = computed(() => {
  const limit = isNarrow.value ? albumPreviewLimitMobile : albumPreviewLimit
  return sortedDisplayAlbums.value.slice(0, limit)
})
const showAlbumMoreBtn = computed(() => {
  const limit = isNarrow.value ? albumPreviewLimitMobile : albumPreviewLimit
  return sortedDisplayAlbums.value.length > limit
})

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
  narrowMq = window.matchMedia('(max-width: 768px)')
  updateNarrow()
  narrowMq.addEventListener('change', updateNarrow)
  loadScanSummary()
  scanLibrary(api, {
    onError: (msg) => showToast(msg, 'error'),
    onComplete: (result, meta) => {
      loadScanSummary()
      notifyScanComplete(result, meta)
    },
  }).catch(() => {})
})

onUnmounted(() => {
  narrowMq?.removeEventListener('change', updateNarrow)
})

async function refreshLibrary() {
  try {
    const result = await scanLibrary(api, {
      force: true,
      onComplete: (r, meta) => notifyScanComplete(r, meta),
    })
    await loadScanSummary()
    if (!result) showToast('正在扫描中，请稍候', 'info')
  } catch {}
}

function applySearch() {
  appliedKeyword.value = keyword.value.trim()
}

function clearSearch() {
  keyword.value = ''
  appliedKeyword.value = ''
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

async function playSong(song) {
  try {
    await playItem(trackPayload(song), 'local')
  } catch (e) {
    showToast(e.message || '播放失败', 'error')
  }
}

async function onSongCoverClick(song) {
  const key = song?.key || ''
  const payload = trackPayload(song)
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
    await playSong(song)
  } finally {
    if (coverPendingPauseKey.value === key) coverPendingPauseKey.value = ''
  }
}

function openAlbum(album) {
  if (!album?.id) return
  router.push({ path: '/library/album', query: { id: album.id } })
}

function openGenre(genre) {
  if (!genre?.id) return
  router.push({ path: '/library/genre', query: { id: genre.id } })
}

function openAllGenres() {
  router.push({ path: '/library/genres' })
}

function openAllAlbums() {
  router.push({ path: '/library/albums' })
}

function genrePillStyle(genre) {
  const theme = genre.theme || getGenreTheme(genre.name)
  return {
    borderColor: theme.border,
    background: theme.bg,
    '--genre-accent': theme.border,
  }
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

function openAllPlaylists() {
  router.push({ path: '/library/playlists' })
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
.library-page {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: hidden;
}

.library-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
  min-width: 0;
}
.library-scan-summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin: 0 0 18px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
  min-width: 0;
}
.library-scan-summary-main {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.library-scan-status {
  flex-shrink: 0;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--text-muted);
}
.library-scan-link {
  margin-left: 8px;
  color: var(--accent);
  text-decoration: none;
}
.library-scan-link:hover { text-decoration: underline; }
.library-search-form {
  flex: 1 1 200px;
  min-width: 0;
  display: flex;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
  min-width: 0;
}
.section-head h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  flex-shrink: 0;
}
.section-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-shrink: 0;
}
.section-head-actions :deep(.app-select) {
  flex-shrink: 0;
  min-width: 88px;
}
.section-more-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.section-more-btn svg {
  width: 14px;
  height: 14px;
  transition: transform 0.2s ease;
}
.section-more-btn.expanded svg { transform: rotate(180deg); }
.section-more-btn:hover {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border-light));
  background: var(--accent-muted);
}

.horizontal-scroll {
  max-width: 100%;
  min-width: 0;
}

.playlist-row-wrap { margin-bottom: 32px; }
.playlist-scroll {
  overflow: visible;
}
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
  min-width: 0;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.playlist-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
}

.genre-section { margin-bottom: 28px; }
.genre-scroll {
  overflow: visible;
}
.genre-pill-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.genre-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-radius: 999px;
  border: 1.5px solid;
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.genre-pill:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
}
.genre-pill-name {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.genre-pill-play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--genre-accent, var(--accent));
  opacity: 0.9;
  line-height: 0;
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
  min-width: 0;
}
.album-cover {
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-elevated);
  margin-bottom: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
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

.song-section { margin-bottom: 24px; min-width: 0; }
.song-total { font-size: 13px; color: var(--text-muted); white-space: nowrap; }
.library-loading, .empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted);
}
.library-meta-loading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-muted);
  background: var(--bg-elevated, rgba(255,255,255,0.04));
  border-radius: 8px;
}
.library-meta-loading-pct {
  font-variant-numeric: tabular-nums;
  color: var(--accent, #60a5fa);
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
.song-item.active,
.song-item.hovered {
  background: var(--bg-hover);
}
.song-cover-btn {
  position: relative;
  width: 56px;
  height: 56px;
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
  .library-topbar {
    gap: 8px;
  }
  .library-scan-summary {
    gap: 8px;
  }
  .library-scan-summary-main {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .library-search-form {
    flex: 1 1 100%;
  }
  .library-search-form :deep(.clearable-input--pill) {
    height: 42px;
    padding: 0 14px;
  }
  .library-topbar .btn-ghost,
  .library-topbar .btn-primary {
    flex: 1;
    min-width: 0;
    padding: 8px 10px;
    font-size: 13px;
  }

  .section-head {
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .section-head h2 { font-size: 18px; }
  .section-head-actions {
    margin-left: auto;
  }

  .playlist-scroll {
    margin: 0 -14px;
    padding: 0 14px 4px;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }
  .playlist-scroll::-webkit-scrollbar { display: none; }
  .playlist-row {
    display: flex;
    gap: 12px;
    width: max-content;
    min-width: 100%;
  }
  .playlist-card {
    flex: 0 0 112px;
    width: 112px;
    border-radius: 0;
    box-shadow: none;
  }
  .playlist-card:hover {
    transform: none;
    box-shadow: none;
  }

  .genre-scroll {
    margin: 0 -14px;
    padding: 0 14px 4px;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }
  .genre-scroll::-webkit-scrollbar { display: none; }
  .genre-pill-row {
    flex-wrap: nowrap;
    width: max-content;
    min-width: 100%;
  }
  .genre-pill-name { max-width: 120px; }

  .album-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px 12px;
  }
  .album-cover {
    border-radius: 10px;
    margin-bottom: 8px;
  }
  .album-name { font-size: 14px; }
  .album-artist { font-size: 12px; margin-top: 2px; }
  .album-tags { display: none; }

  .song-grid {
    grid-template-columns: 1fr;
    gap: 0;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--border-light);
    background: var(--bg-card, var(--bg-elevated));
  }
  .song-item {
    padding: 10px 12px;
    gap: 10px;
    border-radius: 0;
    border-bottom: 1px solid var(--border-light);
  }
  .song-item:last-child { border-bottom: none; }
  .song-item:hover,
  .song-item.active,
  .song-item.hovered {
    background: var(--bg-hover);
  }
  .song-cover-btn {
    width: 48px;
    height: 48px;
    border-radius: 8px;
  }
  .song-title { font-size: 15px; }
  .song-artist { font-size: 12px; }
  .song-tags { display: none; }
  .song-actions { gap: 2px; }
  .song-actions .icon-action-btn {
    width: 34px;
    height: 34px;
    padding: 0;
  }

  .toast {
    left: 12px;
    right: 12px;
    bottom: calc(var(--player-height) + var(--mobile-nav-height) + 16px);
  }
}
</style>
