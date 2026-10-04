<template>
  <div class="discover-more-page">
    <div class="more-toolbar">
      <button type="button" class="btn-ghost btn-sm" @click="goBack">← 返回发现</button>
      <h1 class="more-title">歌单广场</h1>
    </div>

    <div class="more-filters card">
      <div class="source-tabs">
        <button
          v-for="(info, key) in sources"
          :key="key"
          type="button"
          class="tab"
          :class="{ active: source === key }"
          @click="onSourceChange(key)"
        >{{ platformLabel(key, info) }}</button>
      </div>
      <div class="chip-row">
        <button
          v-for="opt in recommendSortOptions"
          :key="opt.id"
          type="button"
          class="chip"
          :class="{ active: sort === opt.id }"
          @click="changeSort(opt.id)"
        >{{ opt.label }}</button>
      </div>
    </div>

    <div v-if="loading && !list.length" class="state">加载中...</div>
    <div v-else-if="error && !list.length" class="state error">{{ error }}</div>
    <div v-else-if="!list.length" class="state">暂无歌单</div>
    <div v-else class="grid">
      <button
        v-for="item in list"
        :key="`${item.source}-${item.id}`"
        type="button"
        class="card-item"
        @click="openPlaylist(item)"
      >
        <div class="cover"><CoverArt :src="item.img" /></div>
        <div class="name">{{ cleanText(item.name) }}</div>
        <div class="sub">
          {{ cleanText(item.author) || '未知作者' }}
          <template v-if="item.total"> · {{ item.total }} 首</template>
        </div>
      </button>
    </div>

    <div v-if="list.length || totalPages > 1" class="pager">
      <button
        type="button"
        class="btn-ghost btn-sm"
        :disabled="page <= 1 || loading"
        @click="goPage(page - 1)"
      >上一页</button>
      <span class="page-info">第 {{ page }} / {{ totalPages }} 页</span>
      <button
        type="button"
        class="btn-ghost btn-sm"
        :disabled="!canNext || loading"
        @click="goPage(page + 1)"
      >下一页</button>
    </div>
  </div>
</template>

<script setup>
defineOptions({ name: 'DiscoverPlaylists' })
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CoverArt from '../components/CoverArt.vue'
import { api } from '../api.js'
import { discoverState, loadDiscoverSources, recommendSortOptions } from '../stores/discover.js'
import { platformLabel } from '../utils/platforms.js'
import { cleanText } from '../utils/text.js'

/** 与 5 列网格对齐：每页 30 张（约 6 行），小屏仍按页拉取 */
const PAGE_SIZE = 30

const route = useRoute()
const router = useRouter()
const sources = ref({})
const source = ref(String(route.query.source || discoverState.activeSource || 'tx'))
const sort = ref(String(route.query.sort || 'new'))
const list = ref([])
const page = ref(1)
const total = ref(0)
const limit = ref(PAGE_SIZE)
const hasMore = ref(false)
const loading = ref(false)
const error = ref('')

const totalPages = computed(() => {
  if (total.value > 0) return Math.max(1, Math.ceil(total.value / (limit.value || PAGE_SIZE)))
  // 无总数时：当前页有数据且还能翻 → 至少显示到下一页
  if (hasMore.value) return page.value + 1
  return Math.max(1, page.value)
})

const canNext = computed(() => {
  if (total.value > 0) return page.value < totalPages.value
  return hasMore.value
})

function goBack() {
  router.push('/discover')
}

function openPlaylist(item) {
  discoverState.activeSource = item.source || source.value
  discoverState.url = item.id
  discoverState.viewMode = 'recommend'
  router.push({ path: '/discover', query: { openPlaylist: item.id, source: discoverState.activeSource } })
}

async function onSourceChange(key) {
  if (source.value === key) return
  source.value = key
  page.value = 1
  list.value = []
  await load()
}

async function changeSort(id) {
  if (sort.value === id) return
  sort.value = id
  page.value = 1
  list.value = []
  await load()
}

async function goPage(next) {
  if (next < 1 || loading.value) return
  if (next > page.value && !canNext.value) return
  page.value = next
  await load()
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.playlist.recommend(source.value, sort.value, page.value, PAGE_SIZE)
    const data = res.data || {}
    const chunk = data.list || []
    list.value = chunk
    limit.value = Number(data.limit) || PAGE_SIZE
    total.value = Number(data.total) || 0
    if (typeof data.hasMore === 'boolean') {
      hasMore.value = data.hasMore
    } else if (total.value > 0) {
      hasMore.value = page.value * limit.value < total.value
    } else {
      hasMore.value = chunk.length >= (limit.value || PAGE_SIZE)
    }
    // 空页回退：无总数且翻过头了
    if (!chunk.length && page.value > 1) {
      hasMore.value = false
      page.value -= 1
      await load()
    }
  } catch (e) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadDiscoverSources(api)
  sources.value = discoverState.sources
  if (!sources.value[source.value]) {
    source.value = Object.keys(sources.value)[0] || source.value
  }
  await load()
})
</script>

<style scoped>
.discover-more-page { padding-bottom: 24px; }
.more-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.more-title { margin: 0; font-size: 20px; font-weight: 700; }
.more-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  margin-bottom: 16px;
}
.source-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.tab {
  padding: 5px 14px;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  border: 1px solid var(--border);
  cursor: pointer;
}
.tab:hover { background: var(--bg-hover); color: var(--text); }
.tab.active {
  color: #fff;
  background: var(--accent);
  border-color: var(--accent);
}
.chip-row { display: flex; gap: 8px; flex-wrap: wrap; }
.chip {
  border: none;
  background: transparent;
  color: var(--text-muted);
  padding: 4px 12px;
  border-radius: 999px;
  cursor: pointer;
}
.chip.active { color: var(--accent); background: var(--accent-muted); font-weight: 600; }
.state { text-align: center; padding: 40px 8px; color: var(--text-muted); }
.state.error { color: var(--error); }
.grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px 12px;
}
.card-item {
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}
.cover {
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-input);
  margin-bottom: 8px;
}
.cover :deep(.cover-art) { width: 100%; height: 100%; }
.name, .sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.name { font-size: 13px; font-weight: 500; }
.sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.pager {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
}
.page-info { font-size: 13px; color: var(--text-muted); }
@media (max-width: 960px) { .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (max-width: 720px) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 480px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
