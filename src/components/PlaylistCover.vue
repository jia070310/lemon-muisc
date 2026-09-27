<template>
  <div
    class="playlist-cover"
    :class="[
      `size-${size}`,
      {
        'has-image': hasImage,
        'is-gradient': isGradientStyle,
        'is-compact': size === 'compact',
      },
    ]"
  >
    <!-- 小卡片：封面在上、文字在下（横向滑动用） -->
    <template v-if="size === 'compact'">
      <div
        class="playlist-compact-cover"
        :class="{ 'is-gradient': isGradientStyle }"
      >
        <div
          v-if="isGradientStyle"
          class="playlist-compact-gradient"
          :style="{ background: gradient }"
        >
          <span class="playlist-compact-icon" v-html="icon"></span>
        </div>
        <template v-else>
          <CoverArt :src="primaryCoverUrl" />
        </template>
      </div>
      <div class="playlist-compact-meta">
        <span class="playlist-compact-name" :title="name">{{ name }}</span>
        <span v-if="count != null" class="playlist-compact-count">{{ count }} 首</span>
      </div>
    </template>

    <!-- 固定渐变风格 -->
    <div
      v-else-if="isGradientStyle"
      class="playlist-cover-gradient"
      :style="{ background: gradient }"
    >
      <span class="playlist-cover-icon-side" v-html="icon"></span>
      <div v-if="showMeta" class="playlist-cover-meta">
        <span class="playlist-cover-name" :title="name">{{ name }}</span>
        <span v-if="count != null" class="playlist-cover-count">{{ count }} 首</span>
      </div>
    </div>

    <!-- 歌曲封面：多图拼贴 / 单图居中；标题在封面内左下角 -->
    <template v-else>
      <div
        v-if="displayUrls.length"
        class="playlist-cover-mosaic"
        :class="`tiles-${Math.min(displayUrls.length, 4)}`"
      >
        <template v-if="displayUrls.length === 1">
          <img
            class="mosaic-blur"
            :src="playableUrls[0]"
            alt=""
            loading="lazy"
            referrerpolicy="no-referrer"
            draggable="false"
            aria-hidden="true"
          />
          <div class="mosaic-solo">
            <CoverArt :src="displayUrls[0]" />
          </div>
        </template>
        <template v-else>
          <div
            v-for="(url, i) in displayUrls.slice(0, 4)"
            :key="`${i}-${url}`"
            class="mosaic-cell"
          >
            <CoverArt :src="url" />
          </div>
        </template>
      </div>
      <CoverArt v-else :src="primaryCoverUrl" />
      <div v-if="hasImage && showMeta" class="playlist-cover-shade"></div>
      <div v-if="showMeta" class="playlist-cover-meta">
        <span class="playlist-cover-name" :title="name">{{ name }}</span>
        <span v-if="count != null" class="playlist-cover-count">{{ count }} 首</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import CoverArt from './CoverArt.vue'
import { toPlayableCoverUrl } from '../utils/coverDisplay.js'

const props = defineProps({
  coverUrl: { type: String, default: '' },
  /** 多封面拼贴（最多取 4）；优先于单 coverUrl */
  coverUrls: { type: Array, default: () => [] },
  coverStyle: { type: String, default: 'cover' },
  gradient: { type: String, default: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' },
  icon: { type: String, default: '♪' },
  name: { type: String, default: '' },
  count: { type: Number, default: null },
  size: { type: String, default: 'card' },
  showMeta: { type: Boolean, default: false },
})

const isGradientStyle = computed(() => props.coverStyle === 'gradient')

const displayUrls = computed(() => {
  if (isGradientStyle.value) return []
  const fromList = (Array.isArray(props.coverUrls) ? props.coverUrls : [])
    .map((u) => String(u || '').trim())
    .filter(Boolean)
  if (fromList.length) {
    const seen = new Set()
    const unique = []
    for (const u of fromList) {
      if (seen.has(u)) continue
      seen.add(u)
      unique.push(u)
      if (unique.length >= 4) break
    }
    return unique
  }
  const single = String(props.coverUrl || '').trim()
  return single ? [single] : []
})

const primaryCoverUrl = computed(() => displayUrls.value[0] || '')
const hasImage = computed(() => displayUrls.value.length > 0)
const playableUrls = computed(() => displayUrls.value.map((u) => toPlayableCoverUrl(u)))
</script>

<style scoped>
.playlist-cover {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  background: var(--bg-elevated);
  width: 100%;
}
.size-card { aspect-ratio: 16 / 9; min-height: 112px; }
.size-lg { width: 200px; height: 200px; border-radius: 14px; flex-shrink: 0; }
.size-row { width: 100%; aspect-ratio: 16 / 9; min-height: 112px; }
.size-compact {
  width: 112px;
  flex-shrink: 0;
  aspect-ratio: auto;
  min-height: 0;
  border-radius: 12px;
  background: transparent;
  overflow: visible;
}
.playlist-cover:not(.size-compact) > :deep(.cover-art) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.playlist-cover:not(.size-compact) > :deep(.cover-art-photo) {
  object-fit: cover;
  object-position: center center;
}

.playlist-cover-mosaic {
  position: absolute;
  inset: 0;
  display: grid;
  gap: 1px;
  background: rgba(0, 0, 0, 0.35);
  overflow: hidden;
}
.playlist-cover-mosaic.tiles-1 {
  display: block;
  background: var(--bg-elevated);
}
.playlist-cover-mosaic.tiles-2 {
  grid-template-columns: 1fr 1fr;
}
.playlist-cover-mosaic.tiles-3 {
  grid-template-columns: 1.15fr 1fr;
  grid-template-rows: 1fr 1fr;
}
.playlist-cover-mosaic.tiles-3 .mosaic-cell:first-child {
  grid-row: 1 / span 2;
}
.playlist-cover-mosaic.tiles-4 {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
}

.mosaic-blur {
  position: absolute;
  inset: -18%;
  width: 136%;
  height: 136%;
  object-fit: cover;
  object-position: center center;
  filter: blur(24px) saturate(1.08);
  transform: scale(1.1);
  opacity: 0.88;
  pointer-events: none;
  user-select: none;
}
.mosaic-solo {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.size-card .mosaic-solo,
.size-row .mosaic-solo {
  width: auto;
  height: 100%;
  aspect-ratio: 1 / 1;
  left: 50%;
  right: auto;
  transform: translateX(-50%);
  border-radius: 2px;
  overflow: hidden;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}
.size-lg .mosaic-solo {
  inset: 0;
  width: 100%;
  height: 100%;
  transform: none;
  box-shadow: none;
}
.mosaic-solo :deep(.cover-art) {
  width: 100%;
  height: 100%;
  background: transparent;
}
.mosaic-solo :deep(.cover-art-photo) {
  object-fit: cover;
  object-position: center center;
}
.mosaic-solo :deep(.cover-art:has(.cover-art-photo) .cover-art-icon) {
  visibility: hidden;
}

.mosaic-cell {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-elevated);
}
.mosaic-cell :deep(.cover-art) {
  width: 100%;
  height: 100%;
}
.mosaic-cell :deep(.cover-art-photo) {
  object-fit: cover;
  object-position: center center;
}

.playlist-compact-cover {
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-elevated);
}
.playlist-compact-cover :deep(.cover-art) {
  width: 100%;
  height: 100%;
}
.playlist-compact-cover :deep(.cover-art-photo) {
  object-fit: cover;
  object-position: center center;
}
.playlist-compact-gradient {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.playlist-compact-icon {
  opacity: 0.42;
  line-height: 0;
  transform: scale(0.85);
}
.playlist-compact-meta {
  margin-top: 8px;
  min-width: 0;
}
.playlist-compact-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.playlist-compact-count {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-muted);
}

.playlist-cover-gradient {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: inherit;
  color: #fff;
  box-sizing: border-box;
}
.playlist-cover-icon-side {
  position: absolute;
  right: 14px;
  top: 14px;
  opacity: 0.35;
  line-height: 0;
}
.playlist-cover-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playlist-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center center;
  display: block;
}
.playlist-cover-shade {
  position: absolute;
  inset: 0;
  z-index: 2;
  /* 底部遮罩，方便左下角标题可读 */
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.72) 0%,
    rgba(0, 0, 0, 0.28) 42%,
    transparent 72%
  );
  pointer-events: none;
}
.playlist-cover-meta {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  top: auto;
  padding: 14px 16px;
  color: #fff;
  z-index: 3;
  box-sizing: border-box;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  pointer-events: none;
}
.is-gradient .playlist-cover-meta {
  max-width: calc(100% - 48px);
}
.playlist-cover-meta .playlist-cover-name {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
}
.playlist-cover-meta .playlist-cover-count {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  opacity: 0.92;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
.is-gradient .playlist-cover-meta .playlist-cover-name {
  text-shadow: none;
}
.is-gradient .playlist-cover-meta .playlist-cover-count {
  text-shadow: none;
  opacity: 0.88;
}
</style>
