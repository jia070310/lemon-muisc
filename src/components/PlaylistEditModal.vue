<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-card">
      <h3>{{ title }}</h3>
      <label class="field">
        <span>歌单名称</span>
        <input v-model="form.name" placeholder="歌单名称" @keydown.enter="submit" />
      </label>
      <label class="field">
        <span>封面模式</span>
        <AppSelect
          v-model="form.coverMode"
          :options="coverModeOptions"
          block
        />
      </label>
      <template v-if="form.coverMode === 'custom'">
        <label class="field">
          <span>封面图片地址</span>
          <input v-model="form.coverUrl" placeholder="https://... 或留空后上传" />
        </label>
        <label class="field upload-field">
          <span>上传封面</span>
          <input type="file" accept="image/*" @change="onFileChange" />
        </label>
        <div v-if="previewCover" class="cover-preview">
          <img :src="previewCover" alt="" />
        </div>
      </template>
      <div class="modal-actions">
        <button type="button" class="btn-ghost" @click="$emit('close')">取消</button>
        <button type="button" class="btn-primary" @click="submit">保存</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed, watch } from 'vue'
import AppSelect from './AppSelect.vue'

const coverModeOptions = [
  { value: 'auto', label: '自动（使用歌单内歌曲封面）' },
  { value: 'custom', label: '自定义封面' },
]

const props = defineProps({
  title: { type: String, default: '编辑歌单' },
  playlist: { type: Object, default: null },
  initialName: { type: String, default: '' },
})

const emit = defineEmits(['close', 'save'])

const form = reactive({
  name: '',
  coverMode: 'auto',
  coverUrl: '',
})

watch(() => [props.playlist, props.initialName], () => {
  form.name = props.playlist?.name || props.initialName || ''
  form.coverMode = props.playlist?.coverMode === 'custom' ? 'custom' : 'auto'
  form.coverUrl = props.playlist?.coverUrl || ''
}, { immediate: true })

const previewCover = computed(() => {
  if (form.coverMode !== 'custom') return ''
  return form.coverUrl || ''
})

function onFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    form.coverUrl = String(reader.result || '')
    form.coverMode = 'custom'
  }
  reader.readAsDataURL(file)
  e.target.value = ''
}

function submit() {
  const name = form.name.trim()
  if (!name) return
  emit('save', {
    name,
    coverMode: form.coverMode === 'custom' && form.coverUrl ? 'custom' : 'auto',
    coverUrl: form.coverMode === 'custom' ? form.coverUrl.trim() : '',
  })
}
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: 1200;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.modal-card {
  width: min(420px, 100%);
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 20px;
}
.modal-card h3 { margin: 0 0 16px; }
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
  font-size: 13px;
  color: var(--text-secondary);
}
.field input, .field select { width: 100%; font-size: 14px; }
.upload-field input[type="file"] { font-size: 13px; }
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
