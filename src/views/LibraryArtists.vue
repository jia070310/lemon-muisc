<template>
  <div class="library-artists-page">
    <div class="page-header-row">
      <button class="btn-ghost btn-sm" @click="$router.back()">← 返回</button>
      <div class="page-title">歌手</div>
    </div>

    <div v-if="libraryLoading && !libraryTracks.length" class="loading card">正在加载音乐库…</div>
    <div v-else-if="!allArtists.length" class="empty card">
      <p>暂无歌手</p>
      <p class="empty-hint">歌曲需包含歌手（Artist）标签信息</p>
      <router-link to="/library" class="btn-ghost btn-sm">返回音乐库</router-link>
    </div>
    <section v-else class="artists-panel">
      <p class="artists-summary">共 {{ allArtists.length }} 位歌手</p>
      <div class="artist-grid">
        <button
          v-for="artist in pagedArtists"
          :key="artist.id"
          type="button"
          class="artist-card"
          @click="openArtist(artist)"
        >
          <div class="artist-card-cover">
            <CoverArt v-if="artist.cover" :src="artist.cover" />
            <div v-else class="artist-avatar-fallback">{{ artistInitial(artist.name) }}</div>
          </div>
          <div class="artist-card-name">{{ artist.name }}</div>
          <div class="artist-card-meta">{{ artist.trackCount }} 首 · {{ artist.albumCount }} 张专辑</div>
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
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import CoverArt from '../components/CoverArt.vue'
import {
  libraryTracks,
  libraryLoading,
  libraryScanned,
  groupArtists,
  scanLibrary,
} from '../stores/library.js'

const router = useRouter()

const allArtists = computed(() => groupArtists(libraryTracks.value))
const page = ref(1)
const pageSize = 60
const totalPages = computed(() => Math.max(1, Math.ceil(allArtists.value.length / pageSize)))
const listStart = computed(() => (page.value - 1) * pageSize)
const pagedArtists = computed(() =>
  allArtists.value.slice(listStart.value, listStart.value + pageSize)
)

onMounted(async () => {
  if (!libraryScanned.value) {
    try { await scanLibrary(api) } catch {}
  }
})

function openArtist(artist) {
  if (!artist?.id) return
  router.push({ path: '/library/artist', query: { id: artist.id } })
}

function artistInitial(name) {
  const n = String(name || '').trim()
  if (!n) return '?'
  const first = n[0]
  // 拉丁字母取首字母大写
  if (/[a-zA-Z]/.test(first)) return first.toUpperCase()
  return first
}
</script>

<style scoped>
.library-artists-page { width: 100%; max-width: 100%; min-width: 0; }
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
.artists-summary {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--text-muted);
}
.artist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 14px;
}
.artist-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 16px 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--border-light);
  background: var(--bg-card, var(--bg-elevated));
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.artist-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.14);
  border-color: var(--accent);
}
.artist-card-cover {
  width: 86px;
  height: 86px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  margin-bottom: 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
}
.artist-card-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.artist-avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-muted);
}
.artist-card-name {
  max-width: 100%;
  font-size: 15px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.artist-card-meta {
  margin-top: 4px;
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
  .artist-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .artist-card { padding: 12px 8px 10px; }
  .artist-card-cover { width: 64px; height: 64px; }
  .artist-card-name { font-size: 13.5px; }
  .artist-card-meta { font-size: 11px; }
}
</style>