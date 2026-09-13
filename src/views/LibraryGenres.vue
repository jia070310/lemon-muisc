<template>
  <div class="library-genres-page">
    <div class="page-header-row">
      <button class="btn-ghost btn-sm" @click="$router.back()">← 返回</button>
      <div class="page-title">音乐风格</div>
    </div>

    <div v-if="loading && !genres.length" class="loading card">正在加载音乐库…</div>
    <div v-else-if="!genres.length" class="empty card">
      <p>暂无风格标签</p>
      <p class="empty-hint">歌曲需包含风格（Genre）标签信息</p>
      <router-link to="/library" class="btn-ghost btn-sm">返回音乐库</router-link>
    </div>
    <section v-else class="genres-panel">
      <p class="genres-summary">共 {{ total }} 种风格</p>
      <div class="genre-grid">
        <button
          v-for="genre in genres"
          :key="genre.id"
          type="button"
          class="genre-card"
          :style="genreCardStyle(genre)"
          @click="openGenre(genre)"
        >
          <div class="genre-card-top">
            <span class="genre-card-name">{{ genre.name }}</span>
            <span class="genre-card-play" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>
            </span>
          </div>
          <div class="genre-card-meta">{{ genre.trackCount }} 首 · {{ genre.artistCount }} 位歌手</div>
        </button>
      </div>
      <div v-if="totalPages > 1" class="pager">
        <button class="btn-ghost btn-sm" :disabled="page <= 1" @click="page--">上一页</button>
        <span>{{ page }} / {{ totalPages }}</span>
        <button class="btn-ghost btn-sm" :disabled="page >= totalPages" @click="page++">下一页</button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import {
  libraryScanned,
  getGenreTheme,
  scanLibrary,
  fetchLibraryGenres,
} from '../stores/library.js'

const router = useRouter()
const genres = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 60
const loading = ref(false)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

async function loadPage() {
  loading.value = true
  try {
    const res = await fetchLibraryGenres(api, { page: page.value, limit: pageSize, sort: 'count' })
    genres.value = res.items
    total.value = res.total
  } catch {
    genres.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

watch(page, () => { loadPage() })

onMounted(async () => {
  if (!libraryScanned.value) {
    try { await scanLibrary(api, { resync: true }) } catch {}
  }
  await loadPage()
})

function openGenre(genre) {
  if (!genre?.id) return
  router.push({ path: '/library/genre', query: { id: genre.id } })
}

function genreCardStyle(genre) {
  const theme = genre.theme || getGenreTheme(genre.name)
  return {
    borderColor: theme.border,
    background: `linear-gradient(135deg, ${theme.bg} 0%, rgba(0,0,0,0.02) 100%)`,
    '--genre-accent': theme.border,
  }
}
</script>

<style scoped>
.library-genres-page { width: 100%; max-width: 100%; min-width: 0; }
.page-header-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}
.page-title { font-size: 22px; font-weight: 600; flex: 1; }
.loading, .empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted);
}
.empty-hint { margin: 8px 0 14px; font-size: 13px; }
.genres-summary {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--text-muted);
}
.genre-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.genre-card {
  text-align: left;
  padding: 14px 14px 12px;
  border-radius: 12px;
  border: 1px solid var(--border-light);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.genre-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
}
.genre-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.genre-card-name {
  font-size: 15px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.genre-card-play {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: var(--genre-accent, var(--accent));
  flex-shrink: 0;
}
.genre-card-meta {
  font-size: 12px;
  color: var(--text-muted);
}
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 18px;
  font-size: 13px;
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .page-title { font-size: 18px; }
  .genre-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
}
</style>
