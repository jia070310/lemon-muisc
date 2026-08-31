<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-card">
      <div class="modal-head">
        <h3>加入歌单</h3>
        <button type="button" class="btn-ghost btn-sm" @click="$emit('close')">关闭</button>
      </div>

      <p v-if="trackName" class="track-hint">「{{ trackName }}」</p>

      <div v-if="!playlists.length" class="empty">
        <p>暂无自定义歌单</p>
        <button type="button" class="btn-primary btn-sm" @click="showCreate = true">创建歌单</button>
      </div>
      <div v-else class="playlist-pick-list">
        <button
          v-for="pl in playlists"
          :key="pl.id"
          type="button"
          class="pick-item"
          @click="pick(pl)"
        >
          <span class="pick-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15V6"/>
              <path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/>
              <path d="M12 12H3"/>
              <path d="M16 6H3"/>
              <path d="M12 18H3"/>
            </svg>
          </span>
          <span class="pick-name">{{ pl.name }}</span>
          <span class="pick-count">{{ pl.trackKeys.length }} 首</span>
        </button>
      </div>

      <div v-if="playlists.length" class="modal-foot">
        <button type="button" class="btn-ghost btn-sm" @click="showCreate = true">新建歌单</button>
      </div>
    </div>

    <CreatePlaylistModal
      v-if="showCreate"
      :api="api"
      @close="showCreate = false"
      @created="onCreate"
      @imported="onImported"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import CreatePlaylistModal from './CreatePlaylistModal.vue'
import { customPlaylists, addTracksToPlaylist } from '../stores/library.js'
import { api } from '../api.js'

const props = defineProps({
  track: { type: Object, required: true },
  source: { type: String, default: 'local' },
  excludePlaylistId: { type: String, default: '' },
})

const emit = defineEmits(['close', 'added'])

const showCreate = ref(false)

const trackName = computed(() => props.track?.name || '')

const playlists = computed(() =>
  customPlaylists.value.filter(pl => pl.id !== props.excludePlaylistId)
)

function pick(pl) {
  const res = addTracksToPlaylist(pl.id, [props.track], props.source)
  emit('added', {
    playlist: res.playlist,
    duplicate: res.added === 0,
    added: res.added,
  })
  if (res.added > 0) emit('close')
}

function onCreate({ playlist }) {
  showCreate.value = false
  if (!playlist) return
  pick(playlist)
}

function onImported({ playlist }) {
  showCreate.value = false
  if (!playlist) return
  emit('added', {
    playlist,
    duplicate: false,
    added: playlist.trackKeys?.length || 0,
  })
  emit('close')
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.modal-card {
  width: min(420px, 100%);
  max-height: min(80vh, 560px);
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 20px;
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.modal-head h3 { margin: 0; font-size: 17px; }
.track-hint {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.playlist-pick-list {
  flex: 1;
  min-height: 0;
  max-height: 360px;
  overflow: auto;
  border: 1px solid var(--border-light);
  border-radius: 10px;
}
.pick-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: none;
  border-bottom: 1px solid var(--border-light);
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}
.pick-item:last-child { border-bottom: none; }
.pick-item:hover { background: var(--bg-hover); }
.pick-icon {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: var(--accent-muted);
  color: var(--accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pick-name {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pick-count {
  font-size: 13px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.empty {
  padding: 28px 12px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}
.empty p { margin: 0 0 14px; }
.modal-foot {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
}
</style>
