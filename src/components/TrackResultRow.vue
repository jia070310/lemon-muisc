<template>
  <div
    class="result-row"
    :class="{ playing, selected }"
  >
    <span class="col-check" @click.stop>
      <input type="checkbox" :checked="selected" @change="$emit('toggle-select')" />
    </span>
    <span class="col-index">{{ index + 1 }}</span>
    <span class="col-name" :title="cleanText(item.name)">{{ cleanText(item.name) }}</span>
    <span class="col-singer" :title="formatArtists(item.singer)">{{ formatArtists(item.singer) }}</span>
    <span class="col-album" :title="cleanText(item.album || item.albumName)">{{ cleanText(item.album || item.albumName) || '-' }}</span>
    <span class="col-duration">{{ item.interval || '-' }}</span>
    <span class="col-play">
      <button class="play-btn" @click="$emit('toggle-play')" :title="playing && !paused ? '暂停' : '试听'">
        <svg v-if="playing && !paused" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        <svg v-else-if="loading" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10" stroke-dasharray="50" stroke-dashoffset="20"/></svg>
        <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
      </button>
    </span>
    <span class="col-queue">
      <button
        class="queue-add-btn"
        :class="{ added: inQueue }"
        @click="$emit('add-queue')"
        :title="inQueue ? '已在列表' : '加入试听列表'"
      >
        <svg v-if="inQueue" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2" fill="none"/></svg>
        <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
    </span>
    <span class="col-action">
      <button
        v-if="showPlaylistPick"
        class="btn-sm btn-ghost playlist-add-btn"
        @click="$emit('add-playlist')"
        title="加入歌单"
      >加入歌单</button>
      <div class="dl-wrap">
        <button class="dl-btn" @click.stop="$emit('toggle-quality-menu', $event)" title="下载">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
        <div class="quality-menu" v-if="qualityMenuOpen" :style="menuStyle" @click.stop>
          <div class="quality-menu-title">选择音质</div>
          <template v-if="qualities.length">
            <button
              v-for="q in qualities"
              :key="q"
              class="quality-option"
              @click="$emit('download', q)"
            >{{ getQualityDisplay(q, item.types) }}</button>
          </template>
          <div v-else class="quality-empty">暂无可用音质</div>
        </div>
      </div>
    </span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { cleanText, formatArtists } from '../utils/text.js'
import { getQualityDisplay } from '../utils/quality.js'
import { getItemQualities } from '../utils/musicPayload.js'

const props = defineProps({
  item: { type: Object, required: true },
  index: { type: Number, required: true },
  selected: Boolean,
  playing: Boolean,
  paused: Boolean,
  loading: Boolean,
  inQueue: Boolean,
  showPlaylistPick: Boolean,
  qualityMenuOpen: Boolean,
  menuStyle: { type: Object, default: () => ({}) },
})

defineEmits([
  'toggle-select',
  'toggle-play',
  'add-queue',
  'add-playlist',
  'toggle-quality-menu',
  'download',
])

const qualities = computed(() => props.item._qualities || getItemQualities(props.item))
</script>

<style scoped>
.result-row {
  display: grid;
  grid-template-columns: 36px 48px minmax(180px, 2.2fr) minmax(120px, 1fr) minmax(120px, 1fr) 64px 44px 44px 44px;
  align-items: center;
  padding: 10px 16px;
  gap: 10px;
  font-size: 13px;
  border-bottom: 1px solid var(--border-light);
  transition: background 0.15s;
}
.result-row:last-child { border-bottom: none; }
.result-row:hover { background: var(--bg-hover); }
.result-row.playing { background: var(--accent-muted); }
.result-row.selected { background: var(--accent-muted); }

.col-check {
  display: flex;
  align-items: center;
  justify-content: center;
}
.col-check input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
}

.col-name, .col-singer, .col-album {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.col-name { font-weight: 500; }
.col-singer, .col-album { color: var(--text-secondary); }
.col-duration { color: var(--text-muted); text-align: center; }
.col-index { color: var(--text-muted); text-align: center; }
.col-play { text-align: center; }
.col-queue { text-align: center; }
.col-action { text-align: center; position: relative; overflow: visible; }

.playlist-add-btn {
  margin-right: 6px;
  white-space: nowrap;
}

.queue-add-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.2s;
  border: 1px solid var(--border);
}
.queue-add-btn:hover { color: var(--accent); border-color: var(--accent); background: var(--accent-muted); }
.queue-add-btn.added { color: var(--success); border-color: var(--success); background: rgba(52, 199, 89, 0.1); cursor: default; }

.play-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.2s;
  border: 1px solid var(--border);
}
.play-btn:hover { color: var(--accent); border-color: var(--accent); background: var(--accent-muted); }
.result-row.playing .play-btn { color: var(--accent); border-color: var(--accent); background: var(--accent-muted); }

.dl-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.2s;
  border: 1px solid var(--border);
}
.dl-btn:hover { color: var(--success); border-color: var(--success); background: rgba(52, 199, 89, 0.12); }

.dl-wrap { position: relative; display: inline-block; }
.quality-menu {
  min-width: 160px;
  max-height: min(280px, 50vh);
  overflow-y: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.quality-menu-title {
  padding: 8px 12px;
  font-size: 11px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-light);
}
.quality-option {
  display: block;
  width: 100%;
  padding: 8px 12px;
  text-align: left;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  border: none;
  border-radius: 0;
}
.quality-option:hover { background: var(--bg-hover); color: var(--accent); }
.quality-empty { padding: 10px 12px; font-size: 13px; color: var(--text-muted); }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
