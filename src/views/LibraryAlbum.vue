<template>
  <div class="library-album-page">
    <div class="page-header-row">
      <button class="btn-ghost btn-sm" @click="$router.back()">← 返回</button>
      <div class="page-title">专辑</div>
    </div>

    <div v-if="libraryLoading && !libraryTracks.length" class="loading card">正在加载音乐库…</div>
    <div v-else-if="!album" class="empty card">
      <p>未找到该专辑</p>
      <router-link to="/library" class="btn-ghost btn-sm">返回音乐库</router-link>
    </div>
    <section v-else class="detail card">
      <div class="detail-hero">
        <div class="album-cover-lg">
          <img
            v-if="album.cover && !coverBroken"
            :src="album.cover"
            alt=""
            @error="coverBroken = true"
          />
          <div v-else class="album-cover-fallback">{{ album.name.slice(0, 1) }}</div>
        </div>
        <div class="detail-info">
          <h1 class="album-title">{{ album.name }}</h1>
          <p class="album-artist">{{ album.artist }}</p>
          <p v-if="albumTags" class="album-tags">{{ albumTags }}</p>
          <p class="detail-meta">{{ album.tracks.length }} 首</p>
          <div class="detail-actions">
            <button class="btn-primary btn-sm" :disabled="!album.tracks.length" @click="playAll">播放全部</button>
            <button class="btn-ghost btn-sm" :disabled="!album.tracks.length" @click="queueAll">加入试听列表</button>
          </div>
        </div>
      </div>

      <div v-if="!album.tracks.length" class="detail-empty">暂无歌曲</div>
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
            </div>
          </div>
        </div>
        <div v-if="totalPages > 1" class="pager">
          <button class="btn-ghost btn-sm" :disabled="page <= 1" @click="page--">上一页</button>
          <span>{{ page }} / {{ totalPages }}</span>
          <button class="btn-ghost btn-sm" :disabled="page >= totalPages" @click="page++">下一页</button>
        </div>
      </template>
    </section>

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
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api.js'
import { formatTrackTags, formatAlbumTags } from '../utils/format.js'
import PickPlaylistModal from '../components/PickPlaylistModal.vue'
import { playItem, addToQueue, isInQueue, isPlayingItem, isPaused } from '../stores/player.js'
import {
  libraryTracks,
  libraryLoading,
  libraryScanned,
  findAlbumById,
  scanLibrary,
  isFavorite,
  toggleFavorite,
} from '../stores/library.js'

const route = useRoute()
const albumId = ref('')
const page = ref(1)
const pageSize = 30
const coverBroken = ref(false)
const brokenCovers = ref(new Set())
const hoverKey = ref('')
const toast = ref(null)
const pickPlaylistTrack = ref(null)

const album = computed(() => findAlbumById(libraryTracks.value, albumId.value))
const albumTags = computed(() => (album.value ? formatAlbumTags(album.value) : ''))
const totalPages = computed(() => Math.max(1, Math.ceil((album.value?.tracks.length || 0) / pageSize)))
const listStart = computed(() => (page.value - 1) * pageSize)
const pagedTracks = computed(() => {
  const tracks = album.value?.tracks || []
  return tracks.slice(listStart.value, listStart.value + pageSize)
})

watch(() => route.query.id, (id) => {
  albumId.value = id ? String(id) : ''
  page.value = 1
  coverBroken.value = false
})

watch(albumId, () => {
  page.value = 1
  coverBroken.value = false
})

function markCoverBroken(key) {
  if (!key) return
  const next = new Set(brokenCovers.value)
  next.add(key)
  brokenCovers.value = next
}

onMounted(async () => {
  if (route.query.id) albumId.value = String(route.query.id)
  if (!libraryScanned.value) {
    try { await scanLibrary(api) } catch {}
  }
})

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

async function playOne(song) {
  try {
    await playItem(trackPayload(song), 'local')
  } catch (e) {
    showToast(e.message || '播放失败', 'error')
  }
}

async function playAll() {
  const list = album.value?.tracks || []
  if (!list.length) return
  for (const s of list) addToQueue(trackPayload(s), 'local')
  try {
    await playItem(trackPayload(list[0]), 'local')
    showToast(`开始播放专辑：${album.value.name}`, 'success')
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
  const list = album.value?.tracks || []
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

function showToast(text, type = 'info') {
  toast.value = { text, type }
  setTimeout(() => { toast.value = null }, 2800)
}
</script>

<style scoped>
.library-album-page { width: 100%; }
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
.detail { padding: 18px; }
.detail-hero {
  display: flex;
  gap: 22px;
  margin-bottom: 22px;
  flex-wrap: wrap;
}
.album-cover-lg {
  width: 200px;
  height: 200px;
  border-radius: 14px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-elevated);
}
.album-cover-lg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.album-cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-muted);
}
.detail-info { flex: 1; min-width: 220px; }
.album-title {
  margin: 0 0 8px;
  font-size: 26px;
  font-weight: 600;
  line-height: 1.3;
}
.album-artist {
  margin: 0 0 6px;
  font-size: 16px;
  color: var(--text-secondary);
}
.album-tags {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--text-muted);
}
.detail-meta { margin: 0 0 16px; color: var(--text-muted); font-size: 15px; }
.detail-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.detail-empty {
  color: var(--text-muted);
  font-size: 14px;
  padding: 20px 0;
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
.toast.error { background: var(--error); color: #fff; }
.toast.info { background: var(--bg-card); border: 1px solid var(--border); }

@media (max-width: 768px) {
  .album-cover-lg {
    width: 160px;
    height: 160px;
  }
  .album-title { font-size: 22px; }
}
</style>
