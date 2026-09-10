<template>
  <div
    class="discover-song-item"
    :class="{ active: playing, hovered }"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @dblclick="$emit('play')"
  >
    <span v-if="index != null" class="song-index">{{ index }}</span>
    <label v-if="selectable" class="song-check" @click.stop>
      <input type="checkbox" :checked="selected" @change="$emit('toggle-select')" />
    </label>
    <button
      type="button"
      class="song-cover-btn"
      :class="{ rippling, disabled: coverDisabled }"
      :disabled="coverDisabled"
      :title="playing && !paused ? '暂停' : '播放'"
      @click.stop="onCoverClick"
    >
      <div class="song-cover-media">
        <CoverArt :src="coverSrc" :loading="eagerCover ? 'eager' : 'lazy'" />
      </div>
      <span class="song-cover-ripple" aria-hidden="true" />
      <span v-if="showOverlay" class="song-play-overlay">
        <svg v-if="loading" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" class="spin" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke-dasharray="50" stroke-dashoffset="20"/>
        </svg>
        <svg v-else-if="showPauseIcon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <rect x="6" y="5" width="4" height="14" rx="1"/>
          <rect x="14" y="5" width="4" height="14" rx="1"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <polygon points="7,3 21,12 7,21"/>
        </svg>
      </span>
    </button>
    <div class="song-meta" @click="$emit('play')">
      <div class="song-name" :title="cleanText(item.name)">{{ cleanText(item.name) }}</div>
      <div class="song-sub" :title="subText">{{ subText }}</div>
    </div>
    <span v-if="showTime" class="song-time">{{ item.interval || '' }}</span>
    <div v-if="$slots.actions" class="song-actions" @click.stop>
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import CoverArt from '../CoverArt.vue'
import { cleanText, formatArtists } from '../../utils/text.js'

const props = defineProps({
  item: { type: Object, required: true },
  playing: Boolean,
  paused: Boolean,
  loading: Boolean,
  selected: Boolean,
  selectable: Boolean,
  showTime: { type: Boolean, default: true },
  showAlbum: Boolean,
  index: { type: Number, default: null },
  coverDisabled: Boolean,
  /** 首屏曲目封面优先加载，避免等整表滚完才出图 */
  eagerCover: Boolean,
})

const emit = defineEmits(['play', 'toggle-select'])

const hovered = ref(false)
const rippling = ref(false)
const pendingPause = ref(false)
const isNarrow = ref(false)
let rippleTimer = 0
let mql

const coverSrc = computed(() => props.item?.picUrl || props.item?.img || '')
const subText = computed(() => {
  const singer = formatArtists(props.item?.singer) || cleanText(props.item?.singer) || '未知歌手'
  if (!props.showAlbum) return singer
  const album = cleanText(props.item?.album || props.item?.albumName || '')
  return album ? `${singer} · ${album}` : singer
})
const showOverlay = computed(() => (
  isNarrow.value || hovered.value || props.playing || props.loading || rippling.value
))
const showPauseIcon = computed(() => {
  if (pendingPause.value) return true
  return props.playing && !props.paused
})

function syncNarrow() {
  isNarrow.value = Boolean(mql?.matches)
}

function onCoverClick() {
  rippling.value = true
  clearTimeout(rippleTimer)
  rippleTimer = window.setTimeout(() => { rippling.value = false }, 560)
  if (props.playing && !props.paused) pendingPause.value = false
  else pendingPause.value = true
  emit('play')
  window.setTimeout(() => { pendingPause.value = false }, 800)
}

onMounted(() => {
  mql = window.matchMedia('(max-width: 768px)')
  syncNarrow()
  mql.addEventListener?.('change', syncNarrow)
})
onUnmounted(() => {
  clearTimeout(rippleTimer)
  mql?.removeEventListener?.('change', syncNarrow)
})
</script>

<style scoped>
.discover-song-item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 12px;
  transition: background 0.15s ease;
}
.discover-song-item:hover,
.discover-song-item.active,
.discover-song-item.hovered {
  background: var(--bg-hover);
}
.song-index {
  width: 24px;
  flex-shrink: 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.song-check {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.song-cover-btn {
  position: relative;
  width: 48px;
  height: 48px;
  padding: 0;
  border: none;
  border-radius: 10px;
  overflow: visible;
  flex-shrink: 0;
  background: var(--bg-elevated, var(--bg-input));
  cursor: pointer;
}
.song-cover-btn.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.song-cover-media {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  background: var(--bg-elevated, var(--bg-input));
}
.song-cover-media :deep(.cover-art) {
  width: 100%;
  height: 100%;
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
  animation: discover-song-cover-ripple 0.65s cubic-bezier(0.2, 0.7, 0.2, 1);
}
@keyframes discover-song-cover-ripple {
  0% {
    transform: translate(-50%, -50%) scale(0.35);
    opacity: 0.95;
  }
  100% {
    transform: translate(-50%, -50%) scale(2.2);
    opacity: 0;
  }
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
  border-radius: inherit;
  transition: background 0.18s ease;
  /* 不用 backdrop-filter：发现页封面多，叠加滤镜易导致 GPU/页面崩溃 */
}
.song-play-overlay svg {
  transition: transform 0.22s ease, opacity 0.18s ease;
}
.song-cover-btn.rippling .song-play-overlay {
  background: color-mix(in srgb, var(--accent) 48%, rgba(0, 0, 0, 0.26));
}
.song-cover-btn.rippling .song-play-overlay svg {
  transform: scale(1.28);
}
.spin { animation: discover-song-spin 0.8s linear infinite; }
@keyframes discover-song-spin {
  to { transform: rotate(360deg); }
}
.song-meta {
  min-width: 0;
  flex: 1;
  cursor: pointer;
}
.song-name,
.song-sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.song-name {
  font-size: 13px;
  font-weight: 500;
}
.song-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}
.song-time {
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.song-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .discover-song-item { padding: 8px; gap: 10px; }
  .song-cover-btn { width: 44px; height: 44px; border-radius: 8px; }
  .song-play-overlay { opacity: 1; }
}
</style>
