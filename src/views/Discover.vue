<template>
  <div class="discover-page">
    <div class="page-title">发现</div>
    <div class="page-subtitle">输入各平台歌单链接，浏览并试听、下载歌单歌曲</div>

    <div class="discover-header card">
      <div class="discover-row">
        <div class="discover-bar">
          <svg class="discover-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
          <input
            v-model="discoverState.url"
            @keydown.enter="fetchPlaylist"
            :placeholder="currentPlaceholder"
            class="discover-input"
          />
        </div>
        <button class="btn-primary discover-btn" @click="fetchPlaylistByInput" :disabled="discoverState.loading">
          {{ discoverState.loading ? '加载中...' : '确认' }}
        </button>
      </div>
      <div class="source-tabs">
        <button
          v-for="(info, key) in discoverState.sources" :key="key"
          :class="['tab', { active: discoverState.activeSource === key }]"
          @click="switchSource(key)"
        >{{ info.name || key }}</button>
      </div>
      <div v-if="showRecommend" class="sort-tabs">
        <button
          v-for="opt in recommendSortOptions" :key="opt.id"
          :class="['sort-tab', { active: discoverState.recommendSort === opt.id }]"
          @click="changeRecommendSort(opt.id)"
        >{{ opt.label }}</button>
      </div>
    </div>

    <div v-if="showRecommend" class="recommend-section">
      <div v-if="discoverState.recommendLoading" class="recommend-loading">正在加载推荐歌单...</div>
      <div v-else-if="discoverState.recommendList.length" class="recommend-grid">
        <button
          v-for="item in discoverState.recommendList" :key="item.id"
          class="recommend-card"
          @click="openRecommendPlaylist(item)"
        >
          <div class="recommend-cover-wrap">
            <img v-if="item.img" :src="item.img" class="recommend-cover" alt="" loading="lazy" @error="onCoverError" />
            <div v-else class="recommend-cover placeholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
          </div>
          <div class="recommend-meta">
            <div class="recommend-name" :title="cleanText(item.name)">{{ cleanText(item.name) }}</div>
            <div class="recommend-author" :title="cleanText(item.author)">{{ cleanText(item.author) || '未知作者' }}</div>
            <div class="recommend-stats">
              <span v-if="item.total"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>{{ item.total }}</span>
              <span v-if="item.play_count"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>{{ item.play_count }}</span>
            </div>
          </div>
        </button>
      </div>
      <div v-else class="empty">暂无推荐歌单</div>
    </div>

    <div v-if="discoverState.viewMode === 'detail' && discoverState.playlistInfo" class="detail-toolbar">
      <button class="btn-ghost btn-sm" @click="backToRecommend">← 返回推荐歌单</button>
    </div>

    <div v-if="discoverState.viewMode === 'detail' && discoverState.playlistInfo" class="playlist-info card">
      <div class="playlist-cover-wrap">
        <img
          v-if="discoverState.playlistInfo.img"
          :src="discoverState.playlistInfo.img"
          class="playlist-cover"
          alt=""
          @error="onCoverError"
        />
        <div v-else class="playlist-cover placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        </div>
      </div>
      <div class="playlist-meta">
        <h2 class="playlist-name">{{ cleanText(discoverState.playlistInfo.name) || '未命名歌单' }}</h2>
        <div class="playlist-tags">
          <span v-if="discoverState.playlistInfo.author">创建者：{{ cleanText(discoverState.playlistInfo.author) }}</span>
          <span v-if="discoverState.playlistInfo.play_count">播放 {{ discoverState.playlistInfo.play_count }}</span>
          <span>共 {{ discoverState.total || discoverState.results.length }} 首</span>
        </div>
        <p v-if="discoverState.playlistInfo.desc" class="playlist-desc">{{ cleanText(discoverState.playlistInfo.desc) }}</p>
      </div>
    </div>

    <div class="results card" v-if="discoverState.viewMode === 'detail' && discoverState.results.length">
      <div class="results-toolbar">
        <span class="results-count">共 {{ discoverState.results.length }} 首</span>
        <div class="results-actions">
          <button class="btn-ghost btn-sm" @click="addAllToQueue">全部加入列表</button>
          <button class="btn-primary btn-sm" @click="playAll">播放全部</button>
        </div>
      </div>
      <div class="result-header">
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
        v-for="(item, i) in discoverState.results" :key="item.id || i"
        class="result-row"
        :class="{ playing: isPlayingItem(item) }"
      >
        <span class="col-index">{{ i + 1 }}</span>
        <span class="col-name" :title="cleanText(item.name)">{{ cleanText(item.name) }}</span>
        <span class="col-singer" :title="cleanText(item.singer)">{{ cleanText(item.singer) }}</span>
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
            :class="{ added: isInQueue(item, activeSource) }"
            @click="addOneToQueue(item)"
            :title="isInQueue(item, activeSource) ? '已在列表' : '加入试听列表'"
          >
            <svg v-if="isInQueue(item, activeSource)" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2" fill="none"/></svg>
            <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </span>
        <span class="col-action">
          <div class="dl-wrap">
            <button class="dl-btn" @click.stop="toggleQualityMenu(item)" title="下载">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <div class="quality-menu" v-if="qualityMenuId === item.id" @click.stop>
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
    </div>

    <div v-else-if="discoverState.viewMode === 'detail' && discoverState.fetched && !discoverState.loading" class="empty">暂无歌曲，请检查歌单链接是否正确</div>

    <div v-if="toast" class="toast" :class="toast.type">{{ toast.text }}</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { api } from '../api.js'
import { discoverState, loadDiscoverSources, sourcePlaceholders, recommendSortOptions } from '../stores/discover.js'
import { loadingPlay, isPaused, isPlayingItem, playItem, addToQueue, isInQueue } from '../stores/player.js'
import { sortQualities, getQualityLabel, getQualityDisplay } from '../utils/quality.js'
import { cleanText, cleanTrackItem } from '../utils/text.js'

const toast = ref(null)
const qualityMenuId = ref(null)

const activeSource = computed(() => discoverState.activeSource)
const showRecommend = computed(() => discoverState.viewMode === 'recommend')
const currentPlaceholder = computed(() =>
  sourcePlaceholders[discoverState.activeSource] || '粘贴歌单链接或 ID')

onMounted(async () => {
  await loadDiscoverSources(api)
  loadRecommend()
  document.addEventListener('click', closeQualityMenu)
})

watch(() => discoverState.activeSource, () => {
  if (discoverState.viewMode === 'recommend') loadRecommend()
})

function switchSource(key) {
  if (discoverState.activeSource === key) return
  discoverState.activeSource = key
  discoverState.url = ''
  discoverState.viewMode = 'recommend'
  discoverState.fetched = false
  discoverState.results = []
  discoverState.playlistInfo = null
  loadRecommend()
}

function changeRecommendSort(sort) {
  if (discoverState.recommendSort === sort) return
  discoverState.recommendSort = sort
  loadRecommend()
}

async function loadRecommend() {
  if (!discoverState.activeSource) return
  discoverState.recommendLoading = true
  try {
    const res = await api.playlist.recommend(
      discoverState.activeSource,
      discoverState.recommendSort,
      discoverState.recommendPage,
    )
    discoverState.recommendList = res.data?.list || []
  } catch (e) {
    discoverState.recommendList = []
    showToast(e.message, 'error')
  } finally {
    discoverState.recommendLoading = false
  }
}

function backToRecommend() {
  discoverState.viewMode = 'recommend'
  discoverState.fetched = false
  discoverState.results = []
  discoverState.playlistInfo = null
  discoverState.url = ''
}

async function openRecommendPlaylist(item) {
  discoverState.url = item.id
  await fetchPlaylist()
}

async function fetchPlaylistByInput() {
  if (!discoverState.url.trim()) {
    backToRecommend()
    return
  }
  await fetchPlaylist()
}

onUnmounted(() => {
  document.removeEventListener('click', closeQualityMenu)
})

function onCoverError(e) {
  e.target.style.display = 'none'
}

function getItemQualities(item) {
  const list = item.qualitys || item.types?.map(t => t.type) || item.meta?.qualitys || []
  return sortQualities(list)
}

function toggleQualityMenu(item) {
  qualityMenuId.value = qualityMenuId.value === item.id ? null : item.id
}

function closeQualityMenu() {
  qualityMenuId.value = null
}

async function togglePlay(item) {
  try {
    await playItem(item, activeSource.value)
  } catch (e) {
    showToast(e.message || '试听失败', 'error')
  }
}

function addOneToQueue(item) {
  if (isInQueue(item, activeSource.value)) {
    showToast('已在试听列表', 'info')
    return
  }
  addToQueue(item, activeSource.value)
  showToast(`已加入列表: ${item.name}`, 'success')
}

function addAllToQueue() {
  let added = 0
  for (const item of discoverState.results) {
    if (!isInQueue(item, activeSource.value)) {
      addToQueue(item, activeSource.value)
      added++
    }
  }
  showToast(added ? `已加入 ${added} 首` : '全部已在列表中', added ? 'success' : 'info')
}

async function playAll() {
  if (!discoverState.results.length) return
  for (const item of discoverState.results) {
    addToQueue(item, activeSource.value)
  }
  try {
    await playItem(discoverState.results[0], activeSource.value)
    showToast(`开始播放，共 ${discoverState.results.length} 首`, 'success')
  } catch (e) {
    showToast(e.message || '播放失败', 'error')
  }
}

async function fetchPlaylist() {
  const input = discoverState.url.trim()
  if (!input || !discoverState.activeSource) return
  discoverState.loading = true
  discoverState.fetched = true
  discoverState.viewMode = 'detail'
  discoverState.results = []
  discoverState.playlistInfo = null
  discoverState.total = 0
  try {
    const res = await api.playlist.fetch(input, discoverState.activeSource)
    const data = res.data
    discoverState.results = (data.list || []).map(cleanTrackItem)
    discoverState.playlistInfo = data.info || null
    discoverState.total = data.total || discoverState.results.length
    if (!discoverState.results.length) {
      showToast('歌单为空或解析失败', 'error')
    }
  } catch (e) {
    discoverState.results = []
    discoverState.playlistInfo = null
    showToast(e.message, 'error')
  } finally {
    discoverState.loading = false
  }
}

async function downloadOne(item, quality) {
  closeQualityMenu()
  try {
    await api.download.add([{
      name: item.name,
      singer: item.singer,
      source: item.source || activeSource.value,
      album: item.album || item.albumName || '',
      interval: item.interval || '',
      quality,
      songId: item.songId ?? item.songmid ?? item.hash ?? item.copyrightId ?? item.id,
      hash: item.hash || '',
      songmid: item.songmid || '',
      strMediaMid: item.strMediaMid || '',
      copyrightId: item.copyrightId || '',
      albumAudioId: item.albumAudioId || '',
      duration: item.duration || '',
      musicId: item.musicId || '',
      rid: item.rid || '',
      dcTargetId: item.dcTargetId || '',
      albumId: item.albumId || item.albumMid || item.albummid || '',
      albumMid: item.albumMid || item.albummid || '',
      albummid: item.albummid || item.albumMid || item.albumId || '',
      id: item.id,
      img: item.img || item.picUrl || item.meta?.picUrl || '',
      picUrl: item.picUrl || item.img || item.meta?.picUrl || '',
      types: item.types || [],
      qualitys: item.qualitys || item.types?.map(t => t.type) || item.meta?.qualitys || [],
    }])
    showToast(`已添加下载: ${item.name} (${getQualityLabel(quality, item.types)})`, 'success')
  } catch (e) {
    showToast(e.message, 'error')
  }
}

function showToast(text, type = 'info') {
  toast.value = { text, type }
  setTimeout(() => { toast.value = null }, 3000)
}
</script>

<style scoped>
.discover-page { max-width: 1100px; }

.discover-header { padding: 20px; margin-bottom: 16px; }

.discover-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.discover-bar {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  background: var(--bg-input);
  border-radius: var(--radius-pill);
  padding: 0 16px;
  border: 1px solid var(--border-light);
}
.discover-bar:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-muted); }
.discover-icon { width: 18px; height: 18px; color: var(--text-muted); flex-shrink: 0; }
.discover-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  font-size: 15px;
  padding: 0;
  background: transparent;
  border: none;
  box-shadow: none;
  border-radius: 0;
}
.discover-input:focus { box-shadow: none; border: none; }
.discover-btn {
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
.tab {
  padding: 5px 14px;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  border: 1px solid var(--border);
}
.tab:hover { background: var(--bg-hover); color: var(--text); }
.tab.active { background: var(--accent); color: #fff; border-color: var(--accent); }

.sort-tabs {
  display: flex;
  gap: 16px;
  padding-top: 4px;
  border-top: 1px solid var(--border-light);
  margin-top: 4px;
  padding-top: 12px;
}
.sort-tab {
  padding: 0 2px 6px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 14px;
  border-bottom: 2px solid transparent;
  border-radius: 0;
}
.sort-tab:hover { color: var(--text); }
.sort-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 500;
}

.recommend-section { margin-bottom: 16px; }
.recommend-loading, .empty {
  text-align: center;
  padding: 48px 0;
  color: var(--text-muted);
  font-size: 14px;
}

.recommend-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px 18px;
}

.recommend-card {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 10px;
  border-radius: var(--radius);
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  text-align: left;
  transition: background 0.15s, border-color 0.15s, transform 0.15s;
  cursor: pointer;
  width: 100%;
}
.recommend-card:hover {
  background: var(--bg-hover);
  border-color: var(--border);
  transform: translateY(-1px);
}

.recommend-cover-wrap { flex-shrink: 0; }
.recommend-cover {
  width: 72px;
  height: 72px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--bg-elevated);
}
.recommend-cover.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  border: 1px solid var(--border-light);
}
.recommend-cover.placeholder svg { width: 28px; height: 28px; opacity: 0.5; }

.recommend-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.recommend-name {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--text);
}
.recommend-author {
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recommend-stats {
  display: flex;
  gap: 12px;
  margin-top: auto;
  font-size: 12px;
  color: var(--text-muted);
}
.recommend-stats span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.detail-toolbar { margin-bottom: 12px; }

.playlist-info {
  display: flex;
  gap: 20px;
  padding: 20px;
  margin-bottom: 16px;
  align-items: flex-start;
}
.playlist-cover-wrap { flex-shrink: 0; }
.playlist-cover {
  width: 140px;
  height: 140px;
  border-radius: 12px;
  object-fit: cover;
  background: var(--bg-elevated);
  box-shadow: var(--shadow);
}
.playlist-cover.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  border: 1px solid var(--border-light);
}
.playlist-cover.placeholder svg { width: 48px; height: 48px; opacity: 0.5; }

.playlist-meta { flex: 1; min-width: 0; }
.playlist-name {
  margin: 0 0 10px;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
  word-break: break-word;
}
.playlist-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 10px;
}
.playlist-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.results { overflow: hidden; }

.results-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-elevated);
}
.results-count { font-size: 13px; color: var(--text-muted); }
.results-actions { display: flex; gap: 8px; }

.result-header, .result-row {
  display: grid;
  grid-template-columns: 40px 1fr 140px 140px 60px 44px 44px 44px;
  align-items: center;
  padding: 10px 16px;
  gap: 8px;
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
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  min-width: 140px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  z-index: 20;
  overflow: hidden;
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
  .discover-header { padding: 12px; }
  .discover-row { gap: 8px; margin-bottom: 12px; }
  .discover-bar { height: 44px; padding: 0 12px; }
  .discover-input { font-size: 16px; }
  .discover-btn { height: 44px; min-width: 72px; padding: 0 14px; }

  .recommend-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .recommend-card { padding: 12px; }
  .recommend-cover { width: 64px; height: 64px; }

  .playlist-info { flex-direction: column; align-items: center; text-align: center; padding: 16px; }
  .playlist-cover { width: 120px; height: 120px; }
  .playlist-tags { justify-content: center; }

  .result-header { display: none; }
  .result-row {
    grid-template-columns: 1fr 36px 36px 36px;
    grid-template-areas: "name play queue action" "meta play queue action";
    gap: 2px 8px;
    padding: 12px 14px;
  }
  .col-index, .col-album, .col-duration { display: none; }
  .col-name {
    grid-area: name;
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.35;
  }
  .col-singer { grid-area: meta; font-size: 12px; }
  .col-play { grid-area: play; }
  .col-queue { grid-area: queue; }
  .col-action { grid-area: action; }

  .results-toolbar { flex-wrap: wrap; gap: 8px; }
  .results-actions { width: 100%; display: flex; gap: 8px; }
  .results-actions .btn-sm { flex: 1; }

  .toast {
    left: 12px;
    right: 12px;
    bottom: calc(var(--player-height) + var(--mobile-nav-height) + 16px);
  }
}
</style>
