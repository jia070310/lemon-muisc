<template>
  <div class="library-search-page">
    <div class="page-header-row">
      <button type="button" class="btn-ghost btn-sm" @click="goBack">← 返回</button>
      <form class="search-form" @submit.prevent="submitSearch">
        <ClearableInput
          v-model="keyword"
          variant="pill"
          show-search-icon
          placeholder="搜索歌曲 / 歌手 / 专辑 / 歌单"
          @clear="onClear"
        />
      </form>
    </div>

    <p v-if="query" class="result-summary">
      「{{ query }}」共
      <strong>{{ totalHits }}</strong> 条结果
      · 歌曲 {{ matchedSongs.length }}
      · 专辑 {{ matchedAlbums.length }}
      · 歌手 {{ matchedArtists.length }}
      · 歌单 {{ matchedPlaylists.length }}
    </p>
    <p v-else class="result-summary muted">输入关键词后回车搜索本地音乐库</p>

    <div v-if="libraryLoading && !libraryTracks.length" class="loading card">正在加载音乐库…</div>

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
            :class="{ active: isPlayingSong(song) }"
            @dblclick="playSong(song)"
          >
            <button type="button" class="song-cover-btn" @click="playSong(song)">
              <div class="song-cover-media">
                <CoverArt :src="song.picUrl || song.img" />
              </div>
              <span class="song-play-overlay">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <polygon points="7,3 21,12 7,21"/>
                </svg>
              </span>
            </button>
            <div class="song-meta">
              <div class="song-title" :title="song.name">{{ song.name }}</div>
              <div class="song-artist" :title="song.singer">{{ song.singer }}</div>
              <div class="song-tags" :title="formatTrackTags(song)">{{ formatTrackTags(song) }}</div>
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
                <svg viewBox="0 0 24 24" width="16" height="16" :fill="isFavorite(song) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
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
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api.js'
import ClearableInput from '../components/ClearableInput.vue'
import CoverArt from '../components/CoverArt.vue'
import PlaylistCover from '../components/PlaylistCover.vue'
import MobileRowActions from '../components/MobileRowActions.vue'
import PickPlaylistModal from '../components/PickPlaylistModal.vue'
import { formatTrackTags, formatAlbumTags } from '../utils/format.js'
import { getTrackFilePath } from '../utils/trackPath.js'
import { playItem, addToQueue, isPlayingItem } from '../stores/player.js'
import {
  libraryTracks,
  libraryLoading,
  libraryScanned,
  librarySongColumns,
  groupAlbums,
  groupArtists,
  buildPlaylistCards,
  scanLibrary,
  isFavorite,
  toggleFavorite,
} from '../stores/library.js'

const route = useRoute()
const router = useRouter()

const keyword = ref(String(route.query.q || ''))
const query = computed(() => String(route.query.q || '').trim())
const activeTab = ref('songs')
const page = ref(1)
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
const songColumns = computed(() => librarySongColumns.value)

function matchesQuery(values, q) {
  return values.some((v) => String(v || '').toLowerCase().includes(q))
}

const matchedSongs = computed(() => {
  const q = query.value.toLowerCase()
  if (!q) return []
  return libraryTracks.value.filter((s) =>
    matchesQuery([s.name, s.singer, s.album, s.albumArtist, s.genre, s.year], q),
  )
})

const matchedAlbums = computed(() => {
  const q = query.value.toLowerCase()
  if (!q) return []
  return groupAlbums(libraryTracks.value).filter((a) =>
    matchesQuery([a.name, a.artist], q),
  )
})

const matchedArtists = computed(() => {
  const q = query.value.toLowerCase()
  if (!q) return []
  return groupArtists(libraryTracks.value).filter((a) =>
    matchesQuery([a.name], q),
  )
})

const matchedPlaylists = computed(() => {
  const q = query.value.toLowerCase()
  if (!q) return []
  return buildPlaylistCards(libraryTracks.value)
    .filter((c) => !c.hidden)
    .filter((c) => matchesQuery([c.name], q))
})

const totalHits = computed(() => (
  matchedSongs.value.length
  + matchedAlbums.value.length
  + matchedArtists.value.length
  + matchedPlaylists.value.length
))

const resultTabs = computed(() => ([
  { id: 'songs', label: '歌曲', count: matchedSongs.value.length },
  { id: 'albums', label: '专辑', count: matchedAlbums.value.length },
  { id: 'artists', label: '歌手', count: matchedArtists.value.length },
  { id: 'playlists', label: '歌单', count: matchedPlaylists.value.length },
]))

const activeList = computed(() => {
  if (activeTab.value === 'albums') return matchedAlbums.value
  if (activeTab.value === 'artists') return matchedArtists.value
  if (activeTab.value === 'playlists') return matchedPlaylists.value
  return matchedSongs.value
})

const pageSize = computed(() => PAGE_SIZES[activeTab.value] || 20)
const totalPages = computed(() => Math.max(1, Math.ceil(activeList.value.length / pageSize.value)))
const pagedItems = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return activeList.value.slice(start, start + pageSize.value)
})

function pickDefaultTab() {
  const first = resultTabs.value.find((t) => t.count > 0)
  activeTab.value = first?.id || 'songs'
  page.value = 1
}

function setTab(tabId) {
  if (activeTab.value === tabId) return
  activeTab.value = tabId
  page.value = 1
}

watch(query, () => {
  keyword.value = query.value
  pickDefaultTab()
})

watch([activeList, pageSize], () => {
  if (page.value > totalPages.value) page.value = 1
})

onMounted(async () => {
  pickDefaultTab()
  if (!libraryScanned.value) {
    try { await scanLibrary(api, { resync: true }) } catch {}
  }
})

function submitSearch() {
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
  return isPlayingItem(trackPayload(song))
}

async function playSong(song) {
  try {
    await playItem(trackPayload(song), 'local')
  } catch (e) {
    showToast(e.message || '播放失败', 'error')
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
.song-item.active { background: var(--accent-muted); }
.song-cover-btn {
  position: relative;
  width: 52px;
  height: 52px;
  border: none;
  padding: 0;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-elevated);
  flex-shrink: 0;
  cursor: pointer;
}
.song-cover-media {
  width: 100%;
  height: 100%;
}
.song-play-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  opacity: 0;
  transition: opacity 0.15s;
}
.song-cover-btn:hover .song-play-overlay { opacity: 1; }
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
