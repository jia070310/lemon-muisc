<template>
  <Teleport to="body">
    <Transition name="fs-fade">
      <div
        v-if="showFullscreenPlayer"
        ref="playerRootRef"
        class="fs-player"
        :class="{
          'mobile-screen-expanded': isScreenExpanded,
          'fs-has-sheet': showQueuePanel || showTagEditModal,
          'fs-chrome-hidden': chromeHidden,
        }"
        @click.self="closeFullscreenPlayer"
        @pointermove="onFsPointerActivity"
        @pointerdown="onFsPointerActivity"
      >
        <div class="fs-bg" :style="bgStyle"></div>
        <div class="fs-spectrum">
          <SpectrumVisualizer
            v-if="visualizerEnabled"
            mode="full"
            :active="showFullscreenPlayer && visualizerEnabled"
          />
        </div>

        <div class="fs-top-left fs-chrome">
          <button
            class="fs-screen-full"
            type="button"
            :title="isScreenExpanded ? '退出屏幕全屏' : '屏幕全屏'"
            @click="toggleNativeFullscreen"
          >
            <svg v-if="!isScreenExpanded" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
              <line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </button>
        </div>

        <button class="fs-close fs-chrome" type="button" title="关闭" @click="closeFullscreenPlayer">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div class="fs-body">
          <div class="fs-cover-col">
            <div class="fs-cover" :class="{ disc: coverStyle === 'disc' }">
              <CoverArt
                :src="coverUrl"
                :round="coverStyle === 'disc'"
                :spin="coverStyle === 'disc' && !isPaused && !!currentPlaying"
                slow
                loading="eager"
                @error="onCoverError"
              />
            </div>
            <div class="fs-meta">
              <div class="fs-title">{{ cleanText(currentPlaying?.name) || '未知歌曲' }}</div>
              <div class="fs-artist">
                {{ formatArtists(currentPlaying?.singer) || '未知艺术家' }}
                <em v-if="currentPlayPlatformLabel" class="fs-platform">{{ currentPlayPlatformLabel }}</em>
              </div>
              <div v-if="playerError" class="fs-error">{{ playerError }}</div>
            </div>
          </div>

          <div class="fs-lyric-wrap">
            <div
              v-if="displayLyricLines.length"
              class="fs-lyric-toolbar fs-chrome"
              @pointerdown.stop
              @click.stop
            >
              <div class="fs-lyric-mode" role="group" aria-label="歌词显示模式">
                <button
                  type="button"
                  class="fs-lyric-mode-btn"
                  :class="{ active: lyricDisplayMode === 'line' }"
                  title="逐行显示"
                  @click.stop="onSelectLyricMode('line')"
                >逐行</button>
                <button
                  type="button"
                  class="fs-lyric-mode-btn"
                  :class="{ active: lyricDisplayMode === 'word', busy: lyricModeBusy }"
                  :title="hasWordLyrics ? '官方逐字高亮' : (canShowWordLyrics ? '按歌词时间推算逐字高亮' : '尝试获取逐字歌词')"
                  @click.stop="onSelectLyricMode('word')"
                >{{ lyricModeBusy ? '获取中' : '逐字' }}</button>
              </div>
            </div>
            <div
              class="fs-lyric-col"
              ref="lyricPanelRef"
              @wheel.passive="onLyricUserInteract"
              @touchstart.passive="onLyricUserInteract"
              @pointerdown="onLyricPanelPointerDown"
            >
              <div v-if="!displayLyricLines.length" class="fs-lyric-empty">暂无歌词</div>
              <div
                v-else
                class="fs-lyric-list"
                ref="lyricListRef"
              >
                <p
                  v-for="(line, i) in displayLyricLines"
                  :key="`${line.time}-${i}`"
                  class="fs-lyric-line"
                  :class="{
                    active: i === activeLyricIdx,
                    near: Math.abs(i - activeLyricIdx) === 1,
                    'is-word-mode': showWordLyrics && line.words?.length,
                  }"
                  :ref="(el) => setLyricLineRef(el, i)"
                >
                  <template v-if="showWordLyrics && line.words?.length">
                    <span
                      v-for="(w, wi) in line.words"
                      :key="wi"
                      class="fs-lyric-word"
                      :class="{
                        sung: i === activeLyricIdx && wi <= liveWordIdx,
                        current: i === activeLyricIdx && wi === liveWordIdx,
                      }"
                    >{{ w.text || ' ' }}</span>
                  </template>
                  <template v-else>{{ line.text || ' ' }}</template>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="fs-controls fs-chrome">
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
            <button
              class="fs-btn fs-btn-main"
              type="button"
              :class="{ buffering: isBuffering }"
              :title="isBuffering ? '加载中…' : (isPaused ? '播放' : '暂停')"
              @click="onMainPlay"
            >
              <svg v-if="isPaused && !isBuffering" viewBox="0 0 24 24" width="28" height="28" fill="#fff"><polygon points="8,5 19,12 8,19"/></svg>
              <svg v-else viewBox="0 0 24 24" width="28" height="28" fill="#fff"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            </button>
            <button class="fs-btn" type="button" title="下一曲" :disabled="!playQueue.length" @click="onNext">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="5,4 15,12 5,20"/><line x1="19" y1="4" x2="19" y2="20" stroke="currentColor" stroke-width="2"/></svg>
            </button>

            <!-- 桌面：次要操作平铺；手机：收进「更多」，保证底栏单行 -->
            <template v-if="!isMobileViewport">
              <button
                v-if="currentLocalTrackPath"
                class="fs-btn"
                type="button"
                title="标签编辑"
                @click="onOpenTagEdit"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                  <line x1="7" y1="7" x2="7.01" y2="7"/>
                </svg>
              </button>
              <button
                class="fs-btn"
                type="button"
                title="加入歌单"
                :disabled="!currentPlaying"
                @click="openPickCurrentPlaylist"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15V6"/><path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/><path d="M12 12H3"/><path d="M16 6H3"/><path d="M12 18H3"/></svg>
              </button>
              <div v-if="canDownloadCurrent" class="fs-dl-wrap" data-fs-dl>
                <button
                  class="fs-btn"
                  type="button"
                  title="下载"
                  @click.stop="toggleDownloadMenu($event)"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                </button>
                <div v-if="downloadMenuOpen" class="quality-menu" :style="downloadMenuStyle" data-fs-dl @click.stop>
                  <div class="quality-menu-title">选择音质</div>
                  <template v-if="currentQualities.length">
                    <button
                      v-for="q in currentQualities"
                      :key="q"
                      type="button"
                      class="quality-option"
                      @click="downloadCurrent(q)"
                    >{{ getQualityDisplay(q, currentPlaying?.types) }}</button>
                  </template>
                  <div v-else class="quality-empty">该曲暂无可用音质（音源未返回）</div>
                </div>
              </div>
            </template>

            <button class="fs-btn" type="button" title="试听列表" :class="{ active: showQueuePanel }" @click="onOpenQueue">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>
              </svg>
            </button>

            <div v-if="isMobileViewport" class="fs-more-wrap" data-fs-more>
              <button
                class="fs-btn"
                type="button"
                title="更多"
                :class="{ active: moreMenuOpen }"
                @click.stop="toggleMoreMenu"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>
                </svg>
              </button>
              <div v-if="moreMenuOpen" class="fs-more-menu" @click.stop>
                <button
                  v-if="currentLocalTrackPath"
                  type="button"
                  class="fs-more-item"
                  @click="onMoreTagEdit"
                >标签编辑</button>
                <button
                  type="button"
                  class="fs-more-item"
                  :disabled="!currentPlaying"
                  @click="onMorePickPlaylist"
                >加入歌单</button>
                <button
                  v-if="canDownloadCurrent"
                  type="button"
                  class="fs-more-item"
                  @click="onMoreDownload"
                >下载</button>
                <div v-if="moreDownloadOpen" class="fs-more-qualities" data-fs-dl>
                  <div class="quality-menu-title">选择音质</div>
                  <template v-if="currentQualities.length">
                    <button
                      v-for="q in currentQualities"
                      :key="q"
                      type="button"
                      class="quality-option"
                      @click="downloadCurrent(q)"
                    >{{ getQualityDisplay(q, currentPlaying?.types) }}</button>
                  </template>
                  <div v-else class="quality-empty">该曲暂无可用音质（音源未返回）</div>
                </div>
              </div>
            </div>

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
                <div class="fs-queue-info" @click="onPlayAt(i)">
                  <div class="fs-queue-name">{{ cleanText(entry.item.name) }}</div>
                  <div class="fs-queue-meta">{{ formatArtists(entry.item.singer) }}</div>
                </div>
                <div class="fs-queue-actions-row">
                  <button
                    class="fs-queue-btn fs-queue-play"
                    type="button"
                    :class="{ playing: i === currentQueueIndex && currentPlaying && !isPaused }"
                    :title="i === currentQueueIndex && currentPlaying && !isPaused ? '暂停' : '播放'"
                    @click.stop="onQueuePlayClick(i)"
                  >
                    <svg v-if="i === currentQueueIndex && currentPlaying && !isPaused" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="7,3 21,12 7,21"/></svg>
                  </button>
                  <button class="fs-queue-btn fs-queue-remove" type="button" title="移除" @click.stop="removeFromQueue(i)">×</button>
                </div>
              </div>
            </div>
            <div v-else class="fs-queue-empty">列表为空</div>
          </div>
        </div>

        <PickPlaylistModal
          v-if="pickPlaylistTrack"
          :track="pickPlaylistTrack.track"
          :source="pickPlaylistTrack.source"
          @close="pickPlaylistTrack = null"
          @added="onAddedToPlaylist"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  currentPlaying, isPaused, isBuffering, currentTime, displayDuration, coverUrl, coverStyle,
  displayLyricLines, activeLyricIdx, hasWordLyrics, canShowWordLyrics,
  lyricDisplayMode, effectiveLyricDisplayMode, setLyricDisplayMode, refreshLyricsPreferWords,
  playQueue, currentQueueIndex, playMode, playModeLabel,
  showFullscreenPlayer, visualizerEnabled, volume, isMuted, playerError,
  currentPlayPlatformLabel,
  togglePause, seekTo, setVolume, toggleMute, fmtTime, playNext, playPrev, togglePlayMode,
  closeFullscreenPlayer, showQueuePanel, playTrackAt, removeFromQueue, clearQueue,
  resumeOrTogglePause, unlockAudioFromGesture, currentLocalTrackPath, tryFillCoverFromNetwork,
  showPlayerNotice,
} from '../stores/player.js'
import { cleanText, formatArtists } from '../utils/text.js'
import { resolveActiveWordIndex, getLyricLineEndTime } from '../utils/lrc.js'
import { openTagEditTrack } from '../utils/tagEdit.js'
import { showTagEditModal } from '../stores/tagEditModal.js'
import { isMobileUiContext } from '../utils/device.js'
import { isAppIconUrl } from '../utils/appIcon.js'
import SpectrumVisualizer from './SpectrumVisualizer.vue'
import CoverArt from './CoverArt.vue'
import PickPlaylistModal from './PickPlaylistModal.vue'
import { api } from '../api.js'
import { assertActiveSourceForDownload } from '../stores/downloadGuard.js'
import { buildDownloadTask, getItemQualities } from '../utils/musicPayload.js'
import { getQualityDisplay, getQualityLabel } from '../utils/quality.js'
import { useQualityMenuPosition } from '../utils/qualityMenu.js'

const lyricPanelRef = ref(null)
const lyricListRef = ref(null)
const playerRootRef = ref(null)
const isNativeFullscreen = ref(false)
const mobileScreenExpanded = ref(false)
const mobileLayoutTick = ref(0)
const pickPlaylistTrack = ref(null)
const downloadMenuOpen = ref(false)
const moreMenuOpen = ref(false)
const moreDownloadOpen = ref(false)
/** 桌面端沉浸全屏：空闲后隐藏顶栏/底栏控件 */
const chromeHidden = ref(false)
const CONTROLS_IDLE_MS = 3200
let chromeIdleTimer = null
let lastPointerStamp = 0

const showWordLyrics = computed(() => effectiveLyricDisplayMode.value === 'word')
const lyricModeBusy = ref(false)

/** 用 currentTime 在组件内重算字下标，避免 store 侧漏更新导致卡在首字 */
const liveWordIdx = computed(() => {
  if (!showWordLyrics.value) return -1
  const lines = displayLyricLines.value
  const idx = activeLyricIdx.value
  if (idx < 0 || !lines[idx]?.words?.length) return -1
  const t = Number(currentTime.value)
  if (!Number.isFinite(t)) return -1
  return resolveActiveWordIndex(
    lines[idx],
    lines[idx].words,
    t,
    getLyricLineEndTime(lines, idx),
  )
})

async function onSelectLyricMode(mode) {
  setLyricDisplayMode(mode)
  if (mode !== 'word' || lyricModeBusy.value) return
  if (hasWordLyrics.value) return
  // 强制拉取官方逐字（酷狗 KRC / 网易 YRC），避免长期停留在推算轴
  lyricModeBusy.value = true
  try {
    const ok = await refreshLyricsPreferWords()
    if (!ok && !canShowWordLyrics.value) {
      showPlayerNotice('当前曲目暂无逐字歌词，已使用逐行/推算显示', 2800)
    }
  } finally {
    lyricModeBusy.value = false
  }
}
const {
  menuStyle: downloadMenuStyle,
  positionMenu: positionDownloadMenu,
  clearMenuPosition: clearDownloadMenuPosition,
} = useQualityMenuPosition()
let mobileViewportMq = null

const isMobileViewport = computed(() => {
  mobileLayoutTick.value
  return isMobileUiContext(860)
})

const isScreenExpanded = computed(() => isNativeFullscreen.value || mobileScreenExpanded.value)

const desktopChromeAutoHide = computed(() => (
  showFullscreenPlayer.value
  && !isMobileViewport.value
  && isNativeFullscreen.value
))

function clearChromeIdleTimer() {
  if (chromeIdleTimer != null) {
    clearTimeout(chromeIdleTimer)
    chromeIdleTimer = null
  }
}

function scheduleChromeHide() {
  clearChromeIdleTimer()
  if (!desktopChromeAutoHide.value) {
    chromeHidden.value = false
    return
  }
  // 暂停、弹层打开时保持控件可见，方便操作
  if (isPaused.value || showQueuePanel.value || showTagEditModal.value || downloadMenuOpen.value || pickPlaylistTrack.value) {
    chromeHidden.value = false
    return
  }
  chromeIdleTimer = setTimeout(() => {
    if (!desktopChromeAutoHide.value) return
    if (isPaused.value || showQueuePanel.value || showTagEditModal.value || downloadMenuOpen.value || pickPlaylistTrack.value) {
      chromeHidden.value = false
      return
    }
    chromeHidden.value = true
  }, CONTROLS_IDLE_MS)
}

function revealChrome() {
  chromeHidden.value = false
  scheduleChromeHide()
}

function onFsPointerActivity() {
  if (!desktopChromeAutoHide.value) return
  const now = Date.now()
  // 节流：播放时 pointermove 很密，避免每帧重置定时器开销
  if (chromeHidden.value || now - lastPointerStamp > 120) {
    lastPointerStamp = now
    revealChrome()
  }
}

function resetChromeIdleState() {
  clearChromeIdleTimer()
  chromeHidden.value = false
  if (desktopChromeAutoHide.value) scheduleChromeHide()
}

/** @type {import('vue').Ref<(HTMLElement | null)[]>} */
const lyricLineEls = ref([])
const coverBroken = ref(false)

const isFallbackCover = computed(() => !coverUrl.value || coverBroken.value)

const volumePercent = computed(() => Math.round((volume.value || 0) * 100))

const currentLocalPath = currentLocalTrackPath

const canDownloadCurrent = computed(() => {
  const t = currentPlaying.value
  if (!t) return false
  if (currentLocalPath.value) return false
  return true
})

const currentQualities = computed(() => {
  if (!currentPlaying.value) return []
  return getItemQualities(currentPlaying.value)
})

function closeDownloadMenu() {
  downloadMenuOpen.value = false
  clearDownloadMenuPosition()
}

function closeMoreMenu() {
  moreMenuOpen.value = false
  moreDownloadOpen.value = false
}

function toggleMoreMenu() {
  moreMenuOpen.value = !moreMenuOpen.value
  moreDownloadOpen.value = false
  if (moreMenuOpen.value) closeDownloadMenu()
}

function onMoreTagEdit() {
  closeMoreMenu()
  onOpenTagEdit()
}

function onMorePickPlaylist() {
  closeMoreMenu()
  openPickCurrentPlaylist()
}

function onMoreDownload() {
  moreDownloadOpen.value = !moreDownloadOpen.value
}

function toggleDownloadMenu(event) {
  downloadMenuOpen.value = !downloadMenuOpen.value
  if (downloadMenuOpen.value) {
    closeMoreMenu()
    positionDownloadMenu(event?.currentTarget, { zIndex: 10050, preferUp: true })
  } else clearDownloadMenuPosition()
}

async function downloadCurrent(quality) {
  const item = currentPlaying.value
  if (!item || currentLocalPath.value) return
  closeDownloadMenu()
  closeMoreMenu()
  if (!(await assertActiveSourceForDownload())) return
  const source = item.source || 'kw'
  try {
    await api.download.add([buildDownloadTask(item, source, quality)])
    showPlayerNotice(`已添加下载: ${item.name || ''} (${getQualityLabel(quality, item.types)})`, 2500)
  } catch (e) {
    showPlayerNotice(e?.message || '下载失败', 3000)
  }
}

const bgStyle = computed(() => {
  if (isFallbackCover.value) return {}
  return {
    backgroundImage: `url(${coverUrl.value})`,
  }
})

watch(coverUrl, () => {
  coverBroken.value = false
})

function onCoverError() {
  if (isAppIconUrl(coverUrl.value)) return
  if (tryFillCoverFromNetwork()) return
  coverBroken.value = true
}

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
  closeDownloadMenu()
  closeMoreMenu()
}

function onFsDocClick(e) {
  if (moreMenuOpen.value && !e.target?.closest?.('[data-fs-more]')) closeMoreMenu()
  if (downloadMenuOpen.value && !e.target?.closest?.('[data-fs-dl]')) closeDownloadMenu()
}

function onOpenTagEdit() {
  if (!currentLocalPath.value) return
  openTagEditTrack(currentLocalPath.value)
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

function openPickCurrentPlaylist() {
  if (!currentPlaying.value) return
  pickPlaylistTrack.value = {
    track: {
      ...currentPlaying.value,
      source: currentPlaying.value.source,
      localPath: currentPlaying.value.localPath,
    },
    source: currentPlaying.value.source || 'local',
  }
}

function onAddedToPlaylist({ playlist, duplicate }) {
  pickPlaylistTrack.value = null
  if (duplicate) showPlayerNotice('歌曲已在歌单中', 2500)
  else showPlayerNotice(`已加入歌单：${playlist?.name || ''}`, 2500)
}

/** 手动浏览歌词后，多久自动回到当前播放行 */
const LYRIC_AUTO_RESUME_MS = 3500
const lyricUserBrowsing = ref(false)
let lyricBrowseTimer = null

function clearLyricBrowseTimer() {
  if (lyricBrowseTimer != null) {
    clearTimeout(lyricBrowseTimer)
    lyricBrowseTimer = null
  }
}

function resetLyricBrowseState() {
  clearLyricBrowseTimer()
  lyricUserBrowsing.value = false
}

/** 用户拖动/滚轮查看歌词：暂停跟随，空闲后自动回位 */
function onLyricUserInteract() {
  lyricUserBrowsing.value = true
  clearLyricBrowseTimer()
  lyricBrowseTimer = setTimeout(() => {
    lyricBrowseTimer = null
    lyricUserBrowsing.value = false
    scrollActiveLyric(true)
  }, LYRIC_AUTO_RESUME_MS)
}

function onLyricPanelPointerDown(e) {
  // 工具栏切换不打断自动跟随
  if (e.target?.closest?.('.fs-lyric-toolbar')) return
  onLyricUserInteract()
}

function scrollActiveLyric(force = false) {
  if (!force && lyricUserBrowsing.value) return
  const idx = activeLyricIdx.value
  if (idx < 0) return
  const el = lyricLineEls.value[idx]
  const panel = lyricPanelRef.value
  if (!el || !panel) return
  const panelRect = panel.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()
  const delta = (elRect.top + elRect.height / 2) - (panelRect.top + panelRect.height / 2)
  if (Math.abs(delta) < 2) return
  const nextTop = panel.scrollTop + delta
  panel.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })
}

function syncNativeFullscreenState() {
  const el = playerRootRef.value
  isNativeFullscreen.value = Boolean(
    el && (document.fullscreenElement === el || document.webkitFullscreenElement === el),
  )
}

async function exitNativeFullscreen() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    isNativeFullscreen.value = false
    return
  }
  try {
    if (document.exitFullscreen) await document.exitFullscreen()
    else if (document.webkitExitFullscreen) await document.webkitExitFullscreen()
  } catch {}
  syncNativeFullscreenState()
}

async function enterNativeFullscreen() {
  const el = playerRootRef.value
  if (!el) return false
  unlockAudioFromGesture()
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: 'hide' })
    } else if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen()
    } else if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen()
    }
  } catch {}
  syncNativeFullscreenState()
  return isNativeFullscreen.value
}

async function collapseScreenExpand() {
  mobileScreenExpanded.value = false
  await exitNativeFullscreen()
}

async function toggleNativeFullscreen() {
  if (isScreenExpanded.value) {
    await collapseScreenExpand()
    return
  }
  const entered = await enterNativeFullscreen()
  if (entered) {
    mobileScreenExpanded.value = false
  } else if (isMobileViewport.value) {
    // 部分手机浏览器无法系统全屏，仍进入无边框放大模式
    mobileScreenExpanded.value = true
  }
}

function bumpMobileLayout() {
  mobileLayoutTick.value++
}

function updateMobileViewport() {
  bumpMobileLayout()
}

function onKeydown(e) {
  if (!showFullscreenPlayer.value) return
  if (desktopChromeAutoHide.value) revealChrome()
  if (e.key === 'Escape') {
    if (isScreenExpanded.value) {
      collapseScreenExpand()
      return
    }
    if (isNativeFullscreen.value) {
      exitNativeFullscreen()
      return
    }
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
  if (lyricUserBrowsing.value) return
  await nextTick()
  scrollActiveLyric()
})

watch(displayLyricLines, async () => {
  lyricLineEls.value = []
  if (!showFullscreenPlayer.value) return
  resetLyricBrowseState()
  await nextTick()
  scrollActiveLyric(true)
})

watch(showFullscreenPlayer, async (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
  document.documentElement.classList.toggle('player-fs-open', open)
  if (open) {
    resetLyricBrowseState()
    await nextTick()
    updateMobileViewport()
    scrollActiveLyric(true)
    resetChromeIdleState()
    return
  }
  resetLyricBrowseState()
  resetChromeIdleState()
  clearChromeIdleTimer()
  chromeHidden.value = false
  mobileScreenExpanded.value = false
  closeMoreMenu()
  closeDownloadMenu()
  document.documentElement.classList.remove('player-fs-open')
  await exitNativeFullscreen()
})

watch(
  [isNativeFullscreen, isPaused, showQueuePanel, showTagEditModal, downloadMenuOpen, moreMenuOpen, pickPlaylistTrack, isMobileViewport],
  () => {
    if (!showFullscreenPlayer.value) return
    resetChromeIdleState()
  },
)

onMounted(() => {
  mobileViewportMq = window.matchMedia('(max-width: 860px)')
  updateMobileViewport()
  mobileViewportMq.addEventListener('change', updateMobileViewport)
  window.addEventListener('resize', bumpMobileLayout)
  document.addEventListener('fullscreenchange', syncNativeFullscreenState)
  document.addEventListener('webkitfullscreenchange', syncNativeFullscreenState)
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('click', onFsDocClick)
})

onUnmounted(() => {
  clearChromeIdleTimer()
  resetLyricBrowseState()
  mobileViewportMq?.removeEventListener('change', updateMobileViewport)
  window.removeEventListener('resize', bumpMobileLayout)
  document.removeEventListener('fullscreenchange', syncNativeFullscreenState)
  document.removeEventListener('webkitfullscreenchange', syncNativeFullscreenState)
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('click', onFsDocClick)
  clearDownloadMenuPosition()
  document.body.style.overflow = ''
  document.documentElement.classList.remove('player-fs-open')
  mobileScreenExpanded.value = false
  exitNativeFullscreen()
})

watch(currentPlaying, () => closeDownloadMenu())
</script>

<style scoped>
.fs-player {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  color: #fff;
  background: #0b0d12;
  overflow: hidden;
}
.fs-chrome {
  transition: opacity 0.35s ease, transform 0.35s ease;
}
.fs-player.fs-chrome-hidden {
  cursor: none;
}
.fs-player.fs-chrome-hidden .fs-chrome {
  opacity: 0;
  pointer-events: none;
}
.fs-player.fs-chrome-hidden .fs-controls {
  transform: translateY(14px);
}
.fs-player.fs-chrome-hidden .fs-top-left,
.fs-player.fs-chrome-hidden .fs-close {
  transform: translateY(-8px);
}
.fs-player.fs-chrome-hidden .fs-lyric-toolbar {
  transform: translateY(-6px);
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
  /* 与大屏主层同级，须低于试听列表等二级浮层 */
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

.fs-top-left {
  position: absolute;
  top: calc(14px + env(safe-area-inset-top, 0px));
  left: 18px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 10px;
}

.fs-screen-full {
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
  flex-shrink: 0;
}
.fs-screen-full:hover { background: rgba(0, 0, 0, 0.6); }

.fs-player:fullscreen,
.fs-player:-webkit-full-screen {
  width: 100%;
  height: 100%;
  background: #0b0d12;
}
.fs-player:fullscreen .fs-top-left,
.fs-player:-webkit-full-screen .fs-top-left,
.fs-player:fullscreen .fs-close,
.fs-player:-webkit-full-screen .fs-close {
  z-index: 5;
}

/* 打开二级浮层时，隐藏大屏角标控件，避免挡操作 */
.fs-player.fs-has-sheet .fs-close,
.fs-player.fs-has-sheet .fs-top-left {
  opacity: 0;
  pointer-events: none;
}

.fs-body {
  position: relative;
  z-index: 2;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(240px, 380px) 1fr;
  gap: 32px;
  padding: calc(64px + env(safe-area-inset-top, 0px)) 40px 16px;
  min-height: 0;
  overflow: hidden;
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
.fs-cover.disc {
  border-radius: 50%;
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
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
}
.fs-platform {
  font-style: normal;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  color: #9fdfff;
  background: rgba(64, 180, 255, 0.16);
  border: 1px solid rgba(120, 200, 255, 0.35);
}
.fs-error {
  margin-top: 8px;
  font-size: 12px;
  color: #ff8b8b;
}

.fs-lyric-wrap {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}
.fs-lyric-col {
  position: relative;
  height: min(62vh, 560px);
  overflow-x: hidden;
  overflow-y: auto;
  mask-image: linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent);
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent);
  /* 大屏/全屏仍可滚轮滚动歌词，但不显示滚动条 */
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.fs-lyric-col::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}
/* 放在歌词滚动区上方，不再挡住当前行 */
.fs-lyric-toolbar {
  position: relative;
  z-index: 20;
  flex: 0 0 auto;
  display: flex;
  justify-content: center;
  padding: 0 8px;
  margin: 0;
  pointer-events: none;
  isolation: isolate;
}
.fs-lyric-mode {
  pointer-events: auto;
  display: inline-flex;
  padding: 3px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}
.fs-lyric-mode-btn {
  appearance: none;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.62);
  font-size: 12px;
  line-height: 1;
  padding: 7px 12px;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  position: relative;
  z-index: 1;
}
.fs-lyric-mode-btn:hover:not(:disabled) {
  color: #fff;
}
.fs-lyric-mode-btn.active {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  font-weight: 600;
}
.fs-lyric-mode-btn.busy {
  opacity: 0.8;
}
.fs-lyric-mode-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.fs-lyric-list {
  position: relative;
  z-index: 0;
  padding: 18% 12px 30%;
  text-align: center;
  max-width: 100%;
  overflow-x: hidden;
}
.fs-lyric-line {
  margin: 0;
  padding: 12px 10px;
  font-size: 22px;
  line-height: 1.55;
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
  font-size: 32px;
  font-weight: 600;
}
.fs-lyric-line.is-word-mode {
  letter-spacing: 0.02em;
}
.fs-lyric-word {
  display: inline;
  color: inherit;
  transition: color 0.12s ease, text-shadow 0.12s ease;
}
/* 未唱到：略淡；已唱/当前：保持与逐行相同的亮白，避免整行发暗 */
.fs-lyric-line.active.is-word-mode .fs-lyric-word {
  color: rgba(255, 255, 255, 0.48);
}
.fs-lyric-line.active.is-word-mode .fs-lyric-word.sung {
  color: #fff;
}
.fs-lyric-line.active.is-word-mode .fs-lyric-word.current {
  color: #fff;
  text-shadow: 0 0 16px rgba(255, 255, 255, 0.45);
}
.fs-lyric-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.4);
  font-size: 18px;
}

.fs-controls {
  position: relative;
  z-index: 10;
  flex-shrink: 0;
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
  accent-color: var(--lemon);
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
.fs-slider:focus,
.fs-slider:focus-visible {
  border: none;
  box-shadow: none;
  outline: none;
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
  background: var(--lemon-gradient);
  box-shadow: none;
  cursor: pointer;
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
  background: var(--lemon-gradient);
  box-shadow: none;
  cursor: pointer;
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
  accent-color: var(--lemon);
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
.fs-vol-slider:focus,
.fs-vol-slider:focus-visible {
  border: none;
  box-shadow: none;
  outline: none;
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
  background: var(--lemon-gradient);
  box-shadow: none;
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
  background: var(--lemon-gradient);
  box-shadow: none;
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

.fs-dl-wrap {
  position: relative;
  display: inline-flex;
}
.fs-more-wrap {
  position: relative;
  display: inline-flex;
}
.fs-more-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 10px);
  z-index: 30;
  min-width: 148px;
  padding: 6px 0;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(20, 22, 30, 0.96);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}
.fs-more-item {
  display: block;
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.92);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.fs-more-item:hover:not(:disabled),
.fs-more-item:active:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}
.fs-more-item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.fs-more-qualities {
  margin: 2px 8px 8px;
  padding: 4px 0 2px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
.quality-menu {
  background: rgba(20, 22, 30, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  padding: 6px 0;
  min-width: 160px;
}
.quality-menu-title {
  padding: 6px 12px 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}
.quality-option {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.92);
  font-size: 13px;
  cursor: pointer;
}
.quality-option:hover {
  background: rgba(255, 255, 255, 0.1);
}
.quality-empty {
  padding: 10px 12px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
}

.fs-queue-mask {
  position: absolute;
  inset: 0;
  z-index: 40;
  background: rgba(0, 0, 0, 0.5);
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
  color: var(--accent);
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
  background: var(--accent-muted);
}
.fs-queue-index {
  width: 20px;
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  flex-shrink: 0;
}
.fs-queue-item.active .fs-queue-index { color: #fff; }
.fs-queue-info { flex: 1; min-width: 0; cursor: pointer; }
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
.fs-queue-actions-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.fs-queue-btn,
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
.fs-queue-btn:hover,
.fs-queue-play:hover,
.fs-queue-remove:hover {
  background: rgba(255, 255, 255, 0.16);
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
}
.fs-btn-main svg {
  width: 30px;
  height: 30px;
}
.fs-btn-main:hover { transform: scale(1.04); }

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
  .fs-meta { max-width: 100%; }
  .fs-title { font-size: 17px; margin-bottom: 4px; }
  .fs-artist { font-size: 13px; }
  .fs-lyric-wrap {
    flex: 1 1 0;
    min-height: 0;
    gap: 8px;
  }
  .fs-lyric-toolbar {
    top: auto;
  }
  .fs-lyric-col {
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
    padding: 12vh 6px 14vh;
  }
  .fs-lyric-line { font-size: 15px; padding: 7px 4px; }
  .fs-lyric-line.active { font-size: 17px; }
  .fs-spectrum {
    height: min(28vh, 180px);
    opacity: 0.55;
    bottom: 72px;
  }
  .fs-controls {
    flex: 0 0 auto;
    z-index: 10;
    padding: 4px 12px calc(10px + env(safe-area-inset-bottom, 0px));
    background: linear-gradient(to top, rgba(0, 0, 0, 0.72) 55%, transparent);
  }
  .fs-progress { margin-bottom: 6px; }
  .fs-close {
    width: 44px;
    height: 44px;
    z-index: 5;
  }
  .fs-top-left {
    z-index: 5;
  }
  .fs-screen-full {
    width: 44px;
    height: 44px;
    background: rgba(0, 0, 0, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.12);
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
    flex-wrap: nowrap;
    gap: 4px 8px;
    justify-content: space-between;
    width: 100%;
    max-width: 420px;
    margin: 0 auto;
  }
  .fs-more-menu {
    right: 0;
    left: auto;
  }
  .fs-volume {
    display: none;
  }
  /* 手机：试听列表做成居中二级矩形窗口，盖住大屏角标 */
  .fs-queue-mask {
    z-index: 40;
    align-items: center;
    justify-content: center;
    padding: calc(12px + env(safe-area-inset-top, 0px)) 14px calc(12px + env(safe-area-inset-bottom, 0px));
    background: rgba(0, 0, 0, 0.58);
  }
  .fs-queue {
    width: min(100%, 420px);
    height: auto;
    max-height: min(78dvh, 640px);
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-left: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
    overflow: hidden;
  }
  .fs-queue-header {
    padding: 14px 16px 12px;
  }
  .fs-queue-item {
    padding: 12px 12px;
    gap: 8px;
  }
  .fs-queue-name {
    font-size: 14px;
  }
  .fs-queue-meta {
    font-size: 12px;
  }
  .fs-queue-btn,
  .fs-queue-play,
  .fs-queue-remove {
    width: 36px;
    height: 36px;
  }
}

/* 矮屏竖屏：压缩封面，优先留给歌词 */
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
</style>
