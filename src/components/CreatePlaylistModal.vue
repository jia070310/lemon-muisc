<template>
  <div class="modal-overlay" @click.self="!importing && $emit('close')">
    <div class="modal-card">
      <h3>创建歌单</h3>

      <div class="mode-tabs" role="tablist">
        <button
          type="button"
          class="mode-tab"
          :class="{ active: mode === 'blank' }"
          :disabled="importing"
          @click="mode = 'blank'"
        >
          空白歌单
        </button>
        <button
          type="button"
          class="mode-tab"
          :class="{ active: mode === 'import' }"
          :disabled="importing"
          @click="mode = 'import'"
        >
          复制网络歌单
        </button>
      </div>

      <template v-if="mode === 'blank'">
        <label class="field">
          <span>歌单名称</span>
          <input v-model="blankForm.name" placeholder="歌单名称" :disabled="importing" @keydown.enter="submit" />
        </label>
        <label class="field">
          <span>封面模式</span>
          <AppSelect v-model="blankForm.coverMode" :options="coverModeOptions" block :disabled="importing" />
        </label>
        <template v-if="blankForm.coverMode === 'custom'">
          <label class="field">
            <span>封面图片地址</span>
            <input v-model="blankForm.coverUrl" placeholder="https://... 或留空后上传" :disabled="importing" />
          </label>
          <label class="field upload-field">
            <span>上传封面</span>
            <input type="file" accept="image/*" :disabled="importing" @change="onFileChange" />
          </label>
          <div v-if="previewCover" class="cover-preview">
            <img :src="previewCover" alt="" />
          </div>
        </template>
      </template>

      <template v-else>
        <label class="field">
          <span>音乐平台</span>
          <AppSelect
            v-model="importForm.source"
            :options="sourceOptions"
            block
            :disabled="importing || !sourceOptions.length"
          />
        </label>
        <label class="field">
          <span>歌单链接</span>
          <textarea
            v-model="importForm.url"
            rows="3"
            :placeholder="urlPlaceholder"
            :disabled="importing"
          />
        </label>
        <label class="field">
          <span>歌单名称（可选）</span>
          <input v-model="importForm.name" placeholder="留空则使用原歌单名称" :disabled="importing" />
        </label>
        <p class="field-hint">
          将完整复制平台歌单到本地歌单；导入后可点击「同步本地」扫描音乐库，已下载的歌曲会显示<strong>本地</strong>标，其余显示<strong>网络</strong>标。
        </p>
        <p v-if="importing" class="import-status">{{ importStatus }}</p>
      </template>

      <div class="modal-actions">
        <button type="button" class="btn-ghost" :disabled="importing" @click="$emit('close')">取消</button>
        <button type="button" class="btn-primary" :disabled="importing || !canSubmit" @click="submit">
          {{ importing ? '处理中…' : (mode === 'import' ? '导入歌单' : '创建') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed, ref, watch, onMounted } from 'vue'
import AppSelect from './AppSelect.vue'
import { createPlaylist, importPlaylistFromUrl } from '../stores/library.js'
import { loadDiscoverSources, discoverState, sourcePlaceholders } from '../stores/discover.js'
import { platformLabel, PLAYLIST_PLATFORM_OPTIONS } from '../utils/platforms.js'

const coverModeOptions = [
  { value: 'auto', label: '自动（使用歌单内歌曲封面）' },
  { value: 'custom', label: '自定义封面' },
]

const props = defineProps({
  api: { type: Object, required: true },
})

const emit = defineEmits(['close', 'created', 'imported'])

const mode = ref('blank')
const importing = ref(false)
const importStatus = ref('')

const blankForm = reactive({
  name: '',
  coverMode: 'auto',
  coverUrl: '',
})

const importForm = reactive({
  source: '',
  url: '',
  name: '',
})

const sourceOptions = computed(() => {
  const fromApi = Object.entries(discoverState.sources || {}).map(([value, info]) => ({
    value,
    label: platformLabel(value, info),
  }))
  return fromApi.length ? fromApi : PLAYLIST_PLATFORM_OPTIONS
})

const urlPlaceholder = computed(() =>
  sourcePlaceholders[importForm.source] || '粘贴各平台歌单链接或 ID')

const previewCover = computed(() => {
  if (blankForm.coverMode !== 'custom') return ''
  return blankForm.coverUrl || ''
})

const canSubmit = computed(() => {
  if (mode.value === 'blank') return Boolean(blankForm.name.trim())
  return Boolean(importForm.url.trim() && importForm.source)
})

onMounted(() => {
  ensureImportSources()
})

watch(mode, (value) => {
  if (value === 'import') ensureImportSources()
})

async function ensureImportSources() {
  try {
    await loadDiscoverSources(props.api, { force: true })
  } catch {}
  if (!importForm.source) {
    const first = sourceOptions.value[0]
    if (first) importForm.source = first.value
  }
}

function onFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    blankForm.coverUrl = String(reader.result || '')
    blankForm.coverMode = 'custom'
  }
  reader.readAsDataURL(file)
  e.target.value = ''
}

async function submit() {
  if (mode.value === 'blank') {
    const name = blankForm.name.trim()
    if (!name) return
    const pl = createPlaylist(name, {
      coverUrl: blankForm.coverUrl,
      coverMode: blankForm.coverMode,
    })
    if (!pl) return
    emit('created', { playlist: pl })
    return
  }

  const url = importForm.url.trim()
  if (!url || !importForm.source || importing.value) return
  importing.value = true
  importStatus.value = '正在解析歌单…'
  try {
    const result = await importPlaylistFromUrl(props.api, {
      url,
      source: importForm.source,
      name: importForm.name.trim(),
      onProgress: (text) => { importStatus.value = text },
    })
    emit('imported', result)
  } catch (e) {
    importStatus.value = e.message || '导入失败'
    setTimeout(() => { importStatus.value = '' }, 2800)
  } finally {
    importing.value = false
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: 1200;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.modal-card {
  width: min(460px, 100%);
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 20px;
}
.modal-card h3 { margin: 0 0 14px; }
.mode-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  padding: 4px;
  background: var(--bg-hover);
  border-radius: 10px;
}
.mode-tab {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.mode-tab.active {
  background: var(--bg-elevated);
  color: var(--text);
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}
.mode-tab:disabled { opacity: 0.6; cursor: not-allowed; }
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
  font-size: 13px;
  color: var(--text-secondary);
}
.field input, .field textarea { width: 100%; font-size: 14px; resize: vertical; }
.upload-field input[type="file"] { font-size: 13px; }
.field-hint {
  margin: -4px 0 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
}
.import-status {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--accent);
}
.cover-preview {
  width: 120px;
  height: 120px;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 14px;
}
.cover-preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
</style>
