<template>
  <div class="source-probe-panel" :class="{ embedded: embedded }">
    <div class="source-probe-head">
      <div>
        <h3 v-if="showTitle" class="source-probe-title">音源状态监测</h3>
        <p class="source-probe-desc">按周期探测各激活音源的平台取链；结果写入权重排序，连续失败可自动关闭解析。</p>
      </div>
      <div class="source-probe-actions">
        <button
          v-if="isAdminUser"
          type="button"
          class="btn-sm btn-primary"
          :disabled="probeRunning || probeLoading"
          @click="runSourceProbeNow"
        >{{ probeRunning ? '检测中…' : '立即检测' }}</button>
        <button
          type="button"
          class="btn-sm btn-ghost"
          :disabled="probeLoading || probeRunning"
          @click="refresh"
        >刷新</button>
      </div>
    </div>

    <div v-if="isAdminUser" class="source-probe-controls">
      <label class="source-probe-toggle">
        <span>自动监测</span>
        <label class="toggle">
          <input type="checkbox" :checked="probeConfig.enabled" @change="onProbeEnabledChange" />
          <span class="slider"></span>
        </label>
      </label>
      <label class="source-probe-toggle">
        <span>失败自动关闭</span>
        <label class="toggle">
          <input type="checkbox" :checked="probeConfig.autoDisable" @change="onProbeAutoDisableChange" />
          <span class="slider"></span>
        </label>
      </label>
      <div class="source-probe-interval">
        <span>间隔</span>
        <AppSelect
          v-model="probeIntervalModel"
          :options="probeIntervalOptions"
          size="sm"
          min-width="120px"
          @change="saveProbeInterval"
        />
      </div>
    </div>

    <p class="source-probe-meta">{{ probeMetaText }}</p>

    <div v-if="probeSourceCards.length" class="source-probe-cards">
      <div v-for="card in probeSourceCards" :key="card.id" class="source-probe-card">
        <div class="source-probe-card-top">
          <span class="source-probe-card-name">{{ card.name }}</span>
          <span class="source-probe-card-ratio" :class="`level-${card.level}`">{{ card.okCount }}/{{ card.total }} 平台</span>
        </div>
        <div v-if="card.platforms.length" class="source-probe-pills">
          <span
            v-for="p in card.platforms"
            :key="`${card.id}-${p.id}`"
            class="source-probe-pill"
            :class="`level-${p.level}`"
            :title="probePillTitle(p)"
          >{{ p.label }}{{ probePillSuffix(p) }}</span>
        </div>
        <p v-else class="source-probe-card-empty">尚未检测，点「立即检测」或等待自动监测</p>
        <div v-if="card.historyBar.length" class="source-probe-history" title="近期采样">
          <i
            v-for="(h, hi) in card.historyBar"
            :key="hi"
            class="source-probe-dot"
            :class="{ ok: h.ok, fail: !h.ok }"
          />
        </div>
      </div>
    </div>
    <p v-else class="source-probe-empty">
      {{ probeLoading ? '加载监测状态…' : '暂无已激活音源。请先在音源管理中激活，再回来查看或立即检测。' }}
    </p>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { api } from '../api.js'
import { isAdmin as isAdminUser } from '../utils/auth.js'
import { showToast } from '../stores/toast.js'
import AppSelect from './AppSelect.vue'
import { buildSourceDisplayRows } from '../utils/sourceFamily.js'
import { PLATFORM_LABELS, platformsOfSource } from '../utils/platforms.js'

const props = defineProps({
  /** 嵌入设置页时隐藏重复大标题 */
  showTitle: { type: Boolean, default: true },
  embedded: { type: Boolean, default: false },
  /** 父级打开时触发刷新 */
  active: { type: Boolean, default: true },
  /** 每次递增可强制重新拉取（导入/激活后打开） */
  reloadToken: { type: [Number, String], default: 0 },
})

const emit = defineEmits(['updated'])

const probeIntervalOptions = [
  { value: '30', label: '30 分钟' },
  { value: '60', label: '1 小时' },
  { value: '120', label: '2 小时' },
  { value: '360', label: '6 小时' },
]

const probeLoading = ref(false)
const probeRunning = ref(false)
const probeConfig = reactive({ enabled: true, intervalMin: 60, autoDisable: true })
const probeIntervalModel = ref('60')
const probeStatus = ref({ sources: {}, meta: {}, config: {}, running: false })
const sourceList = ref([])

function placeholderPlatforms(member) {
  return platformsOfSource(member).map((id) => ({
    id,
    label: PLATFORM_LABELS[id] || id,
    level: 'unknown',
    lastMs: 0,
    avgMs: 0,
    okRatio: 0,
    sampleCount: 0,
    history: [],
    _sourceId: member.id,
    _placeholder: true,
  }))
}

function platformsForMember(member, map) {
  const fromMember = Array.isArray(member?.probe?.platforms) ? member.probe.platforms : null
  const fromStatus = map[member.id]?.platforms
  const list = fromMember || fromStatus || []
  if (list.length) return list.map((p) => ({ ...p, _sourceId: member.id }))
  return placeholderPlatforms(member)
}

const probeSourceCards = computed(() => {
  const map = probeStatus.value?.sources || {}
  const rows = buildSourceDisplayRows(sourceList.value || [])
  const activeIds = new Set((sourceList.value || []).filter((s) => s.active).map((s) => s.id))
  const cards = []
  for (const row of rows) {
    const members = row.type === 'group' ? (row.members || []) : [row.primary || row].filter(Boolean)
    const activeMembers = members.filter((m) => activeIds.has(m.id))
    if (!activeMembers.length) continue
    const platforms = []
    for (const m of activeMembers) {
      for (const p of platformsForMember(m, map)) platforms.push(p)
    }
    const sampled = platforms.filter((p) => !p._placeholder)
    const okCount = sampled.filter((p) => p.level === 'ok').length
    const down = sampled.filter((p) => p.level === 'down' || p.level === 'fail').length
    const level = !sampled.length
      ? 'unknown'
      : (down && okCount ? 'mixed' : (down ? 'down' : (okCount ? 'ok' : 'unknown')))
    const historyBar = sampled
      .flatMap((p) => (Array.isArray(p.history) ? p.history.slice(-6) : []))
      .slice(-24)
    cards.push({
      id: row.id,
      name: row.name,
      platforms,
      okCount,
      total: platforms.length,
      level,
      historyBar,
    })
  }
  return cards
})

const probeMetaText = computed(() => {
  const meta = probeStatus.value?.meta || {}
  const cfg = probeConfig
  const parts = []
  if (!cfg.enabled) parts.push('自动监测已关闭')
  else parts.push(`自动监测每 ${cfg.intervalMin} 分钟`)
  if (meta.lastRunAt) {
    const t = String(meta.lastRunAt).replace('T', ' ').slice(0, 19)
    parts.push(`上次 ${t}`)
  }
  if (meta.lastTotal != null) parts.push(`样本 ${meta.lastOk || 0}/${meta.lastTotal}`)
  if (probeStatus.value?.running || probeRunning.value) parts.push('正在检测…')
  if (meta.lastError) parts.push(meta.lastError)
  return parts.join(' · ') || '尚无监测记录'
})

function probePillSuffix(p) {
  if (p._placeholder || p.level === 'unknown') return ''
  if (p.level === 'ok' && p.lastMs > 0) return ` ${(p.lastMs / 1000).toFixed(1)}s`
  if (p.level === 'down' || p.level === 'fail') return ' 失败'
  if (p.level === 'watch') return ' 观察'
  return ''
}

function probePillTitle(p) {
  if (p._placeholder || (p.level === 'unknown' && !p.sampleCount)) {
    return `${p.label} · 尚未检测`
  }
  const pct = Math.round((p.okRatio || 0) * 100)
  const bits = [`${p.label}`, `近 ${p.sampleCount || 0} 次成功率 ${pct}%`]
  if (p.avgMs) bits.push(`平均 ${(p.avgMs / 1000).toFixed(1)}s`)
  if (p.lastError) bits.push(p.lastError)
  return bits.join(' · ')
}

function applyProbeStatus(res) {
  probeStatus.value = res || {}
  const cfg = res?.config || {}
  probeConfig.enabled = cfg.enabled !== false
  probeConfig.autoDisable = cfg.autoDisable !== false
  probeConfig.intervalMin = Number(cfg.intervalMin) || 60
  probeIntervalModel.value = String(probeConfig.intervalMin)
  probeRunning.value = Boolean(res?.running)
}

async function refresh() {
  probeLoading.value = true
  try {
    const [status, list] = await Promise.all([
      api.source.probeStatus(),
      api.source.list(),
    ])
    applyProbeStatus(status)
    sourceList.value = Array.isArray(list) ? list : []
    emit('updated', { status, list: sourceList.value })
  } catch (e) {
    showToast(e.message || '读取监测状态失败', 'error')
  } finally {
    probeLoading.value = false
  }
}

async function saveProbeConfigPatch(patch) {
  if (!isAdminUser.value) return
  try {
    const res = await api.source.probeConfig(patch)
    applyProbeStatus({ ...probeStatus.value, config: res?.config || patch })
  } catch (e) {
    showToast(e.message || '保存失败', 'error')
    await refresh()
  }
}

function onProbeEnabledChange(ev) {
  const on = Boolean(ev?.target?.checked)
  probeConfig.enabled = on
  saveProbeConfigPatch({ enabled: on })
}

function onProbeAutoDisableChange(ev) {
  const on = Boolean(ev?.target?.checked)
  probeConfig.autoDisable = on
  saveProbeConfigPatch({ autoDisable: on })
}

function saveProbeInterval() {
  const n = Number(probeIntervalModel.value) || 60
  probeConfig.intervalMin = n
  saveProbeConfigPatch({ intervalMin: n })
}

async function runSourceProbeNow() {
  if (!isAdminUser.value || probeRunning.value) return
  probeRunning.value = true
  try {
    const res = await api.source.probeRun()
    if (res?.skipped) showToast('已有监测任务在进行中', 'info')
    else {
      const ok = res?.okCount ?? res?.status?.meta?.lastOk ?? 0
      const total = res?.total ?? res?.status?.meta?.lastTotal ?? 0
      showToast(total ? `监测完成 ${ok}/${total}` : '监测完成', 'success')
    }
    if (res?.status) applyProbeStatus(res.status)
    sourceList.value = await api.source.list()
    emit('updated', { status: probeStatus.value, list: sourceList.value })
  } catch (e) {
    showToast(e.message || '监测失败', 'error')
  } finally {
    probeRunning.value = false
  }
}

watch(
  () => [props.active, props.reloadToken],
  ([on]) => {
    if (on) refresh()
  },
  { immediate: true },
)

defineExpose({ refresh })
</script>

<style scoped>
.source-probe-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.source-probe-panel.embedded {
  padding: 0;
}
.source-probe-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.source-probe-title {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 650;
}
.source-probe-desc {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.45;
}
.source-probe-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.source-probe-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px 18px;
}
.source-probe-toggle,
.source-probe-interval {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}
.source-probe-meta {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}
.source-probe-empty,
.source-probe-card-empty {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}
.source-probe-card-empty {
  font-size: 12px;
  line-height: 1.45;
}
.source-probe-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}
.source-probe-card {
  border: 1px solid var(--border-light);
  border-radius: var(--radius, 10px);
  padding: 10px 12px;
  background: color-mix(in srgb, var(--bg-card, transparent) 80%, transparent);
}
.source-probe-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.source-probe-card-name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.source-probe-card-ratio {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.source-probe-card-ratio.level-ok { color: #16a34a; }
.source-probe-card-ratio.level-mixed { color: var(--warning, #e6a23c); }
.source-probe-card-ratio.level-down { color: var(--error, #ef4444); }
.source-probe-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.source-probe-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.5;
  border: 1px solid transparent;
}
.source-probe-pill.level-ok {
  color: #166534;
  background: color-mix(in srgb, #22c55e 18%, transparent);
  border-color: color-mix(in srgb, #22c55e 35%, transparent);
}
.source-probe-pill.level-fail,
.source-probe-pill.level-down {
  color: #991b1b;
  background: color-mix(in srgb, #ef4444 16%, transparent);
  border-color: color-mix(in srgb, #ef4444 30%, transparent);
}
.source-probe-pill.level-watch,
.source-probe-pill.level-mixed,
.source-probe-pill.level-unknown {
  color: #92400e;
  background: color-mix(in srgb, #f59e0b 16%, transparent);
  border-color: color-mix(in srgb, #f59e0b 30%, transparent);
}
.source-probe-history {
  display: flex;
  gap: 3px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.source-probe-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--text-muted) 35%, transparent);
}
.source-probe-dot.ok { background: #22c55e; }
.source-probe-dot.fail { background: #ef4444; }

.toggle {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
}
.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}
.toggle .slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--border);
  border-radius: 999px;
  transition: 0.2s;
}
.toggle .slider::before {
  position: absolute;
  content: '';
  height: 16px;
  width: 16px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: 0.2s;
}
.toggle input:checked + .slider {
  background: var(--accent, #f97316);
}
.toggle input:checked + .slider::before {
  transform: translateX(18px);
}

@media (max-width: 768px) {
  .source-probe-head {
    flex-direction: column;
  }
  .source-probe-actions {
    width: 100%;
  }
  .source-probe-actions .btn-sm {
    flex: 1;
  }
  .source-probe-cards {
    grid-template-columns: 1fr;
  }
}
</style>
