<template>
  <div class="search-page">
    <div class="page-title">搜索</div>
    <div class="page-subtitle">搜索歌曲并试听、下载</div>

    <div class="search-header card">
      <div class="search-row">
        <div class="search-bar">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            v-model="searchState.keyword"
            @keydown.enter="doSearch"
            placeholder="搜索歌曲、歌手..."
            class="search-input"
            enterkeyhint="search"
          />
        </div>
        <button class="btn-primary search-btn" @click="doSearch" :disabled="searchState.loading">
          {{ searchState.loading ? '搜索中...' : '搜索' }}
        </button>
      </div>
      <div class="source-tabs">
        <button
          v-for="(info, key) in searchState.sources" :key="key"
          :class="['tab', { active: searchState.activeSource === key }]"
          @click="searchState.activeSource = key; searchState.page = 1; doSearch()"
        >{{ info.name || key }}</button>
      </div>
    </div>

    <div class="results card" v-if="searchState.results.length">
      <div class="results-toolbar">
        <span class="results-count">共 {{ searchState.results.length }} 首</span>
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
        v-for="(item, i) in searchState.results" :key="item.id || i"
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
            :class="{ added: isInQueue(item, searchState.activeSource) }"
            @click="addOneToQueue(item)"
            :title="isInQueue(item, searchState.activeSource) ? '已在列表' : '加入试听列表'"
          >
            <svg v-if="isInQueue(item, searchState.activeSource)" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2" fill="none"/></svg>
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

      <div class="pagination" v-if="searchState.totalPages > 1">
        <button class="btn-ghost btn-sm" :disabled="searchState.page <= 1" @click="searchState.page--; doSearch()">上一页</button>
        <span class="page-info">{{ searchState.page }} / {{ searchState.totalPages }}</span>
        <button class="btn-ghost btn-sm" :disabled="searchState.page >= searchState.totalPages" @click="searchState.page++; doSearch()">下一页</button>
      </div>
    </div>

    <div v-else-if="searchState.searched && !searchState.loading" class="empty">暂无搜索结果</div>

    <div v-if="toast" class="toast" :class="toast.type">{{ toast.text }}</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { api } from '../api.js'
import { searchState, loadSearchSources } from '../stores/search.js'
import { loadingPlay, isPaused, isPlayingItem, playItem, addToQueue, isInQueue } from '../stores/player.js'
import { sortQualities, getQualityLabel, getQualityDisplay } from '../utils/quality.js'
import { cleanText, cleanTrackItem } from '../utils/text.js'

const toast = ref(null)
const qualityMenuId = ref(null)

onMounted(async () => {
  await loadSearchSources(api)
  document.addEventListener('click', closeQualityMenu)
})

onUnmounted(() => {
  document.removeEventListener('click', closeQualityMenu)
})

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
    await playItem(item, searchState.activeSource)
  } catch (e) {
    showToast(e.message || '试听失败', 'error')
  }
}

function addOneToQueue(item) {
  if (isInQueue(item, searchState.activeSource)) {
    showToast('已在试听列表', 'info')
    return
  }
  addToQueue(item, searchState.activeSource)
  showToast(`已加入列表: ${item.name}`, 'success')
}

function addAllToQueue() {
  let added = 0
  for (const item of searchState.results) {
    if (!isInQueue(item, searchState.activeSource)) {
      addToQueue(item, searchState.activeSource)
      added++
    }
  }
  showToast(added ? `已加入 ${added} 首` : '全部已在列表中', added ? 'success' : 'info')
}

async function playAll() {
  if (!searchState.results.length) return
  for (const item of searchState.results) {
    addToQueue(item, searchState.activeSource)
  }
  try {
    await playItem(searchState.results[0], searchState.activeSource)
    showToast(`开始播放，共 ${searchState.results.length} 首`, 'success')
  } catch (e) {
    showToast(e.message || '播放失败', 'error')
  }
}

async function doSearch() {
  if (!searchState.keyword.trim() || !searchState.activeSource) return
  searchState.loading = true
  searchState.searched = true
  try {
    const res = await api.search.search(searchState.keyword, searchState.activeSource, searchState.page)
    const data = res.data
    if (Array.isArray(data)) {
      searchState.results = data.map(cleanTrackItem)
      searchState.totalPages = 1
    } else if (data?.list) {
      searchState.results = data.list.map(cleanTrackItem)
      searchState.totalPages = data.allPage || data.totalPage || 1
    } else {
      searchState.results = []
    }
  } catch (e) {
    searchState.results = []
    showToast(e.message, 'error')
  } finally {
    searchState.loading = false
  }
}

async function downloadOne(item, quality) {
  closeQualityMenu()
  try {
    await api.download.add([{
      name: item.name,
      singer: item.singer,
      source: item.source || searchState.activeSource,
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
.search-page {
  width: 100%;
  max-width: none;
}

.search-header { padding: 20px; margin-bottom: 16px; }

.search-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.search-bar {
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
.search-bar:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-muted); }
.search-icon { width: 18px; height: 18px; color: var(--text-muted); flex-shrink: 0; }
.search-input {
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
.search-input:focus { box-shadow: none; border: none; }
.search-btn {
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
  grid-template-columns: 48px minmax(180px, 2.2fr) minmax(120px, 1fr) minmax(120px, 1fr) 64px 44px 44px 44px;
  align-items: center;
  padding: 10px 16px;
  gap: 10px;
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

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid var(--border-light);
}
.page-info { font-size: 13px; color: var(--text-muted); }

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
  .search-header { padding: 12px; }
  .search-row {
    gap: 8px;
    margin-bottom: 12px;
  }
  .search-bar {
    height: 44px;
    padding: 0 12px;
  }
  .search-input {
    font-size: 16px; /* avoid iOS zoom on focus */
  }
  .search-btn {
    height: 44px;
    width: auto;
    min-width: 72px;
    padding: 0 14px;
  }

  .result-header { display: none; }

  .result-row {
    grid-template-columns: 1fr 36px 36px 36px;
    grid-template-areas:
      "name play queue action"
      "meta play queue action";
    gap: 2px 8px;
    padding: 12px 14px;
    align-items: center;
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
  .col-singer {
    grid-area: meta;
    font-size: 12px;
  }
  .col-play { grid-area: play; }
  .col-queue { grid-area: queue; }
  .col-action { grid-area: action; }

  .results-toolbar { flex-wrap: wrap; gap: 8px; }
  .results-actions {
    width: 100%;
    display: flex;
    gap: 8px;
  }
  .results-actions .btn-sm { flex: 1; }

  .toast {
    left: 12px;
    right: 12px;
    bottom: calc(var(--player-height) + var(--mobile-nav-height) + 16px);
  }
}
</style>
