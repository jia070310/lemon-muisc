<template>
  <section class="discover-section">
    <header class="section-head">
      <h2 class="section-title">新歌首发</h2>
      <button type="button" class="section-more" @click="$emit('more')">更多 &gt;</button>
    </header>
    <div v-if="regions.length" class="section-tabs">
      <button
        v-for="r in regions"
        :key="r.id"
        type="button"
        class="chip"
        :class="{ active: region === r.id }"
        @click="$emit('update:region', r.id)"
      >{{ r.label }}</button>
    </div>
    <div class="toolbar">
      <button
        type="button"
        class="btn-ghost btn-sm play-all"
        :disabled="!pageItems.length"
        @click="$emit('play-all', pageItems)"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="7,3 21,12 7,21"/></svg>
        播放全部
      </button>
    </div>

    <div v-if="loading && !list.length" class="section-skeleton">
      <DiscoverSectionSkeleton variant="songs" />
    </div>
    <div v-else-if="unsupported" class="section-state">当前平台暂不支持新歌首发</div>
    <div v-else-if="error && !list.length" class="section-state error">{{ error }}</div>
    <div v-else-if="!list.length" class="section-state">暂无新歌</div>
    <DiscoverSwipeCarousel
      v-else
      v-model="pageIndex"
      :page-count="pageCount"
    >
      <template #default="{ page }">
        <div class="song-grid">
          <DiscoverSongItem
            v-for="(item, i) in itemsForPage(page)"
            :key="itemKey(item, page, i)"
            :item="item"
            :playing="trackKey(item) === playingKey"
            :paused="isPaused"
            :loading="loadingKey !== '' && loadingKey === trackKey(item)"
            @play="$emit('play', item)"
          />
        </div>
      </template>
    </DiscoverSwipeCarousel>
    <DiscoverSectionPager v-model="pageIndex" :page-count="pageCount" label="新歌分页" />
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import DiscoverSectionPager from './DiscoverSectionPager.vue'
import DiscoverSectionSkeleton from './DiscoverSectionSkeleton.vue'
import DiscoverSongItem from './DiscoverSongItem.vue'
import DiscoverSwipeCarousel from './DiscoverSwipeCarousel.vue'
import { currentPlaying, getTrackKey, isPaused, loadingPlay } from '../../stores/player.js'

const props = defineProps({
  list: { type: Array, default: () => [] },
  loading: Boolean,
  error: { type: String, default: '' },
  unsupported: Boolean,
  region: { type: String, default: '' },
  regions: { type: Array, default: () => [] },
  pageSize: { type: Number, default: 9 },
})
defineEmits(['play', 'play-all', 'more', 'update:region'])

const pageIndex = ref(0)
const pageCount = computed(() => Math.max(1, Math.ceil(props.list.length / props.pageSize)))
const pageItems = computed(() => itemsForPage(pageIndex.value))
const playingKey = computed(() => {
  const cur = currentPlaying.value
  return cur ? getTrackKey(cur, cur.source) : ''
})
const loadingKey = computed(() => {
  if (loadingPlay.value == null || loadingPlay.value === '') return ''
  const id = String(loadingPlay.value)
  const hit = props.list.find((item) => String(item.id || item.songmid || item.hash || '') === id)
  return hit ? trackKey(hit) : id
})

function itemsForPage(page) {
  const start = page * props.pageSize
  return props.list.slice(start, start + props.pageSize)
}

function trackKey(item) {
  return getTrackKey(item, item?.source || '')
}

function itemKey(item, page, i) {
  return `${page}:${item.source || ''}:${item.songmid || item.hash || item.songId || item.id || i}`
}

watch(() => [props.list, props.region], () => { pageIndex.value = 0 })
watch(pageCount, (n) => {
  if (pageIndex.value >= n) pageIndex.value = Math.max(0, n - 1)
})
</script>

<style scoped>
.discover-section { margin-top: 28px; }
.section-head {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  margin-bottom: 10px;
}
.section-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}
.section-more {
  position: absolute;
  right: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
}
.section-more:hover { color: var(--accent); }
.section-tabs {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.chip {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
}
.chip.active {
  color: var(--accent);
  font-weight: 600;
  background: var(--accent-muted);
}
.toolbar { margin-bottom: 10px; }
.play-all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.section-state {
  text-align: center;
  color: var(--text-muted);
  padding: 24px 8px;
  font-size: 13px;
}
.section-state.error { color: var(--error); }
.song-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px 14px;
}

@media (max-width: 900px) {
  .song-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .song-grid { grid-template-columns: 1fr; }
  .section-title { font-size: 18px; }
}
</style>
