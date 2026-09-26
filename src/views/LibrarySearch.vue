<template>
  <div class="library-search-page">
    <div class="page-header-row">
      <button type="button" class="btn-ghost btn-sm" @click="goBack">← 返回</button>
      <form class="search-form" @submit.prevent="submitSearch">
        <SearchInput
          ref="librarySearchRef"
          v-model="keyword"
          :history-key="SEARCH_HISTORY_KEYS.library"
          variant="pill"
          show-search-icon
          placeholder="搜索歌曲 / 歌手 / 专辑 / 歌单"
          @clear="onClear"
          @select="submitSearch"
        />
      </form>
    </div>

    <p v-if="query" class="result-summary">
      「{{ query }}」共
      <strong>{{ totalHits }}</strong> 条结果
      · 歌曲 {{ songTotal }}
      · 专辑 {{ albumTotal }}
      · 歌手 {{ artistTotal }}
      · 歌单 {{ matchedPlaylists.length }}
    </p>
    <p v-else class="result-summary muted">输入关键词后回车搜索本地音乐库</p>

    <div v-if="loading && !totalHits" class="loading card">正在搜索…</div>

    <template v-else-if="query">
      <div v-if="!totalHits" class="empty card">
        <p>未找到匹配结果</p>
        <button type="button" class="btn-ghost btn-sm" @click="goBack">返回音乐库</button>
      </div>

      <div v-else class="result-tabs">
        <button
          v-for="tab in resultTabs"
          :key="tab.id"
          type="button"
          class="result-tab"
          :class="{ active: activeTab === tab.id }"
          :disabled="!tab.count"
          @click="setTab(tab.id)"
        >
          {{ tab.label }}
          <span class="tab-count">{{ tab.count }}</span>
        </button>
      </div>

      <!-- 歌曲 -->
      <section v-if="activeTab === 'songs' && matchedSongs.length" class="result-section">
        <div class="song-grid" :class="'song-cols-' + songColumns">
          <div
            v-for="song in pagedItems"
            :key="song.key"
            class="song-item"
            :class="{ active: isPlayingSong(song), hovered: hoverKey === song.key }"
            @mouseenter="hoverKey = song.key"
            @mouseleave="hoverKey = ''"
            @dblclick="playSong(song)"
          >
            <button
              type="button"
              class="song-cover-btn"
              :class="{ rippling: tappingSongKey === song.key }"
              :title="isCoverPauseIcon(song) ? '暂停' : '播放'"
              @click="onSongCoverClick(song)"
            >
              <div class="song-cover-media">
                <CoverArt :src="song.picUrl || song.img" />
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
            <div class="song-meta">
              <div class="song-title" :title="song.name">{{ song.name }}</div>
              <TrackMetaLinks
                class="song-artist"
                :singer="song.singer"
                :album="song.album"
              />
              <div class="song-tags" :title="formatTrackTags({ ...song, album: '' })">{{ formatTrackTags({ ...song, album: '' }) }}</div>
            </div>
            <MobileRowActions
              :open="actionsOpenKey === song.key"
              @toggle="toggleRowActions(song.key)"
              @close="actionsOpenKey = ''"
            >
              <button type="button" class="icon-action-btn" title="加入试听列表" @click.stop="addToQueueSong(song)">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <button type="button" class="icon-action-btn" title="加入歌单" @click.stop="openPickPlaylist(song)">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15V6"/><path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/><path d="M12 12H3"/><path d="M16 6H3"/><path d="M12 18H3"/></svg>
              </button>
              <button
                type="button"
                class="icon-action-btn"
                :class="{ 'fav-active': isFavorite(song) }"
                :title="isFavorite(song) ? '取消收藏' : '收藏'"
                @click.stop="toggleFavorite(song)"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" :fill="isFavorite(song) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </button>
              <button
                type="button"
                class="icon-action-btn danger"
                title="从磁盘删除"
                :disabled="deletingKey === song.key"
                @click.stop="deleteSongFile(song)"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
            </MobileRowActions>
          </div>
        </div>
        <div v-if="totalPages > 1" class="pager">
          <button type="button" class="btn-ghost btn-sm" :disabled="page <= 1" @click="page--">上一页</button>
          <span>{{ page }} / {{ totalPages }} · 每页 {{ pageSize }} 条</span>
          <button type="button" class="btn-ghost btn-sm" :disabled="page >= totalPages" @click="page++">下一页</button>
        </div>
      </section>

      <!-- 专辑 -->
      <section v-else-if="activeTab === 'albums' && matchedAlbums.length" class="result-section">
        <div class="album-grid">
          <button
            v-for="album in pagedItems"
            :key="album.id"
            type="button"
            class="album-card"
            @click="openAlbum(album)"
          >
            <div class="album-cover">
              <CoverArt :src="album.cover" />
            </div>
            <div class="album-name" :title="album.name">{{ album.name }}</div>
            <div class="album-artist" :title="album.artist">{{ album.artist }}</div>
            <div v-if="formatAlbumTags(album)" class="album-tags">{{ formatAlbumTags(album) }}</div>
          </button>
        </div>
        <div v-if="totalPages > 1" class="pager">
          <button type="button" class="btn-ghost btn-sm" :disabled="page <= 1" @click="page--">上一页</button>
          <span>{{ page }} / {{ totalPages }} · 每页 {{ pageSize }} 条</span>
          <button type="button" class="btn-ghost btn-sm" :disabled="page >= totalPages" @click="page++">下一页</button>
        </div>
      </section>

      <!-- 歌手 -->
      <section v-else-if="activeTab === 'artists' && matchedArtists.length" class="result-section">
        <div class="artist-grid">
          <button
            v-for="artist in pagedItems"
            :key="artist.id"
            type="button"
            class="artist-card"
            @click="openArtist(artist)"
          >
            <div class="artist-card-cover">
              <CoverArt v-if="artist.cover" :src="artist.cover" />
              <div v-else class="artist-avatar-fallback">{{ artistInitial(artist.name) }}</div>
            </div>
            <div class="artist-card-name">{{ artist.name }}</div>
            <div class="artist-card-meta">{{ artist.trackCount }} 首 · {{ artist.albumCount }} 张专辑</div>
          </button>
        </div>
        <div v-if="totalPages > 1" class="pager">
          <button type="button" class="btn-ghost btn-sm" :disabled="page <= 1" @click="page--">上一页</button>
          <span>{{ page }} / {{ totalPages }} · 每页 {{ pageSize }} 条</span>
          <button type="button" class="btn-ghost btn-sm" :disabled="page >= totalPages" @click="page++">下一页</button>
        </div>
      </section>

      <!-- 歌单 -->
      <section v-else-if="activeTab === 'playlists' && matchedPlaylists.length" class="result-section">
        <div class="playlist-grid">
          <button
            v-for="card in pagedItems"
            :key="card.id"
            type="button"
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
              :show-meta="true"
            />
          </button>
        </div>
        <div v-if="totalPages > 1" class="pager">
          <button type="button" class="btn-ghost btn-sm" :disabled="page <= 1" @click="page--">上一页</button>
          <span>{{ page }} / {{ totalPages }} · 每页 {{ pageSize }} 条</span>
          <button type="button" class="btn-ghost btn-sm" :disabled="page >= totalPages" @click="page++">下一页</button>
        </div>
      </section>
    </template>

    <PickPlaylistModal
      v-if="pickPlaylistTrack"
      :track="pickPlaylistTrack"
      source="local"
      @close="pickPlaylistTrack = null"
      @added="onAddedToPlaylist"
    />

    <div v-if="toast" class="toast" :class="toast.type">{{ toast.text }}</div>
  </div>
</template>

<script setup>
defineOptions({ name: 'LibrarySearch' })
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api.js'
import SearchInput from '../components/SearchInput.vue'
import { SEARCH_HISTORY_KEYS } from '../composables/useSearchHistory.js'
import CoverArt from '../components/CoverArt.vue'
import PlaylistCover from '../components/PlaylistCover.vue'
import MobileRowActions from '../components/MobileRowActions.vue'
import TrackMetaLinks from '../components/TrackMetaLinks.vue'
import PickPlaylistModal from '../components/PickPlaylistModal.vue'
import { formatTrackTags, formatAlbumTags } from '../utils/format.js'
import { getTrackFilePath } from '../utils/trackPath.js'
import { playItem, addToQueue, isPlayingItem, isPaused } from '../stores/player.js'
import { appConfirm } from '../stores/appDialog.js'
import {
  libraryScanned,
  librarySongColumns,
  buildPlaylistCards,
  scanLibrary,
  isFavorite,
  toggleFavorite,
  fetchLibraryTracksPage,
  fetchLibraryArtists,
  fetchLibraryAlbums,
  removeLibraryTracks,
} from '../stores/library.js'

const route = useRoute()
const router = useRouter()
const librarySearchRef = ref(null)

const keyword = ref(String(route.query.q || ''))
const query = computed(() => String(route.query.q || '').trim())
const activeTab = ref('songs')
const page = ref(1)
const loading = ref(false)
/** 各分类每页固定条数 */
const PAGE_SIZES = {
  songs: 20,
  albums: 24,
  artists: 36,
  playlists: 24,
}
const actionsOpenKey = ref('')
const pickPlaylistTrack = ref(null)
const toast = ref(null)
const hoverKey = ref('')
const tappingSongKey = ref('')
const coverPendingPauseKey = ref('')
const deletingKey = ref('')
const isNarrow = ref(false)
let narrowMq = null
const songColumns = computed(() => librarySongColumns.value)

const matchedSongs = ref([])
const matchedAlbums = ref([])
const matchedArtists = ref([])
const songTotal = ref(0)
const albumTotal = ref(0)
const artistTotal = ref(0)

function matchesQuery(values, q) {
  return values.some((v) => String(v || '').toLowerCase().includes(q))
}

const matchedPlaylists = computed(() => {
  const q = query.value.toLowerCase()
  if (!q) return []
  return buildPlaylistCards([])
    .filter((c) => !c.hidden)
    .filter((c) => matchesQuery([c.name], q))
})

const totalHits = computed(() => (
  songTotal.value
  + albumTotal.value
  + artistTotal.value
  + matchedPlaylists.value.length
))

const resultTabs = computed(() => ([
  { id: 'songs', label: '歌曲', count: songTotal.value },
  { id: 'albums', label: '专辑', count: albumTotal.value },
  { id: 'artists', label: '歌手', count: artistTotal.value },
  { id: 'playlists', label: '歌单', count: matchedPlaylists.value.length },
]))

const activeList = computed(() => {
  if (activeTab.value === 'albums') return matchedAlbums.value
  if (activeTab.value === 'artists') return matchedArtists.value
  if (activeTab.value === 'playlists') return matchedPlaylists.value
  return matchedSongs.value
})

const pageSize = computed(() => PAGE_SIZES[activeTab.value] || 20)
const activeTotal = computed(() => {
  if (activeTab.value === 'albums') return albumTotal.value
  if (activeTab.value === 'artists') return artistTotal.value
  if (activeTab.value === 'playlists') return matchedPlaylists.value.length
  return songTotal.value
})
const totalPages = computed(() => Math.max(1, Math.ceil(activeTotal.value / pageSize.value)))
const pagedItems = computed(() => {
  if (activeTab.value === 'playlists') {
    const start = (page.value - 1) * pageSize.value
    return matchedPlaylists.value.slice(start, start + pageSize.value)
  }
  return activeList.value
})

async function runSearch() {
  const q = query.value
  if (!q) {
    matchedSongs.value = []
    matchedAlbums.value = []
    matchedArtists.value = []
    songTotal.value = 0
    albumTotal.value = 0
    artistTotal.value = 0
    return
  }
  loading.value = true
  try {
    const tab = activeTab.value
    if (tab === 'songs' || tab === 'albums' || tab === 'artists') {
      // 先拉各分类总数摘要（首页），再按当前 tab 分页
    }
    const [songsRes, albumsRes, artistsRes] = await Promise.all([
      fetchLibraryTracksPage(api, {
        page: tab === 'songs' ? page.value : 1,
        limit: tab === 'songs' ? pageSize.value : 1,
        q,
        sort: 'mtime',
        replace: false,
      }),
      fetchLibraryAlbums(api, {
        page: tab === 'albums' ? page.value : 1,
        limit: tab === 'albums' ? pageSize.value : 1,
        q,
        sort: 'recent',
      }),
      fetchLibraryArtists(api, {
        page: tab === 'artists' ? page.value : 1,
        limit: tab === 'artists' ? pageSize.value : 1,
        q,
        sort: 'count',
      }),
    ])
    songTotal.value = songsRes.total
    albumTotal.value = albumsRes.total
    artistTotal.value = artistsRes.total
    if (tab === 'songs') matchedSongs.value = songsRes.items
    if (tab === 'albums') matchedAlbums.value = albumsRes.items
    if (tab === 'artists') matchedArtists.value = artistsRes.items
  } catch {
    /* keep previous */
  } finally {
    loading.value = false
  }
}

function pickDefaultTab() {
  const first = resultTabs.value.find((t) => t.count > 0)
  activeTab.value = first?.id || 'songs'
  page.value = 1
}

function setTab(tabId) {
  if (activeTab.value === tabId) return
  activeTab.value = tabId
  page.value = 1
  runSearch()
}

watch(query, async () => {
  keyword.value = query.value
  page.value = 1
  await runSearch()
  pickDefaultTab()
  await runSearch()
})

watch(page, () => {
  if (activeTab.value !== 'playlists') runSearch()
})

onMounted(async () => {
  narrowMq = window.matchMedia('(max-width: 768px)')
  isNarrow.value = narrowMq.matches
  narrowMq.addEventListener('change', onNarrowChange)
  if (!libraryScanned.value) {
    try { await scanLibrary(api, { resync: true }) } catch {}
  }
  await runSearch()
  pickDefaultTab()
  await runSearch()
})

onUnmounted(() => {
  narrowMq?.removeEventListener('change', onNarrowChange)
  narrowMq = null
})

function onNarrowChange() {
  isNarrow.value = Boolean(narrowMq?.matches)
}

function submitSearch() {
  librarySearchRef.value?.remember?.()
  const q = keyword.value.trim()
  if (!q) {
    router.replace({ path: '/library/search' })
    return
  }
  if (q === query.value) {
    pickDefaultTab()
    return
  }
  router.replace({ path: '/library/search', query: { q } })
}

function onClear() {
  keyword.value = ''
  router.replace({ path: '/library/search' })
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/library')
}

function toggleRowActions(key) {
  actionsOpenKey.value = actionsOpenKey.value === key ? '' : key
}

function trackPayload(song) {
  return {
    ...song,
    source: 'local',
    isLocal: true,
    filePath: getTrackFilePath(song),
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

async function deleteSongFile(song) {
  const filePath = getTrackFilePath(song)
  if (!filePath || deletingKey.value) return
  const name = song.name || song.fileName || filePath
  const ok = await appConfirm({
    title: '永久删除文件',
    message: `确定从磁盘永久删除？\n\n${name}`,
    hint: '此操作不可恢复，文件将从音乐库与硬盘中移除。',
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return

  deletingKey.value = song.key || filePath
  try {
    const res = await api.library.deleteFiles([filePath])
    const failed = res?.data?.failed || []
    if (failed.length) {
      showToast(failed[0]?.error || '删除失败', 'error')
      return
    }
    const deleted = res?.data?.deleted || [filePath]
    removeLibraryTracks(deleted)
    const before = matchedSongs.value.length
    matchedSongs.value = matchedSongs.value.filter((s) => {
      const p = getTrackFilePath(s)
      return p !== filePath && !deleted.includes(p)
    })
    const removed = before - matchedSongs.value.length
    if (removed > 0) songTotal.value = Math.max(0, songTotal.value - removed)
    else songTotal.value = Math.max(0, songTotal.value - 1)
    actionsOpenKey.value = ''
    showToast('已从磁盘删除', 'success')
  } catch (e) {
    showToast(e.message || '删除失败', 'error')
  } finally {
    deletingKey.value = ''
  }
}

async function addToQueueSong(song) {
  try {
    await addToQueue(trackPayload(song), 'local')
    showToast('已加入试听列表', 'success')
  } catch (e) {
    showToast(e.message || '加入失败', 'error')
  }
}

function openPickPlaylist(song) {
  pickPlaylistTrack.value = trackPayload(song)
}

function onAddedToPlaylist() {
  pickPlaylistTrack.value = null
  showToast('已加入歌单', 'success')
}

function openAlbum(album) {
  if (!album?.id) return
  router.push({ path: '/library/album', query: { id: album.id } })
}

function openArtist(artist) {
  if (!artist?.id) return
  router.push({ path: '/library/artist', query: { id: artist.id } })
}

function openPlaylist(card) {
  if (!card?.id) return
  router.push({ path: '/library/playlists', query: { id: card.id } })
}

function artistInitial(name) {
  const n = String(name || '').trim()
  if (!n) return '?'
  const first = n[0]
  if (/[a-zA-Z]/.test(first)) return first.toUpperCase()
  return first
}

function showToast(text, type = 'info') {
  toast.value = { text, type }
  setTimeout(() => { toast.value = null }, 2200)
}
</script>

<style scoped>
.library-search-page {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
.page-header-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  min-width: 0;
}
.search-form {
  flex: 1;
  min-width: 0;
  max-width: 520px;
}
.result-summary {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--text-secondary);
}
.result-summary.muted {
  color: var(--text-muted);
}
.result-summary strong {
  color: var(--text);
}
.loading, .empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted);
}
.result-tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 18px;
  overflow-x: auto;
}
.result-tab {
  border: none;
  background: transparent;
  padding: 9px 14px;
  font-size: 14px;
  color: var(--text-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.result-tab:hover:not(:disabled) { color: var(--text); }
.result-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 600;
}
.result-tab:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.tab-count {
  font-size: 12px;
  color: var(--text-muted);
}
.result-tab.active .tab-count { color: var(--accent); }

.song-grid {
  display: grid;
  gap: 14px 12px;
}
.song-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.song-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.song-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.song-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 6px;
  border-radius: 10px;
}
.song-item:hover,
.song-item.active,
.song-item.hovered {
  background: var(--bg-hover);
}
.song-item.active { background: var(--accent-muted); }
.song-cover-btn {
  position: relative;
  width: 52px;
  height: 52px;
  border: none;
  padding: 0;
  border-radius: 8px;
  overflow: visible;
  background: var(--bg-elevated);
  flex-shrink: 0;
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
    transform: translate(-50%, -50%) scale(0.3);
    opacity: 0.9;
  }
  100% {
    transform: translate(-50%, -50%) scale(2.2);
    opacity: 0;
  }
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
  border-radius: inherit;
  transition: background 0.18s ease;
}
.song-play-overlay svg {
  transition: transform 0.22s ease;
}
.song-cover-btn.rippling .song-play-overlay {
  background: color-mix(in srgb, var(--accent) 48%, rgba(0, 0, 0, 0.26));
}
.song-cover-btn.rippling .song-play-overlay svg {
  transform: scale(1.28);
}
.song-meta { flex: 1; min-width: 0; }
.song-title {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.song-artist, .song-tags {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.icon-action-btn {
  border: none;
  background: transparent;
  color: var(--text-muted);
  padding: 6px;
  border-radius: 6px;
  cursor: pointer;
}
.icon-action-btn:hover { color: var(--text); background: var(--bg-hover); }
.icon-action-btn.fav-active { color: var(--accent); }
.icon-action-btn.danger:hover {
  color: var(--error);
  background: color-mix(in srgb, var(--error) 14%, transparent);
}
.icon-action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.album-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 20px 16px;
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
  margin-bottom: 10px;
}
.album-name {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.album-artist, .album-tags {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.artist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 18px 14px;
}
.artist-card {
  border: none;
  background: transparent;
  padding: 0;
  text-align: center;
  cursor: pointer;
}
.artist-card-cover {
  width: 96px;
  height: 96px;
  margin: 0 auto 10px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--bg-elevated);
}
.artist-avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-muted);
}
.artist-card-name {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.artist-card-meta {
  font-size: 12px;
  color: var(--text-muted);
}

.playlist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 16px;
}
.playlist-card {
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  text-align: left;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 18px;
  color: var(--text-muted);
  font-size: 13px;
}
.toast {
  position: fixed;
  left: 50%;
  bottom: calc(var(--player-height, 64px) + 20px);
  transform: translateX(-50%);
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  z-index: 1200;
  background: var(--bg-card);
  border: 1px solid var(--border);
}
.toast.success { background: var(--success); color: #fff; border-color: transparent; }
.toast.error { background: var(--error); color: #fff; border-color: transparent; }

@media (max-width: 768px) {
  .page-header-row { flex-wrap: wrap; }
  .search-form { max-width: none; flex-basis: 100%; }
  .song-cols-2, .song-cols-3, .song-cols-4 {
    grid-template-columns: 1fr;
  }
}
</style>
