<template>
  <div v-if="plan" class="batch-quality-overlay" @click.self="$emit('cancel')">
    <div class="batch-quality-modal" role="dialog" aria-modal="true" aria-labelledby="batch-quality-title">
      <h3 id="batch-quality-title">批量下载确认</h3>
      <p class="batch-quality-desc">
        已选 <strong>{{ totalCount }}</strong> 首，目标音质
        <strong>{{ preferredLabel }}</strong>。
        多音源激活时会先按音源顺序尝试同一音质，再按下方策略处理。
      </p>
      <p v-if="unsupportedCount" class="batch-quality-hint">
        其中约 {{ unsupportedCount }} 首在当前列表中未标明支持该音质，实际能否下载以取链结果为准。
      </p>

      <div class="batch-strategy-list" role="radiogroup" aria-label="降档策略">
        <label class="batch-strategy" :class="{ active: strategy === 'cascade' }">
          <input v-model="strategy" type="radio" value="cascade" />
          <div class="batch-strategy-body">
            <div class="batch-strategy-title">自动逐档降级</div>
            <div class="batch-strategy-desc">同一音质会先换其他已激活音源；仍失败则自动降一档继续，直到成功或没有更低音质。</div>
          </div>
        </label>

        <label class="batch-strategy" :class="{ active: strategy === 'floor' }">
          <input v-model="strategy" type="radio" value="floor" />
          <div class="batch-strategy-body">
            <div class="batch-strategy-title">最多降到指定音质</div>
            <div class="batch-strategy-desc">只允许降到下面选择的音质；再低则不下载该曲（列表中标记为无要求音质）。</div>
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
            <div class="batch-strategy-title">不降档</div>
            <div class="batch-strategy-desc">拿不到目标音质则直接失败，并在下载列表写明原因；仍可手动重试。</div>
          </div>
        </label>
      </div>

      <div class="batch-quality-actions">
        <button type="button" class="btn-ghost" :disabled="busy" @click="$emit('cancel')">取消</button>
        <button type="button" class="btn-primary" :disabled="busy" @click="onConfirm">
          {{ busy ? '添加中...' : `确认并下载 ${totalCount} 首` }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { getQualityLabel, QUALITY_ORDER } from '../utils/quality.js'

const props = defineProps({
  plan: { type: Object, default: null },
  preferredLabel: { type: String, default: '' },
  busy: { type: Boolean, default: false },
})

const emit = defineEmits(['cancel', 'confirm'])

const strategy = ref('cascade')
const floorQuality = ref('320k')

const totalCount = computed(() => props.plan?.entries?.length || 0)
const unsupportedCount = computed(() => props.plan?.unsupportedCount || 0)
const preferred = computed(() => props.plan?.preferred || '320k')

const floorOptions = computed(() => {
  const start = QUALITY_ORDER.indexOf(preferred.value)
  if (start === -1) return [...QUALITY_ORDER]
  return QUALITY_ORDER.slice(start)
})

watch(() => props.plan, () => {
  strategy.value = 'cascade'
  const opts = floorOptions.value
  floorQuality.value = opts.includes('320k') ? '320k' : (opts[0] || preferred.value)
})

watch(preferred, () => {
  const opts = floorOptions.value
  if (!opts.includes(floorQuality.value)) {
    floorQuality.value = opts.includes('320k') ? '320k' : (opts[0] || preferred.value)
  }
})

function formatQuality(q) {
  return getQualityLabel(q)
}

function onConfirm() {
  emit('confirm', {
    strategy: strategy.value,
    floorQuality: strategy.value === 'floor' ? floorQuality.value : '',
  })
}
</script>

<style scoped>
.batch-quality-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.batch-quality-modal {
  width: min(520px, 100%);
  max-height: min(85vh, 720px);
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 22px 22px 18px;
  box-shadow: var(--shadow);
  overflow: auto;
}

.batch-quality-modal h3 {
  margin: 0 0 10px;
  font-size: 18px;
  color: var(--text);
}

.batch-quality-desc {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.batch-quality-desc strong {
  color: var(--accent);
}

.batch-quality-hint {
  margin: 0 0 14px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}

.batch-strategy-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
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

.batch-strategy-body {
  min-width: 0;
  flex: 1;
}

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

.batch-quality-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .batch-quality-overlay {
    padding: 12px;
    align-items: flex-end;
  }

  .batch-quality-modal {
    max-height: 88vh;
    padding: 18px 16px 14px;
  }
}
</style>
