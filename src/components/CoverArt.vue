<template>
  <div class="cover-art" :class="{ round, spinning: spin && showPhoto, slow }">
    <img class="cover-art-icon" :src="APP_ICON_URL" alt="" draggable="false" />
    <img
      v-if="showPhoto"
      :src="resolvedSrc"
      class="cover-art-photo"
      alt=""
      :loading="loading"
      referrerpolicy="no-referrer"
      draggable="false"
      @error="onPhotoError"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { APP_ICON_URL, isAppIconUrl } from '../utils/appIcon.js'
import { toPlayableCoverUrl } from '../utils/coverDisplay.js'

const props = defineProps({
  src: { type: String, default: '' },
  round: { type: Boolean, default: false },
  spin: { type: Boolean, default: false },
  slow: { type: Boolean, default: false },
  loading: { type: String, default: 'lazy' },
})

const emit = defineEmits(['error'])
const broken = ref(false)

const resolvedSrc = computed(() => toPlayableCoverUrl(props.src))
const showPhoto = computed(() => {
  const url = resolvedSrc.value
  return Boolean(url) && !broken.value && !isAppIconUrl(url)
})

watch(() => props.src, () => {
  broken.value = false
})

function onPhotoError() {
  broken.value = true
  emit('error')
}
</script>

<style scoped>
.cover-art {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg-elevated, rgba(255, 255, 255, 0.06));
}
.cover-art.round,
.cover-art.round .cover-art-icon,
.cover-art.round .cover-art-photo {
  border-radius: 50%;
}
.cover-art-icon,
.cover-art-photo {
  display: block;
  width: 100%;
  height: 100%;
}
.cover-art-icon {
  position: absolute;
  inset: 0;
  object-fit: contain;
  padding: 18%;
  box-sizing: border-box;
  pointer-events: none;
}
.cover-art-photo {
  position: relative;
  z-index: 1;
  object-fit: cover;
}
.cover-art.spinning .cover-art-photo {
  animation: cover-art-spin 4s linear infinite;
}
.cover-art.spinning.slow .cover-art-photo {
  animation-duration: 16s;
}
@keyframes cover-art-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
