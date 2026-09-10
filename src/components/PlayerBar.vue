<template>
  <div v-show="!showFullscreenPlayer" class="player-bar" ref="playerBarRef" :class="{ compact: isCompact }">
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
          <CoverArt
            :src="coverUrl"
            :round="coverStyle === 'disc'"
            :spin="coverStyle === 'disc' && !isPaused && !!currentPlaying"
            loading="eager"
            @error="onCoverError"
          />
        </div>
      </div>
      <div class="player-info">
        <span class="player-name">
          {{ currentPlaying ? `${cleanText(currentPlaying.name)} - ${formatArtists(currentPlaying.singer)}` : '未选择歌曲' }}
          <em v-if="currentPlaying && currentPlayPlatformLabel" class="player-platform">{{ currentPlayPlatformLabel }}</em>
        </span>
        <span class="player-lyric" :class="{ empty: currentPlaying && !currentLyricText && !playerError && !playerNotice, error: !!playerError, notice: !playerError && !!playerNotice }">
          {{ playerError || playerNotice || (currentPlaying ? (currentLyricText || '暂无歌词') : '未知艺术家') }}
        </span>
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
      <button
        class="ctrl-btn ctrl-main"
        :class="{ buffering: isBuffering }"
        @click="onMainPlayClick"
        :disabled="!currentPlaying"
        :title="isBuffering ? '加载中…' : (isPaused ? '播放' : '暂停')"
      >
        <svg v-if="!currentPlaying || (isPaused && !isBuffering)" viewBox="0 0 24 24" width="20" height="20" fill="#fff"><polygon points="8,5 19,12 8,19"/></svg>
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
      <button
        v-if="currentPlaying"
        class="ctrl-btn ctrl-sleep desktop-extra"
        type="button"
        :class="{ active: sleepTimerMinutes > 0 }"
        :title="sleepTimerMinutes ? `睡眠定时剩余 ${sleepTimerLeftLabel || sleepTimerMinutes + 'm'}（再点切换）` : '睡眠定时：15/30/45/60/90 分钟'"
        @click="cycleSleepTimer"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>
        </svg>
        <span v-if="sleepTimerMinutes" class="sleep-left">{{ sleepTimerLeftLabel || `${sleepTimerMinutes}m` }}</span>
        <span v-else class="sleep-hint">定时</span>
      </button>
      <button
        v-if="currentPlaying"
        class="ctrl-btn ctrl-fav desktop-extra"
        :class="{ active: isCurrentFavorite }"
        type="button"
        :title="isCurrentFavorite ? '取消收藏' : '收藏'"
        @click="onToggleFavorite"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" :fill="isCurrentFavorite ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
      </button>
      <button
        v-if="currentPlaying"
        class="ctrl-btn ctrl-playlist desktop-extra"
        type="button"
        title="加入歌单"
        @click="openPickCurrentPlaylist"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15V6"/><path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/><path d="M12 12H3"/><path d="M16 6H3"/><path d="M12 18H3"/></svg>
      </button>
      <div v-if="canDownloadCurrent" class="dl-wrap desktop-extra" data-player-dl>
        <button
          class="ctrl-btn ctrl-download"
          type="button"
          title="下载"
          @click.stop="toggleDownloadMenu($event)"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        <Teleport to="body">
          <div v-if="downloadMenuOpen" class="player-dl-quality-menu quality-menu" :style="downloadMenuStyle" data-player-dl @click.stop>
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
        </Teleport>
      </div>
      <button
        v-if="currentLocalPath && !isMobilePlayer"
        class="ctrl-btn ctrl-tag"
        type="button"
        title="标签编辑"
        @click="onOpenTagEdit"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
          <line x1="7" y1="7" x2="7.01" y2="7"/>
        </svg>
      </button>
      <button ref="queueBtnRef" class="ctrl-btn ctrl-queue desktop-extra" @click="onToggleQueuePanel" :title="`试听列表 (${playQueue.length})`" :class="{ active: showQueuePanel }">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
          <circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>
        </svg>
        <span v-if="playQueue.length" class="queue-badge">{{ playQueue.length }}</span>
      </button>

      <!-- 窄屏：定时 / 收藏 / 列表折叠到「更多」 -->
      <div
        class="player-more compact-only"
        ref="moreWrapRef"
        :class="{ open: showMorePanel }"
      >
        <button
          class="ctrl-btn ctrl-more"
          type="button"
          :class="{ active: showMorePanel || sleepTimerMinutes > 0 || showQueuePanel }"
          :title="moreBtnTitle"
          @click.stop="toggleMorePanel"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>
          </svg>
          <span v-if="playQueue.length" class="queue-badge">{{ playQueue.length > 99 ? '99+' : playQueue.length }}</span>
        </button>
        <div v-if="showMorePanel" class="more-popover card" @click.stop>
          <button
            type="button"
            class="more-item"
            :class="{ active: sleepTimerMinutes > 0 }"
            @click="cycleSleepTimer"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>
            </svg>
            <span>{{ sleepTimerMinutes ? `定时 ${sleepTimerLeftLabel || sleepTimerMinutes + 'm'}` : '睡眠定时' }}</span>
          </button>
          <button
            type="button"
            class="more-item"
            :class="{ active: isCurrentFavorite }"
            :disabled="!currentPlaying"
            @click="onToggleFavorite"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" :fill="isCurrentFavorite ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
            <span>{{ isCurrentFavorite ? '取消收藏' : '收藏' }}</span>
          </button>
          <button
            type="button"
            class="more-item"
            :disabled="!currentPlaying"
            @click="onMoreOpenPlaylist"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15V6"/><path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/><path d="M12 12H3"/><path d="M16 6H3"/><path d="M12 18H3"/></svg>
            <span>加入歌单</span>
          </button>
          <button
            v-if="canDownloadCurrent"
            type="button"
            class="more-item"
            :class="{ active: showMoreDlQuality }"
            @click="showMoreDlQuality = !showMoreDlQuality"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span>下载</span>
          </button>
          <div v-if="canDownloadCurrent && showMoreDlQuality" class="more-quality" @click.stop>
            <template v-if="currentQualities.length">
              <button
                v-for="q in currentQualities"
                :key="q"
                type="button"
                class="more-quality-option"
                @click="downloadCurrent(q)"
              >{{ getQualityDisplay(q, currentPlaying?.types) }}</button>
            </template>
            <div v-else class="more-quality-empty">该曲暂无可用音质</div>
          </div>
          <button
            v-if="currentLocalPath"
            type="button"
            class="more-item"
            @click="onMoreOpenTagEdit"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
            <span>标签编辑</span>
          </button>
          <button
            type="button"
            class="more-item"
            :class="{ active: showQueuePanel }"
            @click="onMoreOpenQueue"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
              <circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>
            </svg>
            <span>试听列表{{ playQueue.length ? ` (${playQueue.length})` : '' }}</span>
          </button>
        </div>
      </div>

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
          <div class="queue-info" @click="onPlayAt(i)">
            <div class="queue-name">{{ cleanText(entry.item.name) }}</div>
            <div class="queue-meta">{{ formatArtists(entry.item.singer) }}</div>
          </div>
          <div class="queue-actions">
            <button
              type="button"
              class="queue-action-btn queue-fav-btn"
              :class="{ active: isQueueFavorite(entry.item, entry.source) }"
              @click.stop="onToggleQueueFavorite(entry.item, entry.source)"
              :title="isQueueFavorite(entry.item, entry.source) ? '取消收藏' : '收藏'"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" :fill="isQueueFavorite(entry.item, entry.source) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
            </button>
            <button
              type="button"
              class="queue-action-btn queue-play-btn"
              :class="{ playing: i === currentQueueIndex && currentPlaying && !isPaused }"
              @click.stop="onQueuePlayClick(i)"
              :title="i === currentQueueIndex && currentPlaying && !isPaused ? '暂停' : '播放'"
            >
              <svg v-if="i === currentQueueIndex && currentPlaying && !isPaused" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="7,3 21,12 7,21"/></svg>
            </button>
            <button type="button" class="queue-action-btn queue-remove" @click.stop="removeFromQueue(i)" title="移除">×</button>
          </div>
        </div>
      </div>
      <div v-else class="queue-empty">列表为空，在搜索页点击 + 或试听添加歌曲</div>
    </div>

    <PickPlaylistModal
      v-if="pickPlaylistTrack"
      :track="pickPlaylistTrack.track"
      :source="pickPlaylistTrack.source"
      @close="pickPlaylistTrack = null"
      @added="onAddedToPlaylist"
    />
  </div>
</template>

<script setup>
import {
  currentPlaying, isPaused, isBuffering, currentTime, displayDuration, volume, isMuted,
  coverUrl, coverStyle, currentLyricText, visualizerEnabled, showFullscreenPlayer,
  playQueue, currentQueueIndex, playMode, playModeLabel, showQueuePanel, playerError, playerNotice,
  sleepTimerMinutes, sleepTimerLeftLabel, setSleepTimer, clearSleepTimer,
  currentPlayPlatformLabel,
  togglePause, stopPlay, seekTo, setVolume, toggleMute, fmtTime, initPlayer,
  playNext, playPrev, togglePlayMode, resumeOrTogglePause, unlockAudioFromGesture,
  removeFromQueue, clearQueue, playTrackAt, openFullscreenPlayer,
  currentLocalTrackPath, tryFillCoverFromNetwork, showPlayerNotice,
} from '../stores/player.js'
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { cleanText, formatArtists } from '../utils/text.js'
import SpectrumVisualizer from './SpectrumVisualizer.vue'
import CoverArt from './CoverArt.vue'
import PickPlaylistModal from './PickPlaylistModal.vue'
import { isFavorite, toggleFavorite } from '../stores/library.js'
import { openTagEditTrack } from '../utils/tagEdit.js'
import { isMobileUiContext } from '../utils/device.js'
import { api } from '../api.js'
import { assertActiveSourceForDownload } from '../stores/downloadGuard.js'
import { buildDownloadTask, getItemQualities } from '../utils/musicPayload.js'
import { getQualityDisplay, getQualityLabel } from '../utils/quality.js'
import { useQualityMenuPosition } from '../utils/qualityMenu.js'

const queuePanelRef = ref(null)
const queueBtnRef = ref(null)
const moreWrapRef = ref(null)
const playerBarRef = ref(null)
const volumeWrapRef = ref(null)
const isCompact = ref(false)
const mobileLayoutTick = ref(0)
const showVolumePanel = ref(false)
const showMorePanel = ref(false)
const showMoreDlQuality = ref(false)
const downloadMenuOpen = ref(false)
const pickPlaylistTrack = ref(null)
const {
  menuStyle: downloadMenuStyle,
  positionMenu: positionDownloadMenu,
  clearMenuPosition: clearDownloadMenuPosition,
} = useQualityMenuPosition()

function onCoverError() {
  tryFillCoverFromNetwork()
}

const isMobilePlayer = computed(() => {
  mobileLayoutTick.value
  return isMobileUiContext(768)
})

const COMPACT_ON = 980
const COMPACT_OFF = 1040

let compactObserver = null
let mobilePlayerMq = null
let volumeLeaveTimer = null

const volumePercent = computed(() => Math.round((volume.value || 0) * 100))
const volumeTip = computed(() => (isMuted.value ? '取消静音' : `音量 ${volumePercent.value}%（点击静音）`))

const isCurrentFavorite = computed(() => currentPlaying.value ? isFavorite({
  ...currentPlaying.value,
  source: currentPlaying.value.source,
  localPath: currentPlaying.value.localPath,
}) : false)

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

function toggleDownloadMenu(event) {
  downloadMenuOpen.value = !downloadMenuOpen.value
  if (downloadMenuOpen.value) {
    // 播放栏在底部：强制向上弹出，避免被底栏/预留高度算错
    positionDownloadMenu(event?.currentTarget, { preferUp: true, zIndex: 90 })
  } else {
    clearDownloadMenuPosition()
  }
}

async function downloadCurrent(quality) {
  const item = currentPlaying.value
  if (!item || currentLocalPath.value) return
  closeDownloadMenu()
  showMoreDlQuality.value = false
  showMorePanel.value = false
  if (!(await assertActiveSourceForDownload())) return
  const source = item.source || 'kw'
  try {
    await api.download.add([buildDownloadTask(item, source, quality)])
    showPlayerNotice(`已添加下载: ${item.name || ''} (${getQualityLabel(quality, item.types)})`, 2500)
  } catch (e) {
    showPlayerNotice(e?.message || '下载失败', 3000)
  }
}

function isQueueFavorite(item, source) {
  return isFavorite({ ...item, source, localPath: item.localPath })
}

function onToggleFavorite() {
  if (!currentPlaying.value) return
  toggleFavorite({
    ...currentPlaying.value,
    source: currentPlaying.value.source,
    localPath: currentPlaying.value.localPath,
  })
}

const SLEEP_STEPS = [0, 15, 30, 45, 60, 90]
function cycleSleepTimer() {
  const cur = sleepTimerMinutes.value || 0
  const idx = SLEEP_STEPS.indexOf(cur)
  const next = SLEEP_STEPS[(idx + 1) % SLEEP_STEPS.length]
  if (!next) clearSleepTimer({ silent: false })
  else setSleepTimer(next)
}

function onToggleQueueFavorite(item, source) {
  toggleFavorite({ ...item, source, localPath: item.localPath })
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

function onMoreOpenPlaylist() {
  showMorePanel.value = false
  showMoreDlQuality.value = false
  openPickCurrentPlaylist()
}

function onAddedToPlaylist({ playlist, duplicate }) {
  pickPlaylistTrack.value = null
  if (duplicate) showPlayerNotice('歌曲已在歌单中', 2500)
  else showPlayerNotice(`已加入歌单：${playlist?.name || ''}`, 2500)
}

function onOpenTagEdit() {
  if (!currentLocalPath.value) return
  openTagEditTrack(currentLocalPath.value)
}

function applyCompact(width) {
  if (isCompact.value) {
    if (width >= COMPACT_OFF) isCompact.value = false
  } else if (width <= COMPACT_ON) {
    isCompact.value = true
  }
}

function updateMobilePlayer() {
  mobileLayoutTick.value++
}

watch(isCompact, (compact) => {
  document.documentElement.style.setProperty('--player-height', compact ? '76px' : '64px')
  if (!compact) {
    showVolumePanel.value = false
    showMorePanel.value = false
    showMoreDlQuality.value = false
  }
}, { immediate: true })

watch(currentPlaying, () => {
  closeDownloadMenu()
  showMoreDlQuality.value = false
})

const moreBtnTitle = computed(() => {
  const parts = ['更多']
  if (sleepTimerMinutes.value) parts.push(`定时 ${sleepTimerLeftLabel.value || sleepTimerMinutes.value + 'm'}`)
  if (currentLocalPath.value) parts.push('可编辑标签')
  if (playQueue.value.length) parts.push(`列表 ${playQueue.value.length}`)
  return parts.join(' · ')
})

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
  mobilePlayerMq = window.matchMedia('(max-width: 768px)')
  updateMobilePlayer()
  mobilePlayerMq.addEventListener('change', updateMobilePlayer)
  window.addEventListener('orientationchange', updateMobilePlayer)
  window.visualViewport?.addEventListener('resize', updateMobilePlayer)
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
  mobilePlayerMq?.removeEventListener('change', updateMobilePlayer)
  window.removeEventListener('orientationchange', updateMobilePlayer)
  window.visualViewport?.removeEventListener('resize', updateMobilePlayer)
  compactObserver?.disconnect()
  compactObserver = null
  clearTimeout(volumeLeaveTimer)
  clearDownloadMenuPosition()
  document.documentElement.style.removeProperty('--player-height')
})

function onDocumentClick(e) {
  if (showFullscreenPlayer.value) return
  if (pickPlaylistTrack.value) return
  const t = e.target
  if (downloadMenuOpen.value && !t?.closest?.('[data-player-dl]')) closeDownloadMenu()
  if (showMorePanel.value) {
    if (!moreWrapRef.value?.contains(t)) {
      showMorePanel.value = false
      showMoreDlQuality.value = false
    }
  }
  if (showQueuePanel.value) {
    const panel = queuePanelRef.value
    const btn = queueBtnRef.value
    const more = moreWrapRef.value
    if (!panel?.contains(t) && !btn?.contains(t) && !more?.contains(t)) showQueuePanel.value = false
  }
  if (showVolumePanel.value) {
    if (!volumeWrapRef.value?.contains(t)) showVolumePanel.value = false
  }
}

function onToggleQueuePanel() {
  showQueuePanel.value = !showQueuePanel.value
  if (showQueuePanel.value) showMorePanel.value = false
}

function toggleMorePanel() {
  showMorePanel.value = !showMorePanel.value
  if (showMorePanel.value) {
    showQueuePanel.value = false
    closeDownloadMenu()
  } else {
    showMoreDlQuality.value = false
  }
}

function onMoreOpenQueue() {
  showMorePanel.value = false
  showQueuePanel.value = true
}

function onMoreOpenTagEdit() {
  showMorePanel.value = false
  onOpenTagEdit()
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

async function onMainPlayClick() {
  if (!currentPlaying.value) return
  unlockAudioFromGesture()
  try {
    await resumeOrTogglePause()
  } catch (e) {
    playerError.value = e?.message || '播放失败'
  }
}

async function onPlayNext() {
  unlockAudioFromGesture()
  try { await playNext() } catch (e) { playerError.value = e?.message || '播放失败' }
}

async function onPlayPrev() {
  unlockAudioFromGesture()
  try { await playPrev() } catch (e) { playerError.value = e?.message || '播放失败' }
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
.bar-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.cover-disc { border-radius: 50%; }
.cover-disc img { border-radius: 50%; }
.cover-card { border-radius: 8px; }
.cover-card img { border-radius: 8px; }
.cover-img.fallback {
  object-fit: contain;
  padding: 18%;
  box-sizing: border-box;
  background: var(--bg-input);
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
.player-platform {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  font-style: normal;
  font-weight: 500;
  vertical-align: 1px;
  color: var(--accent);
  background: var(--accent-muted);
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
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
.player-lyric.error {
  color: var(--error, #ef4444);
}
.player-lyric.notice {
  color: #d97706;
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
  color: #fff;
}
.ctrl-main svg {
  display: block;
}
.ctrl-main:hover:not(:disabled) { transform: scale(1.05); }
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.ctrl-queue:hover, .ctrl-queue.active {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-muted);
}
.ctrl-fav {
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: var(--radius);
  background: transparent;
  border: 1px solid var(--border);
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}
.ctrl-playlist {
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: var(--radius);
  background: transparent;
  border: 1px solid var(--border);
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}
.ctrl-playlist:hover {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-muted);
}
.dl-wrap {
  position: relative;
  flex-shrink: 0;
}
.ctrl-download {
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: var(--radius);
  background: transparent;
  border: 1px solid var(--border);
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}
.ctrl-download:hover {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-muted);
}
.quality-menu {
  background: var(--bg-elevated, var(--bg-card));
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 6px 0;
  min-width: 160px;
}
.quality-menu-title {
  padding: 6px 12px 4px;
  font-size: 12px;
  color: var(--text-muted);
}
.quality-option {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}
.quality-option:hover {
  background: var(--bg-hover);
  color: var(--accent);
}
.quality-empty {
  padding: 10px 12px;
  font-size: 13px;
  color: var(--text-muted);
}
.ctrl-sleep {
  width: auto;
  min-width: 34px;
  height: 34px;
  padding: 0 8px;
  gap: 4px;
  border-radius: var(--radius);
  background: transparent;
  border: 1px solid var(--border);
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 11px;
}
.ctrl-sleep .sleep-left { font-variant-numeric: tabular-nums; }
.ctrl-sleep .sleep-hint { font-size: 11px; opacity: 0.85; }
.ctrl-sleep:hover, .ctrl-sleep.active {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-muted);
}
.ctrl-fav svg {
  display: block;
  flex-shrink: 0;
}
.ctrl-fav:hover {
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.45);
  background: rgba(239, 68, 68, 0.1);
}
.ctrl-fav.active {
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.45);
  background: rgba(239, 68, 68, 0.1);
}
.ctrl-tag {
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: var(--radius);
  background: transparent;
  border: 1px solid var(--border);
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}
.ctrl-tag svg { display: block; flex-shrink: 0; }
.ctrl-tag:hover {
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
  appearance: none;
  accent-color: var(--lemon);
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  border: none;
  padding: 0;
  box-shadow: none;
}
.progress-slider:focus,
.progress-slider:focus-visible {
  border: none;
  box-shadow: none;
  outline: none;
}
.progress-slider::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 2px;
  background: var(--border);
}
.progress-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -4px;
  border-radius: 50%;
  background: var(--lemon-gradient);
  box-shadow: none;
  cursor: pointer;
}
.progress-slider::-moz-range-track {
  height: 4px;
  border-radius: 2px;
  background: var(--border);
  border: none;
}
.progress-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: none;
  border-radius: 50%;
  background: var(--lemon-gradient);
  box-shadow: none;
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
  background: linear-gradient(to top, var(--lemon) var(--vol-pct), var(--border) var(--vol-pct));
  pointer-events: none;
  z-index: 0;
}
.vol-slider-v {
  position: relative;
  z-index: 1;
  -webkit-appearance: none;
  appearance: slider-vertical;
  accent-color: var(--lemon);
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
  box-shadow: none;
}
.vol-slider-v:focus,
.vol-slider-v:focus-visible {
  border: none;
  box-shadow: none;
  outline: none;
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
  background: var(--lemon-gradient);
  border: 2px solid var(--bg-card);
  box-shadow: none;
  cursor: pointer;
}
.vol-slider-v::-moz-range-track {
  width: 4px;
  border-radius: 2px;
  background: transparent;
  border: none;
}
.vol-slider-v::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: 2px solid var(--bg-card);
  border-radius: 50%;
  background: var(--lemon-gradient);
  box-shadow: none;
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
.queue-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.queue-action-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: all 0.15s;
}
.queue-action-btn svg {
  display: block;
  flex-shrink: 0;
}
.queue-action-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-muted);
}
.queue-remove {
  font-size: 16px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, border-color 0.15s, background 0.15s;
}
.queue-item:hover .queue-remove { opacity: 1; }
.queue-remove:hover { color: var(--error); border-color: rgba(239, 68, 68, 0.45); background: rgba(239, 68, 68, 0.1); }

.queue-fav-btn:hover,
.queue-fav-btn.active {
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.45);
  background: rgba(239, 68, 68, 0.1);
}

.queue-play-btn:not(.playing) svg {
  margin-left: 2px;
}
.queue-play-btn:hover,
.queue-item.active .queue-play-btn {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-muted);
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
  font-size: 13px;
  line-height: 1.3;
  max-width: none;
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
  margin: 0 4px;
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
.player-bar.compact .ctrl-tag,
.player-bar.compact .player-progress,
.player-bar.compact .player-volume,
.player-bar.compact .desktop-extra {
  display: none;
}

.player-bar.compact .bar-right {
  flex: 0 0 auto;
  width: auto;
  margin-left: 0;
  gap: 4px;
}

.compact-only {
  display: none;
}

.player-bar.compact .compact-only {
  display: inline-flex;
  position: relative;
  flex-shrink: 0;
}

.player-bar.compact .ctrl-more {
  width: 38px;
  height: 38px;
  border-radius: var(--radius);
  background: transparent;
  border: 1px solid var(--border);
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  position: relative;
}

.player-bar.compact .ctrl-more:hover,
.player-bar.compact .ctrl-more.active {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-muted);
}

.player-bar.compact .more-popover {
  position: absolute;
  right: 0;
  bottom: calc(100% + 10px);
  min-width: 168px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 40;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
}

.player-bar.compact .more-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.player-bar.compact .more-item:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--accent);
}

.player-bar.compact .more-item.active {
  color: var(--accent);
  background: var(--accent-muted);
}

.player-bar.compact .more-item:disabled {
  opacity: 0.4;
  cursor: default;
}

.player-bar.compact .more-quality {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0 4px 4px;
  padding: 4px;
  border-radius: var(--radius);
  background: var(--bg-input);
}

.player-bar.compact .more-quality-option {
  display: block;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: calc(var(--radius) - 2px);
  background: transparent;
  color: var(--text);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.player-bar.compact .more-quality-option:hover {
  background: var(--bg-hover);
  color: var(--accent);
}

.player-bar.compact .more-quality-empty {
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-muted);
}

.player-bar.compact .ctrl-queue {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
}

.player-bar.compact .queue-panel {
  left: 10px;
  right: 10px;
  bottom: calc(var(--player-height) + 10px + env(safe-area-inset-bottom, 0px));
  width: auto;
  max-height: min(62dvh, 520px);
  border-radius: 16px;
}

.player-bar.compact .queue-header {
  padding: 12px 12px 10px;
  gap: 8px;
  flex-wrap: wrap;
}

.player-bar.compact .queue-list {
  flex: 1;
  min-height: 0;
  max-height: none;
  -webkit-overflow-scrolling: touch;
}

.player-bar.compact .queue-item {
  padding: 10px 10px;
  gap: 8px;
}

.player-bar.compact .queue-info {
  cursor: pointer;
}

.player-bar.compact .queue-action-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
}

.player-bar.compact .queue-remove {
  opacity: 1;
}

.player-bar.compact .queue-actions {
  gap: 4px;
}

@media (max-width: 768px) {
  .player-bar {
    left: 0;
    bottom: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom, 0px));
  }

  .player-bar .ctrl-tag {
    display: none;
  }

  .bar-spectrum {
    opacity: 0.62;
  }

  .player-bar.compact .queue-panel {
    left: 8px;
    right: 8px;
    bottom: calc(var(--player-height) + 8px + env(safe-area-inset-bottom, 0px));
    max-height: min(58dvh, 480px);
  }

  .player-bar.compact .queue-index {
    width: 18px;
    font-size: 11px;
  }

  .player-bar.compact .queue-name {
    font-size: 14px;
  }

  .player-bar.compact .queue-meta {
    font-size: 12px;
  }
}
</style>
