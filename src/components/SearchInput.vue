<template>
  <div class="search-input" :class="{ open: panelOpen }" @keydown.escape.capture="closePanel">
    <ClearableInput
      ref="inputRef"
      :model-value="modelValue"
      :placeholder="placeholder"
      :show-search-icon="showSearchIcon"
      :variant="variant"
      :type="type"
      :disabled="disabled"
      :enterkeyhint="enterkeyhint || 'search'"
      :input-class="inputClass"
      :class="inputWrapClass"
      @update:model-value="onUpdate"
      @enter="onEnter"
      @clear="onClear"
      @focus="onFocus"
      @blur="onBlur"
    />
    <div
      v-if="panelOpen && visibleHistory.length"
      class="search-history-panel"
      role="listbox"
      aria-label="历史记录"
      @mousedown.prevent
    >
      <div class="search-history-head">
        <span class="search-history-title">历史记录</span>
        <button type="button" class="search-history-clear-all" @click="clearAll">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            <line x1="10" y1="11" x2="10" y2="17"/>
            <line x1="14" y1="11" x2="14" y2="17"/>
          </svg>
          清除记录
        </button>
      </div>
      <ul class="search-history-chips">
        <li v-for="item in visibleHistory" :key="item" class="search-history-chip">
          <button
            type="button"
            class="search-history-pick"
            role="option"
            :title="item"
            @click="pick(item)"
          >
            <span class="search-history-text">{{ item }}</span>
          </button>
          <button
            type="button"
            class="search-history-remove"
            :aria-label="`删除 ${item}`"
            title="删除"
            @click.stop="removeOne(item)"
          >
            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import ClearableInput from './ClearableInput.vue'
import { useSearchHistory } from '../composables/useSearchHistory.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  showSearchIcon: { type: Boolean, default: false },
  variant: { type: String, default: 'plain' },
  type: { type: String, default: 'text' },
  disabled: { type: Boolean, default: false },
  enterkeyhint: { type: String, default: '' },
  inputClass: { type: String, default: '' },
  inputWrapClass: { type: String, default: '' },
  /** localStorage 分桶 key，空则不启用历史 */
  historyKey: { type: String, default: '' },
  maxHistory: { type: Number, default: 12 },
})

const emit = defineEmits(['update:modelValue', 'enter', 'clear', 'select', 'focus', 'blur'])

const inputRef = ref(null)
const focused = ref(false)
const historyTick = ref(0)
const historyApi = computed(() => (
  props.historyKey
    ? useSearchHistory(props.historyKey, { max: props.maxHistory })
    : null
))

const historyItems = computed(() => {
  historyTick.value
  return historyApi.value?.list() || []
})

const visibleHistory = computed(() => {
  const q = String(props.modelValue || '').trim().toLowerCase()
  const all = historyItems.value
  if (!q) return all
  return all.filter((item) => item.toLowerCase().includes(q))
})

const panelOpen = computed(() => (
  Boolean(props.historyKey && focused.value && !props.disabled && visibleHistory.value.length)
))

function refreshHistory() {
  historyTick.value += 1
}

function onUpdate(value) {
  emit('update:modelValue', value)
}

function remember(query = props.modelValue) {
  if (!historyApi.value) return
  historyApi.value.push(query)
  refreshHistory()
}

function onEnter(e) {
  remember()
  closePanel()
  emit('enter', e)
}

function onClear() {
  emit('clear')
  // 清空后仍保持焦点，可继续看历史
  focused.value = true
}

function onFocus(e) {
  focused.value = true
  refreshHistory()
  emit('focus', e)
}

function onBlur(e) {
  // 稍延迟，让 mousedown.prevent 的点击先执行
  window.setTimeout(() => {
    focused.value = false
    emit('blur', e)
  }, 120)
}

function closePanel() {
  focused.value = false
}

function pick(item) {
  emit('update:modelValue', item)
  remember(item)
  closePanel()
  emit('select', item)
  inputRef.value?.focus?.()
}

function removeOne(item) {
  historyApi.value?.remove(item)
  refreshHistory()
}

function clearAll() {
  historyApi.value?.clear()
  refreshHistory()
}

watch(() => props.historyKey, refreshHistory)

defineExpose({
  focus: () => inputRef.value?.focus?.(),
  remember,
  refreshHistory,
})
</script>

<style scoped>
.search-input {
  position: relative;
  display: flex;
  align-items: stretch;
  min-width: 0;
  flex: 1;
}

.search-history-panel {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  z-index: 40;
  max-height: min(320px, 50vh);
  overflow: auto;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-card);
  box-shadow: var(--shadow);
  padding: 10px 12px 14px;
}

.search-history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--text-muted);
  position: sticky;
  top: 0;
  background: var(--bg-card);
  z-index: 1;
}

.search-history-title {
  font-weight: 500;
  letter-spacing: 0.02em;
}

.search-history-clear-all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-elevated);
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
  cursor: pointer;
  line-height: 1.2;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.search-history-clear-all:hover {
  background: color-mix(in srgb, var(--accent) 14%, var(--bg-elevated));
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  color: var(--text);
}
.search-history-clear-all:active {
  background: color-mix(in srgb, var(--accent) 22%, var(--bg-elevated));
}
.search-history-clear-all svg {
  flex-shrink: 0;
  color: var(--text);
  opacity: 0.92;
  stroke: currentColor;
}

.search-history-chips {
  list-style: none;
  margin: 0;
  padding: 4px 2px 2px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px 10px;
}

.search-history-chip {
  position: relative;
  display: inline-flex;
  max-width: 100%;
  margin: 0;
  padding: 0;
}

.search-history-pick {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  margin: 0;
  padding: 7px 14px;
  border: none;
  border-radius: 10px;
  background: color-mix(in srgb, var(--text) 10%, var(--bg-elevated, var(--bg-card)));
  color: var(--text);
  font: inherit;
  font-size: 13px;
  line-height: 1.3;
  text-align: left;
  cursor: pointer;
}
.search-history-pick:hover {
  background: color-mix(in srgb, var(--text) 16%, var(--bg-elevated, var(--bg-card)));
}

.search-history-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: min(220px, 56vw);
}

/* 右上角骑缝 ×，贴近参考样式 */
.search-history-remove {
  position: absolute;
  top: -6px;
  right: -6px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--bg-card) 35%, #2a2a2e 65%);
  color: color-mix(in srgb, var(--text) 88%, #fff);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--text) 18%, transparent);
  cursor: pointer;
  line-height: 0;
}
.search-history-remove:hover {
  background: color-mix(in srgb, var(--text) 22%, var(--bg-card));
  color: var(--text);
}
</style>
