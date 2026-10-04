import { ref, onMounted, onUnmounted } from 'vue'
import { api } from '../api.js'
import { onWS } from '../ws.js'

export function isOpenPacedJob(job) {
  return job?.status === 'active' || job?.status === 'paused'
}

export function formatPacedStartToast(job, { skippedCount = 0, extra = '' } = {}) {
  if (!job) return extra || '已创建循序下载任务'
  const skippedHint = skippedCount ? `（策略跳过 ${skippedCount} 首）` : ''
  const first = Number(job.cursor) || 0
  const total = Number(job.total) || first
  const hours = Number(job.intervalHours) || 24
  if (isOpenPacedJob(job) && (job.pendingCount || total > first)) {
    return `已开始循序下载：首批 ${first} 首已入队，共 ${total} 首，每 ${hours} 小时一批${skippedHint}。进行中可暂停，暂停后可继续或取消${extra}`
  }
  return `已入队 ${first || total} 首${skippedHint}${extra}`
}

export function usePacedJobUi({ getPlaylistId } = {}) {
  const pacedJob = ref(null)
  const unsubs = []

  function contextId() {
    return String(typeof getPlaylistId === 'function' ? getPlaylistId() : '').trim()
  }

  function isMine(job) {
    if (!job?.id) return false
    if (pacedJob.value?.id === job.id) return true
    const ctx = contextId()
    return Boolean(ctx && job.playlistId === ctx)
  }

  function setPacedJob(job) {
    pacedJob.value = isOpenPacedJob(job) ? job : null
  }

  function applyJob(job) {
    if (!isMine(job)) return
    setPacedJob(job)
  }

  async function refreshPacedJob(playlistId) {
    const id = String(playlistId || contextId() || '').trim()
    if (!id) return
    try {
      const res = await api.download.activePlaylistJob(id)
      setPacedJob(res?.job || null)
    } catch {
      if (!pacedJob.value) return
      if (pacedJob.value.playlistId === id) pacedJob.value = null
    }
  }

  function onPacedJobUpdated(job) {
    applyJob(job)
  }

  function onPacedJobCancelled(job) {
    if (!job?.id) return
    if (pacedJob.value?.id === job.id || (contextId() && job.playlistId === contextId())) {
      pacedJob.value = null
    }
  }

  onMounted(() => {
    unsubs.push(onWS('playlist-download:progress', applyJob))
    unsubs.push(onWS('playlist-download:done', applyJob))
    unsubs.push(onWS('playlist-download:cancelled', applyJob))
  })

  onUnmounted(() => {
    unsubs.splice(0).forEach((fn) => fn?.())
  })

  return {
    pacedJob,
    setPacedJob,
    refreshPacedJob,
    onPacedJobUpdated,
    onPacedJobCancelled,
  }
}
