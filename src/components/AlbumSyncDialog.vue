<template>
  <div v-if="open" class="album-sync-overlay" @click.self="onCancel">
    <div class="album-sync-modal" role="dialog" aria-modal="true" aria-labelledby="album-sync-title">
      <h3 id="album-sync-title">专辑检测</h3>
      <p class="album-sync-desc">
        <strong>{{ artist || '未知歌手' }}</strong>
        ·
        <strong>{{ album || '未知专辑' }}</strong>
        · 本地 {{ localTracks.length }} 首
      </p>

      <!-- 步骤 1：选在线专辑 -->
      <template v-if="step === 'search'">
        <p v-if="searching" class="album-sync-status">正在各音源搜索专辑…</p>
        <p v-else-if="searchError" class="album-sync-error">{{ searchError }}</p>
        <template v-else>
          <p v-if="!candidates.length" class="album-sync-status">未找到匹配专辑，请检查歌手/专辑名或换音源。</p>
          <div v-else class="album-candidate-list">
            <button
              v-for="c in candidates"
              :key="`${c.source}:${c.id}`"
              type="button"
              class="album-candidate"
              :class="{ active: selectedKey === `${c.source}:${c.id}` }"
              @click="selectedKey = `${c.source}:${c.id}`"
            >
              <CoverArt :src="c.img" class="album-candidate-cover" />
              <div class="album-candidate-body">
                <div class="album-candidate-name">{{ c.name }}</div>
                <div class="album-candidate-meta">
                  {{ c.artist || '未知歌手' }}
                  <span v-if="c.count"> · {{ c.count }} 首</span>
                  <span v-if="c.publishTime"> · {{ c.publishTime }}</span>
                </div>
                <div class="album-candidate-source">{{ c.sourceLabel || c.source }}</div>
              </div>
            </button>
          </div>
        </template>
        <div class="album-sync-actions">
          <button type="button" class="btn-ghost" :disabled="busy" @click="onCancel">取消</button>
          <button
            type="button"
            class="btn-primary"
            :disabled="busy || searching || !selectedCandidate"
            @click="runDiff"
          >
            {{ busy ? '对比中…' : '对比本地曲目' }}
          </button>
        </div>
      </template>

      <!-- 步骤 2：结果 -->
      <template v-else-if="step === 'diff'">
        <p v-if="diffError" class="album-sync-error">{{ diffError }}</p>
        <template v-else>
          <p class="album-sync-status">
            在线「{{ diffResult?.onlineAlbum?.name || album }}」
            （{{ diffResult?.onlineAlbum?.sourceLabel }}）共 {{ diffResult?.onlineCount || 0 }} 首；
            缺 {{ missing.length }} · 可升级 {{ upgradable.length }}
          </p>

          <div class="album-sync-quality-row">
            <label>目标音质</label>
            <select v-model="preferredQuality">
              <option v-for="q in qualityOptions" :key="q" :value="q">{{ formatQuality(q) }}</option>
            </select>
            <button type="button" class="btn-ghost btn-sm" :disabled="busy" @click="rerunDiff">按此音质重算</button>
          </div>

          <div class="batch-strategy-list" role="radiogroup" aria-label="降档策略">
            <label class="batch-strategy" :class="{ active: strategy === 'cascade' }">
              <input v-model="strategy" type="radio" value="cascade" />
              <div class="batch-strategy-body">
                <div class="batch-strategy-title">自动逐档降级</div>
                <div class="batch-strategy-desc">拿不到目标音质时自动降一档继续。</div>
              </div>
            </label>
            <label class="batch-strategy" :class="{ active: strategy === 'none' }">
              <input v-model="strategy" type="radio" value="none" />
              <div class="batch-strategy-body">
                <div class="batch-strategy-title">不降档（只要目标音质）</div>
                <div class="batch-strategy-desc">无损补全/升级推荐此项。</div>
              </div>
            </label>
          </div>

          <section v-if="missing.length" class="album-sync-section">
            <div class="album-sync-section-head">
              <label class="album-sync-check-all">
                <input type="checkbox" :checked="allMissingSelected" @change="toggleAllMissing($event.target.checked)" />
                缺曲补全（{{ selectedMissing.size }}/{{ missing.length }}）
              </label>
            </div>
            <div class="album-sync-rows">
              <label v-for="row in missing" :key="`m-${row.index}`" class="album-sync-row">
                <input type="checkbox" :checked="selectedMissing.has(row.index)" @change="toggleMissing(row.index, $event.target.checked)" />
                <span class="album-sync-row-main">
                  <span class="album-sync-row-name">{{ row.onlineName }}</span>
                  <span class="album-sync-row-sub">{{ row.onlineSinger }} · 目标 {{ row.targetLabel || formatQuality(preferredQuality) }}</span>
                </span>
              </label>
            </div>
          </section>

          <section v-if="upgradable.length" class="album-sync-section">
            <div class="album-sync-section-head">
              <label class="album-sync-check-all">
                <input type="checkbox" :checked="allUpgradeSelected" @change="toggleAllUpgrade($event.target.checked)" />
                音质升级（{{ selectedUpgrade.size }}/{{ upgradable.length }}）· 将覆盖原文件
              </label>
            </div>
            <div class="album-sync-rows">
              <label v-for="row in upgradable" :key="`u-${row.index}`" class="album-sync-row">
                <input type="checkbox" :checked="selectedUpgrade.has(row.index)" @change="toggleUpgrade(row.index, $event.target.checked)" />
                <span class="album-sync-row-main">
                  <span class="album-sync-row-name">{{ row.onlineName }}</span>
                  <span class="album-sync-row-sub">
                    {{ row.localLabel || '未知' }} → {{ row.targetLabel || formatQuality(preferredQuality) }}
                    <template v-if="row.filePath"> · 覆盖 {{ baseName(row.filePath) }}</template>
                  </span>
                </span>
              </label>
            </div>
          </section>

          <p v-if="!missing.length && !upgradable.length" class="album-sync-status">
            本地已齐全且音质不低于目标，无需下载。
          </p>
        </template>

        <div class="album-sync-actions">
          <button type="button" class="btn-ghost" :disabled="busy" @click="backToSearch">重选专辑</button>
          <button type="button" class="btn-ghost" :disabled="busy" @click="onCancel">取消</button>
          <button
            type="button"
            class="btn-primary"
            :disabled="busy || (!selectedMissing.size && !selectedUpgrade.size)"
            @click="onConfirm"
          >
            {{ busy ? '入队中…' : `确认并下载 ${selectedMissing.size + selectedUpgrade.size} 首` }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import CoverArt from './CoverArt.vue'
import { api } from '../api.js'
import { getQualityLabel, QUALITY_ORDER } from '../utils/quality.js'
import { isLosslessQuality, buildDownloadTask } from '../utils/musicPayload.js'
import { getTrackFilePath } from '../utils/trackPath.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  artist: { type: String, default: '' },
  album: { type: String, default: '' },
  localTracks: { type: Array, default: () => [] },
  defaultQuality: { type: String, default: 'flac' },
})

const emit = defineEmits(['cancel', 'done'])

const step = ref('search')
const searching = ref(false)
const busy = ref(false)
const searchError = ref('')
const diffError = ref('')
const candidates = ref([])
const selectedKey = ref('')
const diffResult = ref(null)
const preferredQuality = ref('flac')
const strategy = ref('none')
const selectedMissing = ref(new Set())
const selectedUpgrade = ref(new Set())

const qualityOptions = QUALITY_ORDER
const missing = computed(() => diffResult.value?.missing || [])
const upgradable = computed(() => diffResult.value?.upgradable || [])

const selectedCandidate = computed(() => {
  const key = selectedKey.value
  if (!key) return null
  return candidates.value.find((c) => `${c.source}:${c.id}` === key) || null
})

const allMissingSelected = computed(() =>
  missing.value.length > 0 && missing.value.every((r) => selectedMissing.value.has(r.index)))
const allUpgradeSelected = computed(() =>
  upgradable.value.length > 0 && upgradable.value.every((r) => selectedUpgrade.value.has(r.index)))

function formatQuality(q) {
  return getQualityLabel(q)
}

function baseName(fp) {
  const s = String(fp || '')
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'))
  return i >= 0 ? s.slice(i + 1) : s
}

function trackPayloadList() {
  return (props.localTracks || []).map((t) => ({
    name: t.name,
    singer: t.singer,
    filePath: getTrackFilePath(t) || t.filePath || t.localPath || '',
    format: t.format || '',
  })).filter((t) => t.name)
}

async function runSearch() {
  searching.value = true
  searchError.value = ''
  candidates.value = []
  selectedKey.value = ''
  try {
    const res = await api.library.albumSyncPreview({
      artist: props.artist,
      album: props.album,
      preferredQuality: preferredQuality.value,
      tracks: trackPayloadList(),
    })
    const data = res.data || res
    candidates.value = Array.isArray(data.candidates) ? data.candidates : []
    if (candidates.value[0]) {
      selectedKey.value = `${candidates.value[0].source}:${candidates.value[0].id}`
    }
  } catch (e) {
    searchError.value = e.message || '搜索专辑失败'
  } finally {
    searching.value = false
  }
}

async function runDiff() {
  const c = selectedCandidate.value
  if (!c) return
  busy.value = true
  diffError.value = ''
  try {
    const res = await api.library.albumSyncPreview({
      artist: props.artist,
      album: props.album,
      source: c.source,
      onlineAlbumId: c.id,
      preferredQuality: preferredQuality.value,
      tracks: trackPayloadList(),
    })
    const data = res.data || res
    diffResult.value = data
    selectedMissing.value = new Set((data.missing || []).map((r) => r.index))
    selectedUpgrade.value = new Set((data.upgradable || []).map((r) => r.index))
    step.value = 'diff'
  } catch (e) {
    diffError.value = e.message || '对比失败'
    step.value = 'diff'
  } finally {
    busy.value = false
  }
}

async function rerunDiff() {
  await runDiff()
}

function backToSearch() {
  step.value = 'search'
  diffResult.value = null
  diffError.value = ''
}

function toggleMissing(index, on) {
  const next = new Set(selectedMissing.value)
  if (on) next.add(index)
  else next.delete(index)
  selectedMissing.value = next
}

function toggleUpgrade(index, on) {
  const next = new Set(selectedUpgrade.value)
  if (on) next.add(index)
  else next.delete(index)
  selectedUpgrade.value = next
}

function toggleAllMissing(on) {
  selectedMissing.value = on ? new Set(missing.value.map((r) => r.index)) : new Set()
}

function toggleAllUpgrade(on) {
  selectedUpgrade.value = on ? new Set(upgradable.value.map((r) => r.index)) : new Set()
}

function onCancel() {
  if (busy.value) return
  emit('cancel')
}

async function onConfirm() {
  const missRows = missing.value.filter((r) => selectedMissing.value.has(r.index))
  const upRows = upgradable.value.filter((r) => selectedUpgrade.value.has(r.index))
  if (!missRows.length && !upRows.length) return

  busy.value = true
  try {
    const preferred = preferredQuality.value
    const policy = strategy.value === 'none' ? 'none' : 'cascade'
    const albumName = props.album || diffResult.value?.onlineAlbum?.name || ''
    const albumArtist = diffResult.value?.onlineAlbum?.artist || props.artist || ''
    const tasks = []

    for (const row of missRows) {
      const item = {
        ...(row.onlineItem || {}),
        singer: row.onlineItem?.singer || row.onlineSinger || albumArtist,
        album: row.onlineItem?.album || albumName,
      }
      const source = item.source || diffResult.value?.onlineAlbum?.source
      tasks.push(buildDownloadTask(item, source, preferred, {
        preferredQuality: preferred,
        qualityPolicy: policy,
        autoCascade: policy === 'cascade',
        deferExistAsk: true,
        listName: albumName,
        album: albumName,
        albumArtist,
        singer: item.singer || albumArtist,
      }))
    }

    for (const row of upRows) {
      const item = {
        ...(row.onlineItem || {}),
        singer: row.onlineItem?.singer || row.onlineSinger || albumArtist,
        album: row.onlineItem?.album || albumName,
      }
      const source = item.source || diffResult.value?.onlineAlbum?.source
      tasks.push(buildDownloadTask(item, source, preferred, {
        preferredQuality: preferred,
        qualityPolicy: policy,
        autoCascade: policy === 'cascade',
        deferExistAsk: false,
        forceOverwrite: true,
        replacePath: row.filePath || '',
        album: albumName,
        albumArtist,
        singer: item.singer || albumArtist,
      }))
    }

    const CHUNK = 20
    let added = 0
    for (let i = 0; i < tasks.length; i += CHUNK) {
      const res = await api.download.add(tasks.slice(i, i + CHUNK))
      added += (res.ids || []).length
    }
    emit('done', {
      added,
      missing: missRows.length,
      upgradable: upRows.length,
    })
  } catch (e) {
    diffError.value = e.message || '加入下载队列失败'
  } finally {
    busy.value = false
  }
}

watch(() => props.open, (open) => {
  if (!open) return
  step.value = 'search'
  searchError.value = ''
  diffError.value = ''
  diffResult.value = null
  candidates.value = []
  selectedKey.value = ''
  preferredQuality.value = props.defaultQuality || 'flac'
  strategy.value = isLosslessQuality(preferredQuality.value) ? 'none' : 'cascade'
  selectedMissing.value = new Set()
  selectedUpgrade.value = new Set()
  runSearch()
})
</script>

<style scoped>
.album-sync-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.album-sync-modal {
  width: min(640px, 100%);
  max-height: min(90vh, 820px);
  overflow: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 22px 22px 18px;
  box-shadow: var(--shadow);
}
.album-sync-modal h3 {
  margin: 0 0 8px;
  font-size: 18px;
  color: var(--text);
}
.album-sync-desc {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--text-secondary);
}
.album-sync-desc strong { color: var(--accent); }
.album-sync-status {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.5;
}
.album-sync-error {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--error, #dc2626);
}
.album-candidate-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
  max-height: 360px;
  overflow: auto;
}
.album-candidate {
  display: flex;
  gap: 12px;
  align-items: center;
  text-align: left;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--border-light);
  background: var(--bg-card, var(--bg));
  color: var(--text);
  cursor: pointer;
}
.album-candidate.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.album-candidate-cover {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  flex-shrink: 0;
  overflow: hidden;
}
.album-candidate-body { min-width: 0; flex: 1; }
.album-candidate-name {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.album-candidate-meta,
.album-candidate-source {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}
.album-sync-quality-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--text-secondary);
  flex-wrap: wrap;
}
.album-sync-quality-row select {
  min-width: 120px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: var(--bg-input, var(--bg));
  color: var(--text);
}
.batch-strategy-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}
.batch-strategy {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-card, var(--bg));
  cursor: pointer;
}
.batch-strategy.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.batch-strategy input { margin-top: 3px; }
.batch-strategy-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.batch-strategy-desc {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-muted);
}
.album-sync-section { margin-bottom: 14px; }
.album-sync-section-head {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.album-sync-check-all {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.album-sync-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 220px;
  overflow: auto;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 6px;
}
.album-sync-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.album-sync-row:hover { background: color-mix(in srgb, var(--text) 6%, transparent); }
.album-sync-row input { margin-top: 3px; }
.album-sync-row-main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
.album-sync-row-name { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.album-sync-row-sub { font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.album-sync-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 8px;
}
@media (max-width: 768px) {
  .album-sync-overlay {
    padding: 12px;
    align-items: flex-end;
  }
  .album-sync-modal {
    max-height: 92vh;
    padding: 16px;
  }
}
</style>
