<template>
  <Teleport to="body">
    <Transition name="tag-edit-fade">
      <div
        v-if="showTagEditModal && tagEditFilePath"
        class="tag-edit-overlay"
        @click.self="closeTagEditModal"
      >
        <aside class="tag-edit-panel card" role="dialog" aria-labelledby="tag-edit-title">
          <header class="tag-edit-header">
            <div class="tag-edit-heading">
              <h3 id="tag-edit-title">单文件编辑</h3>
              <p class="tag-edit-filename" :title="tagEditFilePath">{{ fileName }}</p>
            </div>
            <div class="tag-edit-header-actions">
              <button
                class="btn-ghost btn-sm"
                type="button"
                :disabled="editorBusy"
                @click="onPreview"
              >
                {{ editorPlaying ? '暂停' : '试听' }}
              </button>
              <button class="btn-icon" type="button" title="关闭" @click="closeTagEditModal">×</button>
            </div>
          </header>

          <div class="tag-edit-body">
            <TagFileEditor
              ref="editorRef"
              :key="tagEditFilePath"
              :file-path="tagEditFilePath"
              variant="modal"
              :show-play="false"
              @playing-change="editorPlaying = $event"
              @busy-change="editorBusy = $event"
            />
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, ref } from 'vue'
import TagFileEditor from './TagFileEditor.vue'
import {
  showTagEditModal,
  tagEditFilePath,
  closeTagEditModal,
} from '../stores/tagEditModal.js'

const editorRef = ref(null)
const editorPlaying = ref(false)
const editorBusy = ref(false)

const fileName = computed(() => {
  const raw = tagEditFilePath.value
  if (!raw) return ''
  const parts = raw.split(/[/\\]/)
  return parts[parts.length - 1] || raw
})

function onPreview() {
  editorRef.value?.togglePlay?.()
}
</script>

<style scoped>
.tag-edit-overlay {
  position: fixed;
  inset: 0;
  /* 须高于 FullscreenPlayer(10000)，否则大屏/全屏里点标签编辑会「无反应」 */
  z-index: 11000;
  display: flex;
  justify-content: flex-end;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
}
.tag-edit-panel {
  width: min(420px, 100vw);
  height: 100%;
  max-height: 100dvh;
  display: flex;
  flex-direction: column;
  border-radius: 0;
  border-left: 1px solid var(--border-light);
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}
.tag-edit-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-elevated);
  flex-shrink: 0;
}
.tag-edit-heading { min-width: 0; flex: 1; }
.tag-edit-header h3 {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
}
.tag-edit-filename {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag-edit-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.btn-icon {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 22px;
  line-height: 1;
  padding: 2px 6px;
  cursor: pointer;
}
.btn-icon:hover { color: var(--text); }
.tag-edit-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.tag-edit-fade-enter-active,
.tag-edit-fade-leave-active {
  transition: opacity 0.2s ease;
}
.tag-edit-fade-enter-active .tag-edit-panel,
.tag-edit-fade-leave-active .tag-edit-panel {
  transition: transform 0.24s ease;
}
.tag-edit-fade-enter-from,
.tag-edit-fade-leave-to {
  opacity: 0;
}
.tag-edit-fade-enter-from .tag-edit-panel,
.tag-edit-fade-leave-to .tag-edit-panel {
  transform: translateX(100%);
}
@media (max-width: 768px) {
  .tag-edit-overlay {
    align-items: flex-end;
    justify-content: center;
  }
  .tag-edit-panel {
    width: 100%;
    height: auto;
    max-height: min(92dvh, 100%);
    border-left: none;
    border-top: 1px solid var(--border-light);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.35);
  }
  .tag-edit-fade-enter-from .tag-edit-panel,
  .tag-edit-fade-leave-to .tag-edit-panel {
    transform: translateY(100%);
  }
}
</style>
