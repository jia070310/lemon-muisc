<template>
  <div class="library-artist-page">
    <div class="page-header-row">
      <button class="btn-ghost btn-sm" @click="$router.back()">← 返回</button>
      <div class="page-title">歌手</div>
    </div>

    <div v-if="libraryLoading && !libraryTracks.length" class="loading card">正在加载音乐库…</div>
    <div v-else-if="!artist" class="empty card">
      <p>未找到该歌手</p>
      <router-link to="/library/artists" class="btn-ghost btn-sm">浏览全部歌手</router-link>
    </div>
    <template v-else>
      <section class="artist-hero card">
        <div class="artist-hero-cover">
          <CoverArt v-if="artist.cover" :src="artist.cover" />
          <div v-else class="artist-avatar-fallback">{{ artistInitial(artist.name) }}</div>
        </div>
        <div class="artist-hero-info">
          <p class="artist-hero-label">歌手</p>
          <h1 class="artist-hero-title">{{ artist.name }}</h1>
          <p class="artist-hero-meta">{{ artist.trackCount }} 首 · {{ artist.albumCount }} 张专辑</p>
          <div class="artist-hero-actions">
            <button class="btn-primary btn-sm" :disabled="!artist.tracks.length" @click="playAll">播放全部</button>
            <button class="btn-ghost btn-sm" :disabled="!artist.tracks.length" @click="shufflePlay">随机播放</button>
            <button class="btn-ghost btn-sm" :disabled="!artist.tracks.length" @click="queueAll">加入试听列表</button>
          </div>
        </div>
      </section>

      <section class="tracks-panel card">
        <h2 class="section-title">歌曲</h2>
        <div v-if="!artist.tracks.length" class="detail-empty">该歌手暂无歌曲</div>
        <template v-else>
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
              <div class="track-meta">
                <div class="track-name">{{ song.name }}</div>
                <div class="track-artist">
                  <span>{{ song.singer }}</span>
                  <template v-if="song.album && song.album !== '未知专辑'">
                    <span class="track-album-sep">·</span>
                    <span class="track-album">{{ song.album }}</span>
                  </template>
                </div>
                <div class="track-path" :title="trackPath(song)">{{ trackPath(song) }}</div>
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
              </MobileRowActions>
            </div>
          </div>
          <div v-if="totalPages > 1" class="pager">
            <button class="btn-ghost btn-sm" :disabled="page <= 1" @click="page--">上一页</button>
            <span>{{ page }} / {{ totalPages }}</span>
            <button class="btn-ghost btn-sm" :disabled="page >= totalPages" @click="page++">下一页</button>
          </div>
        </template>
      </section>
    </template>

    <div v-if="toast" class="toast" :class="toast.type">{{ toast.text }}</div>

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
import { useRoute } from 'vue-router'
import { api } from '../api.js'
import PickPlaylistModal from '../components/PickPlaylistModal.vue'
import CoverArt from '../components/CoverArt.vue'
import MobileRowActions from '../components/MobileRowActions.vue'
import { playItem, addToQueue, isInQueue, isPlayingItem, isPaused } from '../stores/player.js'
import {
  libraryTracks,
  libraryLoading,
  libraryScanned,
  findArtistById,
  scanLibrary,
  isFavorite,
  toggleFavorite,
} from '../stores/library.js'

const route = useRoute()
const artistId = ref('')
const page = ref(1)
const pageSize = 30
const hoverKey = ref('')
const actionsOpenKey = ref('')

function toggleRowActions(key) {
  actionsOpenKey.value = actionsOpenKey.value === key ? '' : key
}
const tappingSongKey = ref('')
const coverPendingPauseKey = ref('')
const isNarrow = ref(false)
const toast = ref(null)
const pickPlaylistTrack = ref(null)
let narrowMq = null

const artist = computed(() => findArtistById(libraryTracks.value, artistId.value))
const totalPages = computed(() => Math.max(1, Math.ceil((artist.value?.tracks.length || 0) / pageSize)))
const listStart = computed(() => (page.value - 1) * pageSize)
const pagedTracks = computed(() => {
  const tracks = artist.value?.tracks || []
  return tracks.slice(listStart.value, listStart.value + pageSize)
})

watch(() => route.query.id, (id) => {
  artistId.value = id ? String(id) : ''
  page.value = 1
})

watch(artistId, () => {
  page.value = 1
})

function updateNarrow() {
  isNarrow.value = narrowMq?.matches ?? window.innerWidth <= 768
}

onMounted(async () => {
  narrowMq = window.matchMedia('(max-width: 768px)')
  updateNarrow()
  narrowMq.addEventListener('change', updateNarrow)
  if (route.query.id) artistId.value = String(route.query.id)
  if (!libraryScanned.value) {
    try { await scanLibrary(api, { resync: true }) } catch {}
  }
})

onUnmounted(() => {
  narrowMq?.removeEventListener('change', updateNarrow)
})

function trackPayload(song) {
  const filePath = song.localPath || song.filePath
  return {
    key: song.key || (filePath ? `local:${filePath}` : ''),
    name: song.name,
    singer: song.singer,
    album: song.album,
    localPath: filePath,
    filePath,
    source: 'local',
    picUrl: song.picUrl,
    lyric: song.lyric,
  }
}

function trackPath(song) {
  return String(song?.localPath || song?.filePath || '').trim()
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
  try {
    await playItem(trackPayload(song), 'local')
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
  const list = artist.value?.tracks || []
  if (!list.length) return
  for (const s of list) addToQueue(trackPayload(s), 'local')
  try {
    await playItem(trackPayload(list[0]), 'local')
    showToast(`开始播放：${artist.value.name}`, 'success')
  } catch (e) {
    showToast(e.message || '播放失败', 'error')
  }
}

async function shufflePlay() {
  const list = [...(artist.value?.tracks || [])]
  if (!list.length) return
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]]
  }
  for (const s of list) addToQueue(trackPayload(s), 'local')
  try {
    await playItem(trackPayload(list[0]), 'local')
    showToast(`随机播放：${artist.value.name}`, 'success')
  } catch (e) {
    showToast(e.message || '播放失败', 'error')
  }
}

function queueOne(song) {
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

function queueAll() {
  const list = artist.value?.tracks || []
  if (!list.length) return
  let added = 0
  for (const s of list) {
    const track = trackPayload(s)
    if (!isInQueue(track, 'local')) {
      addToQueue(track, 'local')
      added++
    }
  }
  showToast(added ? `已加入 ${added} 首` : '歌曲已在试听列表', added ? 'success' : 'info')
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
  setTimeout(() => { toast.value = null }, 2800)
}
</script>

<style scoped>
.library-artist-page { width: 100%; max-width: 100%; min-width: 0; }
.page-header-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}
.page-title { font-size: 22px; font-weight: 600; flex: 1; }
.loading, .empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted);
}
.artist-hero {
  display: flex;
  gap: 20px;
  padding: 18px;
  margin-bottom: 16px;
  border-radius: 16px;
  flex-wrap: wrap;
}
.artist-hero-cover {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
}
.artist-hero-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.artist-avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 46px;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-muted);
}
.artist-hero-info { flex: 1; min-width: 200px; }
.artist-hero-label {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.artist-hero-title {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.25;
}
.artist-hero-meta {
  margin: 0 0 14px;
  font-size: 14px;
  color: var(--text-muted);
}
.artist-hero-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.tracks-panel { padding: 16px 18px 18px; }
.section-title {
  margin: 0 0 12px;
  font-size: 20px;
  font-weight: 650;
}
.detail-empty {
  color: var(--text-muted);
  font-size: 14px;
  padding: 12px 0;
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
.track-row.active,
.track-row.hovered { background: var(--bg-hover); }
.track-row.active .track-name { color: var(--accent); }
.track-index { width: 28px; color: var(--text-muted); font-size: 14px; flex-shrink: 0; }
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
.track-meta { flex: 1; min-width: 0; }
.track-name {
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.track-artist {
  margin-top: 2px;
  font-size: 13px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.track-album-sep { margin: 0 5px; opacity: 0.6; }
.track-album { color: var(--text-muted); }
.track-path {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-muted);
  opacity: 0.85;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mobile-row-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  align-items: center;
}
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
.toast.error { background: var(--error); color: #fff; }
.toast.info { background: var(--bg-card); border: 1px solid var(--border); }

@media (max-width: 768px) {
  .page-title { font-size: 18px; }
  .artist-hero-cover { width: 96px; height: 96px; }
  .artist-hero-title { font-size: 22px; }
  .artist-avatar-fallback { font-size: 34px; }
  .song-cover-btn {
    width: 48px;
    height: 48px;
    border-radius: 8px;
  }
  .toast {
    left: 12px;
    right: 12px;
    bottom: calc(var(--player-height) + var(--mobile-nav-height) + 16px);
  }
}
</style>