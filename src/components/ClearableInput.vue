<template>
  <div
    class="clearable-input"
    :class="[
      `clearable-input--${variant}`,
      { 'has-icon': showSearchIcon, 'has-clear': showClear },
    ]"
  >
    <svg
      v-if="showSearchIcon"
      class="clearable-input-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
    <input
      ref="inputRef"
      :value="modelValue"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      :enterkeyhint="enterkeyhint"
      :class="inputClass"
      @input="onInput"
      @keydown.enter="$emit('enter', $event)"
    />
    <button
      v-if="showClear"
      type="button"
      class="clearable-input-clear"
      tabindex="-1"
      aria-label="清空"
      @click="clear"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  showSearchIcon: { type: Boolean, default: false },
  variant: {
    type: String,
    default: 'plain',
    validator: (v) => ['plain', 'pill', 'bar'].includes(v),
  },
  type: { type: String, default: 'text' },
  disabled: { type: Boolean, default: false },
  enterkeyhint: { type: String, default: '' },
  inputClass: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'enter', 'clear'])

const inputRef = ref(null)
const showClear = computed(() => Boolean(props.modelValue?.length))

function onInput(e) {
  emit('update:modelValue', e.target.value)
}

function clear() {
  emit('update:modelValue', '')
  emit('clear')
  inputRef.value?.focus()
}

defineExpose({ focus: () => inputRef.value?.focus() })
</script>

<style scoped>
.clearable-input {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;
}

.clearable-input--plain {
  width: 100%;
}

.clearable-input--pill,
.clearable-input--bar {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 12px 0 16px;
  border-radius: var(--radius-pill);
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  gap: 10px;
}

.clearable-input--pill:focus-within,
.clearable-input--bar:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-muted);
}

.clearable-input-icon {
  width: 18px;
  height: 18px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.clearable-input input {
  flex: 1;
  min-width: 0;
  width: 100%;
  border: none;
  background: transparent;
  padding: 0;
  box-shadow: none;
  font-size: 15px;
  color: inherit;
}

.clearable-input input:focus {
  outline: none;
  border: none;
  box-shadow: none;
}

.clearable-input--plain input {
  padding-right: 30px;
  font-size: inherit;
}

.clearable-input--plain.has-clear input {
  padding-right: 34px;
}

.clearable-input-clear {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.clearable-input-clear:hover {
  background: rgba(255, 255, 255, 0.16);
  color: var(--text);
}

.clearable-input--plain .clearable-input-clear {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
}
</style>
