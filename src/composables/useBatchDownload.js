import { ref } from 'vue'
import { api } from '../api.js'
import { assertActiveSourceForDownload } from '../stores/downloadGuard.js'
import {
  prepareBatchDownload,
  buildBatchDownloadTasks,
  getBatchQualities,
} from '../utils/musicPayload.js'
import { formatPacedStartToast } from './usePacedJobUi.js'

export function formatBatchDownloadToast(count, summary) {
  if (summary?.job) return formatPacedStartToast(summary.job, { skippedCount: summary.skippedCount || 0 })
  const skipped = summary?.skippedCount || 0
  if (skipped > 0) {
    return `已添加 ${count} 首到下载队列（跳过 ${skipped} 首：无要求音质）`
  }
  return `已添加 ${count} 首到下载队列`
}

const BATCH_OPTIONS = [50, 100, 200, 300, 500, 1000]
const INTERVAL_OPTIONS = [1, 3, 6, 12, 24, 48]

export function useBatchDownload({
  getSource,
  getPlaylistName,
  getPlaylistId,
  getAlbumMeta,
  onCompleted,
  onError,
} = {}) {
  const batchDialog = ref(null)
  const batchDownloading = ref(false)
  const pacedDefaults = ref({ batchSize: 50, intervalHours: 24 })

  function closeBatchDialog() {
    batchDialog.value = null
  }

  async function loadPacedDefaults() {
    try {
      const s = await api.settings.get()
      const batch = Number(s?.['download.playlistBatchSize']) || 50
      const hours = Number(s?.['download.playlistIntervalHours']) || 24
      pacedDefaults.value = {
        batchSize: BATCH_OPTIONS.includes(batch) ? batch : 50,
        intervalHours: INTERVAL_OPTIONS.includes(hours) ? hours : 24,
      }
    } catch {}
    return pacedDefaults.value
  }

  async function executeBatchDownload(plan, {
    strategy = 'cascade',
    floorQuality = '',
    saveListFolder = false,
    batchSize,
    intervalHours,
  } = {}) {
    if (!(await assertActiveSourceForDownload())) return null
    batchDownloading.value = true
    try {
      const listName = saveListFolder
        ? String(getPlaylistName?.() || plan?.playlistName || '').trim()
        : ''
      const albumMeta = typeof getAlbumMeta === 'function' ? getAlbumMeta() : null
      const { tasks, skippedCount } = buildBatchDownloadTasks(plan.entries, getSource(), {
        preferredQuality: plan.preferred,
        strategy,
        floorQuality,
        listName,
        albumMeta,
      })
      if (!tasks.length) {
        onError?.(new Error(skippedCount ? '所选歌曲均无要求音质，未添加下载' : '没有可下载的歌曲'))
        return null
      }
      const defaults = pacedDefaults.value
      const jobBatch = BATCH_OPTIONS.includes(Number(batchSize)) ? Number(batchSize) : defaults.batchSize
      const jobInterval = INTERVAL_OPTIONS.includes(Number(intervalHours)) ? Number(intervalHours) : defaults.intervalHours
      const playlistName = String(getPlaylistName?.() || plan?.playlistName || '批量下载').trim() || '批量下载'
      const playlistId = String(getPlaylistId?.() || '').trim() || `batch:${Date.now()}`
      const res = await api.download.createPlaylistJob({
        playlistId,
        playlistName,
        batchSize: jobBatch,
        intervalHours: jobInterval,
        saveListFolder,
        preferredQuality: plan.preferred,
        strategy,
        floorQuality,
        tasks,
      })
      try {
        await api.settings.update({
          'download.playlistBatchSize': String(jobBatch),
          'download.playlistIntervalHours': String(jobInterval),
        })
        pacedDefaults.value = { batchSize: jobBatch, intervalHours: jobInterval }
      } catch {}
      const summary = {
        total: tasks.length,
        skippedCount,
        strategy,
        floorQuality,
        listName,
        job: res?.job || null,
        batchSize: jobBatch,
        intervalHours: jobInterval,
      }
      onCompleted?.(tasks.length, summary)
      return { tasks, job: res?.job || null, summary }
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
    await loadPacedDefaults()
    batchDialog.value = {
      ...plan,
      playlistName: String(getPlaylistName?.() || '').trim(),
    }
    return null
  }

  async function confirmBatchDialog({
    strategy = 'cascade',
    floorQuality = '',
    saveListFolder = false,
    batchSize,
    intervalHours,
  } = {}) {
    const plan = batchDialog.value
    if (!plan) return null
    closeBatchDialog()
    return executeBatchDownload(plan, { strategy, floorQuality, saveListFolder, batchSize, intervalHours })
  }

  return {
    batchDialog,
    batchDownloading,
    pacedDefaults,
    loadPacedDefaults,
    startBatchDownload,
    confirmBatchDialog,
    closeBatchDialog,
    getBatchQualities,
  }
}
