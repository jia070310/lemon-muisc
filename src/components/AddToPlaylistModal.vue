<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-card modal-wide">
      <div class="modal-head">
        <h3>添加歌曲到「{{ playlistName }}」</h3>
        <button type="button" class="btn-ghost btn-sm" @click="$emit('close')">关闭</button>
      </div>

      <div class="tabs">
        <button :class="['tab', { active: tab === 'library' }]" @click="tab = 'library'">音乐库</button>
        <button :class="['tab', { active: tab === 'search' }]" @click="goSearch">搜索页</button>
        <button :class="['tab', { active: tab === 'discover' }]" @click="goDiscover">发现页</button>
      </div>

      <div v-if="tab === 'library'" class="panel">
        <ClearableInput
          v-model="keyword"
          variant="plain"
          class="search-input-wrap"
          placeholder="筛选歌曲 / 歌手 / 专辑"
        />
        <div class="list-toolbar">
          <label class="select-all">
            <input type="checkbox" :checked="allSelected" :indeterminate.prop="someSelected && !allSelected" @change="toggleAll" />
            全选当前页
          </label>
          <span class="hint">{{ filtered.length }} 首可选</span>
        </div>
        <div class="track-pick-list">
          <label v-for="song in paged" :key="song.key" class="pick-row">
            <input type="checkbox" :value="song.key" v-model="selectedKeys" />
            <div class="pick-cover">
              <CoverArt :src="song.picUrl" />
            </div>
            <div class="pick-meta">
              <div class="pick-name">{{ song.name }}</div>
              <div class="pick-tags">{{ formatTrackTags(song) }}</div>
            </div>
          </label>
          <div v-if="!filtered.length" class="empty">音乐库暂无歌曲</div>
        </div>
        <div class="pager" v-if="totalPages > 1">
          <button class="btn-ghost btn-sm" :disabled="page <= 1" @click="page--">上一页</button>
          <span>{{ page }} / {{ totalPages }}</span>
          <button class="btn-ghost btn-sm" :disabled="page >= totalPages" @click="page++">下一页</button>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn-primary" :disabled="!selectedKeys.length" @click="confirmAdd">
            添加 {{ selectedKeys.length || '' }}
          </button>
        </div>
      </div>

      <div v-else class="panel panel-hint">
        <p>已切换到「{{ tab === 'search' ? '搜索' : '发现' }}」挑选模式。</p>
        <p>在歌曲旁点击「加入歌单」即可添加，完成后可返回歌单页。</p>
        <button type="button" class="btn-ghost btn-sm" @click="tab = 'library'">返回音乐库选择</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import CoverArt from './CoverArt.vue'
import ClearableInput from './ClearableInput.vue'
import { libraryTracks, addTracksToPlaylist, startPlaylistPick } from '../stores/library.js'
import { formatTrackTags } from '../utils/format.js'

const props = defineProps({
  playlistId: { type: String, required: true },
  playlistName: { type: String, default: '歌单' },
  existingKeys: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'added'])

const router = useRouter()
const tab = ref('library')
const keyword = ref('')
const page = ref(1)
const pageSize = 20
const selectedKeys = ref([])

const existingSet = computed(() => new Set(props.existingKeys || []))

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  let list = libraryTracks.value.filter(s => !existingSet.value.has(s.key))
  if (q) {
    list = list.filter(s => [s.name, s.singer, s.album, s.genre].some(v => String(v || '').toLowerCase().includes(q)))
  }
  return list
})

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const paged = computed(() => {
  const start = (page.value - 1) * pageSize
  return filtered.value.slice(start, start + pageSize)
})

const allSelected = computed(() => paged.value.length > 0 && paged.value.every(s => selectedKeys.value.includes(s.key)))
const someSelected = computed(() => paged.value.some(s => selectedKeys.value.includes(s.key)))

watch(keyword, () => { page.value = 1 })

function toggleAll(e) {
  const keys = paged.value.map(s => s.key)
  if (e.target.checked) {
    selectedKeys.value = [...new Set([...selectedKeys.value, ...keys])]
  } else {
    selectedKeys.value = selectedKeys.value.filter(k => !keys.includes(k))
  }
}

function confirmAdd() {
  const tracks = libraryTracks.value.filter(s => selectedKeys.value.includes(s.key))
  const res = addTracksToPlaylist(props.playlistId, tracks)
  emit('added', res)
  selectedKeys.value = []
  if (res.added > 0) emit('close')
}

function goSearch() {
  startPlaylistPick(props.playlistId, props.playlistName)
  tab.value = 'search'
  router.push('/search')
  emit('close')
}

function goDiscover() {
  startPlaylistPick(props.playlistId, props.playlistName)
  tab.value = 'discover'
  router.push('/discover')
  emit('close')
}
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: 1200;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.modal-card {
  width: min(640px, 100%);
  max-height: min(86vh, 760px);
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 20px;
}
.modal-wide { width: min(720px, 100%); }
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.modal-head h3 { margin: 0; font-size: 17px; }
.tabs { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.tab {
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text-secondary);
  font-size: 13px;
}
.tab.active { color: #fff; border-color: transparent; background: var(--accent); }
.panel { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.search-input-wrap { width: 100%; margin-bottom: 10px; }
.list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--text-muted);
}
.select-all { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.track-pick-list {
  flex: 1;
  min-height: 200px;
  max-height: 380px;
  overflow: auto;
  border: 1px solid var(--border-light);
  border-radius: 10px;
}
.pick-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
}
.pick-row:last-child { border-bottom: none; }
.pick-row:hover { background: var(--bg-hover); }
.pick-cover {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}
.pick-meta { min-width: 0; flex: 1; }
.pick-name { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pick-tags { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.empty { padding: 30px; text-align: center; color: var(--text-muted); font-size: 14px; }
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 12px 0;
  font-size: 13px;
  color: var(--text-muted);
}
.modal-actions { display: flex; justify-content: flex-end; }
.panel-hint {
  padding: 20px 4px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-secondary);
}
.panel-hint p { margin: 0 0 10px; }
</style>
