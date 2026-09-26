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
      aria-label="搜索历史"
      @mousedown.prevent
    >
      <div class="search-history-head">
        <span>搜索历史</span>
        <button type="button" class="search-history-clear-all" @click="clearAll">清除全部</button>
      </div>
      <ul class="search-history-list">
        <li v-for="item in visibleHistory" :key="item" class="search-history-item">
          <button
            type="button"
            class="search-history-pick"
            role="option"
            :title="item"
            @click="pick(item)"
          >
            <svg class="search-history-clock" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="12" cy="12" r="9"/>
              <polyline points="12 7 12 12 15 14"/>
            </svg>
            <span class="search-history-text">{{ item }}</span>
          </button>
          <button
            type="button"
            class="search-history-remove"
            :aria-label="`删除 ${item}`"
            title="删除这条"
            @click="removeOne(item)"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2">
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
}

.search-history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px 4px;
  font-size: 12px;
  color: var(--text-muted);
  position: sticky;
  top: 0;
  background: var(--bg-card);
  z-index: 1;
}

.search-history-clear-all {
  border: none;
  background: none;
  padding: 2px 4px;
  font-size: 12px;
  color: var(--accent);
  cursor: pointer;
}
.search-history-clear-all:hover {
  text-decoration: underline;
}

.search-history-list {
  list-style: none;
  margin: 0;
  padding: 4px 0 8px;
}

.search-history-item {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 6px;
}

.search-history-pick {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 8px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.search-history-pick:hover {
  background: color-mix(in srgb, var(--text) 8%, transparent);
}

.search-history-clock {
  flex-shrink: 0;
  color: var(--text-muted);
  opacity: 0.85;
}

.search-history-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-history-remove {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0.55;
}
.search-history-item:hover .search-history-remove,
.search-history-remove:hover {
  opacity: 1;
  background: color-mix(in srgb, var(--text) 10%, transparent);
  color: var(--text);
}
</style>
