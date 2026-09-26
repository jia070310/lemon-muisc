<template>
  <div v-if="open" class="paced-overlay" @click.self="$emit('cancel')">
    <div class="paced-modal" role="dialog" aria-modal="true" aria-labelledby="paced-dl-title">
      <h3 id="paced-dl-title">下载整个歌单</h3>
      <p class="paced-desc">
        共 <strong>{{ totalCount }}</strong> 首网络歌曲，目标音质
        <strong>{{ preferredLabel }}</strong>。
        为降低封号风险，将按你设定的批次与间隔自动依次入队。
      </p>

      <div class="paced-field">
        <label class="paced-label">每次下载</label>
        <select v-model.number="batchSize">
          <option v-for="n in batchOptions" :key="n" :value="n">{{ n }} 首</option>
        </select>
      </div>

      <div class="paced-field">
        <label class="paced-label">间隔时间</label>
        <select v-model.number="intervalHours">
          <option v-for="opt in intervalOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>

      <p class="paced-hint">
        预计约 {{ estimatedBatches }} 批完成；首批立即开始，之后每隔设定时间自动下载下一批。
      </p>

      <div class="batch-strategy-list" role="radiogroup" aria-label="降档策略">
        <label class="batch-strategy" :class="{ active: strategy === 'cascade' }">
          <input v-model="strategy" type="radio" value="cascade" />
          <div class="batch-strategy-body">
            <div class="batch-strategy-title">自动逐档降级</div>
            <div class="batch-strategy-desc">同一音质会先换其他已激活音源；仍失败则自动降一档继续。</div>
          </div>
        </label>

        <label class="batch-strategy" :class="{ active: strategy === 'floor' }">
          <input v-model="strategy" type="radio" value="floor" />
          <div class="batch-strategy-body">
            <div class="batch-strategy-title">最多降到指定音质</div>
            <div class="batch-strategy-desc">只允许降到下面选择的音质；再低则跳过该曲。</div>
            <div class="batch-floor-row" @click.stop>
              <span>最低音质</span>
              <select v-model="floorQuality" :disabled="strategy !== 'floor'">
                <option v-for="q in floorOptions" :key="q" :value="q">{{ formatQuality(q) }}</option>
              </select>
            </div>
          </div>
        </label>

        <label class="batch-strategy" :class="{ active: strategy === 'none' }">
          <input v-model="strategy" type="radio" value="none" />
          <div class="batch-strategy-body">
            <div class="batch-strategy-title">不降档（只要目标音质）</div>
            <div class="batch-strategy-desc">不自动降档；仍拿不到时会询问是否降档。无损推荐此项。</div>
          </div>
        </label>
      </div>

      <label class="paced-folder">
        <input v-model="saveListFolder" type="checkbox" />
        <span>
          保存到歌单文件夹
          <em v-if="playlistName">（{{ playlistName }}）</em>
        </span>
      </label>
      <p class="paced-hint folder-hint">开启后文件会放在下载目录下以歌单名命名的子文件夹中（可再叠加设置里的歌手/专辑分组）。</p>

      <div class="paced-actions">
        <button type="button" class="btn-ghost" :disabled="busy" @click="$emit('cancel')">取消</button>
        <button type="button" class="btn-primary" :disabled="busy || !totalCount" @click="onConfirm">
          {{ busy ? '创建中…' : '开始循序下载' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { getQualityLabel, QUALITY_ORDER } from '../utils/quality.js'
import { isLosslessQuality } from '../utils/musicPayload.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  totalCount: { type: Number, default: 0 },
  preferred: { type: String, default: '320k' },
  preferredLabel: { type: String, default: '' },
  playlistName: { type: String, default: '' },
  defaultBatchSize: { type: Number, default: 50 },
  defaultIntervalHours: { type: Number, default: 24 },
  busy: { type: Boolean, default: false },
})

const emit = defineEmits(['cancel', 'confirm'])

const batchOptions = [50, 100, 200, 300, 500, 1000]
const intervalOptions = [
  { value: 1, label: '1 小时' },
  { value: 3, label: '3 小时' },
  { value: 6, label: '6 小时' },
  { value: 12, label: '12 小时' },
  { value: 24, label: '1 天' },
  { value: 48, label: '2 天' },
]

const batchSize = ref(50)
const intervalHours = ref(24)
const strategy = ref('cascade')
const floorQuality = ref('320k')
const saveListFolder = ref(false)

const floorOptions = computed(() => {
  const start = QUALITY_ORDER.indexOf(props.preferred)
  if (start === -1) return [...QUALITY_ORDER]
  return QUALITY_ORDER.slice(start)
})

const estimatedBatches = computed(() => {
  const n = Math.max(1, Number(batchSize.value) || 50)
  return Math.max(1, Math.ceil((props.totalCount || 0) / n))
})

watch(() => props.open, (open) => {
  if (!open) return
  batchSize.value = batchOptions.includes(props.defaultBatchSize) ? props.defaultBatchSize : 50
  intervalHours.value = intervalOptions.some((o) => o.value === props.defaultIntervalHours)
    ? props.defaultIntervalHours
    : 24
  strategy.value = isLosslessQuality(props.preferred) ? 'none' : 'cascade'
  const opts = floorOptions.value
  floorQuality.value = opts.includes('320k') ? '320k' : (opts[0] || props.preferred)
  saveListFolder.value = false
})

function formatQuality(q) {
  return getQualityLabel(q)
}

function onConfirm() {
  emit('confirm', {
    batchSize: batchSize.value,
    intervalHours: intervalHours.value,
    strategy: strategy.value,
    floorQuality: strategy.value === 'floor' ? floorQuality.value : '',
    saveListFolder: saveListFolder.value,
  })
}
</script>

<style scoped>
.paced-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.paced-modal {
  width: min(540px, 100%);
  max-height: min(88vh, 760px);
  overflow: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 22px 22px 18px;
  box-shadow: var(--shadow);
}

.paced-modal h3 {
  margin: 0 0 10px;
  font-size: 18px;
  color: var(--text);
}

.paced-desc {
  margin: 0 0 14px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.paced-desc strong { color: var(--accent); }

.paced-field {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.paced-label {
  width: 72px;
  flex-shrink: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.paced-field select {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: var(--bg-input, var(--bg));
  color: var(--text);
}

.paced-hint {
  margin: 0 0 14px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}

.folder-hint { margin-top: -4px; margin-bottom: 16px; }

.batch-strategy-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
}

.batch-strategy {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-card, var(--bg));
  cursor: pointer;
  user-select: none;
}

.batch-strategy.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.batch-strategy input {
  margin-top: 3px;
  flex-shrink: 0;
}

.batch-strategy-body { min-width: 0; flex: 1; }

.batch-strategy-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.batch-strategy-desc {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}

.batch-floor-row {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text-secondary);
}

.batch-floor-row select {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: var(--bg-input, var(--bg));
  color: var(--text);
}

.paced-folder {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 14px;
  color: var(--text);
  cursor: pointer;
  user-select: none;
}

.paced-folder input {
  margin-top: 3px;
  accent-color: var(--accent);
}

.paced-folder em {
  font-style: normal;
  color: var(--accent);
}

.paced-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .paced-overlay {
    padding: 12px;
    align-items: flex-end;
  }
  .paced-modal {
    max-height: 90vh;
    padding: 18px 16px 14px;
  }
}
</style>
