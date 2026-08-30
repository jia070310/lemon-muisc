<template>
  <div
    ref="rootRef"
    class="app-select"
    :class="[
      `size-${size}`,
      variant ? `variant-${variant}` : '',
      { open, block, disabled },
    ]"
    :style="minWidth ? { minWidth } : undefined"
  >
    <button
      type="button"
      class="app-select-trigger"
      :title="title"
      :disabled="disabled"
      :aria-expanded="open"
      @click.stop="toggle"
    >
      <span class="app-select-value">{{ currentLabel }}</span>
      <svg class="app-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>
    <div v-if="open" class="app-select-menu" role="listbox" @click.stop>
      <button
        v-for="opt in options"
        :key="String(opt.value)"
        type="button"
        class="app-select-option"
        :class="{ active: opt.value === modelValue }"
        role="option"
        :aria-selected="opt.value === modelValue"
        @click="pick(opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] },
  title: { type: String, default: '' },
  size: { type: String, default: 'md' },
  variant: { type: String, default: '' },
  block: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  minWidth: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'change'])

const rootRef = ref(null)
const open = ref(false)

const currentLabel = computed(() => {
  const opt = props.options.find(o => o.value === props.modelValue)
  return opt?.label ?? String(props.modelValue ?? '')
})

function toggle() {
  if (props.disabled) return
  open.value = !open.value
}

function pick(value) {
  if (value !== props.modelValue) {
    emit('update:modelValue', value)
    emit('change', value)
  }
  open.value = false
}

function onDocClick(e) {
  if (!rootRef.value?.contains(e.target)) open.value = false
}

function onKeydown(e) {
  if (e.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>
