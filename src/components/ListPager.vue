<template>
  <div v-if="show" class="list-pager">
    <AppSelect
      v-if="showSize"
      class="list-pager-size"
      :model-value="resolvedPageSize"
      :options="sizeOptions"
      size="sm"
      min-width="7.5rem"
      title="每页显示条数"
      @update:model-value="onSizeChange"
    />
    <div class="list-pager-nav" role="navigation" :aria-label="ariaLabel">
      <button
        v-if="showEnds"
        type="button"
        class="list-pager-btn"
        :disabled="currentPage <= 1"
        title="第一页"
        aria-label="第一页"
        @click="go(1)"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
          <polyline points="11 18 5 12 11 6"/>
          <polyline points="18 18 12 12 18 6"/>
        </svg>
      </button>
      <button
        type="button"
        class="list-pager-btn"
        :disabled="currentPage <= 1"
        aria-label="上一页"
        @click="go(currentPage - 1)"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <button
        v-for="n in visiblePages"
        :key="n"
        type="button"
        class="list-pager-page"
        :class="{ active: n === currentPage }"
        :aria-current="n === currentPage ? 'page' : undefined"
        :aria-label="`第 ${n} 页`"
        @click="go(n)"
      >{{ n }}</button>
      <button
        type="button"
        class="list-pager-btn"
        :disabled="currentPage >= resolvedTotalPages"
        aria-label="下一页"
        @click="go(currentPage + 1)"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
      <button
        v-if="showEnds"
        type="button"
        class="list-pager-btn"
        :disabled="currentPage >= resolvedTotalPages"
        title="最后一页"
        aria-label="最后一页"
        @click="go(resolvedTotalPages)"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
          <polyline points="13 18 19 12 13 6"/>
          <polyline points="6 18 12 12 6 6"/>
        </svg>
      </button>
    </div>
    <form
      v-if="showJump && resolvedTotalPages > 1"
      class="list-pager-jump"
      @submit.prevent="submitJump"
    >
      <span class="list-pager-jump-label">跳至</span>
      <input
        v-model="jumpInput"
        class="list-pager-jump-input"
        type="number"
        inputmode="numeric"
        min="1"
        :max="resolvedTotalPages"
        :placeholder="String(currentPage)"
        aria-label="跳转页码"
      />
      <span class="list-pager-jump-label">/ {{ resolvedTotalPages }} 页</span>
      <button type="submit" class="list-pager-jump-go">前往</button>
    </form>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import AppSelect from './AppSelect.vue'
import {
  listPageSizeSelectOptions,
  LIST_PAGE_SIZE_OPTIONS,
  LIST_PAGE_SIZE_DEFAULT,
  toListCount,
  countListPages,
} from '../composables/useListPageSize.js'

const props = defineProps({
  page: { type: [Number, String], default: 1 },
  pageSize: { type: [Number, String], default: 20 },
  /** 总条数（优先）；也可只传 totalPages */
  total: { type: [Number, String], default: 0 },
  totalPages: { type: [Number, String], default: 0 },
  /** 总条数不超过最小档且仅一页时是否仍显示（便于改每页条数） */
  alwaysShowSize: { type: Boolean, default: false },
  /** 远程接口不支持改条数时设为 false，仅保留翻页 */
  showSize: { type: Boolean, default: true },
  /** 显示第一页 / 最后一页 */
  showEnds: { type: Boolean, default: false },
  /** 显示跳转到指定页 */
  showJump: { type: Boolean, default: false },
  ariaLabel: { type: String, default: '分页' },
  sizeOptions: {
    type: Array,
    default: () => listPageSizeSelectOptions,
  },
})

const emit = defineEmits(['update:page', 'update:pageSize', 'change-page', 'change-page-size'])

const jumpInput = ref('')

const resolvedPageSize = computed(() =>
  Math.max(1, toListCount(props.pageSize, LIST_PAGE_SIZE_DEFAULT) || LIST_PAGE_SIZE_DEFAULT),
)

const resolvedTotal = computed(() => toListCount(props.total, 0))

const resolvedTotalPages = computed(() =>
  countListPages(resolvedTotal.value, resolvedPageSize.value, props.totalPages),
)

const currentPage = computed(() =>
  Math.min(resolvedTotalPages.value, Math.max(1, Number(props.page) || 1)),
)

const minSize = computed(() => {
  const vals = (props.sizeOptions || [])
    .map((o) => Number(o?.value))
    .filter((n) => Number.isFinite(n) && n > 0)
  return vals.length ? Math.min(...vals) : (LIST_PAGE_SIZE_OPTIONS[0] || 10)
})

const show = computed(() => {
  const total = resolvedTotal.value
  const pages = resolvedTotalPages.value
  if (pages > 1) return true
  if (!props.showSize) return false
  if (props.alwaysShowSize && total > 0) return true
  if (total > minSize.value) return true
  return false
})

/** 默认最多显示 3 个页码（条数够才出 2、3 页） */
const visiblePages = computed(() => {
  const total = resolvedTotalPages.value
  const current = currentPage.value
  const windowSize = Math.min(3, total)
  let start = Math.max(1, current - Math.floor((windowSize - 1) / 2))
  let end = start + windowSize - 1
  if (end > total) {
    end = total
    start = Math.max(1, end - windowSize + 1)
  }
  const pages = []
  for (let n = start; n <= end; n++) pages.push(n)
  return pages
})

watch(
  () => props.page,
  (p) => {
    if (jumpInput.value === '' || jumpInput.value == null) return
    const n = Number(jumpInput.value)
    if (Number.isFinite(n) && n === Number(p)) jumpInput.value = ''
  },
)

function go(next) {
  const p = Math.min(resolvedTotalPages.value, Math.max(1, Number(next) || 1))
  if (p === Number(props.page)) return
  emit('update:page', p)
  emit('change-page', p)
}

function submitJump() {
  const raw = String(jumpInput.value ?? '').trim()
  if (!raw) return
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n)) return
  go(n)
  jumpInput.value = ''
}

function onSizeChange(value) {
  const next = Number(value)
  if (!Number.isFinite(next) || next === props.pageSize) return
  emit('update:pageSize', next)
  emit('change-page-size', next)
  if (props.page !== 1) {
    emit('update:page', 1)
    emit('change-page', 1)
  }
}
</script>

<style scoped>
.list-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 16px;
  padding: 4px 0;
}
.list-pager-nav {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.list-pager-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-elevated, var(--bg-card));
  color: var(--text-secondary);
  cursor: pointer;
}
.list-pager-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.list-pager-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.list-pager-page {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  height: 34px;
  padding: 0 8px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-elevated, var(--bg-card));
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.list-pager-page:hover:not(.active) {
  border-color: var(--accent);
  color: var(--accent);
}
.list-pager-page.active {
  border-color: transparent;
  color: #fff;
  background: var(--accent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent);
  cursor: default;
}
.list-pager-jump {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.list-pager-jump-label {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}
.list-pager-jump-input {
  width: 52px;
  height: 34px;
  padding: 0 8px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-elevated, var(--bg-card));
  color: var(--text);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.list-pager-jump-input:focus {
  outline: none;
  border-color: var(--accent);
}
.list-pager-jump-go {
  height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-elevated, var(--bg-card));
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}
.list-pager-jump-go:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.list-pager-size :deep(.app-select-trigger) {
  height: 34px;
  min-height: 34px;
  border-radius: 8px;
}
@media (max-width: 768px) {
  .list-pager {
    gap: 10px;
    margin-top: 12px;
  }
  .list-pager-jump-input {
    width: 48px;
  }
}
</style>
