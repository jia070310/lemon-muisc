<template>
  <Teleport to="body">
    <div v-if="open" class="probe-modal-overlay" @click.self="emit('close')">
      <div
        class="probe-modal card"
        role="dialog"
        aria-modal="true"
        aria-label="音源状态监测"
        @click.stop
      >
        <div class="probe-modal-head">
          <h2 class="probe-modal-title">音源状态监测</h2>
          <button type="button" class="probe-close" title="关闭" aria-label="关闭" @click="emit('close')">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div class="probe-modal-body">
          <SourceProbePanel
            :active="open"
            :reload-token="panelReloadToken"
            :show-title="false"
            @updated="emit('updated', $event)"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import SourceProbePanel from './SourceProbePanel.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** 外部在导入/激活后递增，强制面板重拉 */
  reloadToken: { type: [Number, String], default: 0 },
})
const emit = defineEmits(['close', 'updated'])

const panelReloadToken = ref(0)

function bumpReload() {
  panelReloadToken.value += 1
}

function onKeydown(ev) {
  if (ev.key === 'Escape' && props.open) emit('close')
}

watch(() => props.open, (on, wasOn) => {
  if (typeof document !== 'undefined') {
    if (on) document.addEventListener('keydown', onKeydown)
    else document.removeEventListener('keydown', onKeydown)
  }
  if (on && !wasOn) bumpReload()
})

watch(() => props.reloadToken, (v, prev) => {
  if (props.open && v !== prev) bumpReload()
})

onMounted(() => {
  if (props.open) {
    bumpReload()
    document.addEventListener('keydown', onKeydown)
  }
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.probe-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background: color-mix(in srgb, #000 48%, transparent);
  backdrop-filter: blur(4px);
}
.probe-modal {
  width: min(880px, 100%);
  max-height: min(84vh, 820px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--border-light);
  box-shadow: 0 18px 48px color-mix(in srgb, #000 28%, transparent);
}
.probe-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}
.probe-modal-title {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
}
.probe-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-elevated, color-mix(in srgb, var(--text) 10%, transparent));
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
}
.probe-close:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--text) 12%, var(--bg-elevated, transparent));
  border-color: var(--border);
}
.probe-modal-body {
  padding: 14px 16px 18px;
  overflow: auto;
  min-height: 0;
  flex: 1;
}
</style>
