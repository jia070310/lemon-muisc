<template>
  <div v-if="open" class="qu-overlay" @click.self="onCancel">
    <div class="qu-modal" role="dialog" aria-modal="true" aria-labelledby="qu-title">
      <header class="qu-header">
        <h3 id="qu-title">音乐库音质升级</h3>
        <p class="qu-desc">
          先选库里的本地格式（如 MP3 / FLAC），再选要升到的目标音质；列表为「还能往上换」的曲目。
        </p>
      </header>

      <div v-if="step === 'running'" class="qu-running">
        <p class="qu-hint">{{ progressText }}</p>
        <div class="qu-progress">
          <div class="qu-progress-fill" :style="{ width: progressPercent + '%' }" />
        </div>
        <p v-if="runError" class="qu-error">{{ runError }}</p>
      </div>

      <div v-else class="qu-layout">
        <aside class="qu-controls">
          <div class="qu-section-title">选择本地格式</div>
          <div class="qu-chips" role="radiogroup" aria-label="本地格式">
            <button
              v-for="g in formatGroupOptions"
              :key="g.id"
              type="button"
              class="qu-chip"
              :class="{ active: formatFilter === g.id }"
              :disabled="scanning || busy"
              @click="onFormatFilterChange(g.id)"
            >
              {{ g.label }}
              <em v-if="groupCountLabel(g.id)">{{ groupCountLabel(g.id) }}</em>
            </button>
          </div>

          <div class="qu-section-title">升到哪种音质</div>
          <div class="qu-field qu-target-field">
            <AppSelect
              v-model="preferredQuality"
              :options="targetSelectOptions"
              :disabled="scanning || busy"
              block
              title="目标音质"
            />
          </div>
          <div v-if="selectedTarget" class="qu-target-tip" :class="selectedTarget.available ? 'ok' : 'miss'">
            <span class="qu-badge" :class="selectedTarget.available ? 'ok' : 'miss'">
              {{ selectedTarget.available ? '音源已声明' : '音源未声明' }}
            </span>
            <span :title="selectedTarget.hint || defaultTargetHint(selectedTarget)">
              {{ shortHint(selectedTarget) }}
            </span>
          </div>
          <p class="qu-hint side-note">声明情况来自激活音源脚本；实际以下载匹配为准。</p>

          <div class="qu-side-actions">
            <button type="button" class="btn-primary btn-sm" :disabled="scanning || busy" @click="runScan">
              {{ scanning ? '扫描中…' : (candidates.length ? '重新扫描' : '扫描可升级文件') }}
            </button>
            <p v-if="scanSummary" class="qu-hint scan-sum">{{ scanSummary }}</p>
            <p v-if="scanError" class="qu-error">{{ scanError }}</p>
          </div>
        </aside>

        <section class="qu-main">
          <div class="qu-toolbar">
            <label class="qu-check">
              <input type="checkbox" :checked="allSelected" @change="toggleAll($event.target.checked)" />
              全选（{{ selected.size }}/{{ candidates.length }}）
            </label>
            <span class="qu-hint inline">
              {{ formatFilterLabel }} → {{ formatQuality(preferredQuality) }}
            </span>
          </div>

          <div v-if="!candidates.length" class="qu-empty">
            {{ emptyListHint }}
          </div>
          <div v-else class="qu-list">
            <label v-for="c in candidates" :key="c.filePath" class="qu-item">
              <input
                type="checkbox"
                :checked="selected.has(c.filePath)"
                @change="toggleOne(c.filePath, $event.target.checked)"
              />
              <div class="qu-item-body">
                <div class="qu-item-title">{{ c.title }}</div>
                <div class="qu-item-meta">
                  <span>{{ c.artist || '未知歌手' }}</span>
                  <span>·</span>
                  <span class="qu-fmt">{{ (c.format || '').toUpperCase() || '有损' }}</span>
                  <span>·</span>
                  <span>{{ c.localLabel || '有损' }}</span>
                </div>
                <code class="qu-path" :title="c.filePath">{{ c.fileName || c.filePath }}</code>
              </div>
            </label>
          </div>
        </section>

        <aside class="qu-pace-block">
          <div class="qu-section-title">循序下载设置</div>
          <div class="qu-pace-row">
            <div class="qu-field">
              <label class="qu-label">每次下载</label>
              <AppSelect
                v-model="batchSize"
                :options="batchSelectOptions"
                :disabled="busy"
                block
                size="sm"
                title="每次下载数量"
              />
            </div>
            <div class="qu-field">
              <label class="qu-label">间隔</label>
              <AppSelect
                v-model="intervalHours"
                :options="intervalSelectOptions"
                :disabled="busy"
                block
                size="sm"
                title="批次间隔"
              />
            </div>
          </div>
          <p class="qu-hint">约 {{ estimatedBatches }} 批完成首轮入队计划。</p>

          <div class="batch-strategy-list" role="radiogroup" aria-label="降档策略">
            <label class="batch-strategy" :class="{ active: strategy === 'none' }">
              <input v-model="strategy" type="radio" value="none" />
              <div class="batch-strategy-body">
                <div class="batch-strategy-title">只要目标音质</div>
                <div class="batch-strategy-desc">声明列表须含所选档，否则跳过。</div>
              </div>
            </label>
            <label class="batch-strategy" :class="{ active: strategy === 'cascade' }">
              <input v-model="strategy" type="radio" value="cascade" />
              <div class="batch-strategy-body">
                <div class="batch-strategy-title">允许自动降档</div>
                <div class="batch-strategy-desc">失败后可降到其他档位。</div>
              </div>
            </label>
          </div>
        </aside>
      </div>

      <div class="qu-actions">
        <button type="button" class="btn-ghost" :disabled="busy && step !== 'running'" @click="onCancel">
          {{ step === 'running' ? '后台继续' : '取消' }}
        </button>
        <button
          v-if="step !== 'running'"
          type="button"
          class="btn-primary"
          :disabled="busy || scanning || !selected.size"
          @click="onStart"
        >
          开始升级（{{ selected.size }}）
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { api } from '../api.js'
import { getQualityLabel } from '../utils/quality.js'
import AppSelect from './AppSelect.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  defaultBatchSize: { type: Number, default: 50 },
  defaultIntervalHours: { type: Number, default: 24 },
})

const emit = defineEmits(['cancel', 'done'])

const DEFAULT_FORMAT_GROUPS = [
  { id: 'all', label: '全部格式', exts: [] },
]

const DEFAULT_TARGETS = [
  { quality: 'flac', label: 'FLAC', available: false, hint: '' },
  { quality: 'flac24bit', label: 'FLAC Hi-Res', available: false, hint: '' },
  { quality: 'hires', label: 'Hi-Res', available: false, hint: '' },
  { quality: 'master', label: '超清母带', available: false, hint: '' },
]

const batchOptions = [10, 20, 50, 100, 200, 300]
const intervalOptions = [
  { value: 1, label: '1 小时' },
  { value: 3, label: '3 小时' },
  { value: 6, label: '6 小时' },
  { value: 12, label: '12 小时' },
  { value: 24, label: '1 天' },
  { value: 48, label: '2 天' },
]

const step = ref('scan')
const scanning = ref(false)
const busy = ref(false)
const scanError = ref('')
const runError = ref('')
const preferredQuality = ref('flac')
const formatFilter = ref('all')
const formatGroups = ref([...DEFAULT_FORMAT_GROUPS])
const targetSupport = ref([...DEFAULT_TARGETS])
const candidates = ref([])
const selected = ref(new Set())
const scanMeta = ref(null)
const batchSize = ref(50)
const intervalHours = ref(24)
const strategy = ref('none')
const matchDone = ref(0)
const matchTotal = ref(0)
const progressText = ref('')

const formatGroupOptions = computed(() => {
  // 优先用扫描结果：库内实际存在的格式
  const fromScan = scanMeta.value?.formatGroups
  if (Array.isArray(fromScan) && fromScan.length) return fromScan
  const groups = formatGroups.value.length ? formatGroups.value : DEFAULT_FORMAT_GROUPS
  const counts = scanMeta.value?.groupCounts || scanMeta.value?.libraryGroupCounts
  if (!counts) return groups
  return groups.filter((g) => Number(counts[g.id] || 0) > 0)
})

watch(formatGroupOptions, (opts) => {
  if (!opts.length) return
  if (!opts.some((g) => g.id === formatFilter.value)) {
    formatFilter.value = opts[0].id
    if (scanMeta.value) runScan()
  }
})
const targetOptions = computed(() => {
  const list = targetSupport.value.length ? targetSupport.value : DEFAULT_TARGETS
  return list.map((t) => ({
    ...t,
    label: t.label || formatQuality(t.quality),
  }))
})

const targetSelectOptions = computed(() => (
  targetOptions.value.map((t) => ({
    value: t.quality,
    label: targetOptionLabel(t),
  }))
))

const batchSelectOptions = computed(() => (
  batchOptions.map((n) => ({ value: n, label: `${n} 首` }))
))

const intervalSelectOptions = computed(() => (
  intervalOptions.map((opt) => ({ value: opt.value, label: opt.label }))
))

const formatFilterLabel = computed(() => {
  const g = formatGroupOptions.value.find((x) => x.id === formatFilter.value)
  return g?.label || '全部格式'
})

const emptyListHint = computed(() => {
  if (scanning.value) return '正在扫描…'
  const lib = Number(scanMeta.value?.filteredLibraryCount || 0)
  const upAll = Number(scanMeta.value?.allUpgradableCount || 0)
  const upMap = scanMeta.value?.upgradeGroupCounts || {}
  const up = formatFilter.value === 'all'
    ? upAll
    : Number(upMap[formatFilter.value] || 0)
  if (lib > 0 && up === 0) {
    return `已选格式共 ${lib} 首，相对目标「${formatQuality(preferredQuality.value)}」暂无更高档可换，请改选更高目标音质`
  }
  return '当前筛选下没有可升级文件，可换格式或目标音质后重新扫描。'
})

const scanSummary = computed(() => {
  const m = scanMeta.value
  if (!m) return ''
  const parts = [
    `库内 ${m.totalTracked || 0} 首`,
    `可升 ${m.candidateCount || 0}`,
  ]
  if (m.allUpgradableCount != null && m.allUpgradableCount !== m.candidateCount) {
    parts.push(`合计可升 ${m.allUpgradableCount}`)
  }
  if (m.alreadyOkCount || m.losslessCount) {
    parts.push(`已达目标 ${m.alreadyOkCount || m.losslessCount}`)
  }
  if (m.truncated) parts.push('已截断')
  return parts.join(' · ')
})

const selectedTarget = computed(() => (
  targetOptions.value.find((t) => t.quality === preferredQuality.value) || null
))

function targetOptionLabel(t) {
  const name = t.label || formatQuality(t.quality)
  return t.available ? `${name}（音源已声明）` : `${name}（音源未声明）`
}

const allSelected = computed(() => (
  candidates.value.length > 0 && selected.value.size === candidates.value.length
))

const estimatedBatches = computed(() => {
  const n = Math.max(1, Number(batchSize.value) || 50)
  return Math.max(1, Math.ceil((selected.value.size || 0) / n))
})

const progressPercent = computed(() => {
  if (!matchTotal.value) return 0
  return Math.min(100, Math.round((matchDone.value / matchTotal.value) * 100))
})

watch(() => props.open, async (open) => {
  if (!open) return
  step.value = 'scan'
  scanning.value = false
  busy.value = false
  scanError.value = ''
  runError.value = ''
  preferredQuality.value = 'flac'
  formatFilter.value = 'all'
  candidates.value = []
  selected.value = new Set()
  scanMeta.value = null
  batchSize.value = batchOptions.includes(props.defaultBatchSize) ? props.defaultBatchSize : 50
  intervalHours.value = intervalOptions.some((o) => o.value === props.defaultIntervalHours)
    ? props.defaultIntervalHours
    : 24
  strategy.value = 'none'
  matchDone.value = 0
  matchTotal.value = 0
  progressText.value = ''
  await loadOptions()
  await runScan()
})

/** 目标音质变化时重扫：例如选 Hi-Res 才会把普通 FLAC 列入可升级 */
watch(preferredQuality, (q, prev) => {
  if (!props.open) return
  if (!prev || q === prev) return
  if (scanning.value || busy.value) return
  runScan()
})

function formatQuality(q) {
  return getQualityLabel(q) || q
}

function defaultTargetHint(t) {
  return t.available
    ? `已激活音源声明支持：${(t.platforms || []).join('、') || '是'}`
    : '当前激活音源未声明此音质（仍可尝试）'
}

function shortHint(t) {
  const full = t.hint || defaultTargetHint(t)
  if (t.available && Array.isArray(t.platforms) && t.platforms.length) {
    return `支持：${t.platforms.join('、')}`
  }
  return full.length > 48 ? `${full.slice(0, 48)}…` : full
}

function groupCountLabel(id) {
  const counts = scanMeta.value?.libraryGroupCounts || scanMeta.value?.groupCounts
  if (!counts || counts[id] == null) return ''
  return String(counts[id])
}

async function loadOptions() {
  try {
    const res = await api.library.qualityUpgradeOptions()
    const data = res.data || res
    // 格式芯片以扫描结果为准；此处只拉目标音质支持提示
    if (Array.isArray(data.targets) && data.targets.length) {
      targetSupport.value = data.targets
    }
  } catch {
    // keep defaults
  }
}

function onFormatFilterChange(id) {
  if (formatFilter.value === id) return
  formatFilter.value = id
  runScan()
}

function toggleOne(path, on) {
  const next = new Set(selected.value)
  if (on) next.add(path)
  else next.delete(path)
  selected.value = next
}

function toggleAll(on) {
  selected.value = on ? new Set(candidates.value.map((c) => c.filePath)) : new Set()
}

async function runScan() {
  scanning.value = true
  scanError.value = ''
  try {
    const res = await api.library.qualityUpgradeScan({
      preferredQuality: preferredQuality.value,
      formatFilter: formatFilter.value,
    })
    const data = res.data || res
    candidates.value = Array.isArray(data.candidates) ? data.candidates : []
    scanMeta.value = data
    if (Array.isArray(data.targetSupport) && data.targetSupport.length) {
      targetSupport.value = data.targetSupport
    }
    if (Array.isArray(data.formatGroups) && data.formatGroups.length) {
      formatGroups.value = data.formatGroups
    }
    selected.value = new Set(candidates.value.map((c) => c.filePath))
    step.value = 'select'
  } catch (e) {
    scanError.value = e.message || '扫描失败'
  } finally {
    scanning.value = false
  }
}

function onCancel() {
  if (busy.value && step.value === 'running') {
    emit('cancel')
    return
  }
  if (busy.value) return
  emit('cancel')
}

async function onStart() {
  const picked = candidates.value.filter((c) => selected.value.has(c.filePath))
  if (!picked.length) return

  busy.value = true
  step.value = 'running'
  runError.value = ''
  matchDone.value = 0
  matchTotal.value = picked.length
  const qLabel = formatQuality(preferredQuality.value)
  progressText.value = `正在匹配 ${qLabel}：0/${picked.length}…`

  const matched = []
  let unmatchedCount = 0
  const CHUNK = 20
  const exactQuality = strategy.value === 'none'

  try {
    for (let i = 0; i < picked.length; i += CHUNK) {
      const chunk = picked.slice(i, i + CHUNK)
      progressText.value = `正在匹配 ${qLabel}：${Math.min(i + chunk.length, picked.length)}/${picked.length}…`
      const res = await api.library.qualityUpgradeMatch({
        preferredQuality: preferredQuality.value,
        exactQuality,
        tracks: chunk,
      })
      const data = res.data || res
      matched.push(...(data.matched || []))
      unmatchedCount += (data.unmatched || []).length
      matchDone.value = Math.min(i + chunk.length, picked.length)
    }

    if (!matched.length) {
      runError.value = unmatchedCount
        ? `已检查 ${picked.length} 首，均未匹配到可升级为 ${qLabel} 的在线资源`
        : '没有可升级曲目'
      busy.value = false
      step.value = 'select'
      return
    }

    progressText.value = `匹配成功 ${matched.length} 首，正在创建循序下载…`
    const res = await api.library.qualityUpgradeStart({
      preferredQuality: preferredQuality.value,
      strategy: strategy.value,
      batchSize: batchSize.value,
      intervalHours: intervalHours.value,
      matched,
    })

    emit('done', {
      job: res.job,
      matchedCount: res.matchedCount || matched.length,
      unmatchedCount,
      batchSize: batchSize.value,
      intervalHours: intervalHours.value,
      preferredQuality: preferredQuality.value,
      formatFilter: formatFilter.value,
    })
  } catch (e) {
    runError.value = e.message || '启动失败'
    busy.value = false
    step.value = 'select'
  }
}
</script>

<style scoped>
.qu-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.qu-modal {
  width: min(1080px, 100%);
  height: min(86vh, 760px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 18px 20px 14px;
  box-shadow: var(--shadow);
}
.qu-header {
  flex-shrink: 0;
  margin-bottom: 12px;
}
.qu-modal h3 {
  margin: 0 0 4px;
  font-size: 18px;
  color: var(--text);
}
.qu-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-muted);
}

.qu-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  grid-template-areas:
    "controls main"
    "pace main";
  gap: 14px;
}

.qu-controls {
  grid-area: controls;
  min-height: 0;
  overflow: auto;
  padding-right: 12px;
  border-right: 1px solid var(--border-light);
}
.qu-pace-block {
  grid-area: pace;
  min-height: 0;
  overflow: auto;
  padding-right: 12px;
  border-right: 1px solid var(--border-light);
  padding-top: 4px;
}
.qu-main {
  grid-area: main;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.qu-pace-row {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.qu-section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 8px;
}
.qu-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.qu-chip {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-secondary);
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.qu-chip em {
  font-style: normal;
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-hover);
  border-radius: 999px;
  padding: 0 5px;
  line-height: 16px;
}
.qu-chip.active {
  color: var(--accent);
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.qu-chip:disabled { opacity: 0.6; cursor: not-allowed; }

.qu-target-field {
  margin-bottom: 6px;
}
.qu-target-field :deep(.app-select) {
  width: 100%;
}
.qu-target-tip {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
  margin-bottom: 6px;
}
.qu-target-tip.ok { color: var(--text-secondary); }
.qu-badge {
  flex-shrink: 0;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  line-height: 15px;
}
.qu-badge.ok {
  color: var(--success, #2a8);
  background: color-mix(in srgb, var(--success, #2a8) 14%, transparent);
}
.qu-badge.miss {
  color: var(--warning, #b80);
  background: color-mix(in srgb, var(--warning, #b80) 14%, transparent);
}
.qu-hint.side-note {
  margin: 0 0 10px;
  font-size: 11px;
}
.qu-side-actions {
  margin-bottom: 4px;
}
.qu-hint.scan-sum {
  margin: 8px 0 0;
  font-size: 11px;
}

.qu-pace-block .qu-section-title {
  margin-top: 4px;
}
.qu-field {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.qu-label {
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 56px;
  flex-shrink: 0;
}
.qu-field :deep(.app-select) {
  flex: 1;
  min-width: 0;
}

.batch-strategy-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.batch-strategy {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 10px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  cursor: pointer;
}
.batch-strategy.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.batch-strategy-title {
  font-size: 12px;
  color: var(--text);
  margin-bottom: 2px;
}
.batch-strategy-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.35;
}

.qu-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  flex-shrink: 0;
}
.qu-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
}
.qu-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--border-light);
  border-radius: 10px;
}
.qu-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
  border: 1px dashed var(--border);
  border-radius: 10px;
}
.qu-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
}
.qu-item:last-child { border-bottom: none; }
.qu-item-title {
  font-size: 14px;
  color: var(--text);
}
.qu-item-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}
.qu-fmt {
  color: var(--accent);
  font-weight: 600;
}
.qu-path {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.qu-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.45;
}
.qu-hint.inline { margin: 0; }
.qu-error {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--error, #e55);
}

.qu-running {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 24px 8px;
}
.qu-progress {
  height: 8px;
  border-radius: 999px;
  background: var(--bg-hover);
  overflow: hidden;
  margin: 10px 0;
}
.qu-progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s ease;
}

.qu-actions {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border-light);
}

@media (max-width: 820px) {
  .qu-overlay {
    padding: 0;
    align-items: stretch;
    justify-content: stretch;
  }
  .qu-modal {
    width: 100%;
    height: 100%;
    max-height: none;
    border-radius: 0;
    border: none;
    padding: 12px 12px 0;
    padding-top: calc(12px + env(safe-area-inset-top, 0px));
  }
  .qu-header {
    margin-bottom: 8px;
    flex-shrink: 0;
  }
  .qu-modal h3 {
    font-size: 16px;
  }
  .qu-desc {
    font-size: 12px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* 单列文档流，整页滚动；底部操作栏固定 */
  .qu-layout {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    gap: 0;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
  }

  .qu-controls,
  .qu-main,
  .qu-pace-block {
    grid-area: auto;
    position: relative;
    z-index: auto;
    border-right: none;
    padding-right: 0;
    overflow: visible;
    min-height: 0;
    flex: none;
  }

  .qu-controls {
    order: 1;
    padding-bottom: 12px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--border-light);
  }

  .qu-main {
    order: 2;
    display: flex;
    flex-direction: column;
    padding: 10px 0 12px;
    min-height: 200px;
  }

  .qu-pace-block {
    order: 3;
    padding: 12px 0 16px;
    border-top: 1px solid var(--border-light);
  }

  .qu-hint.side-note {
    display: none;
  }

  .qu-side-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .qu-hint.scan-sum {
    margin: 0;
    flex: 1 1 160px;
  }

  .qu-pace-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 8px;
  }
  .qu-pace-row .qu-field {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    margin-bottom: 0;
  }
  .qu-pace-row .qu-label {
    min-width: 0;
  }

  .qu-toolbar {
    flex-wrap: wrap;
    gap: 6px 10px;
  }
  .qu-list {
    flex: none;
    max-height: min(38vh, 320px);
    min-height: 140px;
  }
  .qu-empty {
    flex: none;
    min-height: 100px;
    padding: 16px 12px;
  }
  .qu-path {
    display: none;
  }
  .qu-item {
    padding: 9px 10px;
  }
  .batch-strategy-desc {
    display: none;
  }
  .batch-strategy {
    padding: 10px 12px;
    align-items: center;
  }
  .batch-strategy-title {
    margin-bottom: 0;
  }

  .qu-actions {
    position: sticky;
    bottom: 0;
    z-index: 2;
    margin-top: 0;
    padding: 10px 0 calc(10px + env(safe-area-inset-bottom, 0px));
    background: var(--bg-elevated);
    gap: 8px;
  }
  .qu-actions .btn-ghost,
  .qu-actions .btn-primary {
    flex: 1;
    min-height: 40px;
  }
}
</style>
