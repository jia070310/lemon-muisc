<template>
  <!-- 手机抽屉：必须挂到 body，避免被播放条 backdrop-filter 困在局部层叠里盖不住底栏 -->
  <Teleport to="body">
    <div
      v-if="open && sheet"
      class="song-info-sheet-host"
      @click.self="emit('close')"
    >
      <div class="song-info-backdrop" @click="emit('close')" />
      <div
        ref="panelRef"
        class="song-info-panel is-sheet"
        role="dialog"
        aria-labelledby="song-info-title"
        aria-modal="true"
        @click.stop
      >
        <div class="song-info-handle" aria-hidden="true" />
        <div class="song-info-header">
          <span id="song-info-title" class="song-info-title">歌曲信息</span>
          <div class="song-info-header-actions">
            <button
              v-if="filePath"
              type="button"
              class="btn-ghost btn-sm"
              @click="onOpenTagEdit"
            >标签编辑</button>
            <button type="button" class="btn-icon" title="关闭" @click="emit('close')">×</button>
          </div>
        </div>

        <div class="song-info-body">
          <div class="song-info-cover">
            <CoverArt :src="cover" />
          </div>
          <div class="song-info-main">
            <div class="song-info-name" :title="title">{{ title || '未知歌曲' }}</div>
            <div class="song-info-links" @click.capture="onMetaNavigate">
              <TrackMetaLinks :singer="singer" :album="album" />
            </div>
          </div>
        </div>

        <dl class="song-info-list">
          <div v-for="row in rows" :key="row.label" class="song-info-row">
            <dt>{{ row.label }}</dt>
            <dd :title="row.value">{{ row.value }}</dd>
          </div>
        </dl>

        <div v-if="loading" class="song-info-loading">正在读取文件信息…</div>
      </div>
    </div>
  </Teleport>

  <!-- 桌面：仍挂在播放条旁的浮层 -->
  <div
    v-if="open && !sheet"
    ref="panelRef"
    class="song-info-panel card"
    role="dialog"
    aria-labelledby="song-info-title"
    aria-modal="true"
    @click.stop
  >
    <div class="song-info-header">
      <span id="song-info-title" class="song-info-title">歌曲信息</span>
      <div class="song-info-header-actions">
        <button
          v-if="filePath"
          type="button"
          class="btn-ghost btn-sm"
          @click="onOpenTagEdit"
        >标签编辑</button>
        <button type="button" class="btn-icon" title="关闭" @click="emit('close')">×</button>
      </div>
    </div>

    <div class="song-info-body">
      <div class="song-info-cover">
        <CoverArt :src="cover" />
      </div>
      <div class="song-info-main">
        <div class="song-info-name" :title="title">{{ title || '未知歌曲' }}</div>
        <div class="song-info-links" @click.capture="onMetaNavigate">
          <TrackMetaLinks :singer="singer" :album="album" />
        </div>
      </div>
    </div>

    <dl class="song-info-list">
      <div v-for="row in rows" :key="row.label" class="song-info-row">
        <dt>{{ row.label }}</dt>
        <dd :title="row.value">{{ row.value }}</dd>
      </div>
    </dl>

    <div v-if="loading" class="song-info-loading">正在读取文件信息…</div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import CoverArt from './CoverArt.vue'
import TrackMetaLinks from './TrackMetaLinks.vue'
import { api } from '../api.js'
import { cleanText, formatArtists } from '../utils/text.js'
import { formatDuration } from '../utils/format.js'
import { getTrackFilePath } from '../utils/trackPath.js'
import { getQualityLabel } from '../utils/quality.js'
import { platformLabel } from '../utils/platforms.js'
import { openTagEditTrack } from '../utils/tagEdit.js'
import {
  coverUrl,
  displayDuration,
  fmtTime,
  playQuality,
  currentPlayPlatformLabel,
} from '../stores/player.js'
import { localCoverUrl } from '../stores/library.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  track: { type: Object, default: null },
  /** 手机端底部抽屉 */
  sheet: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const panelRef = ref(null)
const loading = ref(false)
const fileMeta = ref(null)
let loadToken = 0

defineExpose({ panelRef })

const track = computed(() => props.track || null)
const filePath = computed(() => getTrackFilePath(track.value))
const title = computed(() => cleanText(fileMeta.value?.title || track.value?.name || ''))
const singer = computed(() => (
  fileMeta.value?.artist
  || formatArtists(track.value?.singer)
  || track.value?.singer
  || ''
))
const album = computed(() => String(fileMeta.value?.album || track.value?.album || '').trim())
const cover = computed(() => {
  const fromTrack = coverUrl.value || track.value?.picUrl || track.value?.img || ''
  if (fromTrack) return fromTrack
  // 本地文件优先走封面接口（不必等 tag.read 的 base64）
  if (filePath.value) return localCoverUrl(filePath.value)
  if (fileMeta.value?.pictureBase64 && fileMeta.value?.pictureMime) {
    return `data:${fileMeta.value.pictureMime};base64,${fileMeta.value.pictureBase64}`
  }
  return ''
})

const rows = computed(() => {
  const t = track.value
  if (!t) return []
  const meta = fileMeta.value
  const list = []

  const durSec = Number(meta?.duration) || Number(displayDuration.value) || Number(t.duration) || 0
  const durLabel = durSec > 0
    ? (fmtTime(durSec) || formatDuration(durSec))
    : (t.interval || '')
  if (durLabel) list.push({ label: '时长', value: durLabel })

  const year = meta?.year || t.year
  if (year) list.push({ label: '年份', value: String(year) })

  const genre = meta?.genre || t.genre
  if (genre) list.push({ label: '流派', value: String(genre) })

  const format = meta?.format || t.format
  if (format) list.push({ label: '格式', value: String(format).toUpperCase() })

  if (meta?.bitrate) {
    list.push({ label: '码率', value: `${Math.round(Number(meta.bitrate) / 1000)} kbps` })
  }
  if (meta?.sampleRate) {
    const khz = Number(meta.sampleRate) / 1000
    list.push({ label: '采样率', value: `${khz % 1 === 0 ? khz.toFixed(0) : khz.toFixed(1)} kHz` })
  }
  if (meta?.bitsPerSample) {
    list.push({ label: '位深', value: `${meta.bitsPerSample} bit` })
  }

  if (!filePath.value) {
    const q = playQuality.value
    if (q) list.push({ label: '试听音质', value: getQualityLabel(q, t.types) })
    const plat = currentPlayPlatformLabel.value || platformLabel(t.source)
    if (plat) list.push({ label: '音源', value: plat })
    else if (t.source) list.push({ label: '音源', value: String(t.source) })
  } else {
    list.push({ label: '来源', value: '本地文件' })
  }

  if (filePath.value) list.push({ label: '路径', value: filePath.value })

  return list
})

watch(
  () => [props.open, filePath.value],
  async ([open, path]) => {
    const token = ++loadToken
    fileMeta.value = null
    if (!open || !path) {
      loading.value = false
      return
    }
    loading.value = true
    try {
      const res = await api.tag.read(path)
      if (token !== loadToken) return
      fileMeta.value = res?.data || res || null
    } catch {
      if (token !== loadToken) return
      fileMeta.value = null
    } finally {
      if (token === loadToken) loading.value = false
    }
  },
)

function onMetaNavigate(e) {
  if (e?.target?.closest?.('.track-meta-link')) emit('close')
}

function onOpenTagEdit() {
  if (!filePath.value) return
  emit('close')
  openTagEditTrack(filePath.value)
}
</script>

<style scoped>
/* 裁剪区下沿对齐试听条顶边：弹出动画从该线往上，不会从屏幕最底冒出 */
.song-info-sheet-host {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: calc(var(--player-height, 64px) + env(safe-area-inset-bottom, 0px));
  z-index: 200;
  overflow: hidden;
  pointer-events: none;
}
.song-info-sheet-host > * {
  pointer-events: auto;
}

.song-info-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
}

.song-info-panel {
  position: absolute;
  bottom: 72px;
  left: 24px;
  width: min(380px, calc(100vw - var(--sidebar-width) - 48px));
  max-height: 420px;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow);
  z-index: 60;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
  padding: 0;
}

.song-info-panel.is-sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  width: auto;
  min-height: 0;
  max-height: min(62dvh, 100%);
  z-index: 1;
  margin: 0;
  border-radius: 16px 16px 0 0;
  border: 1px solid var(--border-light);
  border-left: none;
  border-right: none;
  border-bottom: none;
  padding-bottom: 0;
  background: var(--bg-card);
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  transform: translateY(0);
  animation: song-info-sheet-in 0.28s cubic-bezier(0.22, 0.9, 0.28, 1);
}

@media (max-width: 768px) {
  .song-info-sheet-host {
    bottom: calc(var(--player-height, 64px) + var(--mobile-nav-height, 56px) + env(safe-area-inset-bottom, 0px));
  }
}

@keyframes song-info-sheet-in {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.song-info-handle {
  width: 36px;
  height: 4px;
  border-radius: 999px;
  background: var(--border);
  margin: 10px auto 0;
  flex-shrink: 0;
}

.song-info-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-elevated);
  flex-shrink: 0;
}
.song-info-panel.is-sheet .song-info-header {
  background: transparent;
}
.song-info-title {
  font-size: 14px;
  font-weight: 600;
}
.song-info-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
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

.song-info-body {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 14px;
  flex-shrink: 0;
}
.song-info-cover {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-input);
}
.song-info-panel.is-sheet .song-info-cover {
  width: 64px;
  height: 64px;
  border-radius: 10px;
}
.song-info-cover :deep(.cover-art) {
  width: 100%;
  height: 100%;
}
.song-info-main {
  min-width: 0;
  flex: 1;
}
.song-info-name {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.song-info-panel.is-sheet .song-info-name {
  font-size: 15px;
}
.song-info-links {
  font-size: 12px;
  color: var(--text-muted);
}
.song-info-links :deep(.track-meta-links) {
  font-size: inherit;
  color: inherit;
}

.song-info-list {
  margin: 0;
  padding: 0 14px 12px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  -webkit-overflow-scrolling: touch;
}
.song-info-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  padding: 8px 0;
  border-top: 1px solid var(--border-light);
}
.song-info-row dt {
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.song-info-row dd {
  margin: 0;
  font-size: 12px;
  text-align: right;
  word-break: break-all;
  color: var(--text);
  max-width: 72%;
}
.song-info-loading {
  padding: 0 14px 12px;
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
}
</style>
