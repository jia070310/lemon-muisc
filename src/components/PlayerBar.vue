<template>
  <div class="player-bar" ref="playerBarRef">
    <div class="bar-left">
      <div class="bar-cover" :class="coverStyle === 'disc' ? 'cover-disc' : 'cover-card'">
        <img v-if="coverUrl" :src="coverUrl" alt="" :class="{ spinning: coverStyle === 'disc' && !isPaused && currentPlaying }" />
        <div v-else class="cover-placeholder" :class="{ spinning: coverStyle === 'disc' && !isPaused && currentPlaying }">♪</div>
      </div>
      <div class="player-info">
        <span class="player-name">{{ currentPlaying ? `${cleanText(currentPlaying.name)} - ${cleanText(currentPlaying.singer)}` : '未选择歌曲' }}</span>
        <span class="player-lyric">{{ currentPlaying ? (currentLyricText || '暂无歌词') : '未知艺术家' }}</span>
      </div>
    </div>

    <div class="bar-center">
      <button class="ctrl-btn ctrl-mode" @click="togglePlayMode" :title="playModeLabel">
        <svg v-if="playMode === 'list'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="14" y2="18"/>
        </svg>
        <svg v-else-if="playMode === 'loop'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
        </svg>
        <svg v-else-if="playMode === 'single'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
          <text x="12" y="14" text-anchor="middle" fill="currentColor" stroke="none" font-size="8" font-weight="700">1</text>
        </svg>
        <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>
        </svg>
      </button>
      <button class="ctrl-btn ctrl-sub" @click="onPlayPrev" :disabled="!playQueue.length" title="上一曲">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="19,20 9,12 19,4"/><line x1="5" y1="4" x2="5" y2="20" stroke="currentColor" stroke-width="2"/></svg>
      </button>
      <button class="ctrl-btn ctrl-main" @click="currentPlaying ? togglePause() : null" :disabled="!currentPlaying" :title="isPaused ? '播放' : '暂停'">
        <svg v-if="!currentPlaying || isPaused" viewBox="0 0 24 24" width="20" height="20" fill="#fff"><polygon points="5,3 19,12 5,21"/></svg>
        <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="#fff"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
      </button>
      <button class="ctrl-btn ctrl-sub" @click="onPlayNext" :disabled="!playQueue.length" title="下一曲">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="5,4 15,12 5,20"/><line x1="19" y1="4" x2="19" y2="20" stroke="currentColor" stroke-width="2"/></svg>
      </button>
      <button class="ctrl-btn ctrl-sub" @click="stopPlay" :disabled="!currentPlaying" title="停止">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>
      </button>
    </div>

    <div class="bar-right">
      <div class="player-progress" v-if="currentPlaying">
        <input type="range" min="0" :max="displayDuration || 1" :value="currentTime" @input="onSeek" class="progress-slider" />
        <span class="time-display">{{ fmtTime(currentTime) }} / {{ fmtTime(displayDuration) }}</span>
      </div>
      <button ref="queueBtnRef" class="ctrl-btn ctrl-queue" @click.stop="toggleQueuePanel" :title="`试听列表 (${playQueue.length})`" :class="{ active: showQueuePanel }">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
          <circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>
        </svg>
        <span v-if="playQueue.length" class="queue-badge">{{ playQueue.length }}</span>
      </button>
      <div class="player-volume">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="var(--text-muted)" stroke-width="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
        <input type="range" min="0" max="1" step="0.01" :value="volume" @input="onVolume" class="vol-slider" />
      </div>
    </div>

    <div class="queue-panel card" v-if="showQueuePanel" ref="queuePanelRef" @click.stop>
      <div class="queue-header">
        <span class="queue-title">试听列表 <em>{{ playQueue.length }}</em></span>
        <div class="queue-header-actions">
          <span class="queue-mode">{{ playModeLabel }}</span>
          <button class="btn-ghost btn-sm" @click="clearQueue" :disabled="!playQueue.length">清空</button>
          <button class="btn-icon" @click="showQueuePanel = false">×</button>
        </div>
      </div>
      <div class="queue-list" v-if="playQueue.length">
        <div
          v-for="(entry, i) in playQueue" :key="entry.key"
          class="queue-item"
          :class="{ active: i === currentQueueIndex }"
          @dblclick="onPlayAt(i)"
        >
          <span class="queue-index">{{ i === currentQueueIndex && !isPaused ? '▶' : i + 1 }}</span>
          <div class="queue-info">
            <div class="queue-name">{{ cleanText(entry.item.name) }}</div>
            <div class="queue-meta">{{ cleanText(entry.item.singer) }}</div>
          </div>
          <button class="queue-remove" @click.stop="removeFromQueue(i)" title="移除">×</button>
        </div>
      </div>
      <div v-else class="queue-empty">列表为空，在搜索页点击 + 或试听添加歌曲</div>
    </div>
  </div>
</template>

<script setup>
import {
  currentPlaying, isPaused, currentTime, displayDuration, volume,
  coverUrl, coverStyle, currentLyricText,
  playQueue, currentQueueIndex, playMode, playModeLabel, showQueuePanel,
  togglePause, stopPlay, seekTo, setVolume, fmtTime, initPlayer,
  playNext, playPrev, togglePlayMode, toggleQueuePanel,
  removeFromQueue, clearQueue, playTrackAt,
} from '../stores/player.js'
import { onMounted, onUnmounted, ref } from 'vue'
import { cleanText } from '../utils/text.js'

const queuePanelRef = ref(null)
const queueBtnRef = ref(null)

onMounted(() => {
  initPlayer()
  document.addEventListener('click', onDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
})

function onDocumentClick(e) {
  if (!showQueuePanel.value) return
  const panel = queuePanelRef.value
  const btn = queueBtnRef.value
  if (panel?.contains(e.target) || btn?.contains(e.target)) return
  showQueuePanel.value = false
}

function onSeek(e) { seekTo(Number(e.target.value)) }
function onVolume(e) { setVolume(Number(e.target.value)) }

async function onPlayNext() {
  try { await playNext() } catch {}
}

async function onPlayPrev() {
  try { await playPrev() } catch {}
}

async function onPlayAt(index) {
  try { await playTrackAt(index) } catch {}
}
</script>

<style scoped>
.player-bar {
  position: fixed;
  bottom: 0;
  left: var(--sidebar-width);
  right: 0;
  height: 64px;
  background: rgba(24, 24, 24, 0.92);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  padding: 0 24px;
  gap: 20px;
  z-index: 50;
}

.bar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 260px;
  flex-shrink: 0;
  min-width: 0;
}

.bar-cover {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  overflow: hidden;
}
.bar-cover img,
.cover-placeholder {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cover-disc { border-radius: 50%; }
.cover-disc img, .cover-disc .cover-placeholder { border-radius: 50%; }
.cover-card { border-radius: 8px; }
.cover-card img, .cover-card .cover-placeholder { border-radius: 8px; }
.cover-placeholder {
  background: var(--bg-input);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 18px;
}
.spinning { animation: disc-spin 4s linear infinite; }
@keyframes disc-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.player-info { min-width: 0; flex: 1; }
.player-name {
  display: block;
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}
.player-lyric {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}

.bar-center {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.ctrl-btn {
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.2s;
  color: var(--text-secondary);
  position: relative;
}
.ctrl-main {
  width: 40px;
  height: 40px;
  background: var(--accent);
  color: #fff;
}
.ctrl-main:hover:not(:disabled) { background: var(--accent-hover); transform: scale(1.05); }
.ctrl-main:disabled { opacity: 0.35; cursor: default; transform: none; }
.ctrl-sub, .ctrl-mode {
  width: 32px;
  height: 32px;
  background: var(--bg-input);
}
.ctrl-sub:hover:not(:disabled), .ctrl-mode:hover { background: var(--bg-hover); color: var(--text); }
.ctrl-sub:disabled { opacity: 0.35; cursor: default; }
.ctrl-mode:hover { color: var(--accent); }

.ctrl-queue {
  width: 34px;
  height: 34px;
  border-radius: var(--radius);
  background: transparent;
  border: 1px solid var(--border);
  flex-shrink: 0;
}
.ctrl-queue:hover, .ctrl-queue.active {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-muted);
}
.queue-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
}

.bar-right {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  justify-content: flex-end;
}
.player-progress {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  max-width: 360px;
}
.progress-slider {
  flex: 1;
  -webkit-appearance: none;
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  border: none;
  padding: 0;
}
.progress-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
}
.time-display {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.player-volume {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  width: 100px;
}
.vol-slider {
  flex: 1;
  -webkit-appearance: none;
  height: 3px;
  background: var(--border);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  border: none;
  padding: 0;
}
.vol-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-secondary);
  cursor: pointer;
}

.queue-panel {
  position: absolute;
  bottom: 72px;
  right: 24px;
  width: min(380px, calc(100vw - var(--sidebar-width) - 48px));
  max-height: 420px;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow);
  z-index: 60;
}
.queue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-elevated);
}
.queue-title { font-size: 14px; font-weight: 600; }
.queue-title em { font-style: normal; color: var(--text-muted); font-weight: 400; margin-left: 4px; }
.queue-header-actions { display: flex; align-items: center; gap: 8px; }
.queue-mode { font-size: 11px; color: var(--accent); }
.btn-icon {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 18px;
  padding: 0 4px;
  line-height: 1;
}
.btn-icon:hover { color: var(--text); }

.queue-list {
  overflow-y: auto;
  max-height: 340px;
}
.queue-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-light);
  transition: background 0.15s;
}
.queue-item:last-child { border-bottom: none; }
.queue-item:hover { background: var(--bg-hover); }
.queue-item.active { background: var(--accent-muted); }
.queue-index {
  width: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.queue-item.active .queue-index { color: var(--accent); }
.queue-info { flex: 1; min-width: 0; }
.queue-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.queue-meta {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 1px;
}
.queue-remove {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 16px;
  padding: 0 4px;
  opacity: 0;
  transition: opacity 0.15s;
}
.queue-item:hover .queue-remove { opacity: 1; }
.queue-remove:hover { color: var(--error); }
.queue-empty {
  padding: 32px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .player-bar {
    left: 0;
    bottom: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom, 0px));
    height: var(--player-height);
    padding: 0 10px;
    gap: 8px;
  }
  .bar-left {
    width: auto;
    flex: 1;
    min-width: 0;
  }
  .bar-cover {
    width: 40px;
    height: 40px;
  }
  .player-lyric { display: none; }
  .bar-center { gap: 4px; }
  .ctrl-mode, .ctrl-sub[title="停止"], .player-volume { display: none; }
  .player-progress {
    display: none;
  }
  .bar-right {
    flex: 0;
    gap: 6px;
  }
  .queue-panel {
    left: 12px;
    right: 12px;
    bottom: calc(var(--player-height) + 12px);
    width: auto;
    max-height: min(50vh, 360px);
  }
}
</style>
