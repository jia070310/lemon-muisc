<template>
  <div class="discover-song-actions" @click.stop>
    <MobileRowActions
      :open="actionsOpen"
      @toggle="toggleActions"
      @close="closeActions"
    >
      <button
        type="button"
        class="icon-action-btn"
        :class="{ added: queued }"
        :title="queued ? '已在试听列表' : '加入试听列表'"
        @click="onQueue"
      >
        <svg v-if="queued" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2" fill="none"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>

      <button
        type="button"
        class="icon-action-btn"
        :class="{ 'fav-active': favorited }"
        :title="favorited ? '取消收藏' : '加入收藏'"
        @click="onFavorite"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          :fill="favorited ? 'currentColor' : 'none'"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>
        </svg>
      </button>

      <button
        type="button"
        class="icon-action-btn"
        title="加入歌单"
        @click="onPlaylist"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15V6"/><path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/><path d="M12 12H3"/><path d="M16 6H3"/><path d="M12 18H3"/>
        </svg>
      </button>

      <div class="dl-wrap" data-keep-actions-open>
        <button type="button" class="icon-action-btn" title="下载" @click="toggleMenu($event)">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        <Teleport to="body">
          <div
            v-if="menuOpen"
            class="quality-menu discover-dl-quality-menu"
            :style="menuStyle"
            data-keep-actions-open
            @click.stop
          >
            <div class="quality-menu-title">选择音质</div>
            <template v-if="qualities.length">
              <button
                v-for="q in qualities"
                :key="q"
                type="button"
                class="quality-option"
                @click="onDownload(q)"
              >{{ getQualityDisplay(q, item.types) }}</button>
            </template>
            <div v-else class="quality-empty">该曲暂无可用音质（音源未返回）</div>
          </div>
        </Teleport>
      </div>
    </MobileRowActions>

    <PickPlaylistModal
      v-if="pickTrack"
      :track="pickTrack"
      :source="resolvedSource"
      @close="pickTrack = null"
      @added="onPlaylistAdded"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import MobileRowActions from '../MobileRowActions.vue'
import PickPlaylistModal from '../PickPlaylistModal.vue'
import { api } from '../../api.js'
import { assertActiveSourceForDownload } from '../../stores/downloadGuard.js'
import {
  isFavorite,
  toggleFavorite,
  playlistPickTarget,
  addToPickingPlaylist,
} from '../../stores/library.js'
import { addToQueue, isInQueue } from '../../stores/player.js'
import { buildDownloadTask, getItemQualities } from '../../utils/musicPayload.js'
import { getQualityDisplay, getQualityLabel } from '../../utils/quality.js'
import { useQualityMenuPosition } from '../../utils/qualityMenu.js'

/** 窄屏下同一时刻只展开一行操作 */
const openOwnerId = ref('')
let seq = 0

const props = defineProps({
  item: { type: Object, required: true },
  source: { type: String, default: '' },
})
const emit = defineEmits(['toast'])

const ownerId = `dsa-${++seq}`
const actionsOpen = computed({
  get: () => openOwnerId.value === ownerId,
  set: (v) => {
    openOwnerId.value = v ? ownerId : (openOwnerId.value === ownerId ? '' : openOwnerId.value)
  },
})
const menuOpen = ref(false)
const pickTrack = ref(null)
const { menuStyle, positionMenu, clearMenuPosition } = useQualityMenuPosition()

const resolvedSource = computed(() => props.source || props.item?.source || '')
const queued = computed(() => isInQueue(props.item, resolvedSource.value))
const favorited = computed(() => isFavorite(props.item))
const qualities = computed(() => getItemQualities(props.item))

function notify(text, type = 'info') {
  emit('toast', { text, type })
}

function closeMenu() {
  menuOpen.value = false
  clearMenuPosition()
}

function closeActions() {
  if (openOwnerId.value === ownerId) openOwnerId.value = ''
  closeMenu()
}

function toggleActions() {
  actionsOpen.value = !actionsOpen.value
  if (!actionsOpen.value) closeMenu()
}

function onQueue() {
  if (queued.value) {
    notify('已在试听列表', 'info')
    return
  }
  addToQueue(props.item, resolvedSource.value)
  notify(`已加入试听列表: ${props.item.name || ''}`, 'success')
}

function onFavorite() {
  const added = toggleFavorite({ ...props.item, source: resolvedSource.value })
  notify(added ? `已加入收藏: ${props.item.name || ''}` : '已取消收藏', added ? 'success' : 'info')
}

function onPlaylist() {
  if (playlistPickTarget.value) {
    const res = addToPickingPlaylist(props.item, resolvedSource.value)
    if (res.ok) notify(`已加入歌单：${playlistPickTarget.value?.name || ''}`, 'success')
    else if (res.duplicate) notify('该歌曲已在歌单中', 'info')
    else notify('加入歌单失败', 'error')
    return
  }
  closeActions()
  pickTrack.value = { ...props.item, source: resolvedSource.value }
}

function onPlaylistAdded({ playlist, duplicate }) {
  if (duplicate) notify('该歌曲已在歌单中', 'info')
  else notify(`已加入歌单：${playlist?.name || ''}`, 'success')
  pickTrack.value = null
}

function toggleMenu(event) {
  menuOpen.value = !menuOpen.value
  if (menuOpen.value) {
    openOwnerId.value = ownerId
    // 发现页轮播有 transform，fixed 会相对变换层偏移；挂到 body 并用视口坐标
    positionMenu(event?.currentTarget, { align: 'right', zIndex: 120 })
  } else {
    clearMenuPosition()
  }
}

async function onDownload(quality) {
  closeMenu()
  closeActions()
  if (!(await assertActiveSourceForDownload())) return
  try {
    await api.download.add([buildDownloadTask(props.item, resolvedSource.value, quality)])
    notify(`已添加下载: ${props.item.name || ''} (${getQualityLabel(quality, props.item.types)})`, 'success')
  } catch (e) {
    notify(e.message || '下载失败', 'error')
  }
}

function onDocClick(e) {
  if (!menuOpen.value) return
  if (e.target?.closest?.('[data-keep-actions-open]')) return
  closeMenu()
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  clearMenuPosition()
})
</script>

<style scoped>
.discover-song-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
}
.icon-action-btn.added {
  color: var(--success);
  border-color: rgba(52, 199, 89, 0.45);
  background: rgba(52, 199, 89, 0.12);
}
.dl-wrap { position: relative; }
.discover-dl-quality-menu.quality-menu {
  background: var(--bg-elevated, var(--bg-card));
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 6px 0;
  min-width: 160px;
}
.discover-dl-quality-menu .quality-menu-title {
  padding: 6px 12px 4px;
  font-size: 12px;
  color: var(--text-muted);
}
.discover-dl-quality-menu .quality-option {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}
.discover-dl-quality-menu .quality-option:hover {
  background: var(--bg-hover);
  color: var(--accent);
}
.discover-dl-quality-menu .quality-empty {
  padding: 10px 12px;
  font-size: 13px;
  color: var(--text-muted);
}
</style>
