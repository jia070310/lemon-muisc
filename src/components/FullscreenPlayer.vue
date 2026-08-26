<template>
  <Teleport to="body">
    <Transition name="fs-fade">
      <div
        v-if="showFullscreenPlayer"
        class="fs-player"
        @click.self="closeFullscreenPlayer"
      >
        <div class="fs-bg" :style="bgStyle"></div>
        <div class="fs-spectrum">
          <SpectrumVisualizer
            v-if="visualizerEnabled"
            mode="full"
            :active="showFullscreenPlayer && visualizerEnabled"
          />
        </div>

        <button class="fs-close" type="button" title="关闭" @click="closeFullscreenPlayer">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div class="fs-body">
          <div class="fs-cover-col">
            <div class="fs-cover" :class="{ spinning: coverStyle === 'disc' && !isPaused && currentPlaying }">
              <img v-if="coverUrl" :src="coverUrl" alt="" />
              <div v-else class="fs-cover-placeholder">♪</div>
            </div>
            <div class="fs-meta">
              <div class="fs-title">{{ cleanText(currentPlaying?.name) || '未知歌曲' }}</div>
              <div class="fs-artist">{{ formatArtists(currentPlaying?.singer) || '未知艺术家' }}</div>
              <div v-if="playerError" class="fs-error">{{ playerError }}</div>
            </div>
          </div>

          <div class="fs-lyric-col" ref="lyricPanelRef">
            <div v-if="!lyricLines.length" class="fs-lyric-empty">暂无歌词</div>
            <div
              v-else
              class="fs-lyric-list"
              ref="lyricListRef"
            >
              <p
                v-for="(line, i) in lyricLines"
                :key="`${line.time}-${i}`"
                class="fs-lyric-line"
                :class="{ active: i === activeLyricIdx, near: Math.abs(i - activeLyricIdx) === 1 }"
                :ref="(el) => setLyricLineRef(el, i)"
              >{{ line.text || ' ' }}</p>
            </div>
          </div>
        </div>

        <div class="fs-controls">
          <div class="fs-progress">
            <span class="fs-time">{{ fmtTime(currentTime) }}</span>
            <input
              type="range"
              class="fs-slider"
              min="0"
              :max="displayDuration || 1"
              :value="currentTime"
              @input="onSeek"
            />
            <span class="fs-time">{{ fmtTime(displayDuration) }}</span>
          </div>
          <div class="fs-btns">
            <button class="fs-btn" type="button" :title="playModeLabel" @click="togglePlayMode">
              <svg v-if="playMode === 'list'" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="14" y2="18"/>
              </svg>
              <svg v-else-if="playMode === 'loop'" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
              <svg v-else-if="playMode === 'single'" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                <text x="12" y="14" text-anchor="middle" fill="currentColor" stroke="none" font-size="8" font-weight="700">1</text>
              </svg>
              <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>
              </svg>
            </button>
            <button class="fs-btn" type="button" title="上一曲" :disabled="!playQueue.length" @click="onPrev">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="19,20 9,12 19,4"/><line x1="5" y1="4" x2="5" y2="20" stroke="currentColor" stroke-width="2"/></svg>
            </button>
            <button class="fs-btn fs-btn-main" type="button" :title="isPaused ? '播放' : '暂停'" @click="onMainPlay">
              <svg v-if="isPaused" viewBox="0 0 24 24" width="28" height="28" fill="#fff"><polygon points="7,3 21,12 7,21"/></svg>
              <svg v-else viewBox="0 0 24 24" width="28" height="28" fill="#fff"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            </button>
            <button class="fs-btn" type="button" title="下一曲" :disabled="!playQueue.length" @click="onNext">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="5,4 15,12 5,20"/><line x1="19" y1="4" x2="19" y2="20" stroke="currentColor" stroke-width="2"/></svg>
            </button>
            <button class="fs-btn" type="button" title="试听列表" :class="{ active: showQueuePanel }" @click="onOpenQueue">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>
              </svg>
            </button>

            <div class="fs-volume" @wheel.prevent="onVolumeWheel">
              <button
                class="fs-btn"
                type="button"
                :title="isMuted ? '取消静音' : '静音'"
                @click="toggleMute"
              >
                <svg v-if="isMuted || volumePercent === 0" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/>
                  <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
                </svg>
                <svg v-else-if="volumePercent < 50" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                </svg>
              </button>
              <input
                type="range"
                class="fs-vol-slider"
                min="0"
                max="100"
                step="1"
                :value="isMuted ? 0 : volumePercent"
                @input="onVolumePercent"
              />
              <span class="fs-vol-pct">{{ isMuted ? 0 : volumePercent }}%</span>
            </div>
          </div>
        </div>

        <div v-if="showQueuePanel" class="fs-queue-mask" @click="showQueuePanel = false">
          <div class="fs-queue" @click.stop>
            <div class="fs-queue-header">
              <span class="fs-queue-title">试听列表 <em>{{ playQueue.length }}</em></span>
              <div class="fs-queue-actions">
                <span class="fs-queue-mode">{{ playModeLabel }}</span>
                <button class="fs-queue-text" type="button" :disabled="!playQueue.length" @click="clearQueue">清空</button>
                <button class="fs-queue-close" type="button" @click="showQueuePanel = false">×</button>
              </div>
            </div>
            <div v-if="playQueue.length" class="fs-queue-list">
              <div
                v-for="(entry, i) in playQueue"
                :key="entry.key"
                class="fs-queue-item"
                :class="{ active: i === currentQueueIndex }"
                @dblclick="onPlayAt(i)"
              >
                <span class="fs-queue-index">{{ i === currentQueueIndex && !isPaused ? '▶' : i + 1 }}</span>
                <div class="fs-queue-info">
                  <div class="fs-queue-name">{{ cleanText(entry.item.name) }}</div>
                  <div class="fs-queue-meta">{{ formatArtists(entry.item.singer) }}</div>
                </div>
                <button
                  class="fs-queue-play"
                  type="button"
                  :class="{ playing: i === currentQueueIndex && currentPlaying && !isPaused }"
                  :title="i === currentQueueIndex && currentPlaying && !isPaused ? '暂停' : '播放'"
                  @click.stop="onQueuePlayClick(i)"
                >
                  <svg v-if="i === currentQueueIndex && currentPlaying && !isPaused" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="7,3 21,12 7,21"/></svg>
                </button>
                <button class="fs-queue-remove" type="button" title="移除" @click.stop="removeFromQueue(i)">×</button>
              </div>
            </div>
            <div v-else class="fs-queue-empty">列表为空</div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  currentPlaying, isPaused, currentTime, displayDuration, coverUrl, coverStyle,
  lyricLines, activeLyricIdx, playQueue, currentQueueIndex, playMode, playModeLabel,
  showFullscreenPlayer, visualizerEnabled, volume, isMuted, playerError,
  togglePause, seekTo, setVolume, toggleMute, fmtTime, playNext, playPrev, togglePlayMode,
  closeFullscreenPlayer, showQueuePanel, playTrackAt, removeFromQueue, clearQueue,
  resumeOrTogglePause, unlockAudioFromGesture,
} from '../stores/player.js'
import { cleanText, formatArtists } from '../utils/text.js'
import SpectrumVisualizer from './SpectrumVisualizer.vue'

const lyricPanelRef = ref(null)
const lyricListRef = ref(null)
/** @type {import('vue').Ref<(HTMLElement | null)[]>} */
const lyricLineEls = ref([])

const volumePercent = computed(() => Math.round((volume.value || 0) * 100))

const bgStyle = computed(() => {
  if (!coverUrl.value) return {}
  return {
    backgroundImage: `url(${coverUrl.value})`,
  }
})

function setLyricLineRef(el, i) {
  if (el) lyricLineEls.value[i] = el
}

function onSeek(e) {
  seekTo(Number(e.target.value))
}

function onVolumePercent(e) {
  setVolume(Number(e.target.value) / 100)
}

function onVolumeWheel(e) {
  const delta = e.deltaY < 0 ? 2 : -2
  setVolume((volumePercent.value + delta) / 100)
}

async function onMainPlay() {
  unlockAudioFromGesture()
  try {
    await resumeOrTogglePause()
  } catch (e) {
    playerError.value = e?.message || '播放失败'
  }
}

async function onPrev() {
  unlockAudioFromGesture()
  try { await playPrev() } catch (e) { playerError.value = e?.message || '播放失败' }
}

async function onNext() {
  unlockAudioFromGesture()
  try { await playNext() } catch (e) { playerError.value = e?.message || '播放失败' }
}

function onOpenQueue() {
  showQueuePanel.value = !showQueuePanel.value
}

async function onPlayAt(index) {
  unlockAudioFromGesture()
  try { await playTrackAt(index) } catch (e) { playerError.value = e?.message || '播放失败' }
}

async function onQueuePlayClick(index) {
  unlockAudioFromGesture()
  if (index === currentQueueIndex.value && currentPlaying.value) {
    try { await togglePause() } catch (e) { playerError.value = e?.message || '播放失败' }
    return
  }
  await onPlayAt(index)
}

function scrollActiveLyric() {
  const idx = activeLyricIdx.value
  if (idx < 0) return
  const el = lyricLineEls.value[idx]
  const panel = lyricPanelRef.value
  if (!el || !panel) return
  const panelRect = panel.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()
  const delta = (elRect.top + elRect.height / 2) - (panelRect.top + panelRect.height / 2)
  const nextTop = panel.scrollTop + delta
  panel.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })
}

function onKeydown(e) {
  if (!showFullscreenPlayer.value) return
  if (e.key === 'Escape') {
    if (showQueuePanel.value) {
      showQueuePanel.value = false
      return
    }
    closeFullscreenPlayer()
  }
  if (e.key === ' ') {
    e.preventDefault()
    onMainPlay()
  }
}

watch(activeLyricIdx, async () => {
  if (!showFullscreenPlayer.value) return
  await nextTick()
  scrollActiveLyric()
})

watch(showFullscreenPlayer, async (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
  if (open) {
    await nextTick()
    scrollActiveLyric()
  }
})

watch(lyricLines, () => {
  lyricLineEls.value = []
})

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<style scoped>
.fs-player {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  color: #fff;
  background: #0b0d12;
  overflow: hidden;
}
.fs-bg {
  position: absolute;
  inset: -40px;
  background-size: cover;
  background-position: center;
  filter: blur(40px) saturate(1.2);
  opacity: 0.35;
  transform: scale(1.1);
}
.fs-spectrum {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: min(42vh, 360px);
  opacity: 0.9;
  mask-image: linear-gradient(to top, #000 40%, transparent 100%);
  -webkit-mask-image: linear-gradient(to top, #000 40%, transparent 100%);
  pointer-events: none;
  z-index: 1;
}
.fs-close {
  position: absolute;
  top: calc(14px + env(safe-area-inset-top, 0px));
  right: 18px;
  z-index: 5;
  width: 46px;
  height: 46px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.fs-close:hover { background: rgba(0, 0, 0, 0.6); }

.fs-body {
  position: relative;
  z-index: 2;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(240px, 380px) 1fr;
  gap: 32px;
  padding: calc(64px + env(safe-area-inset-top, 0px)) 40px 16px;
  min-height: 0;
  align-items: center;
}
.fs-cover-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}
.fs-cover {
  width: min(320px, 70vw);
  aspect-ratio: 1;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
  background: rgba(255, 255, 255, 0.06);
}
.fs-cover.spinning {
  border-radius: 50%;
  animation: fs-spin 16s linear infinite;
}
.fs-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.fs-cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 64px;
  color: rgba(255, 255, 255, 0.35);
}
.fs-meta { text-align: center; max-width: 320px; }
.fs-title {
  font-size: 22px;
  font-weight: 650;
  line-height: 1.3;
  margin-bottom: 6px;
}
.fs-artist {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.65);
}
.fs-error {
  margin-top: 8px;
  font-size: 12px;
  color: #ff8b8b;
}

.fs-lyric-col {
  height: min(62vh, 560px);
  overflow-x: hidden;
  overflow-y: auto;
  mask-image: linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent);
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent);
  scrollbar-width: thin;
}
.fs-lyric-col::-webkit-scrollbar {
  width: 6px;
  height: 0;
}
.fs-lyric-list {
  padding: 30% 12px;
  text-align: center;
  max-width: 100%;
  overflow-x: hidden;
}
.fs-lyric-line {
  margin: 0;
  padding: 10px 8px;
  font-size: 16px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.35);
  transition: color 0.25s, font-size 0.25s;
  max-width: 100%;
  box-sizing: border-box;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.fs-lyric-line.near { color: rgba(255, 255, 255, 0.55); }
.fs-lyric-line.active {
  color: #fff;
  font-size: 22px;
  font-weight: 600;
}
.fs-lyric-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.4);
  font-size: 15px;
}

.fs-controls {
  position: relative;
  z-index: 3;
  padding: 8px 28px calc(20px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(to top, rgba(0, 0, 0, 0.55), transparent);
}
.fs-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.fs-time {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  font-variant-numeric: tabular-nums;
  min-width: 40px;
}
.fs-slider {
  flex: 1;
  -webkit-appearance: none;
  appearance: none;
  height: 12px;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  outline: none;
  cursor: pointer;
  box-shadow: none;
}
.fs-slider:focus {
  border: none;
  box-shadow: none;
}
.fs-slider::-webkit-slider-runnable-track {
  height: 2px;
  border-radius: 1px;
  background: rgba(255, 255, 255, 0.22);
  border: none;
}
.fs-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -5px;
  border: none;
  border-radius: 50%;
  background: var(--accent, #3c6ef7);
  cursor: pointer;
  box-shadow: none;
}
.fs-slider::-moz-range-track {
  height: 2px;
  border-radius: 1px;
  background: rgba(255, 255, 255, 0.22);
  border: none;
}
.fs-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: none;
  border-radius: 50%;
  background: var(--accent, #3c6ef7);
  cursor: pointer;
  box-shadow: none;
}
.fs-btns {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px 18px;
}
.fs-volume {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  min-width: 0;
}
.fs-vol-slider {
  width: min(120px, 22vw);
  -webkit-appearance: none;
  appearance: none;
  height: 12px;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  outline: none;
  cursor: pointer;
  box-shadow: none;
}
.fs-vol-slider:focus {
  border: none;
  box-shadow: none;
}
.fs-vol-slider::-webkit-slider-runnable-track {
  height: 2px;
  border-radius: 1px;
  background: rgba(255, 255, 255, 0.22);
}
.fs-vol-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -5px;
  border: none;
  border-radius: 50%;
  background: var(--accent, #3c6ef7);
  cursor: pointer;
}
.fs-vol-slider::-moz-range-track {
  height: 2px;
  border-radius: 1px;
  background: rgba(255, 255, 255, 0.22);
  border: none;
}
.fs-vol-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: none;
  border-radius: 50%;
  background: var(--accent, #3c6ef7);
  cursor: pointer;
}
.fs-vol-pct {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
  font-variant-numeric: tabular-nums;
  min-width: 36px;
}
.fs-btn {
  width: 50px;
  height: 50px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.fs-btn svg {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}
.fs-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.fs-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.12); }
.fs-btn.active { background: rgba(255, 255, 255, 0.18); }

.fs-queue-mask {
  position: absolute;
  inset: 0;
  z-index: 8;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
}
.fs-queue {
  width: min(380px, 100%);
  height: 100%;
  background: rgba(12, 14, 20, 0.96);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(16px);
}
.fs-queue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: calc(14px + env(safe-area-inset-top, 0px)) 16px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.fs-queue-title {
  font-size: 15px;
  font-weight: 600;
}
.fs-queue-title em {
  font-style: normal;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 400;
  margin-left: 4px;
}
.fs-queue-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.fs-queue-mode {
  font-size: 11px;
  color: var(--accent, #6c9eff);
}
.fs-queue-text {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  cursor: pointer;
}
.fs-queue-text:disabled { opacity: 0.35; }
.fs-queue-close {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}
.fs-queue-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.fs-queue-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.fs-queue-item.active {
  background: rgba(60, 110, 247, 0.22);
}
.fs-queue-index {
  width: 20px;
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  flex-shrink: 0;
}
.fs-queue-item.active .fs-queue-index { color: #fff; }
.fs-queue-info { flex: 1; min-width: 0; }
.fs-queue-name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fs-queue-meta {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fs-queue-play,
.fs-queue-remove {
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  font-size: 18px;
}
.fs-queue-play svg {
  display: block;
}
/* 播放三角视觉重心偏左，略右移光学居中 */
.fs-queue-play:not(.playing) svg {
  margin-left: 2px;
}
.fs-queue-empty {
  padding: 32px 16px;
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
}

.fs-btn-main {
  width: 64px;
  height: 64px;
  background: var(--accent, #3c6ef7);
}
.fs-btn-main svg {
  width: 30px;
  height: 30px;
}
.fs-btn-main:hover { filter: brightness(1.08); }

@keyframes fs-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.fs-fade-enter-active,
.fs-fade-leave-active {
  transition: opacity 0.22s ease;
}
.fs-fade-enter-from,
.fs-fade-leave-to {
  opacity: 0;
}

@media (max-width: 860px) {
  .fs-body {
    display: flex;
    flex-direction: column;
    grid-template-columns: unset;
    gap: 8px;
    padding: calc(52px + env(safe-area-inset-top, 0px)) 14px 4px;
    align-items: stretch;
    overflow: hidden;
    min-height: 0;
  }
  .fs-cover-col {
    flex: 0 0 auto;
    gap: 10px;
  }
  .fs-cover {
    width: min(140px, 34vw);
  }
  .fs-cover.spinning { animation-duration: 18s; }
  .fs-meta { max-width: 100%; }
  .fs-title { font-size: 17px; margin-bottom: 4px; }
  .fs-artist { font-size: 13px; }
  .fs-lyric-col {
    /* 强制吃掉剩余高度，避免内容撑破后压到控制栏 */
    flex: 1 1 0;
    height: 0;
    min-height: 0;
    max-height: none;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    mask-image: linear-gradient(to bottom, transparent, #000 10%, #000 82%, transparent);
    -webkit-mask-image: linear-gradient(to bottom, transparent, #000 10%, #000 82%, transparent);
  }
  .fs-lyric-list {
    /* 上下留白用固定值，避免 % 按宽度算导致空隙过大 */
    padding: 28vh 6px 22vh;
  }
  .fs-lyric-line { font-size: 15px; padding: 7px 4px; }
  .fs-lyric-line.active { font-size: 17px; }
  .fs-spectrum {
    height: min(28vh, 180px);
    opacity: 0.55;
    /* 频谱停在控制区上方，减少盖住歌词 */
    bottom: 72px;
  }
  .fs-controls {
    flex: 0 0 auto;
    z-index: 4;
    padding: 4px 12px calc(10px + env(safe-area-inset-bottom, 0px));
    background: linear-gradient(to top, rgba(0, 0, 0, 0.72) 55%, transparent);
  }
  .fs-progress { margin-bottom: 6px; }
  .fs-close {
    width: 44px;
    height: 44px;
  }
  .fs-btn {
    width: 44px;
    height: 44px;
  }
  .fs-btn svg {
    width: 22px;
    height: 22px;
  }
  .fs-btn-main {
    width: 56px;
    height: 56px;
  }
  .fs-btn-main svg {
    width: 26px;
    height: 26px;
  }
  .fs-btns {
    gap: 8px 14px;
  }
  /* 与底栏一致：窄屏隐藏音量，腾出歌词空间 */
  .fs-volume {
    display: none;
  }
  .fs-queue {
    width: min(100%, 420px);
  }
}

/* 矮屏 / 横屏：进一步压缩封面，优先留给歌词 */
@media (max-width: 860px) and (max-height: 700px) {
  .fs-cover {
    width: min(110px, 28vw);
  }
  .fs-cover-col { gap: 6px; }
  .fs-body {
    padding-top: calc(44px + env(safe-area-inset-top, 0px));
    gap: 6px;
  }
  .fs-lyric-list { padding: 22vh 6px 18vh; }
  .fs-spectrum {
    height: min(22vh, 140px);
    bottom: 64px;
  }
}

@media (max-width: 860px) and (orientation: landscape) {
  .fs-body {
    flex-direction: row;
    align-items: stretch;
    padding: calc(12px + env(safe-area-inset-top, 0px)) 16px 4px;
    gap: 16px;
  }
  .fs-cover-col {
    width: min(160px, 28vw);
    justify-content: center;
  }
  .fs-cover {
    width: min(120px, 22vw);
  }
  .fs-lyric-col {
    flex: 1 1 0;
  }
  .fs-lyric-list { padding: 18vh 8px; }
  .fs-spectrum {
    height: min(40vh, 160px);
    bottom: 56px;
  }
}
</style>
