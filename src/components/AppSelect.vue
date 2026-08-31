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
    <Teleport to="body">
      <div
        v-if="open"
        ref="menuRef"
        class="app-select-menu"
        :style="menuStyle"
        role="listbox"
        @click.stop
      >
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
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'

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
const menuRef = ref(null)
const open = ref(false)
const menuStyle = ref({})

const currentLabel = computed(() => {
  const opt = props.options.find(o => o.value === props.modelValue)
  return opt?.label ?? String(props.modelValue ?? '')
})

function updateMenuPosition() {
  const trigger = rootRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  const menuEl = menuRef.value
  const menuWidth = menuEl?.offsetWidth || Math.max(rect.width, 120)
  const maxLeft = Math.max(8, window.innerWidth - menuWidth - 8)
  const left = Math.min(rect.left, maxLeft)
  menuStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 6}px`,
    left: `${left}px`,
    minWidth: `${rect.width}px`,
    zIndex: 1300,
  }
}

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
  if (rootRef.value?.contains(e.target) || menuRef.value?.contains(e.target)) return
  open.value = false
}

function onKeydown(e) {
  if (e.key === 'Escape') open.value = false
}

watch(open, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  updateMenuPosition()
  await nextTick()
  updateMenuPosition()
})

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', updateMenuPosition)
  window.addEventListener('scroll', updateMenuPosition, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', updateMenuPosition)
  window.removeEventListener('scroll', updateMenuPosition, true)
})
</script>
