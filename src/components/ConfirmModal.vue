<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="modal-overlay confirm-overlay"
      @click.self="!busy && onCancel()"
      @keydown.esc.prevent="!busy && onCancel()"
    >
      <div class="confirm-modal card" role="dialog" :aria-labelledby="titleId" aria-modal="true">
        <div class="confirm-body" :class="{ 'no-cover': !cover }">
          <div v-if="cover" class="confirm-cover-wrap">
            <CoverArt :src="cover" />
          </div>
          <div class="confirm-main">
            <h3 :id="titleId">{{ title }}</h3>
            <p v-if="message" class="confirm-text">{{ message }}</p>
            <p v-if="hint" class="confirm-hint">{{ hint }}</p>
            <label v-if="mode === 'prompt'" class="confirm-input-wrap">
              <span v-if="inputLabel" class="confirm-input-label">{{ inputLabel }}</span>
              <input
                ref="inputEl"
                class="confirm-input"
                type="text"
                :value="inputValue"
                :placeholder="inputPlaceholder"
                :disabled="busy"
                @input="onInput"
                @keydown.enter.prevent="!busy && onConfirm()"
              />
            </label>
          </div>
        </div>
        <div class="confirm-actions">
          <button
            v-if="mode !== 'alert'"
            type="button"
            class="btn-ghost btn-sm"
            :disabled="busy"
            @click="onCancel()"
          >
            {{ cancelText }}
          </button>
          <button
            type="button"
            class="btn-sm"
            :class="danger ? 'btn-danger' : 'btn-primary'"
            :disabled="busy"
            @click="onConfirm()"
          >
            {{ busy ? busyText : confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import CoverArt from './CoverArt.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  mode: { type: String, default: 'confirm' }, // confirm | alert | prompt
  title: { type: String, default: '确认' },
  message: { type: String, default: '' },
  hint: { type: String, default: '' },
  cover: { type: String, default: '' },
  confirmText: { type: String, default: '确定' },
  cancelText: { type: String, default: '取消' },
  danger: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  busyText: { type: String, default: '处理中…' },
  inputValue: { type: String, default: '' },
  inputPlaceholder: { type: String, default: '' },
  inputLabel: { type: String, default: '' },
})

const emit = defineEmits(['confirm', 'cancel', 'update:inputValue'])

const titleId = 'confirm-modal-title'
const inputEl = ref(null)

watch(
  () => [props.open, props.mode],
  async ([open, mode]) => {
    if (open && mode === 'prompt') {
      await nextTick()
      inputEl.value?.focus?.()
      inputEl.value?.select?.()
    }
  },
)

function onInput(e) {
  emit('update:inputValue', e?.target?.value ?? '')
}

function onConfirm() {
  emit('confirm')
}

function onCancel() {
  emit('cancel')
}
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  /* 高于页面内弹层（如查重 ~1200）与标签编辑浮层（~11000） */
  z-index: 12000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.confirm-modal {
  width: min(460px, 100%);
  padding: 22px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}
.confirm-body {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 20px;
}
.confirm-cover-wrap {
  flex-shrink: 0;
  width: 72px;
  height: 72px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-input);
}
.confirm-cover-wrap :deep(.cover-art) {
  width: 100%;
  height: 100%;
}
.confirm-main {
  min-width: 0;
  flex: 1;
}
.confirm-modal h3 {
  margin: 0 0 10px;
  font-size: 17px;
  line-height: 1.35;
  color: var(--text);
}
.confirm-text {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}
.confirm-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}
.confirm-input-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}
.confirm-input-label {
  font-size: 12px;
  color: var(--text-muted);
}
.confirm-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-input, var(--bg));
  color: var(--text);
  font-size: 14px;
}
.confirm-input:focus {
  outline: none;
  border-color: var(--accent);
}
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.btn-danger {
  background: var(--error, #e5484d);
  color: #fff;
  border: 1px solid transparent;
  border-radius: var(--radius, 8px);
  padding: 6px 14px;
  cursor: pointer;
}
.btn-danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 480px) {
  .confirm-body:not(.no-cover) {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .confirm-actions {
    width: 100%;
  }
  .confirm-actions .btn-sm {
    flex: 1;
  }
}
</style>
