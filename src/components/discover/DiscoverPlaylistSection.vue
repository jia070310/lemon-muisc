<template>
  <section class="discover-section">
    <header class="section-head">
      <h2 class="section-title">歌单</h2>
      <button type="button" class="section-more" @click="$emit('more')">更多 &gt;</button>
    </header>
    <div class="section-tabs">
      <button
        v-for="opt in sortOptions"
        :key="opt.id"
        type="button"
        class="chip"
        :class="{ active: sort === opt.id }"
        @click="$emit('update:sort', opt.id)"
      >{{ opt.label }}</button>
    </div>

    <div v-if="loading && !list.length" class="section-skeleton">
      <DiscoverSectionSkeleton variant="playlists" />
    </div>
    <div v-else-if="error && !list.length" class="section-state error">{{ error }}</div>
    <div v-else-if="!list.length" class="section-state">暂无推荐歌单</div>
    <DiscoverSwipeCarousel
      v-else
      v-model="pageIndex"
      :page-count="pageCount"
    >
      <template #default="{ page }">
        <div class="playlist-grid">
          <button
            v-for="item in itemsForPage(page)"
            :key="`${item.source}-${item.id}`"
            type="button"
            class="playlist-card"
            @click="$emit('open', item)"
          >
            <div class="cover-wrap">
              <CoverArt :src="item.img" />
            </div>
            <div class="meta">
              <div class="name" :title="cleanText(item.name)">{{ cleanText(item.name) }}</div>
              <div class="author" :title="authorLine(item)">{{ authorLine(item) }}</div>
            </div>
          </button>
        </div>
      </template>
    </DiscoverSwipeCarousel>
    <DiscoverSectionPager v-model="pageIndex" :page-count="pageCount" label="歌单分页" />
  </section>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import CoverArt from '../CoverArt.vue'
import DiscoverSectionPager from './DiscoverSectionPager.vue'
import DiscoverSectionSkeleton from './DiscoverSectionSkeleton.vue'
import DiscoverSwipeCarousel from './DiscoverSwipeCarousel.vue'
import { cleanText } from '../../utils/text.js'

const props = defineProps({
  list: { type: Array, default: () => [] },
  loading: Boolean,
  error: { type: String, default: '' },
  sort: { type: String, default: 'new' },
  sortOptions: { type: Array, default: () => [] },
  hasMore: Boolean,
})
const emit = defineEmits(['open', 'more', 'update:sort', 'need-more'])

/** 按网格列数 × 2 行：一屏两行，超出翻页 */
function calcPageSize() {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1200
  if (w <= 480) return 6 // 2×3
  if (w <= 720) return 6 // 3×2
  if (w <= 960) return 8 // 4×2
  return 10 // 5×2
}

const pageSize = ref(calcPageSize())
const pageIndex = ref(0)
const pageCount = computed(() => Math.max(1, Math.ceil(props.list.length / pageSize.value) || 1))

function itemsForPage(page) {
  const start = page * pageSize.value
  return props.list.slice(start, start + pageSize.value)
}

function authorLine(item) {
  const author = cleanText(item.author) || '未知作者'
  return item.total ? `${author} · ${item.total} 首` : author
}

function onResize() {
  const next = calcPageSize()
  if (next === pageSize.value) return
  pageSize.value = next
  if (pageIndex.value >= pageCount.value) {
    pageIndex.value = Math.max(0, pageCount.value - 1)
  }
}

watch(() => [props.list, props.sort], () => { pageIndex.value = 0 })
watch(pageCount, (n) => {
  if (pageIndex.value >= n) pageIndex.value = Math.max(0, n - 1)
})
watch(pageIndex, (idx) => {
  const nearEnd = (idx + 1) * pageSize.value >= props.list.length - pageSize.value
  if (nearEnd && props.hasMore) emit('need-more')
})

onMounted(() => {
  window.addEventListener('resize', onResize)
  onResize()
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
})
</script>

<style scoped>
.discover-section { margin-top: 22px; }
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
  text-align: center;
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
  margin-bottom: 14px;
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
.section-state {
  text-align: center;
  color: var(--text-muted);
  padding: 24px 8px;
  font-size: 13px;
}
.section-state.error { color: var(--error); }
.playlist-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px 12px;
}
.playlist-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}
.cover-wrap {
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-input);
}
.cover-wrap :deep(.cover-art) { width: 100%; height: 100%; }
.meta { min-width: 0; }
.name, .author {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name { font-size: 13px; font-weight: 500; color: var(--text-primary); }
.author { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

@media (max-width: 960px) {
  .playlist-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  .playlist-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .section-title { font-size: 18px; }
}
@media (max-width: 480px) {
  .playlist-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
