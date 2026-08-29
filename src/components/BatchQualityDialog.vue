<template>
  <div v-if="plan" class="batch-quality-overlay" @click.self="$emit('cancel')">
    <div class="batch-quality-modal" role="dialog" aria-modal="true" aria-labelledby="batch-quality-title">
      <h3 id="batch-quality-title">部分歌曲不支持所选音质</h3>
      <p class="batch-quality-desc">
        你选择了 <strong>{{ preferredLabel }}</strong>。
        <template v-if="matchedCount > 0">{{ matchedCount }} 首将按该音质下载，</template>
        以下 {{ plan.rows.length }} 首需单独选择可用音质：
      </p>

      <div v-if="bulkOptions.length > 1" class="batch-bulk-bar">
        <span>以下歌曲统一设为</span>
        <select
          :value="bulkQuality"
          class="batch-quality-select"
          @change="$emit('update:bulkQuality', $event.target.value)"
        >
          <option v-for="q in bulkOptions" :key="q" :value="q">{{ formatQuality(q) }}</option>
        </select>
        <button type="button" class="btn-ghost btn-sm" @click="$emit('apply-bulk')">应用</button>
      </div>

      <div class="batch-quality-list">
        <div v-for="row in plan.rows" :key="row.key" class="batch-quality-row">
          <div class="batch-quality-meta">
            <div class="batch-quality-name" :title="cleanText(row.item.name)">{{ cleanText(row.item.name) }}</div>
            <div class="batch-quality-singer" :title="formatArtists(row.item.singer)">{{ formatArtists(row.item.singer) }}</div>
            <div class="batch-quality-available">
              可用：{{ row.available.map(q => formatQuality(q, row.item.types)).join('、') || '未知' }}
            </div>
          </div>
          <select
            v-model="selections[row.key]"
            class="batch-quality-select"
          >
            <option v-if="!row.available.length" value="128k">128K · MP3</option>
            <option v-for="q in row.available" :key="q" :value="q">
              {{ formatQuality(q, row.item.types) }}
            </option>
          </select>
        </div>
      </div>

      <div class="batch-quality-actions">
        <button type="button" class="btn-ghost" :disabled="busy" @click="$emit('cancel')">取消</button>
        <button type="button" class="btn-primary" :disabled="busy" @click="$emit('confirm')">
          {{ busy ? '添加中...' : `确认并下载 ${totalCount} 首` }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { getQualityLabel } from '../utils/quality.js'
import { cleanText, formatArtists } from '../utils/text.js'

const props = defineProps({
  plan: { type: Object, default: null },
  selections: { type: Object, required: true },
  bulkQuality: { type: String, default: '' },
  bulkOptions: { type: Array, default: () => [] },
  preferredLabel: { type: String, default: '' },
  busy: { type: Boolean, default: false },
})

defineEmits(['cancel', 'confirm', 'apply-bulk', 'update:bulkQuality'])

const matchedCount = computed(() => props.plan?.matched?.length || 0)
const totalCount = computed(() => (props.plan?.matched?.length || 0) + (props.plan?.rows?.length || 0))

function formatQuality(q, types) {
  return getQualityLabel(q, types)
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
  width: min(560px, 100%);
  max-height: min(80vh, 720px);
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
  line-height: 1.55;
  color: var(--text-secondary);
}

.batch-quality-desc strong {
  color: var(--accent);
}

.batch-bulk-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--accent-muted);
  font-size: 13px;
  color: var(--text-secondary);
}

.batch-quality-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin-bottom: 16px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
}

.batch-quality-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
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
  font-size: 14px;
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

.batch-quality-available {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.batch-quality-select {
  flex-shrink: 0;
  min-width: 132px;
  max-width: 42%;
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
    align-items: stretch;
  }

  .batch-quality-select {
    max-width: none;
    width: 100%;
  }
}
</style>
