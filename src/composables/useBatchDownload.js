import { ref } from 'vue'
import { api } from '../api.js'
import {
  prepareBatchDownload,
  buildBatchDownloadTasks,
  buildBatchQualityMap,
  getBatchQualities,
} from '../utils/musicPayload.js'

const BATCH_AUTO_QUALITY_KEY = 'lx-music-nas:batch-download-auto-quality'

export function isBatchQualityAutoConfirmEnabled() {
  try {
    return localStorage.getItem(BATCH_AUTO_QUALITY_KEY) === '1'
  } catch {
    return false
  }
}

export function setBatchQualityAutoConfirm(enabled) {
  try {
    if (enabled) localStorage.setItem(BATCH_AUTO_QUALITY_KEY, '1')
    else localStorage.removeItem(BATCH_AUTO_QUALITY_KEY)
  } catch {}
}

export function formatBatchDownloadToast(count, summary) {
  if (!summary?.downgradedCount) return `已添加 ${count} 首到下载队列`
  return `已添加 ${count} 首到下载队列（${summary.downgradedCount} 首已自动降档）`
}

export function useBatchDownload({ getSource, onCompleted, onError } = {}) {
  const batchDialog = ref(null)
  const batchDownloading = ref(false)

  function closeBatchDialog() {
    batchDialog.value = null
  }

  function summarizePlan(plan) {
    const matchedCount = plan.matched?.length || 0
    const downgradedCount = plan.rows?.length || 0
    return {
      total: matchedCount + downgradedCount,
      matchedCount,
      downgradedCount,
      downgraded: (plan.rows || []).map((row) => ({
        key: row.key,
        name: row.item?.name || '',
        singer: row.item?.singer || '',
        from: plan.preferred,
        to: row.selected,
        available: row.available || [],
      })),
    }
  }

const BATCH_CHUNK_SIZE = 20

  async function executeBatchDownload(plan, qualityMap) {
    batchDownloading.value = true
    try {
      const tasks = buildBatchDownloadTasks(plan.entries, getSource(), qualityMap)
      for (let i = 0; i < tasks.length; i += BATCH_CHUNK_SIZE) {
        await api.download.add(tasks.slice(i, i + BATCH_CHUNK_SIZE))
      }
      const summary = summarizePlan(plan)
      onCompleted?.(tasks.length, summary)
      return tasks
    } catch (e) {
      onError?.(e)
      throw e
    } finally {
      batchDownloading.value = false
    }
  }

  async function startBatchDownload(entries, preferredQuality) {
    const plan = prepareBatchDownload(entries, preferredQuality)
    if (!plan.entries.length) return null

    const qualityMap = buildBatchQualityMap(plan)
    if (!plan.needsConfirm || isBatchQualityAutoConfirmEnabled()) {
      return executeBatchDownload(plan, qualityMap)
    }

    batchDialog.value = plan
    return null
  }

  async function confirmBatchDialog({ remember = false } = {}) {
    const plan = batchDialog.value
    if (!plan) return null
    if (remember) setBatchQualityAutoConfirm(true)
    const qualityMap = buildBatchQualityMap(plan)
    closeBatchDialog()
    return executeBatchDownload(plan, qualityMap)
  }

  return {
    batchDialog,
    batchDownloading,
    startBatchDownload,
    confirmBatchDialog,
    closeBatchDialog,
    getBatchQualities,
    isBatchQualityAutoConfirmEnabled,
    setBatchQualityAutoConfirm,
  }
}
