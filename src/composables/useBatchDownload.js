import { ref } from 'vue'
import { api } from '../api.js'
import { assertActiveSourceForDownload } from '../stores/downloadGuard.js'
import {
  prepareBatchDownload,
  buildBatchDownloadTasks,
  getBatchQualities,
} from '../utils/musicPayload.js'

export function formatBatchDownloadToast(count, summary) {
  const skipped = summary?.skippedCount || 0
  if (skipped > 0) {
    return `已添加 ${count} 首到下载队列（跳过 ${skipped} 首：无要求音质）`
  }
  return `已添加 ${count} 首到下载队列`
}

export function useBatchDownload({ getSource, onCompleted, onError } = {}) {
  const batchDialog = ref(null)
  const batchDownloading = ref(false)

  function closeBatchDialog() {
    batchDialog.value = null
  }

  const BATCH_CHUNK_SIZE = 20

  async function executeBatchDownload(plan, { strategy = 'cascade', floorQuality = '' } = {}) {
    if (!(await assertActiveSourceForDownload())) return null
    batchDownloading.value = true
    try {
      const { tasks, skippedCount } = buildBatchDownloadTasks(plan.entries, getSource(), {
        preferredQuality: plan.preferred,
        strategy,
        floorQuality,
      })
      if (!tasks.length) {
        onError?.(new Error(skippedCount ? '所选歌曲均无要求音质，未添加下载' : '没有可下载的歌曲'))
        return null
      }
      for (let i = 0; i < tasks.length; i += BATCH_CHUNK_SIZE) {
        await api.download.add(tasks.slice(i, i + BATCH_CHUNK_SIZE))
      }
      const summary = {
        total: tasks.length,
        skippedCount,
        strategy,
        floorQuality,
      }
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
    if (!(await assertActiveSourceForDownload())) return null
    const plan = prepareBatchDownload(entries, preferredQuality)
    if (!plan.entries.length) return null
    // 批量下载固定只弹一次策略确认窗
    batchDialog.value = plan
    return null
  }

  async function confirmBatchDialog({ strategy = 'cascade', floorQuality = '' } = {}) {
    const plan = batchDialog.value
    if (!plan) return null
    closeBatchDialog()
    return executeBatchDownload(plan, { strategy, floorQuality })
  }

  return {
    batchDialog,
    batchDownloading,
    startBatchDownload,
    confirmBatchDialog,
    closeBatchDialog,
    getBatchQualities,
  }
}
