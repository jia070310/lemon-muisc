<template>
  <div
    ref="rootRef"
    class="mobile-row-actions"
    :class="{ open: open, narrow: isNarrow }"
    @click.stop
  >
    <button
      v-if="isNarrow"
      type="button"
      class="icon-action-btn actions-toggle"
      :class="{ active: open }"
      :title="open ? '收起操作' : '更多操作'"
      :aria-expanded="open ? 'true' : 'false'"
      @click.stop="$emit('toggle')"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="1.7"/>
        <circle cx="12" cy="12" r="1.7"/>
        <circle cx="12" cy="19" r="1.7"/>
      </svg>
    </button>
    <div
      v-show="!isNarrow || open"
      class="mobile-row-actions-panel"
      @click.capture="onPanelAction"
    >
      <slot />
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
})

const emit = defineEmits(['toggle', 'close'])

const isNarrow = ref(false)
const rootRef = ref(null)
let mq = null

function updateNarrow() {
  isNarrow.value = mq?.matches ?? window.innerWidth <= 768
}

function onDocPointer(e) {
  if (!props.open || !isNarrow.value) return
  const el = rootRef.value
  if (el && !el.contains(e.target)) emit('close')
}

function onPanelAction() {
  if (isNarrow.value && props.open) emit('close')
}

onMounted(() => {
  mq = window.matchMedia('(max-width: 768px)')
  updateNarrow()
  mq.addEventListener('change', updateNarrow)
  document.addEventListener('pointerdown', onDocPointer, true)
})

onUnmounted(() => {
  mq?.removeEventListener('change', updateNarrow)
  document.removeEventListener('pointerdown', onDocPointer, true)
})
</script>

<style scoped>
.mobile-row-actions {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
}
.mobile-row-actions-panel {
  display: flex;
  align-items: center;
  gap: 4px;
}
.actions-toggle {
  display: none;
}
.mobile-row-actions.narrow .actions-toggle {
  display: inline-flex;
}
.mobile-row-actions.narrow .mobile-row-actions-panel {
  position: absolute;
  right: calc(100% + 6px);
  top: 50%;
  transform: translateY(-50%);
  z-index: 30;
  gap: 2px;
  padding: 6px;
  border-radius: 12px;
  background: var(--bg-elevated, var(--bg-card));
  border: 1px solid var(--border-light, var(--border));
  box-shadow: var(--shadow, 0 10px 28px rgba(0, 0, 0, 0.28));
  white-space: nowrap;
}
.mobile-row-actions.narrow.open {
  z-index: 31;
}
.mobile-row-actions.narrow .actions-toggle.active {
  color: var(--accent);
  background: var(--bg-hover);
}
</style>
