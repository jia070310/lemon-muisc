<template>
  <Teleport to="body">
    <div class="pod-edit-overlay" @pointerdown.self="onCancel" @keydown.esc.prevent="onCancel">
      <div class="pod-edit-card card" role="dialog" aria-modal="true" aria-labelledby="pod-edit-title" @pointerdown.stop>
        <h3 id="pod-edit-title" class="pod-edit-title">编辑订阅</h3>
        <p class="pod-edit-desc">可更换封面与 RSS 链接。自定义封面后刷新节目不会被覆盖。</p>

        <div class="pod-edit-cover-row">
          <div class="pod-edit-cover-preview">
            <img v-if="previewSrc" :src="previewSrc" alt="" @error="previewBroken = true" />
            <div v-else class="pod-edit-cover-empty"><PodcastIcon :size="28" /></div>
          </div>
          <div class="pod-edit-cover-actions">
            <label class="field">
              <span>封面链接</span>
              <input
                v-model="form.imageUrl"
                type="url"
                placeholder="https://… 图片地址"
                :disabled="saving"
                @input="onImageUrlInput"
              />
            </label>
            <div class="pod-edit-cover-btns">
              <button type="button" class="btn-ghost btn-sm" :disabled="saving" @click="pickFile">上传图片</button>
              <button
                type="button"
                class="btn-ghost btn-sm"
                :disabled="saving || (!form.imageUrl && !form.imageData && !feed.imageCustom)"
                @click="clearCover"
              >恢复默认</button>
            </div>
            <input
              ref="fileInput"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              hidden
              @change="onFileChange"
            />
          </div>
        </div>

        <label class="field">
          <span>显示名称</span>
          <input v-model="form.title" type="text" maxlength="200" placeholder="播客名称" :disabled="saving" />
        </label>

        <label class="field">
          <span>订阅链接（RSS）</span>
          <input v-model="form.url" type="url" required placeholder="https://…/feed.xml" :disabled="saving" />
        </label>
        <p class="pod-edit-hint">更换链接后会按新地址重新拉取节目；若封面已自定义则保留。</p>

        <p v-if="error" class="pod-edit-error">{{ error }}</p>

        <div class="pod-edit-actions">
          <button type="button" class="btn-ghost btn-sm" :disabled="saving" @click="onCancel">取消</button>
          <button type="button" class="btn-primary btn-sm" :disabled="saving || !canSave" @click="onSave">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import PodcastIcon from './PodcastIcon.vue'
import { api } from '../api.js'
import { toPlayableCoverUrl } from '../utils/coverDisplay.js'

const props = defineProps({
  feed: { type: Object, required: true },
})
const emit = defineEmits(['close', 'saved'])

const form = reactive({
  title: '',
  url: '',
  imageUrl: '',
  imageData: '',
})
const clearCustomImage = ref(false)
const saving = ref(false)
const error = ref('')
const previewBroken = ref(false)
const fileInput = ref(null)

watch(
  () => props.feed,
  (f) => {
    form.title = f?.title || ''
    form.url = f?.url || ''
    // 外链自定义封面回填输入框；本地上传封面只走预览
    form.imageUrl = f?.imageCustom && f?.imageUrl && /^https?:\/\//i.test(f.imageUrl)
      ? f.imageUrl
      : ''
    form.imageData = ''
    clearCustomImage.value = false
    error.value = ''
    previewBroken.value = false
  },
  { immediate: true },
)

const previewSrc = computed(() => {
  if (previewBroken.value && !form.imageData && !form.imageUrl) return ''
  if (clearCustomImage.value && !form.imageData && !form.imageUrl) return ''
  if (form.imageData) return form.imageData
  if (form.imageUrl.trim()) return toPlayableCoverUrl(form.imageUrl.trim())
  if (!clearCustomImage.value && props.feed?.imageUrl) {
    return toPlayableCoverUrl(props.feed.imageUrl)
  }
  return ''
})

const canSave = computed(() => Boolean(String(form.url || '').trim()))

function onImageUrlInput() {
  clearCustomImage.value = false
  form.imageData = ''
  previewBroken.value = false
}

function pickFile() {
  fileInput.value?.click()
}

function onFileChange(e) {
  const file = e.target?.files?.[0]
  e.target.value = ''
  if (!file) return
  if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type)) {
    error.value = '请选择 JPG / PNG / WebP / GIF 图片'
    return
  }
  if (file.size > 6 * 1024 * 1024) {
    error.value = '图片不能超过 6MB'
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    form.imageData = String(reader.result || '')
    form.imageUrl = ''
    clearCustomImage.value = false
    previewBroken.value = false
    error.value = ''
  }
  reader.onerror = () => {
    error.value = '读取图片失败'
  }
  reader.readAsDataURL(file)
}

function clearCover() {
  form.imageUrl = ''
  form.imageData = ''
  clearCustomImage.value = true
  previewBroken.value = false
}

function onCancel() {
  if (saving.value) return
  emit('close')
}

async function onSave() {
  if (!canSave.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const body = {
      title: String(form.title || '').trim(),
      url: String(form.url || '').trim(),
    }
    if (clearCustomImage.value) {
      body.clearCustomImage = true
      body.imageUrl = ''
    } else if (form.imageData) {
      body.imageUrl = form.imageData
    } else if (form.imageUrl.trim()) {
      body.imageUrl = form.imageUrl.trim()
    }
    const res = await api.podcasts.update(props.feed.id, body)
    if (res.fetchError) {
      error.value = `已保存，但拉取新链接失败：${res.fetchError}`
      emit('saved', res.data)
      return
    }
    emit('saved', res.data)
    emit('close')
  } catch (e) {
    error.value = e.message || '保存失败'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.pod-edit-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.45);
}
.pod-edit-card {
  width: min(440px, 100%);
  max-height: min(90vh, 720px);
  overflow: auto;
  padding: 18px 18px 16px;
}
.pod-edit-title {
  margin: 0 0 6px;
  font-size: 17px;
  color: var(--text);
}
.pod-edit-desc,
.pod-edit-hint {
  margin: 0 0 14px;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--text-muted);
}
.pod-edit-hint { margin-top: -6px; }
.pod-edit-cover-row {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}
.pod-edit-cover-preview {
  width: 88px;
  height: 88px;
  flex-shrink: 0;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg);
  border: 1px solid var(--border-light);
}
.pod-edit-cover-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.pod-edit-cover-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}
.pod-edit-cover-actions {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pod-edit-cover-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 12.5px;
  color: var(--text-muted);
}
.field input {
  height: 40px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text);
  padding: 0 12px;
  font-size: 14px;
}
.pod-edit-error {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--danger, #ef4444);
}
.pod-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
