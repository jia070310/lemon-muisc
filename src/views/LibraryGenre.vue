<template>
  <div class="library-genre-page">
    <div class="page-header-row">
      <button class="btn-ghost btn-sm" @click="$router.back()">← 返回</button>
      <div class="page-title">音乐风格</div>
    </div>

    <div v-if="libraryLoading && !libraryTracks.length" class="loading card">正在加载音乐库…</div>
    <div v-else-if="!genre" class="empty card">
      <p>未找到该风格</p>
      <router-link to="/library/genres" class="btn-ghost btn-sm">浏览全部风格</router-link>
    </div>
    <template v-else>
      <section class="genre-hero card" :style="heroStyle">
        <div class="genre-hero-cover">
          <img
            v-if="genre.cover && !coverBroken"
            :src="genre.cover"
            alt=""
            @error="coverBroken = true"
          />
          <div v-else class="genre-hero-fallback">{{ genre.name.slice(0, 1) }}</div>
        </div>
        <div class="genre-hero-info">
          <p class="genre-hero-label">风格</p>
          <h1 class="genre-hero-title">{{ genre.name }}</h1>
          <p class="genre-hero-meta">{{ genre.trackCount }} 首 · {{ genre.artistCount }} 位歌手</p>
          <div class="genre-hero-actions">
            <button class="btn-primary btn-sm" :disabled="!genre.tracks.length" @click="playAll">播放全部</button>
            <button class="btn-ghost btn-sm" :disabled="!genre.tracks.length" @click="shufflePlay">随机混合</button>
            <button class="btn-ghost btn-sm" :disabled="!genre.tracks.length" @click="queueAll">加入试听列表</button>
          </div>
        </div>
      </section>

      <section class="for-you card" v-if="genre.tracks.length">
        <h2 class="section-title">为您</h2>
        <div class="mix-cards">
          <button type="button" class="mix-card mix-card-main" :style="mixMainStyle" @click="shufflePlay">
            <div class="mix-card-icon">♪</div>
            <div class="mix-card-text">
              <div class="mix-card-title">随机混合</div>
              <div class="mix-card-desc">从「{{ genre.name }}」中随机播放</div>
            </div>
            <span class="mix-card-play">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>
            </span>
          </button>
          <button type="button" class="mix-card" @click="playAll">
            <div class="mix-card-icon subtle">▶</div>
            <div class="mix-card-text">
              <div class="mix-card-title">顺序播放</div>
              <div class="mix-card-desc">按最近添加排序</div>
            </div>
          </button>
        </div>
      </section>

      <section class="tracks-panel card">
        <h2 class="section-title">歌曲</h2>
        <div v-if="!genre.tracks.length" class="detail-empty">该风格下暂无歌曲</div>
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
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api.js'
import { formatTrackTags } from '../utils/format.js'
import PickPlaylistModal from '../components/PickPlaylistModal.vue'
import { playItem, addToQueue, isInQueue, isPlayingItem, isPaused } from '../stores/player.js'
import {
  libraryTracks,
  libraryLoading,
  libraryScanned,
  findGenreById,
  getGenreTheme,
  scanLibrary,
  isFavorite,
  toggleFavorite,
} from '../stores/library.js'

const route = useRoute()
const genreId = ref('')
const page = ref(1)
const pageSize = 30
const coverBroken = ref(false)
const brokenCovers = ref(new Set())
const hoverKey = ref('')
const toast = ref(null)
const pickPlaylistTrack = ref(null)

const genre = computed(() => findGenreById(libraryTracks.value, genreId.value))
const theme = computed(() => genre.value?.theme || getGenreTheme(genre.value?.name || ''))
const heroStyle = computed(() => ({
  borderColor: theme.value.border,
  background: `linear-gradient(135deg, ${theme.value.bg} 0%, var(--bg-card, var(--bg-elevated)) 55%)`,
}))
const mixMainStyle = computed(() => ({
  borderColor: theme.value.border,
  background: `linear-gradient(135deg, ${theme.value.bg} 0%, rgba(0,0,0,0.04) 100%)`,
  '--genre-accent': theme.value.border,
}))
const totalPages = computed(() => Math.max(1, Math.ceil((genre.value?.tracks.length || 0) / pageSize)))
const listStart = computed(() => (page.value - 1) * pageSize)
const pagedTracks = computed(() => {
  const tracks = genre.value?.tracks || []
  return tracks.slice(listStart.value, listStart.value + pageSize)
})

watch(() => route.query.id, (id) => {
  genreId.value = id ? String(id) : ''
  page.value = 1
  coverBroken.value = false
})

watch(genreId, () => {
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
  if (route.query.id) genreId.value = String(route.query.id)
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
  const list = genre.value?.tracks || []
  if (!list.length) return
  for (const s of list) addToQueue(trackPayload(s), 'local')
  try {
    await playItem(trackPayload(list[0]), 'local')
    showToast(`开始播放：${genre.value.name}`, 'success')
  } catch (e) {
    showToast(e.message || '播放失败', 'error')
  }
}

async function shufflePlay() {
  const list = [...(genre.value?.tracks || [])]
  if (!list.length) return
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]]
  }
  for (const s of list) addToQueue(trackPayload(s), 'local')
  try {
    await playItem(trackPayload(list[0]), 'local')
    showToast(`随机播放：${genre.value.name}`, 'success')
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
  const list = genre.value?.tracks || []
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
.library-genre-page { width: 100%; max-width: 100%; min-width: 0; }
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
.genre-hero {
  display: flex;
  gap: 20px;
  padding: 18px;
  margin-bottom: 16px;
  border: 1.5px solid;
  border-radius: 16px;
  flex-wrap: wrap;
}
.genre-hero-cover {
  width: 140px;
  height: 140px;
  border-radius: 14px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-elevated);
}
.genre-hero-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.genre-hero-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 42px;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-muted);
}
.genre-hero-info { flex: 1; min-width: 200px; }
.genre-hero-label {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.genre-hero-title {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.25;
}
.genre-hero-meta {
  margin: 0 0 14px;
  font-size: 14px;
  color: var(--text-muted);
}
.genre-hero-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.for-you {
  padding: 16px 18px;
  margin-bottom: 16px;
}
.section-title {
  margin: 0 0 12px;
  font-size: 20px;
  font-weight: 650;
}
.mix-cards {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 12px;
}
.mix-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid var(--border-light);
  background: var(--bg-elevated);
  text-align: left;
  cursor: pointer;
  transition: transform 0.15s ease;
}
.mix-card:hover { transform: translateY(-1px); }
.mix-card-main {
  border-width: 1.5px;
}
.mix-card-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--genre-accent, var(--accent));
  background: rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}
.mix-card-icon.subtle { font-size: 14px; color: var(--text-secondary); }
.mix-card-text { flex: 1; min-width: 0; }
.mix-card-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 2px;
}
.mix-card-desc {
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mix-card-play {
  color: var(--genre-accent, var(--accent));
  line-height: 0;
  flex-shrink: 0;
}
.tracks-panel { padding: 16px 18px 18px; }
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
.track-row.active { background: var(--bg-hover); }
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
  font-size: 18px;
  font-weight: 700;
  color: var(--accent);
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
.track-tags {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.track-row-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
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
  .genre-hero-cover { width: 100px; height: 100px; }
  .genre-hero-title { font-size: 22px; }
  .mix-cards { grid-template-columns: 1fr; }
  .track-tags { display: none; }
  .toast {
    left: 12px;
    right: 12px;
    bottom: calc(var(--player-height) + var(--mobile-nav-height) + 16px);
  }
}
</style>
