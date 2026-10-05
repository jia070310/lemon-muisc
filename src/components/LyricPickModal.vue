<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="!busy && $emit('close')" @keydown.esc.prevent="!busy && $emit('close')">
      <div class="modal-card" role="dialog" aria-labelledby="lyric-pick-title" aria-modal="true">
        <div class="modal-head">
          <div>
            <h3 id="lyric-pick-title">修改歌词</h3>
            <p class="modal-sub">从网络搜索并选择正确歌词应用到当前播放</p>
          </div>
          <button type="button" class="btn-ghost btn-sm" :disabled="busy" @click="$emit('close')">关闭</button>
        </div>

        <div class="search-bar">
          <label class="search-field">
            <span>歌手</span>
            <ClearableInput v-model="artist" variant="plain" placeholder="歌手名" @enter="doSearch" />
          </label>
          <button
            type="button"
            class="btn-ghost btn-sm swap-btn"
            title="对调歌手与歌名"
            :disabled="busy || loading"
            @click="swapArtistTitle"
          >对调</button>
          <label class="search-field">
            <span>歌名</span>
            <ClearableInput v-model="title" variant="plain" placeholder="歌曲名" @enter="doSearch" />
          </label>
          <label class="search-field album-field">
            <span>专辑</span>
            <ClearableInput v-model="album" variant="plain" placeholder="可选" @enter="doSearch" />
          </label>
          <div class="search-field source-field">
            <span>音源</span>
            <div class="source-tabs" role="group" aria-label="歌词音源">
              <button
                v-for="opt in sourceOptions"
                :key="opt.value"
                type="button"
                class="source-tab"
                :class="{ active: source === opt.value }"
                :disabled="busy || loading"
                @click="selectSource(opt.value)"
              >{{ opt.label }}</button>
            </div>
          </div>
          <button type="button" class="btn-primary btn-sm search-btn" :disabled="busy || loading" @click="doSearch">
            {{ loading ? '搜索中…' : '搜索' }}
          </button>
        </div>

        <div class="body">
          <div class="result-list">
            <div v-if="loading && !results.length" class="empty">正在搜索…</div>
            <div v-else-if="!results.length" class="empty">暂无结果，请调整歌手或歌名后重试</div>
            <button
              v-for="(item, i) in results"
              :key="`${item.source || source}-${item.id || i}`"
              type="button"
              class="result-item"
              :class="{ active: preview?.id === item.id && preview?.source === item.source }"
              :disabled="busy || previewLoading"
              @click="previewItem(item)"
            >
              <img v-if="item.picUrl" :src="item.picUrl" class="thumb" alt="" />
              <div v-else class="thumb placeholder">♪</div>
              <div class="item-info">
                <div class="item-name">{{ item.name }}</div>
                <div class="item-meta">{{ item.singer }} · {{ item.album || item.albumName || '-' }}</div>
                <div v-if="item._score != null" class="item-score">匹配度 {{ item._score }}</div>
              </div>
            </button>
          </div>
          <div class="preview-pane">
            <div v-if="previewLoading" class="empty">正在加载歌词…</div>
            <template v-else-if="previewMeta">
              <div class="preview-meta">
                <div><strong>{{ previewMeta.title || preview?.name || '-' }}</strong></div>
                <div>{{ previewMeta.artist || preview?.singer || '-' }} · {{ previewMeta.album || preview?.album || '-' }}</div>
              </div>
              <pre class="preview-lyric">{{ lyricPreviewText }}</pre>
            </template>
            <div v-else class="empty">请从左侧选择一条结果预览歌词</div>
          </div>
        </div>

        <div class="footer">
          <span v-if="toast" class="footer-toast" :class="toast.type">{{ toast.text }}</span>
          <div class="footer-actions">
            <button type="button" class="btn-ghost btn-sm" :disabled="busy" @click="$emit('close')">取消</button>
            <button
              type="button"
              class="btn-primary btn-sm"
              :disabled="busy || !canApply"
              @click="confirm"
            >
              {{ busy ? '应用中…' : '使用此歌词' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api.js'
import ClearableInput from './ClearableInput.vue'
import { resolveSearchArtistTitle } from '../utils/filenameParse.js'
import { PLATFORM_LABELS } from '../utils/platforms.js'

const props = defineProps({
  artist: { type: String, default: '' },
  title: { type: String, default: '' },
  album: { type: String, default: '' },
  fileName: { type: String, default: '' },
  defaultSource: { type: String, default: 'tx' },
  busy: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'confirm'])

const sourceOptions = [
  { value: 'tx', label: PLATFORM_LABELS.tx || 'QQ音乐' },
  { value: 'wy', label: PLATFORM_LABELS.wy || '网易云' },
]

const artist = ref('')
const title = ref('')
const album = ref('')
const source = ref(props.defaultSource === 'wy' ? 'wy' : 'tx')
const loading = ref(false)
const previewLoading = ref(false)
const results = ref([])
const preview = ref(null)
const previewMeta = ref(null)
const toast = ref(null)

const canApply = computed(() => Boolean(String(previewMeta.value?.lyric || '').trim()))
const lyricPreviewText = computed(() => {
  const lyric = String(previewMeta.value?.lyric || '')
  if (!lyric) return '暂无歌词'
  return lyric.length > 1600 ? `${lyric.slice(0, 1600)}…` : lyric
})

onMounted(() => {
  const resolved = resolveSearchArtistTitle({
    artist: props.artist || '',
    title: props.title || '',
    fileName: props.fileName || '',
  })
  artist.value = resolved.artist
  title.value = resolved.title
  album.value = String(props.album || '').trim()
  if (artist.value || title.value || album.value) void doSearch()
})

function showToast(text, type = 'info') {
  toast.value = { text, type }
  setTimeout(() => {
    if (toast.value?.text === text) toast.value = null
  }, 2800)
}

function swapArtistTitle() {
  const a = artist.value
  artist.value = title.value
  title.value = a
}

function selectSource(next) {
  if (source.value === next || props.busy || loading.value) return
  source.value = next
  results.value = []
  preview.value = null
  previewMeta.value = null
  void doSearch()
}

async function doSearch() {
  const a = artist.value.trim()
  const t = title.value.trim()
  const al = album.value.trim()
  if (!a && !t && !al) {
    showToast('请至少填写歌手或歌名', 'info')
    return
  }
  loading.value = true
  preview.value = null
  previewMeta.value = null
  try {
    const res = await api.tag.match({ artist: a, title: t, album: al }, source.value)
    results.value = res.data || []
    if (!results.value.length) showToast('未找到匹配结果', 'info')
    else if (results.value.length === 1) await previewItem(results.value[0])
  } catch (e) {
    showToast(e.message || '搜索失败', 'error')
  } finally {
    loading.value = false
  }
}

async function previewItem(item) {
  preview.value = item
  previewMeta.value = null
  previewLoading.value = true
  try {
    const res = await api.tag.matchApply(item, source.value, ['lyric'])
    previewMeta.value = res.data || null
    if (!String(previewMeta.value?.lyric || '').trim()) {
      showToast('该结果暂无歌词，请换一条', 'info')
    }
  } catch (e) {
    showToast(e.message || '加载歌词失败', 'error')
  } finally {
    previewLoading.value = false
  }
}

function confirm() {
  const lyric = String(previewMeta.value?.lyric || '').trim()
  if (!lyric || props.busy) return
  emit('confirm', {
    lyric,
    ylyric: String(previewMeta.value?.ylyric || '').trim(),
    match: preview.value,
    meta: previewMeta.value,
    source: source.value,
  })
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 13000;
  background: rgba(0, 0, 0, 0.62);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.modal-card {
  width: min(920px, 100%);
  max-height: min(88vh, 860px);
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: 14px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
  padding: 16px;
}
.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.modal-head h3 {
  margin: 0 0 4px;
  font-size: 18px;
}
.modal-sub {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.45;
}
.search-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-end;
  margin-bottom: 12px;
}
.search-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 120px;
  flex: 1;
  font-size: 12px;
  color: var(--text-muted);
}
.album-field { flex: 0.8; }
.source-field { flex: 0 0 auto; min-width: 168px; }
.source-tabs {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-input, var(--bg));
}
.source-tab {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1;
  padding: 8px 12px;
  border-radius: 999px;
  cursor: pointer;
}
.source-tab:hover:not(:disabled) { color: var(--text); }
.source-tab.active {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
  font-weight: 650;
}
.source-tab:disabled { opacity: 0.5; cursor: not-allowed; }
.swap-btn { flex-shrink: 0; margin-bottom: 1px; }
.search-btn { flex-shrink: 0; min-width: 72px; }
.body {
  flex: 1;
  min-height: 280px;
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(280px, 1.15fr);
  gap: 12px;
  overflow: hidden;
}
.result-list,
.preview-pane {
  min-height: 0;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-card, var(--bg));
  overflow: auto;
}
.result-item {
  width: 100%;
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid var(--border-light);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.result-item:hover { background: var(--bg-hover); }
.result-item.active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}
.thumb {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--bg-elevated);
}
.thumb.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 16px;
}
.item-info { min-width: 0; flex: 1; }
.item-name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-meta,
.item-score {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-pane {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.preview-meta {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.45;
}
.preview-lyric {
  margin: 0;
  flex: 1;
  min-height: 0;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text);
  font-family: inherit;
}
.empty {
  padding: 28px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-light);
}
.footer-toast {
  font-size: 12px;
  color: var(--text-muted);
}
.footer-toast.error { color: var(--error); }
.footer-toast.success { color: var(--success); }
.footer-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

@media (max-width: 720px) {
  .modal-card { max-height: 92vh; padding: 12px; }
  .body {
    grid-template-columns: 1fr;
    min-height: 0;
  }
  .result-list { max-height: 36vh; }
  .preview-pane { max-height: 34vh; }
  .source-field { flex: 1 1 120px; }
}
</style>
