<template>
  <div class="tag-file-editor" :class="{ 'is-modal': variant === 'modal' }">
    <div v-if="loading" class="editor-loading">正在读取文件标签...</div>

    <div v-else-if="editForm" class="edit-form">
      <div class="field-toolbar meta-fetch-toolbar">
        <div class="split-btn">
          <button class="btn-primary btn-sm" @click="openFetchModal('meta')" :disabled="fetchLoading">
            {{ fetchLoading ? '获取中...' : '网络获取信息' }}
          </button>
          <AppSelect v-model="fetchSource" :options="sourceOptions" size="sm" variant="attached-end" title="选择音源" />
        </div>
      </div>
      <label>标题<input v-model="editForm.title" @input="markModified" /></label>
      <label>歌手<input v-model="editForm.artist" @input="markModified" /></label>
      <label>专辑<input v-model="editForm.album" @input="markModified" /></label>
      <label>年份<input v-model="editForm.year" @input="markModified" /></label>
      <label>风格<input v-model="editForm.genre" @input="markModified" /></label>
      <label>描述<input v-model="editForm.comment" @input="markModified" /></label>

      <label class="field-block">封面
        <div class="field-toolbar">
          <div class="split-btn">
            <button class="btn-primary btn-sm" @click="openFetchModal('cover')" :disabled="fetchLoading">
              {{ fetchLoading ? '获取中...' : '网络获取信息' }}
            </button>
            <AppSelect v-model="fetchSource" :options="sourceOptions" size="sm" variant="attached-end" title="选择音源" />
          </div>
        </div>
        <div class="cover-box">
          <img v-if="editForm.pictureBase64" :src="editForm.pictureBase64" alt="cover" />
          <img v-else-if="editForm.picUrl" :src="editForm.picUrl" alt="cover" referrerpolicy="no-referrer" />
          <img v-else-if="coverPreviewUrl" :src="coverPreviewUrl" alt="cover" />
          <div v-else class="cover-placeholder">无封面</div>
        </div>
        <input type="file" accept="image/*" @change="onCoverUpload" />
        <input v-model="editForm.picUrl" placeholder="或输入封面 URL" @input="markModified" />
      </label>

      <label class="field-block">歌词
        <div class="field-toolbar">
          <div class="split-btn">
            <button class="btn-primary btn-sm" @click="openFetchModal('lyric')" :disabled="fetchLoading">
              {{ fetchLoading ? '获取中...' : '网络获取信息' }}
            </button>
            <AppSelect v-model="fetchSource" :options="sourceOptions" size="sm" variant="attached-end" title="选择音源" />
          </div>
        </div>
        <textarea v-model="editForm.lyric" rows="10" @input="markModified" placeholder="LRC 歌词内容"></textarea>
      </label>
    </div>

    <div v-else class="editor-empty">无法加载文件信息</div>

    <div v-if="editForm && !loading" class="edit-actions">
      <button class="btn-primary" @click="save" :disabled="saving">
        {{ saving ? '保存中...' : '保存到文件' }}
      </button>
      <button
        v-if="showPlay"
        class="btn-ghost"
        @click="togglePlay"
        :disabled="playBusy"
      >
        {{ playing ? '暂停' : '试听' }}
      </button>
    </div>

    <div v-if="toast" class="toast" :class="toast.type">{{ toast.text }}</div>

    <div class="modal-overlay fetch-overlay" v-if="showFetchModal" @click.self="closeFetchModal">
      <div class="fetch-modal">
        <div class="fetch-header">
          <h3>{{ fetchIntentLabel }} · {{ fetchSourceLabel }}</h3>
          <button class="btn-icon" @click="closeFetchModal">×</button>
        </div>
        <div class="fetch-search">
          <label class="search-field">
            <span>歌手</span>
            <ClearableInput v-model="fetchArtist" variant="plain" placeholder="歌手名" @enter="doFetchSearch" />
          </label>
          <label class="search-field">
            <span>歌名</span>
            <ClearableInput v-model="fetchTitle" variant="plain" placeholder="歌曲名" @enter="doFetchSearch" />
          </label>
          <button class="btn-primary btn-sm search-btn" @click="doFetchSearch" :disabled="fetchLoading">
            {{ fetchLoading ? '搜索中...' : '搜索' }}
          </button>
        </div>
        <div class="fetch-body">
          <div class="fetch-list">
            <div v-if="!fetchResults.length && !fetchLoading" class="fetch-empty">暂无结果，请调整歌手或歌名后重试</div>
            <div
              v-for="(item, i) in fetchResults" :key="i"
              :class="['fetch-item', { active: fetchPreview?.id === item.id && fetchPreview?.source === item.source }]"
              @click="previewFetchItem(item)"
            >
              <img v-if="item.picUrl" :src="item.picUrl" class="fetch-thumb" alt="" />
              <div v-else class="fetch-thumb placeholder">♪</div>
              <div class="fetch-item-info">
                <div class="fetch-item-name">{{ item.name }}</div>
                <div class="fetch-item-meta">{{ item.singer }} · {{ item.album || item.albumName || '-' }}</div>
                <div class="fetch-item-score">匹配度 {{ item._score }}</div>
              </div>
            </div>
          </div>
          <div class="fetch-preview" v-if="fetchPreviewMeta">
            <div class="preview-info">
              <p><strong>标题</strong> {{ fetchPreviewMeta.title || fetchPreview?.name || '-' }}</p>
              <p><strong>歌手</strong> {{ fetchPreviewMeta.artist || fetchPreview?.singer || '-' }}</p>
              <p><strong>专辑</strong> {{ fetchPreviewMeta.album || '-' }}</p>
              <p v-if="fetchIntent === 'meta' || fetchPreviewMeta.year"><strong>年份</strong> {{ fetchPreviewMeta.year || '-' }}</p>
              <p v-if="fetchIntent === 'meta' || fetchPreviewMeta.genre"><strong>风格</strong> {{ fetchPreviewMeta.genre || '-' }}</p>
              <p v-if="fetchIntent === 'meta' && fetchPreviewMeta.comment"><strong>描述</strong> {{ fetchPreviewMeta.comment }}</p>
            </div>
            <template v-if="fetchIntent === 'cover'">
              <div class="preview-cover large">
                <img v-if="fetchPreviewMeta.pic || fetchPreview?.picUrl" :src="fetchPreviewMeta.pic || fetchPreview?.picUrl" alt="cover" />
                <div v-else class="cover-placeholder">无封面</div>
              </div>
            </template>
            <template v-else-if="fetchIntent === 'lyric'">
              <div class="preview-lyric">
                <div class="preview-lyric-title">歌词预览</div>
                <pre>{{ fetchPreviewMeta.lyric ? fetchPreviewMeta.lyric.slice(0, 800) : '暂无歌词' }}{{ fetchPreviewMeta.lyric?.length > 800 ? '...' : '' }}</pre>
              </div>
            </template>
          </div>
          <div class="fetch-preview empty" v-else>
            <p>请从左侧选择一条结果查看{{ fetchPreviewEmptyHint }}</p>
          </div>
        </div>
        <div class="fetch-footer">
          <button class="btn-ghost" @click="closeFetchModal">取消</button>
          <button class="btn-primary" @click="confirmFetchApply" :disabled="!fetchPreviewMeta || !canConfirmFetch">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { api } from '../api.js'
import { updateLibraryTracksFromFiles } from '../stores/library.js'
import { isPlayingItem, playItem, refreshPlayingLocalMeta } from '../stores/player.js'
import { withStreamAuth } from '../utils/streamAuth.js'
import AppSelect from './AppSelect.vue'
import ClearableInput from './ClearableInput.vue'

const props = defineProps({
  filePath: { type: String, required: true },
  showPlay: { type: Boolean, default: true },
  variant: { type: String, default: 'page' },
})

const emit = defineEmits(['saved', 'playing-change', 'busy-change'])

const sourceOptions = [
  { value: 'tx', label: 'QQ音乐' },
  { value: 'wy', label: '网易云' },
]

const loading = ref(true)
const saving = ref(false)
const modified = ref(false)
const editForm = ref(null)
const toast = ref(null)
const playBusy = ref(false)

const fetchSource = ref('tx')
const fetchLoading = ref(false)
const fetchResults = ref([])
const fetchPreview = ref(null)
const fetchPreviewMeta = ref(null)
const showFetchModal = ref(false)
const fetchArtist = ref('')
const fetchTitle = ref('')
const fetchIntent = ref('cover')

const fetchSourceLabel = computed(() => (fetchSource.value === 'tx' ? 'QQ音乐' : '网易云'))
const fetchIntentLabel = computed(() => {
  if (fetchIntent.value === 'cover') return '网络获取封面'
  if (fetchIntent.value === 'lyric') return '网络获取歌词'
  return '网络获取信息'
})
const fetchPreviewEmptyHint = computed(() => {
  if (fetchIntent.value === 'cover') return '封面'
  if (fetchIntent.value === 'lyric') return '歌词'
  return '标签信息'
})
const canConfirmFetch = computed(() => {
  if (!fetchPreviewMeta.value) return false
  if (fetchIntent.value === 'cover') {
    return Boolean(fetchPreviewMeta.value.pic || fetchPreviewMeta.value.picUrl || fetchPreview.value?.picUrl)
  }
  if (fetchIntent.value === 'lyric') return Boolean(fetchPreviewMeta.value.lyric)
  return Boolean(
    fetchPreviewMeta.value.title
    || fetchPreviewMeta.value.artist
    || fetchPreviewMeta.value.album
    || fetchPreviewMeta.value.year
    || fetchPreviewMeta.value.genre
    || fetchPreviewMeta.value.comment,
  )
})

const coverPreviewUrl = computed(() => {
  if (!props.filePath) return ''
  return withStreamAuth(`/api/tag/cover?path=${encodeURIComponent(props.filePath)}`)
})

const playing = computed(() => isPlayingItem(buildTrackFromForm()))

watch(playing, (val) => emit('playing-change', val), { immediate: true })
watch([loading, saving, playBusy], () => {
  emit('busy-change', loading.value || saving.value || playBusy.value)
}, { immediate: true })

watch(() => props.filePath, () => {
  loadFile()
}, { immediate: true })

function markModified() {
  modified.value = true
}

function showToast(text, type = 'info') {
  toast.value = { text, type }
  setTimeout(() => { toast.value = null }, 3000)
}

function createEmptyForm() {
  return reactive({
    title: '',
    artist: '',
    album: '',
    year: '',
    genre: '',
    comment: '',
    lyric: '',
    pictureBase64: '',
    picUrl: '',
    hasPicture: false,
    hasLyrics: false,
  })
}

async function loadFile() {
  loading.value = true
  modified.value = false
  editForm.value = createEmptyForm()
  if (!props.filePath) {
    loading.value = false
    editForm.value = null
    return
  }
  try {
    const res = await api.tag.read(props.filePath)
    const meta = res.data || {}
    editForm.value = reactive({
      title: meta.title || '',
      artist: meta.artist || '',
      album: meta.album || '',
      year: meta.year ? String(meta.year) : '',
      genre: meta.genre || '',
      comment: meta.comment || '',
      lyric: meta.lyric || '',
      pictureBase64: meta.pictureBase64 || '',
      picUrl: meta.picUrl || '',
      hasPicture: Boolean(meta.hasPicture || meta.pictureBase64),
      hasLyrics: Boolean(meta.hasLyrics || meta.lyric),
    })
  } catch (e) {
    showToast(`读取失败：${e.message}`, 'error')
    editForm.value = null
  } finally {
    loading.value = false
  }
}

function buildMetaPayload() {
  const form = editForm.value
  const meta = {
    title: form.title,
    artist: form.artist,
    album: form.album,
    year: form.year,
    genre: form.genre,
    comment: form.comment,
    lyric: form.lyric,
  }
  if (form.pictureBase64) meta.pic = form.pictureBase64
  else if (form.picUrl) meta.picUrl = form.picUrl
  return meta
}

function buildSavedFileRow() {
  const form = editForm.value
  return {
    filePath: props.filePath,
    title: form.title,
    artist: form.artist,
    album: form.album,
    year: form.year,
    genre: form.genre,
    comment: form.comment,
    lyric: form.lyric,
    pictureBase64: form.pictureBase64,
    pic: form.pictureBase64,
    pictureMime: form.pictureMime,
    picUrl: form.picUrl,
    hasPicture: Boolean(form.pictureBase64 || form.picUrl || form.hasPicture),
    hasLyrics: Boolean(form.lyric || form.hasLyrics),
  }
}

async function save() {
  if (!editForm.value || !props.filePath) return
  saving.value = true
  try {
    const res = await api.tag.writeBatch([{ filePath: props.filePath, meta: buildMetaPayload() }])
    const row = (res.data || [])[0]
    if (!row?.ok) throw new Error(row?.error || '保存失败')
    modified.value = false
    const saved = buildSavedFileRow()
    updateLibraryTracksFromFiles([saved])
    await refreshPlayingLocalMeta(props.filePath, saved)
    showToast('已保存到文件', 'success')
    emit('saved', saved)
  } catch (e) {
    showToast(e.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

function buildTrackFromForm() {
  const form = editForm.value
  if (!form) return null
  const pic = form.pictureBase64 || form.picUrl || coverPreviewUrl.value
  return {
    id: `local_${props.filePath}`,
    name: form.title || '未知歌曲',
    singer: form.artist || '未知歌手',
    album: form.album || '',
    source: 'local',
    localPath: props.filePath,
    picUrl: pic,
    img: pic,
    lyric: form.lyric || '',
    hasPicture: Boolean(form.pictureBase64 || form.picUrl || form.hasPicture),
    hasLyrics: Boolean(form.lyric),
  }
}

async function togglePlay() {
  const track = buildTrackFromForm()
  if (!track) return
  playBusy.value = true
  try {
    await playItem(track, 'local')
  } catch (e) {
    showToast(e.message || '试听失败', 'error')
  } finally {
    playBusy.value = false
  }
}

function parseLocalFilename(fileName) {
  const base = String(fileName || '').replace(/\.[^.]+$/, '').trim()
  const m = base.match(/^(.+?)\s*[-–—_]\s*(.+)$/)
  if (m) return { artist: m[1].trim(), title: m[2].trim() }
  return { title: base, artist: '' }
}

async function openFetchModal(intent) {
  if (!editForm.value) return
  fetchIntent.value = intent
  showFetchModal.value = true
  fetchResults.value = []
  fetchPreview.value = null
  fetchPreviewMeta.value = null
  fetchArtist.value = editForm.value.artist || ''
  fetchTitle.value = editForm.value.title || ''
  if (!fetchArtist.value && !fetchTitle.value) {
    const parsed = parseLocalFilename(props.filePath.split(/[/\\]/).pop())
    fetchArtist.value = parsed.artist
    fetchTitle.value = parsed.title
  }
  if (fetchArtist.value || fetchTitle.value) await doFetchSearch()
}

function closeFetchModal() {
  showFetchModal.value = false
  fetchPreview.value = null
  fetchPreviewMeta.value = null
}

function fetchFieldsForIntent(intent) {
  if (intent === 'cover') return ['cover', 'title', 'artist', 'album', 'year', 'genre', 'comment']
  if (intent === 'lyric') return ['lyric', 'title', 'artist', 'album', 'year', 'genre', 'comment']
  return ['title', 'artist', 'album', 'year', 'genre', 'comment']
}

async function doFetchSearch() {
  const artist = fetchArtist.value.trim()
  const title = fetchTitle.value.trim()
  if (!artist && !title) {
    showToast('请至少填写歌手或歌名', 'info')
    return
  }
  fetchLoading.value = true
  fetchPreview.value = null
  fetchPreviewMeta.value = null
  try {
    const res = await api.tag.match({ artist, title }, fetchSource.value)
    fetchResults.value = res.data || []
    if (!fetchResults.value.length) showToast('未找到匹配结果', 'info')
    else if (fetchResults.value.length === 1) await previewFetchItem(fetchResults.value[0])
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    fetchLoading.value = false
  }
}

async function previewFetchItem(item) {
  fetchPreview.value = item
  fetchPreviewMeta.value = null
  try {
    const res = await api.tag.matchApply(item, fetchSource.value, fetchFieldsForIntent(fetchIntent.value))
    fetchPreviewMeta.value = res.data
  } catch (e) {
    showToast(e.message, 'error')
  }
}

function applyFetchedMetaToForm(meta) {
  if (!meta || !editForm.value) return
  if (meta.title) editForm.value.title = meta.title
  if (meta.artist) editForm.value.artist = meta.artist
  if (meta.album) editForm.value.album = meta.album
  if (meta.year) editForm.value.year = String(meta.year)
  if (meta.genre) editForm.value.genre = meta.genre
  if (meta.comment) editForm.value.comment = meta.comment
  if (fetchIntent.value === 'cover') {
    if (meta.pic) editForm.value.pictureBase64 = meta.pic
    else if (meta.picUrl) editForm.value.picUrl = meta.picUrl
    else if (fetchPreview.value?.picUrl) editForm.value.picUrl = fetchPreview.value.picUrl
  } else if (fetchIntent.value === 'lyric' && meta.lyric) {
    editForm.value.lyric = meta.lyric
  }
}

function confirmFetchApply() {
  if (!fetchPreviewMeta.value || !editForm.value || !canConfirmFetch.value) return
  applyFetchedMetaToForm(fetchPreviewMeta.value)
  markModified()
  closeFetchModal()
  const toastMap = {
    cover: '已应用封面与标签信息',
    lyric: '已应用歌词与标签信息',
    meta: '已应用网络标签信息',
  }
  showToast(toastMap[fetchIntent.value] || '已应用网络信息', 'success')
}

function onCoverUpload(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    editForm.value.pictureBase64 = reader.result
    markModified()
  }
  reader.readAsDataURL(file)
  e.target.value = ''
}

defineExpose({ togglePlay })
</script>

<style scoped>
.tag-file-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  height: 100%;
}
.tag-file-editor.is-modal {
  gap: 0;
  padding: 0 16px 16px;
}
.tag-file-editor.is-modal .edit-form {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 0;
  overscroll-behavior: contain;
}
.tag-file-editor.is-modal .edit-actions {
  flex-shrink: 0;
  padding-top: 12px;
  border-top: 1px solid var(--border-light);
  background: var(--bg-card);
  position: sticky;
  bottom: 0;
  margin: 0 -16px -16px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
}
.tag-file-editor.is-modal .toast {
  bottom: calc(80px + env(safe-area-inset-bottom, 0px));
}
.fetch-overlay {
  z-index: 2900;
}
.editor-loading,
.editor-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}
.edit-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.edit-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}
.edit-form input,
.edit-form textarea {
  font-size: 14px;
  padding: 10px 12px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text);
}
.field-block { gap: 8px !important; }
.field-toolbar { display: flex; align-items: center; }
.meta-fetch-toolbar { margin-bottom: 4px; }
.split-btn { display: flex; align-items: stretch; gap: 0; }
.split-btn .btn-primary { border-radius: var(--radius) 0 0 var(--radius); }
.cover-box {
  width: 120px;
  height: 120px;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg-input);
}
.cover-box img { width: 100%; height: 100%; object-fit: cover; }
.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-muted);
}
.edit-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  padding-top: 4px;
}
.toast {
  position: fixed;
  bottom: calc(var(--player-height, 64px) + 20px);
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 16px;
  border-radius: var(--radius);
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow);
  z-index: 2100;
  font-size: 13px;
}
.toast.success { color: var(--success); }
.toast.error { color: var(--error); }
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
}
.fetch-modal {
  width: min(920px, 100%);
  max-height: 85vh;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.fetch-header,
.fetch-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-elevated);
}
.fetch-footer { border-bottom: none; border-top: 1px solid var(--border-light); justify-content: flex-end; gap: 10px; }
.fetch-header h3 { margin: 0; font-size: 16px; }
.fetch-search {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 10px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
}
.search-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--text-secondary); }
.fetch-body { display: grid; grid-template-columns: 1fr 1fr; min-height: 280px; overflow: hidden; }
.fetch-list { overflow-y: auto; border-right: 1px solid var(--border-light); }
.fetch-item {
  display: flex;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-light);
}
.fetch-item:hover { background: var(--bg-hover); }
.fetch-item.active { background: var(--accent-muted); }
.fetch-thumb {
  width: 48px;
  height: 48px;
  border-radius: var(--radius);
  object-fit: cover;
  flex-shrink: 0;
  background: var(--bg-input);
}
.fetch-thumb.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
}
.fetch-item-info { min-width: 0; flex: 1; }
.fetch-item-name,
.fetch-item-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fetch-item-meta { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.fetch-item-score { font-size: 11px; color: var(--accent); margin-top: 2px; }
.fetch-preview { padding: 16px; overflow-y: auto; }
.fetch-preview.empty { display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
.preview-info p { margin: 0 0 8px; font-size: 13px; }
.preview-cover.large img { width: 180px; height: 180px; object-fit: cover; border-radius: var(--radius); }
.preview-lyric pre {
  margin: 0;
  white-space: pre-wrap;
  font-size: 12px;
  line-height: 1.5;
  max-height: 260px;
  overflow: auto;
}
.fetch-empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px; }
.btn-icon { background: none; border: none; color: var(--text-muted); font-size: 18px; cursor: pointer; }
@media (max-width: 768px) {
  .fetch-search { grid-template-columns: 1fr; }
  .fetch-body { grid-template-columns: 1fr; }
  .fetch-list { border-right: none; border-bottom: 1px solid var(--border-light); max-height: 220px; }
  .tag-file-editor.is-modal .edit-form input,
  .tag-file-editor.is-modal .edit-form textarea {
    font-size: 16px;
    min-height: 44px;
  }
  .tag-file-editor.is-modal .edit-form textarea {
    min-height: 120px;
  }
  .tag-file-editor.is-modal .split-btn {
    flex-wrap: wrap;
    gap: 8px;
  }
  .tag-file-editor.is-modal .split-btn .btn-primary {
    border-radius: var(--radius);
    flex: 1 1 auto;
  }
}
</style>
