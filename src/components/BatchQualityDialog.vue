<template>
  <div v-if="plan" class="batch-quality-overlay" @click.self="$emit('cancel')">
    <div class="batch-quality-modal" role="dialog" aria-modal="true" aria-labelledby="batch-quality-title">
      <h3 id="batch-quality-title">确认批量下载音质</h3>
      <p class="batch-quality-desc">
        你选择了 <strong>{{ preferredLabel }}</strong>。
        <template v-if="matchedCount > 0">{{ matchedCount }} 首将按该音质下载。</template>
        <template v-if="downgradedCount > 0">
          <span v-if="matchedCount > 0"> </span>
          另有 <strong>{{ downgradedCount }}</strong> 首不支持该音质，将自动降为最接近的可用音质。
        </template>
      </p>

      <div v-if="downgradedCount" class="batch-summary-box">
        <button
          type="button"
          class="batch-summary-toggle"
          @click="showDetails = !showDetails"
        >
          <span>{{ showDetails ? '收起详情' : '查看降档歌曲' }}（{{ downgradedCount }} 首）</span>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" :class="{ open: showDetails }">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <div v-if="showDetails" class="batch-quality-list">
          <div v-for="row in downgradedRows" :key="row.key" class="batch-quality-row">
            <div class="batch-quality-meta">
              <div class="batch-quality-name" :title="cleanText(row.name)">{{ cleanText(row.name) }}</div>
              <div class="batch-quality-singer" :title="formatArtists(row.singer)">{{ formatArtists(row.singer) }}</div>
            </div>
            <div class="batch-quality-result">
              <span class="batch-quality-from">{{ formatQuality(row.from) }}</span>
              <span class="batch-quality-arrow">→</span>
              <span class="batch-quality-to">{{ formatQuality(row.to) }}</span>
            </div>
          </div>
        </div>
      </div>

      <label class="batch-remember">
        <input v-model="rememberChoice" type="checkbox" />
        <span>以后不再提示，不支持所选音质时自动按最接近音质下载</span>
      </label>

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
import { getQualityLabel } from '../utils/quality.js'
import { cleanText, formatArtists } from '../utils/text.js'

const props = defineProps({
  plan: { type: Object, default: null },
  preferredLabel: { type: String, default: '' },
  busy: { type: Boolean, default: false },
})

const emit = defineEmits(['cancel', 'confirm'])

const showDetails = ref(false)
const rememberChoice = ref(false)

const matchedCount = computed(() => props.plan?.matched?.length || 0)
const downgradedRows = computed(() => {
  const preferred = props.plan?.preferred
  return (props.plan?.rows || []).map((row) => ({
    key: row.key,
    name: row.item?.name || '',
    singer: row.item?.singer || '',
    from: preferred,
    to: row.selected,
  }))
})
const downgradedCount = computed(() => downgradedRows.value.length)
const totalCount = computed(() => matchedCount.value + downgradedCount.value)

watch(() => props.plan, () => {
  showDetails.value = false
  rememberChoice.value = false
})

function formatQuality(q) {
  return getQualityLabel(q)
}

function onConfirm() {
  emit('confirm', { remember: rememberChoice.value })
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
  width: min(480px, 100%);
  max-height: min(80vh, 640px);
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 22px 22px 18px;
  box-shadow: var(--shadow);
}

.batch-quality-modal h3 {
  margin: 0 0 10px;
  font-size: 18px;
  color: var(--text);
}

.batch-quality-desc {
  margin: 0 0 14px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.batch-quality-desc strong {
  color: var(--accent);
}

.batch-summary-box {
  margin-bottom: 14px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  overflow: hidden;
}

.batch-summary-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border: none;
  background: var(--bg-card, var(--bg));
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}

.batch-summary-toggle:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.batch-summary-toggle svg {
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.batch-summary-toggle svg.open {
  transform: rotate(180deg);
}

.batch-quality-list {
  max-height: min(36vh, 280px);
  overflow-y: auto;
  border-top: 1px solid var(--border-light);
}

.batch-quality-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-light);
}

.batch-quality-row:last-child {
  border-bottom: none;
}

.batch-quality-meta {
  min-width: 0;
  flex: 1;
}

.batch-quality-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-quality-singer {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-quality-result {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.batch-quality-from {
  color: var(--text-muted);
  text-decoration: line-through;
}

.batch-quality-arrow {
  color: var(--text-muted);
}

.batch-quality-to {
  color: var(--accent);
  font-weight: 600;
}

.batch-remember {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.batch-remember input {
  margin-top: 3px;
  flex-shrink: 0;
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
    max-height: 85vh;
    padding: 18px 16px 14px;
  }

  .batch-quality-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .batch-quality-result {
    width: 100%;
  }
}
</style>
