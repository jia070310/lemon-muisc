<template>
  <div class="library-albums-page">
    <div class="page-header-row">
      <button class="btn-ghost btn-sm" @click="$router.back()">← 返回</button>
      <div class="page-title">全部专辑</div>
      <AppSelect
        v-model="albumSort"
        :options="albumSortOptions"
        title="专辑排序"
        size="sm"
      />
    </div>

    <div v-if="libraryLoading && !libraryTracks.length" class="loading card">正在加载音乐库…</div>
    <div v-else-if="!albums.length" class="empty card">
      <p>暂无专辑</p>
      <router-link to="/library" class="btn-ghost btn-sm">返回音乐库</router-link>
    </div>
    <section v-else class="albums-panel">
      <p class="albums-summary">共 {{ albums.length }} 张专辑</p>
      <div class="album-grid">
        <button
          v-for="album in albums"
          :key="album.id"
          type="button"
          class="album-card"
          @click="openAlbum(album)"
        >
          <div class="album-cover">
            <img
              v-if="album.cover && !brokenCovers.has(album.id)"
              :src="album.cover"
              alt=""
              loading="lazy"
              @error="markCoverBroken(album.id)"
            />
            <div v-else class="album-cover-fallback">{{ album.name.slice(0, 1) }}</div>
          </div>
          <div class="album-name" :title="album.name">{{ album.name }}</div>
          <div class="album-artist" :title="album.artist">{{ album.artist }}</div>
          <div v-if="formatAlbumTags(album)" class="album-tags">{{ formatAlbumTags(album) }}</div>
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import AppSelect from '../components/AppSelect.vue'
import { formatAlbumTags } from '../utils/format.js'
import {
  libraryTracks,
  libraryLoading,
  libraryScanned,
  groupAlbums,
  sortAlbums,
  ALBUM_SORT_OPTIONS,
  scanLibrary,
} from '../stores/library.js'

const ALBUM_SORT_KEY = 'lemon-library-album-sort'

const router = useRouter()
const albumSort = ref(localStorage.getItem(ALBUM_SORT_KEY) || 'recent')
const brokenCovers = ref(new Set())

const albumSortOptions = computed(() => ALBUM_SORT_OPTIONS.map(o => ({ value: o.id, label: o.label })))
const albums = computed(() => sortAlbums(groupAlbums(libraryTracks.value), albumSort.value))

watch(albumSort, (value) => {
  try { localStorage.setItem(ALBUM_SORT_KEY, value) } catch {}
})

onMounted(async () => {
  if (!libraryScanned.value) {
    try { await scanLibrary(api) } catch {}
  }
})

function markCoverBroken(id) {
  if (!id) return
  const next = new Set(brokenCovers.value)
  next.add(id)
  brokenCovers.value = next
}

function openAlbum(album) {
  if (!album?.id) return
  router.push({ path: '/library/album', query: { id: album.id } })
}
</script>

<style scoped>
.library-albums-page {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
.page-header-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
  min-width: 0;
}
.page-title {
  flex: 1;
  min-width: 0;
  font-size: 22px;
  font-weight: 600;
}
.loading, .empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted);
}
.albums-summary {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--text-muted);
}
.album-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
  gap: 22px 18px;
}
.album-card {
  border: none;
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}
.album-cover {
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-elevated);
  margin-bottom: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
}
.album-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.album-cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34px;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-muted);
}
.album-name {
  font-size: 16px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.album-artist {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.album-tags {
  margin-top: 5px;
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.92;
}

@media (max-width: 768px) {
  .page-header-row {
    flex-wrap: wrap;
  }
  .page-title {
    order: -1;
    width: 100%;
    font-size: 18px;
  }
  .album-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px 12px;
  }
}
</style>
