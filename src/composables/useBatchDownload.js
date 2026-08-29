import { ref, computed } from 'vue'
import { api } from '../api.js'
import { prepareBatchDownload, buildBatchDownloadTasks, getBatchQualities } from '../utils/musicPayload.js'
import { sortQualities } from '../utils/quality.js'

export function useBatchDownload({ getSource, onCompleted, onError } = {}) {
  const batchDialog = ref(null)
  const rowSelections = ref({})
  const bulkQuality = ref('')
  const batchDownloading = ref(false)

  const bulkQualityOptions = computed(() => {
    const plan = batchDialog.value
    if (!plan?.rows?.length) return []
    const union = new Set()
    for (const row of plan.rows) {
      for (const q of row.available) union.add(q)
    }
    return sortQualities([...union])
  })

  function openBatchDialog(plan) {
    const selections = {}
    for (const row of plan.rows) selections[row.key] = row.selected
    rowSelections.value = selections
    batchDialog.value = plan
    const union = new Set()
    for (const row of plan.rows) {
      for (const q of row.available) union.add(q)
    }
    bulkQuality.value = sortQualities([...union])[0] || ''
  }

  function closeBatchDialog() {
    batchDialog.value = null
    rowSelections.value = {}
    bulkQuality.value = ''
  }

  function applyBulkQuality() {
    const q = bulkQuality.value
    if (!q || !batchDialog.value) return
    const next = { ...rowSelections.value }
    for (const row of batchDialog.value.rows) {
      if (row.available.includes(q)) next[row.key] = q
    }
    rowSelections.value = next
  }

  async function executeBatchDownload(plan, qualityMap) {
    batchDownloading.value = true
    try {
      const tasks = buildBatchDownloadTasks(plan.entries, getSource(), qualityMap)
      await api.download.add(tasks)
      onCompleted?.(tasks.length)
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
    if (!plan.needsConfirm) {
      const qualityMap = {}
      for (const m of plan.matched) qualityMap[m.key] = m.quality
      return executeBatchDownload(plan, qualityMap)
    }
    openBatchDialog(plan)
    return null
  }

  async function confirmBatchDialog() {
    const plan = batchDialog.value
    if (!plan) return null
    const qualityMap = {}
    for (const m of plan.matched) qualityMap[m.key] = m.quality
    for (const row of plan.rows) {
      qualityMap[row.key] = rowSelections.value[row.key] || row.selected
    }
    closeBatchDialog()
    return executeBatchDownload(plan, qualityMap)
  }

  return {
    batchDialog,
    rowSelections,
    bulkQuality,
    bulkQualityOptions,
    batchDownloading,
    startBatchDownload,
    confirmBatchDialog,
    closeBatchDialog,
    applyBulkQuality,
    getBatchQualities,
  }
}
