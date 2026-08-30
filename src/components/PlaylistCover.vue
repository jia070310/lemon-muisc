<template>
  <div
    class="playlist-cover"
    :class="[
      `size-${size}`,
      {
        'has-image': !!displayCoverUrl,
        'is-gradient': isGradientStyle,
      },
    ]"
  >
    <!-- 固定渐变风格：最新添加 / 最近播放 -->
    <div
      v-if="isGradientStyle"
      class="playlist-cover-gradient"
      :style="{ background: gradient }"
    >
      <span class="playlist-cover-icon-side" v-html="icon"></span>
      <div class="playlist-cover-meta-inline">
        <span class="playlist-cover-name">{{ name }}</span>
        <span v-if="count != null" class="playlist-cover-count">{{ count }} 首</span>
      </div>
    </div>

    <!-- 歌曲封面风格 -->
    <template v-else>
      <img
        v-if="displayCoverUrl && !coverBroken"
        :src="displayCoverUrl"
        alt=""
        loading="lazy"
        @error="coverBroken = true"
      />
      <div v-else class="playlist-cover-fallback" :style="{ background: gradient }">
        <span class="playlist-cover-icon" v-html="icon"></span>
      </div>
      <div v-if="displayCoverUrl && showMeta" class="playlist-cover-shade"></div>
      <div v-if="showMeta" class="playlist-cover-meta">
        <span class="playlist-cover-name">{{ name }}</span>
        <span v-if="count != null" class="playlist-cover-count">{{ count }} 首</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  coverUrl: { type: String, default: '' },
  coverStyle: { type: String, default: 'cover' },
  gradient: { type: String, default: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' },
  icon: { type: String, default: '♪' },
  name: { type: String, default: '' },
  count: { type: Number, default: null },
  size: { type: String, default: 'card' },
  showMeta: { type: Boolean, default: false },
})

const isGradientStyle = computed(() => props.coverStyle === 'gradient')
const displayCoverUrl = computed(() => (isGradientStyle.value ? '' : props.coverUrl))
const coverBroken = ref(false)

watch(() => props.coverUrl, () => {
  coverBroken.value = false
})
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

.playlist-cover-gradient {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: inherit;
  padding: 18px 20px;
  color: #fff;
  text-align: left;
  box-sizing: border-box;
}
.playlist-cover-icon-side {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0.35;
  line-height: 0;
}
.playlist-cover-meta-inline {
  position: relative;
  z-index: 1;
  max-width: calc(100% - 48px);
}
.is-gradient .playlist-cover-name {
  display: block;
  font-size: 20px;
  font-weight: 600;
}
.is-gradient .playlist-cover-count {
  display: block;
  margin-top: 8px;
  font-size: 13px;
  opacity: 0.88;
}

.playlist-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.playlist-cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.playlist-cover-icon { opacity: 0.35; }
.playlist-cover-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.72) 0%, rgba(0, 0, 0, 0.2) 55%, transparent 100%);
  pointer-events: none;
}
.has-image .playlist-cover-meta {
  position: absolute;
  inset: auto 0 0 0;
  padding: 16px 18px;
  color: #fff;
  z-index: 1;
}
.has-image .playlist-cover-name {
  display: block;
  font-size: 20px;
  font-weight: 600;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
}
.has-image .playlist-cover-count {
  display: block;
  margin-top: 5px;
  font-size: 13px;
  opacity: 0.92;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
:not(.has-image) .playlist-cover-meta {
  position: absolute;
  inset: auto 0 0 0;
  padding: 14px 16px;
  color: #fff;
  z-index: 1;
}
:not(.has-image) .playlist-cover-name {
  display: block;
  font-size: 20px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:not(.has-image) .playlist-cover-count {
  display: block;
  margin-top: 5px;
  font-size: 13px;
  opacity: 0.88;
}
</style>
