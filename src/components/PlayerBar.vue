<template>
  <div class="player-bar" ref="playerBarRef" :class="{ compact: isCompact }">
    <div v-if="visualizerEnabled" class="bar-spectrum">
      <SpectrumVisualizer mode="bar" :active="visualizerEnabled && !!currentPlaying && !showFullscreenPlayer" />
    </div>
    <div class="bar-left">
      <div
        class="cover-progress-wrap"
        :class="[coverStyle === 'disc' ? 'wrap-disc' : 'wrap-card', { clickable: !!currentPlaying }]"
        :title="currentPlaying ? '打开全屏播放' : ''"
        @click="onCoverClick"
      >
        <svg
          v-if="currentPlaying && coverStyle === 'card'"
          class="cover-progress-ring cover-progress-card"
          viewBox="0 0 44 44"
          aria-hidden="true"
        >
          <path class="ring-bg" :d="CARD_PROGRESS_PATH" pathLength="100" />
          <path
            class="ring-fg"
            :d="CARD_PROGRESS_PATH"
            pathLength="100"
            stroke-dasharray="100"
            :stroke-dashoffset="cardDashoffset"
          />
        </svg>
        <svg
          v-else-if="currentPlaying"
          class="cover-progress-ring cover-progress-disc"
          viewBox="0 0 52 52"
          aria-hidden="true"
        >
          <circle class="ring-bg" :cx="RING_CENTER" :cy="RING_CENTER" :r="DISC_RING_RADIUS" />
          <circle
            class="ring-fg"
            :cx="RING_CENTER"
            :cy="RING_CENTER"
            :r="DISC_RING_RADIUS"
            :stroke-dasharray="DISC_RING_CIRC"
            :stroke-dashoffset="discRingDashoffset"
          />
        </svg>
        <div class="bar-cover" :class="coverStyle === 'disc' ? 'cover-disc' : 'cover-card'">
          <img v-if="coverUrl" :src="coverUrl" alt="" :class="{ spinning: coverStyle === 'disc' && !isPaused && currentPlaying }" />
          <div v-else class="cover-placeholder" :class="{ spinning: coverStyle === 'disc' && !isPaused && currentPlaying }">♪</div>
        </div>
      </div>
      <div class="player-info">
        <span class="player-name">{{ currentPlaying ? `${cleanText(currentPlaying.name)} - ${cleanText(currentPlaying.singer)}` : '未选择歌曲' }}</span>
        <span class="player-lyric" :class="{ empty: currentPlaying && !currentLyricText }">{{ currentPlaying ? (currentLyricText || '暂无歌词') : '未知艺术家' }}</span>
        <span v-if="currentPlaying" class="player-time-mobile">{{ fmtTime(currentTime) }} / {{ fmtTime(displayDuration) }}</span>
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
        <svg v-if="!currentPlaying || isPaused" viewBox="0 0 24 24" width="20" height="20" fill="#fff"><polygon points="7,3 21,12 7,21"/></svg>
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
      <button ref="queueBtnRef" class="ctrl-btn ctrl-queue" @click="onToggleQueuePanel" :title="`试听列表 (${playQueue.length})`" :class="{ active: showQueuePanel }">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
          <circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>
        </svg>
        <span v-if="playQueue.length" class="queue-badge">{{ playQueue.length }}</span>
      </button>
      <div
        class="player-volume"
        ref="volumeWrapRef"
        :class="{ open: showVolumePanel }"
        @wheel.prevent="onVolumeWheel"
        @mouseenter="onVolumeEnter"
        @mouseleave="onVolumeLeave"
      >
        <button
          class="ctrl-btn ctrl-vol"
          type="button"
          :title="volumeTip"
          @click.stop="onVolumeBtnClick"
        >
          <svg v-if="isMuted" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/>
            <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
          </svg>
          <svg v-else-if="volumePercent < 50" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          </svg>
        </button>
        <div class="vol-popover" @click.stop @mouseenter="onVolumeEnter" @mouseleave="onVolumeLeave">
          <span class="vol-percent">{{ isMuted ? '静音' : volumePercent + '%' }}</span>
          <div class="vol-slider-wrap" :style="{ '--vol-pct': (isMuted ? 0 : volumePercent) + '%' }">
            <input
              type="range"
              class="vol-slider-v"
              min="0"
              max="100"
              step="1"
              :value="isMuted ? 0 : volumePercent"
              @input="onVolumePercent"
              @change="onVolumePercent"
            />
          </div>
        </div>
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
          <button
            class="queue-play-btn"
            @click.stop="onQueuePlayClick(i)"
            :title="i === currentQueueIndex && currentPlaying && !isPaused ? '暂停' : '播放'"
          >
            <svg v-if="i === currentQueueIndex && currentPlaying && !isPaused" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="7,3 21,12 7,21"/></svg>
          </button>
          <button class="queue-remove" @click.stop="removeFromQueue(i)" title="移除">×</button>
        </div>
      </div>
      <div v-else class="queue-empty">列表为空，在搜索页点击 + 或试听添加歌曲</div>
    </div>
  </div>
</template>

<script setup>
import {
  currentPlaying, isPaused, currentTime, displayDuration, volume, isMuted,
  coverUrl, coverStyle, currentLyricText, visualizerEnabled, showFullscreenPlayer,
  playQueue, currentQueueIndex, playMode, playModeLabel, showQueuePanel,
  togglePause, stopPlay, seekTo, setVolume, toggleMute, fmtTime, initPlayer,
  playNext, playPrev, togglePlayMode,
  removeFromQueue, clearQueue, playTrackAt, openFullscreenPlayer,
} from '../stores/player.js'
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { cleanText } from '../utils/text.js'
import SpectrumVisualizer from './SpectrumVisualizer.vue'

const queuePanelRef = ref(null)
const queueBtnRef = ref(null)
const playerBarRef = ref(null)
const volumeWrapRef = ref(null)
const isCompact = ref(false)
const showVolumePanel = ref(false)

const COMPACT_ON = 980
const COMPACT_OFF = 1040

let compactObserver = null
let volumeLeaveTimer = null

const volumePercent = computed(() => Math.round((volume.value || 0) * 100))
const volumeTip = computed(() => (isMuted.value ? '取消静音' : `音量 ${volumePercent.value}%（点击静音）`))

function applyCompact(width) {
  if (isCompact.value) {
    if (width >= COMPACT_OFF) isCompact.value = false
  } else if (width <= COMPACT_ON) {
    isCompact.value = true
  }
}

watch(isCompact, (compact) => {
  document.documentElement.style.setProperty('--player-height', compact ? '76px' : '64px')
  if (!compact) showVolumePanel.value = false
}, { immediate: true })

const RING_CENTER = 26
const DISC_RING_RADIUS = 22
const DISC_RING_CIRC = 2 * Math.PI * DISC_RING_RADIUS

/** 圆角方形进度路径（40×40 封面，rx=8，从顶边中点顺时针） */
const CARD_PROGRESS_PATH = 'M 22,2 L 34,2 A 8,8 0 0 1 42,10 L 42,34 A 8,8 0 0 1 34,42 L 10,42 A 8,8 0 0 1 2,34 L 2,10 A 8,8 0 0 1 10,2 L 22,2 Z'

const progressRatio = computed(() => {
  const dur = displayDuration.value
  if (!dur || dur <= 0) return 0
  return Math.min(1, Math.max(0, currentTime.value / dur))
})

const discRingDashoffset = computed(() => DISC_RING_CIRC * (1 - progressRatio.value))
const cardDashoffset = computed(() => 100 * (1 - progressRatio.value))

onMounted(() => {
  initPlayer()
  document.addEventListener('click', onDocumentClick)
  if (playerBarRef.value && typeof ResizeObserver !== 'undefined') {
    compactObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width
      if (typeof width === 'number') applyCompact(width)
    })
    compactObserver.observe(playerBarRef.value)
    applyCompact(playerBarRef.value.clientWidth)
  }
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  compactObserver?.disconnect()
  compactObserver = null
  clearTimeout(volumeLeaveTimer)
  document.documentElement.style.removeProperty('--player-height')
})

function onDocumentClick(e) {
  const t = e.target
  if (showQueuePanel.value) {
    const panel = queuePanelRef.value
    const btn = queueBtnRef.value
    if (!panel?.contains(t) && !btn?.contains(t)) showQueuePanel.value = false
  }
  if (showVolumePanel.value) {
    if (!volumeWrapRef.value?.contains(t)) showVolumePanel.value = false
  }
}

function onToggleQueuePanel() {
  showQueuePanel.value = !showQueuePanel.value
}

function onSeek(e) { seekTo(Number(e.target.value)) }

function onCoverClick() {
  if (!currentPlaying.value) return
  openFullscreenPlayer()
}

function onVolumePercent(e) {
  setVolume(Number(e.target.value) / 100)
}

function onVolumeWheel(e) {
  const delta = e.deltaY < 0 ? 2 : -2
  setVolume((volumePercent.value + delta) / 100)
  showVolumePanel.value = true
}

function onVolumeEnter() {
  clearTimeout(volumeLeaveTimer)
  if (!isCompact.value) showVolumePanel.value = true
}

function onVolumeLeave() {
  volumeLeaveTimer = setTimeout(() => {
    if (!isCompact.value) showVolumePanel.value = false
  }, 220)
}

function onVolumeBtnClick() {
  toggleMute()
}

async function onPlayNext() {
  try { await playNext() } catch {}
}

async function onPlayPrev() {
  try { await playPrev() } catch {}
}

async function onPlayAt(index) {
  try { await playTrackAt(index) } catch {}
}

async function onQueuePlayClick(index) {
  if (index === currentQueueIndex.value && currentPlaying.value) {
    togglePause()
    return
  }
  await onPlayAt(index)
}
</script>

<style scoped>
.player-bar {
  position: fixed;
  bottom: 0;
  left: var(--sidebar-width);
  right: 0;
  height: var(--player-height);
  background: var(--bg-player);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  padding: 0 24px;
  gap: 20px;
  z-index: 50;
}

.bar-spectrum {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  opacity: 0.45;
  pointer-events: none;
  mask-image: linear-gradient(to top, #000 20%, transparent 95%);
  -webkit-mask-image: linear-gradient(to top, #000 20%, transparent 95%);
}

.bar-left,
.bar-center,
.bar-right {
  position: relative;
  z-index: 1;
}

.bar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 260px;
  flex-shrink: 0;
  min-width: 0;
}

.cover-progress-wrap {
  position: relative;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
}
.cover-progress-wrap.clickable {
  cursor: pointer;
}
.cover-progress-wrap.clickable:hover .bar-cover {
  filter: brightness(1.08);
}

.cover-progress-ring {
  display: none;
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2;
}

.cover-progress-disc {
  transform: rotate(-90deg);
}

.cover-progress-card {
  transform: none;
}

.ring-bg {
  fill: none;
  stroke: var(--border);
  stroke-width: 2;
}

.ring-fg {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.15s linear;
}

.bar-cover {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  overflow: hidden;
  z-index: 1;
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

.player-time-mobile {
  display: none;
  font-size: 10px;
  color: var(--text-muted);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
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
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.ctrl-vol {
  width: 34px;
  height: 34px;
  border-radius: var(--radius);
  background: transparent;
  border: 1px solid var(--border);
}
.ctrl-vol:hover,
.player-volume.open .ctrl-vol {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-muted);
}
.vol-popover {
  display: none;
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  width: 52px;
  padding: 10px 8px 12px;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  z-index: 70;
}
.vol-popover::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -10px;
  height: 10px;
}
.player-volume:hover .vol-popover,
.player-volume.open .vol-popover {
  display: flex;
}
.vol-percent {
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.vol-slider-wrap {
  position: relative;
  width: 28px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.vol-slider-wrap::before {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: 4px;
  height: 120px;
  border-radius: 2px;
  background: linear-gradient(to top, var(--accent) var(--vol-pct), var(--border) var(--vol-pct));
  pointer-events: none;
  z-index: 0;
}
.vol-slider-v {
  position: relative;
  z-index: 1;
  -webkit-appearance: none;
  appearance: slider-vertical;
  writing-mode: vertical-lr;
  direction: rtl;
  width: 28px;
  height: 120px;
  padding: 0;
  margin: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  touch-action: none;
}
.vol-slider-v::-webkit-slider-runnable-track {
  width: 4px;
  border-radius: 2px;
  background: transparent;
}
.vol-slider-v::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  margin-left: -6px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--bg-card);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  cursor: pointer;
}
.vol-slider-v::-moz-range-track {
  width: 4px;
  border-radius: 2px;
  background: transparent;
}
.vol-slider-v::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: 2px solid var(--bg-card);
  border-radius: 50%;
  background: var(--accent);
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
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
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
  flex-shrink: 0;
}
.queue-item:hover .queue-remove { opacity: 1; }
.queue-remove:hover { color: var(--error); }

.queue-play-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}
.queue-play-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-muted);
}
.queue-item.active .queue-play-btn {
  color: var(--accent);
  border-color: var(--accent);
}
.queue-empty {
  padding: 32px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
}

.player-bar.compact {
  padding: 8px 12px;
  gap: 0;
}

.player-bar.compact .bar-left {
  flex: 1;
  width: auto;
  min-width: 0;
  gap: 10px;
}

.player-bar.compact .cover-progress-wrap {
  width: 50px;
  height: 50px;
}

.player-bar.compact .cover-progress-ring {
  display: block;
}

.player-bar.compact .cover-progress-wrap.wrap-disc {
  width: 50px;
  height: 50px;
}

.player-bar.compact .cover-progress-wrap.wrap-disc .bar-cover {
  width: 40px;
  height: 40px;
}

.player-bar.compact .cover-progress-wrap.wrap-card {
  width: 44px;
  height: 44px;
}

.player-bar.compact .cover-progress-wrap.wrap-card .bar-cover {
  width: 40px;
  height: 40px;
}

.player-bar.compact .player-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-width: 0;
}

.player-bar.compact .player-name {
  font-size: 12px;
  line-height: 1.3;
}

.player-bar.compact .player-lyric {
  display: block;
  font-size: 11px;
  line-height: 1.3;
  color: var(--accent);
  opacity: 0.95;
}

.player-bar.compact .player-lyric.empty {
  color: var(--text-muted);
  opacity: 1;
}

.player-bar.compact .player-time-mobile {
  display: block;
}

.player-bar.compact .bar-center {
  flex-shrink: 0;
  gap: 2px;
  margin: 0 6px;
}

.player-bar.compact .ctrl-main {
  width: 38px;
  height: 38px;
}

.player-bar.compact .ctrl-sub,
.player-bar.compact .ctrl-mode {
  width: 32px;
  height: 32px;
  display: flex;
}

.player-bar.compact .ctrl-sub[title="停止"],
.player-bar.compact .player-progress,
.player-bar.compact .player-volume {
  display: none;
}

.player-bar.compact .bar-right {
  flex: 0 0 auto;
  width: auto;
  margin-left: 0;
}

.player-bar.compact .ctrl-queue {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
}

.player-bar.compact .queue-panel {
  left: 12px;
  right: 12px;
  bottom: calc(var(--player-height) + 12px);
  width: auto;
  max-height: min(50vh, 360px);
}

.player-bar.compact .queue-play-btn {
  width: 32px;
  height: 32px;
}

.player-bar.compact .queue-remove {
  opacity: 1;
}

@media (max-width: 768px) {
  .player-bar {
    left: 0;
    bottom: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom, 0px));
  }
}
</style>
