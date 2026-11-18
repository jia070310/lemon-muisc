<template>
  <div class="cast-inner">
    <div class="queue-header">
      <span class="queue-title"><CastIcon :size="16" />投屏到 DLNA</span>
      <div class="queue-header-actions">
        <button class="btn-ghost btn-sm" type="button" :disabled="loading" @click="search(true)">
          {{ loading ? '搜索中…' : '重新搜索' }}
        </button>
        <button
          v-if="dlnaCastingUdn"
          class="btn-ghost btn-sm"
          type="button"
          @click="stopCast"
        >停止</button>
        <button class="btn-icon" type="button" @click="emit('close')">×</button>
      </div>
    </div>
    <p v-if="error" class="cast-err">{{ error }}</p>
    <div v-if="loading && !devices.length" class="cast-empty">正在搜索设备…</div>
    <div v-else-if="!devices.length" class="cast-empty">未发现设备</div>
    <div v-else class="queue-list">
      <button
        v-for="d in devices"
        :key="d.udn"
        type="button"
        class="queue-item dev-row"
        :class="{ active: dlnaCastingUdn === d.udn }"
        :disabled="playingUdn === d.udn"
        @click="castTo(d)"
      >
        <span class="dev-meta">
          <span class="queue-name">{{ d.name }}</span>
          <span v-if="d.kind === 'app'" class="dev-sub">应用接收端 · 建议投系统电视</span>
          <span v-else-if="d.host" class="dev-sub">{{ d.host }}</span>
        </span>
        <em>{{ playingUdn === d.udn ? '投送中…' : (dlnaCastingUdn === d.udn ? '投送中' : '投送') }}</em>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { api } from '../api.js'
import {
  currentPlaying,
  coverUrl,
  getCurrentPlayStreamRel,
  dlnaCastingUdn,
  pushPlayingToDlna,
  stopDlnaCast,
} from '../stores/player.js'
import CastIcon from './CastIcon.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const devices = ref([])
const loading = ref(false)
const error = ref('')
const playingUdn = ref('')

async function search(refresh = false) {
  loading.value = true
  error.value = ''
  try {
    const res = await api.dlna.devices(refresh)
    devices.value = res.data || []
  } catch (e) {
    error.value = e.message || '搜索失败'
  } finally {
    loading.value = false
  }
}

async function castTo(device) {
  const t = currentPlaying.value
  if (!t) {
    error.value = '当前没有正在播放的内容'
    return
  }
  playingUdn.value = device.udn
  error.value = ''
  try {
    const pic = String(t.picUrl || t.img || coverUrl.value || '').trim()
    // 带上完整播放队列，由服务端按播放模式连播；勿只投当前一首否则播完即停
    await pushPlayingToDlna(device.udn, {
      streamRel: getCurrentPlayStreamRel() || undefined,
      picUrl: pic && !pic.startsWith('blob:') ? pic : undefined,
      deviceName: device.name,
      host: device.host,
    })
  } catch (e) {
    error.value = e.message || '投送失败'
  } finally {
    playingUdn.value = ''
  }
}

async function stopCast() {
  if (!dlnaCastingUdn.value) return
  try {
    await stopDlnaCast()
  } catch (e) {
    error.value = e.message || '停止失败'
  }
}

watch(() => props.open, (v) => {
  if (v) search(true)
}, { immediate: true })
</script>

<style scoped>
.cast-inner {
  display: flex;
  flex-direction: column;
  min-height: 280px;
  height: 100%;
  max-height: inherit;
}
.queue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-elevated);
  gap: 8px;
  flex-shrink: 0;
}
.queue-title {
  font-size: 14px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.queue-header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.btn-icon {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 18px;
  padding: 0 4px;
  line-height: 1;
  cursor: pointer;
}
.btn-icon:hover { color: var(--text); }
.cast-empty {
  margin: 0;
  flex: 1;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 14px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}
.cast-err {
  margin: 0;
  padding: 8px 14px;
  font-size: 12px;
  color: var(--danger, #ef4444);
  flex-shrink: 0;
}
.queue-list {
  overflow-y: auto;
  flex: 1;
  min-height: 200px;
}
.dev-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--border-light);
  background: transparent;
  color: inherit;
  padding: 10px 14px;
  cursor: pointer;
  border-radius: 0;
  text-align: left;
}
.dev-row:hover { background: var(--bg-hover); }
.dev-row.active { background: var(--accent-muted); }
.dev-row:disabled { opacity: 0.7; cursor: wait; }
.dev-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 10px;
}
.queue-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dev-sub {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dev-row em { font-style: normal; color: var(--accent); font-size: 12px; flex-shrink: 0; }
</style>
