<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="!busy && $emit('close')">
      <div class="modal-card card" role="dialog" aria-labelledby="playlist-dedup-title" aria-modal="true">
        <div class="modal-head">
          <h3 id="playlist-dedup-title">歌单去重</h3>
          <button type="button" class="btn-ghost btn-sm" :disabled="busy" @click="$emit('close')">关闭</button>
        </div>

        <p class="modal-desc">
          按<strong>歌名</strong>识别重复（不同歌手、本地与网络版本也算重复）。选择保留规则后可预览每组保留哪一首。
        </p>

        <div v-if="!groups.length" class="empty">
          当前歌单未发现重复歌曲。
        </div>
        <template v-else>
          <div class="summary">
            发现 <strong>{{ groups.length }}</strong> 组重复，共可移除
            <strong>{{ removeCount }}</strong> 首，保留后约
            <strong>{{ keepTotal }}</strong> 首。
          </div>

          <div class="policy-row" role="radiogroup" aria-label="保留规则">
            <span class="policy-label">保留规则</span>
            <label v-for="opt in policyOptions" :key="opt.value" class="policy-opt">
              <input v-model="policy" type="radio" name="dedup-policy" :value="opt.value" :disabled="busy" />
              <span>{{ opt.label }}</span>
            </label>
          </div>

          <div class="group-list">
            <section v-for="group in groups" :key="group.titleKey" class="group-card">
              <div class="group-head">
                <div class="group-title" :title="group.title">{{ group.title }}</div>
                <div class="group-meta">{{ group.items.length }} 首重复</div>
              </div>
              <div class="track-options">
                <label
                  v-for="item in group.items"
                  :key="item.track.key"
                  class="track-opt"
                  :class="{ selected: keepByTitleKey.get(group.titleKey) === item.track.key }"
                >
                  <input
                    type="radio"
                    :name="`dedup-${group.titleKey}`"
                    :value="item.track.key"
                    :checked="keepByTitleKey.get(group.titleKey) === item.track.key"
                    :disabled="busy"
                    @change="setKeep(group.titleKey, item.track.key)"
                  />
                  <div class="track-cover">
                    <CoverArt :src="item.track.picUrl || item.track.img" />
                  </div>
                  <div class="track-meta">
                    <div class="track-name">{{ item.track.name }}</div>
                    <div class="track-sub">
                      <span>{{ item.track.singer || '未知艺术家' }}</span>
                      <span class="origin-badge" :class="isLocal(item.track) ? 'local' : 'online'">
                        {{ originLabel(item.track) }}
                      </span>
                    </div>
                  </div>
                  <span class="keep-tag" v-if="keepByTitleKey.get(group.titleKey) === item.track.key">保留</span>
                </label>
              </div>
            </section>
          </div>
        </template>

        <div class="modal-actions">
          <button type="button" class="btn-ghost btn-sm" :disabled="busy" @click="$emit('close')">取消</button>
          <button
            type="button"
            class="btn-primary btn-sm"
            :disabled="busy || !removeCount"
            @click="confirm"
          >
            {{ busy ? '处理中…' : `移除重复 ${removeCount || ''}`.trim() }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import CoverArt from './CoverArt.vue'
import { platformLabel } from '../utils/platforms.js'
import {
  buildKeepKeysFromPolicy,
  collectKeysToRemove,
  findPlaylistDuplicateGroups,
  isPlaylistTrackLocal,
} from '../utils/playlistDedup.js'

const props = defineProps({
  tracks: { type: Array, default: () => [] },
  playlistName: { type: String, default: '' },
  busy: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'confirm'])

const policyOptions = [
  { value: 'prefer-local', label: '优先保留本地' },
  { value: 'prefer-online', label: '优先保留网络' },
  { value: 'keep-first', label: '保留最先出现' },
  { value: 'keep-last', label: '保留最后出现' },
]

const policy = ref('prefer-local')
const keepByTitleKey = ref(new Map())
const groups = computed(() => findPlaylistDuplicateGroups(props.tracks || []))

const removeKeys = computed(() => collectKeysToRemove(props.tracks || [], groups.value, keepByTitleKey.value))
const removeCount = computed(() => removeKeys.value.length)
const keepTotal = computed(() => Math.max(0, (props.tracks || []).length - removeCount.value))

watch(
  [groups, policy],
  () => {
    keepByTitleKey.value = buildKeepKeysFromPolicy(groups.value, policy.value)
  },
  { immediate: true },
)

function setKeep(titleKey, key) {
  const next = new Map(keepByTitleKey.value)
  next.set(titleKey, key)
  keepByTitleKey.value = next
}

function isLocal(track) {
  return isPlaylistTrackLocal(track)
}

function originLabel(track) {
  if (isLocal(track)) return '本地'
  const label = platformLabel(track?.source || '')
  return label && label !== track?.source ? label : (track?.source || '网络')
}

function confirm() {
  if (!removeCount.value || props.busy) return
  emit('confirm', {
    policy: policy.value,
    removeKeys: removeKeys.value,
    removed: removeCount.value,
    kept: keepTotal.value,
  })
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
  width: min(720px, 100%);
  max-height: min(86vh, 900px);
  display: flex;
  flex-direction: column;
  padding: 18px 18px 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.modal-head h3 {
  margin: 0;
  font-size: 18px;
}
.modal-desc {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-muted);
}
.summary {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--text-secondary);
}
.policy-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin-bottom: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-hover);
}
.policy-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.policy-opt {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}
.policy-opt input { accent-color: var(--accent); }
.empty {
  padding: 28px 8px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}
.group-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 2px;
}
.group-card {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg-card, var(--bg));
}
.group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.group-title {
  font-size: 14px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.group-meta {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
}
.track-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.track-opt {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid transparent;
  cursor: pointer;
  min-width: 0;
}
.track-opt:hover { background: var(--bg-hover); }
.track-opt.selected {
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.track-opt input { accent-color: var(--accent); flex-shrink: 0; }
.track-cover {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-elevated);
}
.track-meta { flex: 1; min-width: 0; }
.track-name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.track-sub {
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
  min-width: 0;
}
.track-sub > span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.origin-badge {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 999px;
  font-weight: 600;
}
.origin-badge.local {
  color: #15803d;
  background: rgba(34, 197, 94, 0.14);
}
.origin-badge.online {
  color: var(--accent);
  background: var(--accent-muted);
}
.keep-tag {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--accent);
  font-weight: 650;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-light);
}

@media (max-width: 640px) {
  .modal-card { max-height: 90vh; padding: 14px; }
  .policy-row { gap: 8px 12px; }
}
</style>
