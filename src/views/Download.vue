<template>
  <div class="download-page">
    <div class="page-title">下载管理</div>
    <div class="page-subtitle">查看和管理下载任务，可直接试听</div>

    <div class="toolbar">
      <button class="btn-ghost btn-sm" @click="loadList">刷新</button>
      <button class="btn-ghost btn-sm" @click="openQualityUpgrade">音质升级</button>
      <button class="btn-ghost btn-sm" @click="resumeAll" :disabled="!pausableCount">全部继续</button>
      <button class="btn-ghost btn-sm" @click="pauseAll" :disabled="!activeCount">全部暂停</button>
      <button
        class="btn-ghost btn-sm"
        :class="{ active: batchMode }"
        @click="toggleBatchMode"
      >{{ batchMode ? '退出批量' : '批量' }}</button>
      <button
        v-if="failedCount"
        class="btn-ghost btn-sm"
        :disabled="retryingFailed"
        @click="retryAllFailed"
      >{{ retryingFailed ? '重试中…' : `重试失败 (${failedCount})` }}</button>
      <button
        v-if="previewFailCount"
        class="btn-ghost btn-sm"
        :disabled="retryingFailed"
        @click="retryPreviewFails"
      >重试试听失败 ({{ previewFailCount }})</button>
      <button class="btn-ghost btn-sm" @click="clearCompleted">清除已完成</button>
      <button class="btn-ghost btn-sm" @click="dismissAll" :disabled="!tasks.length">清理全部列表</button>
      <button class="btn-primary btn-sm" @click="playAllPlayable" :disabled="!playableTasks.length">试听全部</button>
    </div>

    <div v-if="upgradeJob" class="upgrade-job card">
      <div class="upgrade-job-text">
        音质升级循序下载中：已入队 {{ upgradeJob.cursor }}/{{ upgradeJob.total }} 首
        <span v-if="upgradeJob.nextRunAt" class="upgrade-job-next">
          · 下一批约 {{ formatJobNext(upgradeJob.nextRunAt) }}
        </span>
      </div>
      <button
        type="button"
        class="btn-ghost btn-sm"
        :disabled="cancellingUpgrade"
        @click="cancelUpgradeJob"
      >{{ cancellingUpgrade ? '取消中…' : '取消升级' }}</button>
    </div>

    <div v-if="batchMode && tasks.length" class="batch-bar card">
      <label class="batch-select-all">
        <input type="checkbox" :checked="allSelected" :indeterminate.prop="someSelected && !allSelected" @change="toggleSelectAll" />
        全选
      </label>
      <span class="batch-count" v-if="selectedCount">已选 {{ selectedCount }}</span>
      <div class="batch-actions">
        <button class="btn-ghost btn-sm" :disabled="!selectedPausableCount" @click="resumeSelected">继续</button>
        <button class="btn-ghost btn-sm" :disabled="!selectedActiveCount" @click="pauseSelected">暂停</button>
        <button class="btn-ghost btn-sm" :disabled="!selectedRetryableCount" @click="retrySelected">重试失败</button>
        <button class="btn-ghost btn-sm" :disabled="!selectedCount" @click="dismissSelected">移出列表</button>
        <button class="btn-ghost btn-sm btn-danger-hover" :disabled="!selectedDeletableCount" @click="removeSelected">删除文件</button>
      </div>
    </div>

    <div class="stats card" v-if="tasks.length">
      <span>总计 {{ tasks.length }} 项</span>
      <span class="sep">|</span>
      <span class="c-success">已完成 {{ countByStatus('completed') }}</span>
      <span class="sep">|</span>
      <span class="c-accent">下载中 {{ countByStatus('downloading') }}</span>
      <span class="sep">|</span>
      <span class="c-warning">等待中 {{ countByStatus('waiting') }}</span>
      <span class="sep" v-if="countByStatus('paused')">|</span>
      <span class="c-warning" v-if="countByStatus('paused')">已暂停 {{ countByStatus('paused') }}</span>
      <span class="sep" v-if="countByStatus('error') || countByStatus('await_confirm') || countByStatus('await_source') || countByStatus('await_exist')">|</span>
      <span class="c-error" v-if="countByStatus('error')">失败 {{ countByStatus('error') }}</span>
      <span class="sep" v-if="previewFailCount">|</span>
      <span class="c-warning" v-if="previewFailCount">试听片段 {{ previewFailCount }}</span>
      <span class="sep" v-if="countByStatus('error') && (countByStatus('await_confirm') || countByStatus('await_source') || countByStatus('await_exist'))">|</span>
      <span class="c-warning" v-if="countByStatus('await_confirm')">待确认降质 {{ countByStatus('await_confirm') }}</span>
      <span class="sep" v-if="countByStatus('await_confirm') && (countByStatus('await_source') || countByStatus('await_exist'))">|</span>
      <span class="c-warning" v-if="countByStatus('await_source')">待切换音源 {{ countByStatus('await_source') }}</span>
      <span class="sep" v-if="countByStatus('await_source') && countByStatus('await_exist')">|</span>
      <span class="c-warning" v-if="countByStatus('await_exist')">同名待处理 {{ countByStatus('await_exist') }}</span>
    </div>

    <div v-if="tasks.length" class="filter-bar">
      <button
        v-for="opt in statusFilterOptions"
        :key="opt.value"
        type="button"
        class="btn-ghost btn-sm filter-chip"
        :class="{ active: statusFilter === opt.value }"
        @click="statusFilter = opt.value"
      >{{ opt.label }}</button>
    </div>

    <div class="task-list card" v-if="filteredTasks.length">
      <div
        v-for="task in filteredTasks"
        :key="task.id"
        class="task-item"
        :class="{ playing: isPlayingTask(task), selected: isSelected(task.id) }"
      >
        <label v-if="batchMode" class="task-check">
          <input type="checkbox" :checked="isSelected(task.id)" @change="toggleSelect(task.id)" />
        </label>

        <button
          type="button"
          class="task-cover"
          :class="{ rippling: tappingTaskId === task.id, disabled: !canPreview(task) }"
          :disabled="!canPreview(task)"
          :title="previewTitle(task)"
          @click="onTaskCoverClick(task)"
        >
          <div class="task-cover-media">
            <CoverArt :src="taskCover(task)" />
          </div>
          <span class="task-cover-ripple" aria-hidden="true" />
          <span
            v-if="!showTaskProgress(task) && canPreview(task)"
            class="task-play-overlay"
          >
            <svg v-if="isTaskCoverPauseIcon(task)" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1"/>
              <rect x="14" y="5" width="4" height="14" rx="1"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <polygon points="7,3 21,12 7,21"/>
            </svg>
          </span>
          <span
            v-else-if="!showTaskProgress(task)"
            class="cover-badge"
            :class="'status-' + task.status"
          >{{ statusIcon(task.status) }}</span>
          <span v-else class="cover-pct">{{ progressPercent(task) }}%</span>
        </button>

        <div class="task-info">
          <div class="task-name" :title="task.name">{{ task.name }}</div>
          <div class="task-meta">
            <span class="meta-singer" :title="task.singer">{{ task.singer || '未知歌手' }}</span>
            <span class="meta-dot" aria-hidden="true">·</span>
            <span class="meta-quality">{{ task.quality || '-' }}</span>
            <span class="meta-dot" aria-hidden="true">·</span>
            <span class="meta-status" :class="'status-text-' + task.status">{{ statusText(task.status) }}</span>
          </div>
          <div
            class="task-error"
            :class="{ warn: task.status === 'await_confirm' || task.status === 'await_source' || task.status === 'await_exist', errorish: task.status === 'error' }"
            v-if="task.status === 'error' || task.status === 'await_confirm' || task.status === 'await_source' || task.status === 'await_exist'"
          >
            <span class="task-error-text">{{ formatTaskError(task) }}</span>
          </div>
          <div class="task-progress" v-if="showTaskProgress(task)">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: progressPercent(task) + '%' }"></div>
            </div>
          </div>
          <div v-if="taskActionButtons(task).length" class="task-status-actions">
            <button
              v-for="btn in taskActionButtons(task)"
              :key="btn.key"
              type="button"
              class="btn-sm"
              :class="btn.className"
              :disabled="btn.disabled"
              :title="btn.title"
              @click="btn.onClick"
            >{{ btn.label }}</button>
          </div>
        </div>

        <MobileRowActions
          :open="actionsOpenId === task.id"
          @toggle="toggleRowActions(task.id)"
          @close="actionsOpenId = ''"
        >
          <button
            type="button"
            class="icon-action-btn"
            :class="{ active: isTaskInQueue(task) }"
            :disabled="!canPreview(task)"
            :title="isTaskInQueue(task) ? '已在试听列表' : '加入试听列表'"
            @click.stop="addOneToQueue(task)"
          >
            <svg v-if="isTaskInQueue(task)" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2" fill="none"/></svg>
            <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button
            type="button"
            class="icon-action-btn"
            title="加入歌单"
            :disabled="!canPreview(task) && !task.file_path"
            @click.stop="openPickPlaylist(task)"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15V6"/><path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/><path d="M12 12H3"/><path d="M16 6H3"/><path d="M12 18H3"/></svg>
          </button>
          <button
            type="button"
            class="icon-action-btn"
            :class="{ 'fav-active': isTaskFavorite(task) }"
            :title="isTaskFavorite(task) ? '取消收藏' : '收藏'"
            :disabled="!canPreview(task) && !task.file_path"
            @click.stop="onToggleTaskFavorite(task)"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" :fill="isTaskFavorite(task) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
          <button
            type="button"
            class="icon-action-btn"
            title="移出列表，不删除已下载文件"
            @click.stop="dismiss(task.id)"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
          </button>
          <button
            v-if="task.file_path"
            type="button"
            class="icon-action-btn danger"
            title="删除列表记录并删除磁盘文件"
            @click.stop="remove(task.id)"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </MobileRowActions>
      </div>
    </div>

    <div v-else-if="tasks.length" class="empty">当前筛选无任务</div>
    <div v-else class="empty">暂无下载任务</div>

    <div v-if="toast" class="toast" :class="toast.type">{{ toast.text }}</div>

    <PickPlaylistModal
      v-if="pickPlaylistTrack"
      :track="pickPlaylistTrack"
      :source="pickPlaylistTrack.source || 'local'"
      @close="pickPlaylistTrack = null"
      @added="onAddedToPlaylist"
    />

    <QualityUpgradeDialog
      :open="upgradeDialogOpen"
      :default-batch-size="upgradeDefaults.batchSize"
      :default-interval-hours="upgradeDefaults.intervalHours"
      @cancel="upgradeDialogOpen = false"
      @done="onUpgradeDone"
    />
  </div>
</template>

<script setup>
defineOptions({ name: 'Download' })
import { ref, computed, onMounted, onUnmounted, onActivated } from 'vue'
import { api } from '../api.js'
import { onWS } from '../ws.js'
import { appConfirm } from '../stores/appDialog.js'
import {
  loadingPlay, isPaused, isPlayingItem, playItem, addToQueue, isInQueue,
} from '../stores/player.js'
import { formatUserError } from '../utils/userError.js'
import { toPlayableCoverUrl } from '../utils/coverDisplay.js'
import { localCoverUrl, isFavorite, toggleFavorite } from '../stores/library.js'
import MobileRowActions from '../components/MobileRowActions.vue'
import CoverArt from '../components/CoverArt.vue'
import PickPlaylistModal from '../components/PickPlaylistModal.vue'
import QualityUpgradeDialog from '../components/QualityUpgradeDialog.vue'

const tasks = ref([])
const toast = ref(null)
const batchMode = ref(false)
const selectedIds = ref(new Set())
const retryingFailed = ref(false)
const retryingTaskId = ref('')
const actionsOpenId = ref('')
const pickPlaylistTrack = ref(null)
const tappingTaskId = ref('')
const coverPendingPauseId = ref('')
const upgradeDialogOpen = ref(false)
const upgradeJob = ref(null)
const cancellingUpgrade = ref(false)
const upgradeDefaults = ref({ batchSize: 50, intervalHours: 24 })

/** 解析任务本地文件路径（兼容 file_path / filePath / meta 残留） */
function resolveTaskFilePath(task) {
  const direct = String(task?.file_path || task?.filePath || '').trim()
  if (direct) return direct
  const meta = task?.meta && typeof task.meta === 'object' ? task.meta : {}
  const fromOffer = String(meta.existFileOffer?.filePath || '').trim()
  if (fromOffer) return fromOffer
  const arts = Array.isArray(meta.downloadArtifacts) ? meta.downloadArtifacts : []
  for (const p of arts) {
    const s = String(p || '').trim()
    if (s) return s
  }
  return ''
}

function toggleRowActions(id) {
  actionsOpenId.value = actionsOpenId.value === id ? '' : id
}

function taskFavoritePayload(task) {
  const track = taskToTrack(task)
  const filePath = resolveTaskFilePath(task)
  if (filePath) {
    return {
      ...track,
      localPath: filePath,
      filePath,
      source: 'local',
    }
  }
  return track
}

function isTaskFavorite(task) {
  return isFavorite(taskFavoritePayload(task))
}

function onToggleTaskFavorite(task) {
  toggleFavorite(taskFavoritePayload(task))
}

function openPickPlaylist(task) {
  const track = taskFavoritePayload(task)
  pickPlaylistTrack.value = {
    ...track,
    picUrl: taskCover(task) || track.picUrl || '',
  }
}

function onAddedToPlaylist({ playlist, duplicate }) {
  pickPlaylistTrack.value = null
  if (duplicate) showToast('歌曲已在歌单中', 'info')
  else showToast(`已加入歌单：${playlist?.name || ''}`, 'success')
}

onMounted(() => {
  loadList()
  refreshUpgradeJob()
  loadUpgradeDefaults()
})
onActivated(() => {
  loadList()
  refreshUpgradeJob()
})

const unsubs = []
const progressPending = new Map()
let progressFlushTimer = null
let missingTaskReloadTimer = null

function scheduleReloadForMissingTask() {
  if (missingTaskReloadTimer) return
  missingTaskReloadTimer = setTimeout(() => {
    missingTaskReloadTimer = null
    loadList().catch(() => {})
  }, 300)
}

function flushDownloadProgress() {
  progressFlushTimer = null
  for (const [id, data] of progressPending) {
    const t = tasks.value.find(x => x.id === id)
    if (!t) {
      scheduleReloadForMissingTask()
      continue
    }
    t.progress = data.progress
    t.downloaded_size = data.downloaded
    t.total_size = data.total
    t.status = 'downloading'
  }
  progressPending.clear()
}

unsubs.push(onWS('download:added', (d) => {
  const incoming = (d?.tasks || []).map(normalizeDownloadTask)
  if (!incoming.length) return
  const existing = new Set(tasks.value.map(t => t.id))
  const fresh = incoming.filter(t => !existing.has(t.id))
  if (!fresh.length) return
  tasks.value = [...fresh, ...tasks.value]
}))
unsubs.push(onWS('download:progress', (d) => {
  if (!d?.id) return
  progressPending.set(d.id, {
    progress: d.total > 0 ? d.downloaded / d.total : (d.progress ?? 0),
    downloaded: d.downloaded,
    total: d.total,
  })
  if (!progressFlushTimer) {
    progressFlushTimer = setTimeout(flushDownloadProgress, 250)
  }
}))
unsubs.push(onWS('download:status', (d) => {
  const t = tasks.value.find(x => x.id === d.id)
  if (!t) {
    if (d?.id) scheduleReloadForMissingTask()
    return
  }
  t.status = d.status
  if (d.progress !== undefined) t.progress = d.progress
  if (d.error !== undefined) t.error = d.error
  if (d.quality) t.quality = d.quality
  if (d.downgradeOffer !== undefined) {
    t.meta = { ...(t.meta || {}), downgradeOffer: d.downgradeOffer }
  }
  if (d.existFileOffer !== undefined) {
    t.meta = { ...(t.meta || {}), existFileOffer: d.existFileOffer }
  }
  if (d.filePath) t.file_path = d.filePath
  else if (d.status === 'completed') {
    const resolved = resolveTaskFilePath(t)
    if (resolved) t.file_path = resolved
  }
}))
unsubs.push(onWS('download:removed', (d) => {
  tasks.value = tasks.value.filter(x => x.id !== d.id)
  if (d?.id && selectedIds.value.has(d.id)) {
    const next = new Set(selectedIds.value)
    next.delete(d.id)
    selectedIds.value = next
  }
}))
unsubs.push(onWS('download:cleared', (d) => {
  if (d?.all) {
    tasks.value = []
    selectedIds.value = new Set()
    return
  }
  tasks.value = tasks.value.filter(x => x.status !== 'completed')
}))
unsubs.push(onWS('playlist-download:progress', (job) => {
  if (job?.playlistId === 'quality-upgrade') upgradeJob.value = job
}))
unsubs.push(onWS('playlist-download:done', (job) => {
  if (job?.playlistId === 'quality-upgrade') {
    upgradeJob.value = null
    showToast('音质升级循序任务已全部入队', 'success')
  }
}))
unsubs.push(onWS('playlist-download:cancelled', (job) => {
  if (job?.playlistId === 'quality-upgrade') upgradeJob.value = null
}))
onUnmounted(() => {
  if (progressFlushTimer) {
    clearTimeout(progressFlushTimer)
    progressFlushTimer = null
  }
  if (missingTaskReloadTimer) {
    clearTimeout(missingTaskReloadTimer)
    missingTaskReloadTimer = null
  }
  progressPending.clear()
  unsubs.forEach(fn => fn())
})

const selectedCount = computed(() => selectedIds.value.size)
const allSelected = computed(() => tasks.value.length > 0 && tasks.value.every(t => selectedIds.value.has(t.id)))
const someSelected = computed(() => selectedCount.value > 0)
const pausableCount = computed(() => tasks.value.filter(canResume).length)
const activeCount = computed(() => tasks.value.filter(canPause).length)
const selectedTasks = computed(() => tasks.value.filter(t => selectedIds.value.has(t.id)))
const selectedPausableCount = computed(() => selectedTasks.value.filter(canResume).length)
const selectedActiveCount = computed(() => selectedTasks.value.filter(canPause).length)
const selectedDeletableCount = computed(() => selectedTasks.value.filter(t => t.file_path).length)
const selectedRetryableCount = computed(() => selectedTasks.value.filter(canRetry).length)
const failedCount = computed(() => tasks.value.filter(t => t.status === 'error').length)
const previewFailCount = computed(() => tasks.value.filter(isPreviewFail).length)
const statusFilter = ref('all')
const statusFilterOptions = [
  { value: 'all', label: '全部' },
  { value: 'downloading', label: '下载中' },
  { value: 'waiting', label: '等待' },
  { value: 'error', label: '失败' },
  { value: 'preview', label: '试听失败' },
  { value: 'await', label: '待处理' },
  { value: 'completed', label: '已完成' },
]
const filteredTasks = computed(() => {
  const list = tasks.value
  const f = statusFilter.value
  if (f === 'all') return list
  if (f === 'preview') return list.filter(isPreviewFail)
  if (f === 'await') return list.filter((t) => ['await_confirm', 'await_source', 'await_exist'].includes(t.status))
  return list.filter((t) => t.status === f)
})

function isPreviewFail(task) {
  if (task.status !== 'error') return false
  const msg = String(task.error || task.meta?.downgradeOffer?.reason || '')
  return /试听时长|试听片段|仅支持试听|PREVIEW_CLIP|时长不完整/i.test(msg)
}

const playableTasks = computed(() => tasks.value.filter(canPreview))

function taskToTrack(task) {
  const meta = task.meta || {}
  const filePath = resolveTaskFilePath(task)
  // 已有本地文件：按本地曲目播放（与音乐库一致），避免再走在线音源失败却无声
  if (filePath) {
    return {
      id: task.id,
      key: `local:${filePath}`,
      name: task.name,
      singer: task.singer,
      album: task.album || meta.album || '',
      interval: task.interval,
      localPath: filePath,
      filePath,
      source: 'local',
      picUrl: meta.picUrl || meta.img || '',
      img: meta.img || meta.picUrl || '',
    }
  }
  return {
    id: meta.songId || meta.songmid || meta.hash || meta.copyrightId || task.id,
    name: task.name,
    singer: task.singer,
    source: task.source || meta.source,
    album: task.album,
    interval: task.interval,
    songId: meta.songId,
    songmid: meta.songmid,
    hash: meta.hash,
    copyrightId: meta.copyrightId,
    strMediaMid: meta.strMediaMid,
    albumAudioId: meta.albumAudioId,
    albumId: meta.albumId || meta.albumMid || meta.albummid,
    albumMid: meta.albumMid || meta.albummid,
    picUrl: meta.picUrl || meta.img || '',
    img: meta.img || meta.picUrl || '',
    qualitys: meta.qualitys || [],
  }
}

function taskCover(task) {
  const meta = task.meta || {}
  const online = meta.picUrl || meta.img || ''
  if (online) return toPlayableCoverUrl(online)
  const filePath = resolveTaskFilePath(task)
  if (filePath) return localCoverUrl(filePath)
  return ''
}

function taskActionButtons(task) {
  const buttons = []
  if (canResume(task)) {
    buttons.push({
      key: 'resume',
      label: '继续',
      className: 'btn-ghost',
      title: '继续',
      onClick: () => resume(task.id),
    })
  }
  if (canPause(task)) {
    buttons.push({
      key: 'pause',
      label: '暂停',
      className: 'btn-ghost',
      title: '暂停',
      onClick: () => pause(task.id),
    })
  }
  if (task.status === 'await_confirm') {
    buttons.push({
      key: 'retry-same',
      label: '重试原音质',
      className: 'btn-ghost',
      title: '保持原音质再试：失败常因音源/网络短暂中断，稍后重试可能成功',
      onClick: () => retrySameQuality(task),
    })
    buttons.push({
      key: 'downgrade',
      label: '降质下载',
      className: 'btn-primary',
      title: downgradeTitle(task),
      onClick: () => confirmDowngrade(task),
    })
    buttons.push({
      key: 'reject-down',
      label: '放弃',
      className: 'btn-ghost',
      title: '标记为失败，不再自动处理',
      onClick: () => rejectDowngrade(task),
    })
  }
  if (task.status === 'await_exist') {
    buttons.push({
      key: 'skip-exist',
      label: '跳过',
      className: 'btn-ghost',
      title: '保留本地文件，跳过本次下载',
      onClick: () => skipExist(task),
    })
    buttons.push({
      key: 'confirm-exist',
      label: '仍下载当前音质',
      className: 'btn-primary',
      title: existOverwriteTitle(task),
      onClick: () => confirmExist(task),
    })
  }
  if (task.status === 'await_source') {
    for (const alt of sourceFallbackAlternatives(task)) {
      buttons.push({
        key: `src-${alt.id}`,
        label: `切到「${alt.name}」`,
        className: 'btn-primary',
        title: `切换到 ${alt.name}`,
        onClick: () => confirmSourceSwitch(task, alt.id),
      })
    }
    buttons.push({
      key: 'reject-src',
      label: '放弃',
      className: 'btn-ghost',
      title: '放弃切换音源',
      onClick: () => rejectSourceSwitch(task),
    })
  }
  if (canRetry(task)) {
    buttons.push({
      key: 'retry',
      label: retryingTaskId.value === task.id ? '重试中…' : '重试',
      className: 'btn-primary',
      title: '按当前音质重新排队下载',
      disabled: retryingTaskId.value === task.id,
      onClick: () => retryTask(task),
    })
  }
  return buttons
}

function trackId(task) {
  return taskToTrack(task).id
}

function canPreview(task) {
  if (resolveTaskFilePath(task)) return true
  // 已完成但找不到本地文件：不要伪装成可在线试听
  if (task.status === 'completed') return false
  const meta = task.meta || {}
  return !!(
    (task.source || meta.source)
    && (meta.songmid || meta.hash || meta.songId || meta.copyrightId)
  )
}

function isPlayingTask(task) {
  const track = taskToTrack(task)
  return isPlayingItem(track)
}

function isTaskInQueue(task) {
  const track = taskToTrack(task)
  return isInQueue(track, track.source || 'local')
}

function previewTitle(task) {
  if (!canPreview(task)) {
    if (task.status === 'completed' && !resolveTaskFilePath(task)) return '本地文件缺失，无法试听'
    return '缺少歌曲信息，无法试听'
  }
  return isPlayingTask(task) && !isPaused.value ? '暂停' : '试听'
}

function isTaskCoverPauseIcon(task) {
  if (coverPendingPauseId.value === task.id) return true
  if (!isPlayingTask(task)) return false
  return !isPaused.value
}

async function togglePlay(task) {
  if (!canPreview(task)) {
    showToast(previewTitle(task), 'error')
    return
  }
  const track = taskToTrack(task)
  // 有本地文件时与音乐库一致，强制 source=local
  const source = resolveTaskFilePath(task) ? 'local' : (track.source || task.source)
  try {
    await playItem(track, source)
  } catch (e) {
    showToast(e.message || '试听失败', 'error')
  }
}

async function onTaskCoverClick(task) {
  if (!canPreview(task)) {
    showToast(previewTitle(task), 'error')
    return
  }
  const id = task.id
  tappingTaskId.value = id
  setTimeout(() => {
    if (tappingTaskId.value === id) tappingTaskId.value = ''
  }, 560)

  if (isPlayingTask(task) && !isPaused.value) {
    coverPendingPauseId.value = ''
  } else {
    coverPendingPauseId.value = id
  }

  try {
    await togglePlay(task)
  } finally {
    if (coverPendingPauseId.value === id) coverPendingPauseId.value = ''
  }
}

function addOneToQueue(task) {
  if (!canPreview(task)) {
    showToast('该任务缺少歌曲信息，无法加入列表', 'error')
    return
  }
  const track = taskToTrack(task)
  if (isInQueue(track, track.source)) {
    showToast('已在试听列表', 'info')
    return
  }
  addToQueue(track, track.source)
  showToast(`已加入列表: ${track.name}`, 'success')
}

async function playAllPlayable() {
  const list = playableTasks.value
  if (!list.length) {
    showToast('没有可试听的任务', 'info')
    return
  }
  for (const task of list) {
    const track = taskToTrack(task)
    addToQueue(track, track.source)
  }
  try {
    await playItem(taskToTrack(list[0]), taskToTrack(list[0]).source)
    showToast(`开始试听，共 ${list.length} 首`, 'success')
  } catch (e) {
    showToast(e.message || '试听失败', 'error')
  }
}

function canResume(task) {
  return task.status === 'paused'
}

function canRetry(task) {
  return task.status === 'error'
}

function canPause(task) {
  return task.status === 'downloading' || task.status === 'waiting'
}

function showTaskProgress(task) {
  return task.status === 'downloading' || (task.status === 'paused' && progressRatio(task) > 0)
}

function progressRatio(task) {
  let ratio = Number(task?.progress)
  if (!Number.isFinite(ratio)) ratio = 0
  if (ratio > 1) ratio /= 100
  if (ratio <= 0 && task?.total_size > 0 && task?.downloaded_size >= 0) {
    ratio = task.downloaded_size / task.total_size
  }
  return Math.max(0, Math.min(ratio, 1))
}

function progressPercent(task) {
  return Math.round(progressRatio(task) * 100)
}

function normalizeDownloadTask(task) {
  const file_path = resolveTaskFilePath(task)
  return {
    ...task,
    file_path,
    progress: progressRatio(task),
  }
}

function isSelected(id) {
  return selectedIds.value.has(id)
}

function toggleSelect(id) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedIds.value = new Set()
    return
  }
  selectedIds.value = new Set(tasks.value.map(t => t.id))
}

function toggleBatchMode() {
  batchMode.value = !batchMode.value
  if (!batchMode.value) selectedIds.value = new Set()
}

async function loadList() {
  try {
    tasks.value = (await api.download.list()).map(normalizeDownloadTask)
    const valid = new Set(tasks.value.map(t => t.id))
    selectedIds.value = new Set([...selectedIds.value].filter(id => valid.has(id)))
  } catch {}
}

function countByStatus(s) { return tasks.value.filter(t => t.status === s).length }

function formatTaskError(task) {
  const exist = task.meta?.existFileOffer
  if (task.status === 'await_exist' && exist) {
    return `本地已有「${exist.fileName || '同名文件'}」（${exist.localLabel || '未知音质'}），当前要下 ${exist.requestedLabel || task.quality}`
  }
  const raw = task.error || task.meta?.downgradeOffer?.reason || task.meta?.sourceFallbackOffer?.reason
  const text = formatUserError(raw, '下载失败，请稍后重试')
  if (isPreviewFail(task) || /试听时长|试听片段|仅支持试听/i.test(String(raw || ''))) {
    return `试听片段：${text}`
  }
  if (task.status === 'await_confirm') return `音质降级：${text}`
  if (task.status === 'await_source') return `建议换源：${text}`
  return text
}

function sourceFallbackAlternatives(task) {
  return task.meta?.sourceFallbackOffer?.alternatives || []
}

async function confirmSourceSwitch(task, sourceApiId) {
  try {
    await api.download.confirmSource(task.id, sourceApiId)
    const t = tasks.value.find(x => x.id === task.id)
    if (t) t.status = 'waiting'
    showToast('已切换音源并重新排队', 'success')
  } catch (e) {
    showToast(e.message || '切换音源失败', 'error')
  }
}

async function rejectSourceSwitch(task) {
  try {
    await api.download.rejectSource(task.id)
    const t = tasks.value.find(x => x.id === task.id)
    if (t) t.status = 'error'
    showToast('已取消切换音源', 'info')
  } catch (e) {
    showToast(e.message || '操作失败', 'error')
  }
}

function statusText(s) {
  const m = {
    waiting: '等待中',
    downloading: '下载中',
    completed: '已完成',
    paused: '已暂停',
    error: '失败',
    await_confirm: '待确认降质',
    await_source: '待切换音源',
    await_exist: '待处理同名',
  }
  return m[s] || s
}
function statusIcon(s) {
  const m = { completed: '✓', paused: '⏸', waiting: '⏳', error: '✕', await_confirm: '?', await_source: '↪', await_exist: '!' }
  return m[s] || ''
}

async function pause(id) {
  try {
    await api.download.pause(id)
    const t = tasks.value.find(x => x.id === id)
    if (t) t.status = 'paused'
  } catch (e) {
    showToast(e.message || '暂停失败', 'error')
  }
}

async function resume(id) {
  try {
    await api.download.resume(id)
    const t = tasks.value.find(x => x.id === id)
    if (t) {
      t.status = 'waiting'
      t.error = ''
      t.progress = 0
    }
  } catch (e) {
    showToast(e.message || '继续失败', 'error')
  }
}

async function retryTask(task) {
  if (!canRetry(task) || retryingTaskId.value === task.id) return
  retryingTaskId.value = task.id
  try {
    await api.download.resume(task.id)
    task.status = 'waiting'
    task.error = ''
    task.progress = 0
    showToast(`已重新排队：${task.name}`, 'success')
  } catch (e) {
    showToast(e.message || '重试失败', 'error')
  } finally {
    if (retryingTaskId.value === task.id) retryingTaskId.value = ''
  }
}

async function pauseAll() {
  try {
    const res = await api.download.pauseAll()
    await loadList()
    showToast(res.count ? `已暂停 ${res.count} 项` : '没有可暂停的任务', res.count ? 'success' : 'info')
  } catch (e) {
    showToast(e.message || '暂停失败', 'error')
  }
}

async function resumeAll() {
  try {
    const res = await api.download.resumeAll()
    await loadList()
    showToast(res.count ? `已继续 ${res.count} 项` : '没有可继续的任务', res.count ? 'success' : 'info')
  } catch (e) {
    showToast(e.message || '继续失败', 'error')
  }
}

async function retryAllFailed() {
  const failed = tasks.value.filter(t => t.status === 'error')
  if (!failed.length || retryingFailed.value) return
  retryingFailed.value = true
  let ok = 0
  try {
    for (const task of failed) {
      try {
        await api.download.resume(task.id)
        ok++
      } catch {}
    }
    await loadList()
    showToast(ok ? `已重试 ${ok} 个失败任务` : '重试失败', ok ? 'success' : 'error')
  } finally {
    retryingFailed.value = false
  }
}

async function retryPreviewFails() {
  const failed = tasks.value.filter(isPreviewFail)
  if (!failed.length || retryingFailed.value) return
  retryingFailed.value = true
  let ok = 0
  try {
    for (const task of failed) {
      try {
        await api.download.resume(task.id)
        ok++
      } catch {}
    }
    await loadList()
    showToast(ok ? `已重试 ${ok} 个试听失败任务` : '重试失败', ok ? 'success' : 'error')
  } finally {
    retryingFailed.value = false
  }
}

async function pauseSelected() {
  const ids = selectedTasks.value.filter(canPause).map(t => t.id)
  if (!ids.length) return
  try {
    const res = await api.download.pauseAll(ids)
    await loadList()
    showToast(`已暂停 ${res.count || ids.length} 项`, 'success')
  } catch (e) {
    showToast(e.message || '暂停失败', 'error')
  }
}

async function retrySelected() {
  const list = selectedTasks.value.filter(canRetry)
  if (!list.length || retryingFailed.value) return
  retryingFailed.value = true
  let ok = 0
  try {
    for (const task of list) {
      try {
        await api.download.resume(task.id)
        task.status = 'waiting'
        task.error = ''
        task.progress = 0
        ok++
      } catch {}
    }
    showToast(ok ? `已重试 ${ok} 个失败任务` : '重试失败', ok ? 'success' : 'error')
  } finally {
    retryingFailed.value = false
  }
}

async function resumeSelected() {
  const ids = selectedTasks.value.filter(canResume).map(t => t.id)
  if (!ids.length) return
  try {
    const res = await api.download.resumeAll(ids)
    await loadList()
    showToast(`已继续 ${res.count || ids.length} 项`, 'success')
  } catch (e) {
    showToast(e.message || '继续失败', 'error')
  }
}

async function dismissSelected() {
  const ids = [...selectedIds.value]
  if (!ids.length) return
  try {
    const res = await api.download.dismiss(ids)
    selectedIds.value = new Set()
    await loadList()
    showToast(`已移出 ${res.count || ids.length} 项（文件保留）`, 'success')
  } catch (e) {
    showToast(e.message || '清理失败', 'error')
  }
}

async function removeSelected() {
  const ids = selectedTasks.value.filter(t => t.file_path).map(t => t.id)
  if (!ids.length) return
  const ok = await appConfirm({
    title: '删除磁盘文件',
    message: `确定删除 ${ids.length} 个任务的磁盘文件吗？`,
    hint: '此操作不可恢复。',
    confirmText: '删除文件',
    danger: true,
  })
  if (!ok) return
  try {
    for (const id of ids) {
      await api.download.remove(id)
    }
    selectedIds.value = new Set()
    await loadList()
    showToast(`已删除 ${ids.length} 个文件`, 'success')
  } catch (e) {
    showToast(e.message || '删除失败', 'error')
  }
}
async function confirmDowngrade(task) {
  try {
    await api.download.confirmDowngrade(task.id)
    showToast('已确认降档，将自动逐档下降', 'success')
  } catch (e) {
    showToast(e.message || '确认失败', 'error')
  }
}
async function retrySameQuality(task) {
  try {
    await api.download.resume(task.id)
    task.status = 'waiting'
    task.error = ''
    task.progress = 0
    if (task.meta?.downgradeOffer) delete task.meta.downgradeOffer
    showToast('已按原音质重新排队（适合临时网络抖动后再试）', 'success')
  } catch (e) {
    showToast(e.message || '重试失败', 'error')
  }
}
function downgradeTitle(task) {
  const offer = task.meta?.downgradeOffer
  const to = offer?.toLabel || offer?.toQuality || '更低音质'
  return `改用 ${to} 下载：原音质多次失败时可换较低音质提高成功率`
}
async function rejectDowngrade(task) {
  try {
    await api.download.rejectDowngrade(task.id)
    showToast('已放弃降质下载', 'info')
  } catch (e) {
    showToast(e.message || '操作失败', 'error')
  }
}
async function skipExist(task) {
  try {
    await api.download.skipExist(task.id)
    showToast('已跳过：保留本地文件，并从下载列表移除', 'success')
  } catch (e) {
    showToast(e.message || '跳过失败', 'error')
  }
}
async function confirmExist(task) {
  try {
    await api.download.confirmExist(task.id)
    showToast('将覆盖同名文件并下载当前音质', 'success')
  } catch (e) {
    showToast(e.message || '确认失败', 'error')
  }
}
function existOverwriteTitle(task) {
  const offer = task.meta?.existFileOffer
  const local = offer?.localLabel || '未知'
  const want = offer?.requestedLabel || task.quality || '当前音质'
  return `本地 ${local}，仍下载 ${want}（会覆盖同名文件）`
}
async function dismiss(id) {
  try {
    await api.download.dismiss([id])
    tasks.value = tasks.value.filter(t => t.id !== id)
    const next = new Set(selectedIds.value)
    next.delete(id)
    selectedIds.value = next
  } catch (e) {
    showToast(e.message || '移出失败', 'error')
  }
}

async function dismissAll() {
  if (!tasks.value.length) return
  const ok = await appConfirm({
    title: '清理全部列表',
    message: `确定将 ${tasks.value.length} 个任务移出列表吗？`,
    hint: '已下载的文件不会删除。',
    confirmText: '移出列表',
  })
  if (!ok) return
  try {
    const res = await api.download.dismissAll()
    tasks.value = []
    selectedIds.value = new Set()
    showToast(`已清理 ${res.count || 0} 项（文件保留）`, 'success')
  } catch (e) {
    showToast(e.message || '清理失败', 'error')
  }
}

async function remove(id) {
  const ok = await appConfirm({
    title: '删除磁盘文件',
    message: '确定删除该任务的磁盘文件吗？',
    hint: '此操作不可恢复。',
    confirmText: '删除文件',
    danger: true,
  })
  if (!ok) return
  try {
    await api.download.remove(id)
    tasks.value = tasks.value.filter(t => t.id !== id)
  } catch (e) {
    showToast(e.message || '删除失败', 'error')
  }
}

async function clearCompleted() {
  try {
    const res = await api.download.clearCompleted()
    tasks.value = tasks.value.filter(t => t.status !== 'completed')
    showToast(`已清除 ${res.count || 0} 项已完成记录`, 'success')
  } catch (e) {
    showToast(e.message || '清除失败', 'error')
  }
}

function showToast(text, type = 'info') {
  toast.value = { text, type }
  setTimeout(() => { toast.value = null }, 3000)
}

function openQualityUpgrade() {
  upgradeDialogOpen.value = true
}

async function loadUpgradeDefaults() {
  try {
    const s = await api.settings.get()
    const batch = Number(s?.['download.playlistBatchSize'])
    const hours = Number(s?.['download.playlistIntervalHours'])
    upgradeDefaults.value = {
      batchSize: [10, 20, 50, 100, 200, 300, 500, 1000].includes(batch) ? batch : 50,
      intervalHours: [1, 3, 6, 12, 24, 48].includes(hours) ? hours : 24,
    }
  } catch {}
}

async function refreshUpgradeJob() {
  try {
    const res = await api.library.qualityUpgradeActiveJob()
    upgradeJob.value = res?.job || null
  } catch {
    upgradeJob.value = null
  }
}

function formatJobNext(ts) {
  const n = Number(ts) || 0
  if (!n) return ''
  const d = new Date(n * 1000)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (x) => String(x).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function onUpgradeDone(payload) {
  upgradeDialogOpen.value = false
  upgradeJob.value = payload?.job || null
  const matched = payload?.matchedCount || 0
  const unmatched = payload?.unmatchedCount || 0
  const first = Math.min(payload?.batchSize || 50, matched)
  const unmatchedHint = unmatched ? `，未匹配 ${unmatched} 首` : ''
  showToast(
    `已开始音质升级：首批 ${first} 首已入队，共 ${matched} 首，每 ${payload?.intervalHours || 24} 小时一批${unmatchedHint}`,
    'success',
  )
  try {
    await api.settings.update({
      'download.playlistBatchSize': String(payload.batchSize),
      'download.playlistIntervalHours': String(payload.intervalHours),
    })
    upgradeDefaults.value = {
      batchSize: payload.batchSize,
      intervalHours: payload.intervalHours,
    }
  } catch {}
  loadList().catch(() => {})
}

async function cancelUpgradeJob() {
  if (!upgradeJob.value?.id) return
  cancellingUpgrade.value = true
  try {
    await api.library.qualityUpgradeCancel()
    upgradeJob.value = null
    showToast('已取消音质升级循序任务', 'success')
  } catch (e) {
    showToast(e.message || '取消失败', 'error')
  } finally {
    cancellingUpgrade.value = false
  }
}
</script>

<style scoped>
.download-page {
  width: 100%;
  max-width: none;
}

.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.toolbar .btn-ghost.active {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-muted);
}

.upgrade-job {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 16px;
  margin-bottom: 16px;
}
.upgrade-job-text {
  font-size: 13px;
  color: var(--text-secondary);
}
.upgrade-job-next {
  color: var(--text-muted);
}

.batch-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 16px;
  margin-bottom: 16px;
}
.batch-select-all {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}
.batch-select-all input { accent-color: var(--accent); }
.batch-count { font-size: 13px; color: var(--text-muted); }
.batch-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-left: auto;
}

.stats {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 16px;
  display: flex;
  gap: 8px;
  padding: 14px 18px;
  flex-wrap: wrap;
  align-items: center;
}
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.filter-chip.active {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-muted);
}
.sep { color: var(--border); }
.c-success { color: var(--success); }
.c-accent { color: var(--accent); }
.c-warning { color: var(--warning); }
.c-error { color: var(--error); }

.task-list { display: flex; flex-direction: column; }

.task-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-light);
  transition: background 0.15s;
}
.task-item:last-child { border-bottom: none; }
.task-item:hover { background: var(--bg-hover); }
.task-item.playing { background: var(--accent-muted); }
.task-item.selected { background: color-mix(in srgb, var(--accent) 8%, transparent); }

.task-check {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}
.task-check input { accent-color: var(--accent); }

.task-cover {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  padding: 0;
  border: none;
  border-radius: 8px;
  overflow: visible;
  background: var(--bg-input);
  cursor: pointer;
}
.task-cover:disabled,
.task-cover.disabled {
  cursor: default;
  opacity: 0.85;
}
.task-cover-media {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  background: var(--bg-input);
}
.task-cover-media :deep(.cover-art) {
  width: 100%;
  height: 100%;
}
.task-cover-media :deep(.cover-art-icon),
.task-cover-media :deep(.cover-art-photo) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.task-cover-ripple {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 68%;
  height: 68%;
  border-radius: 50%;
  transform: translate(-50%, -50%) scale(0.3);
  border: 2px solid rgba(125, 211, 252, 0.95);
  box-shadow:
    0 0 0 0 rgba(125, 211, 252, 0.5),
    0 0 18px rgba(125, 211, 252, 0.28);
  background: rgba(125, 211, 252, 0.18);
  opacity: 0;
  pointer-events: none;
  z-index: 3;
}
.task-cover.rippling .task-cover-ripple {
  animation: task-cover-ripple 0.65s cubic-bezier(0.2, 0.7, 0.2, 1);
}
@keyframes task-cover-ripple {
  0% {
    transform: translate(-50%, -50%) scale(0.35);
    opacity: 0.95;
  }
  100% {
    transform: translate(-50%, -50%) scale(2.2);
    opacity: 0;
  }
}
.task-play-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: inherit;
  background: rgba(0, 0, 0, 0.42);
  color: #fff;
  z-index: 4;
  transition: background 0.18s ease, backdrop-filter 0.18s ease;
  backdrop-filter: saturate(1);
}
.task-play-overlay svg {
  transition: transform 0.22s ease, opacity 0.18s ease;
}
.task-cover.rippling .task-play-overlay {
  background: color-mix(in srgb, var(--accent) 48%, rgba(0, 0, 0, 0.26));
  backdrop-filter: saturate(1.35);
}
.task-cover.rippling .task-play-overlay svg {
  transform: scale(1.28);
}
.cover-badge {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
  z-index: 5;
}
.cover-pct {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: inherit;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  z-index: 4;
}

.task-info { flex: 1; min-width: 0; }
.task-name { font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-meta {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 0 6px;
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-muted);
  min-width: 0;
  overflow: hidden;
}
.task-meta .meta-singer {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  max-width: 42%;
}
.task-meta .meta-dot { opacity: 0.55; flex-shrink: 0; }
.task-meta .meta-quality,
.task-meta .meta-status { flex-shrink: 0; }
.task-meta .meta-quality { text-transform: lowercase; }
.task-meta .status-text-completed { color: var(--success); }
.task-meta .status-text-error { color: var(--error); }
.task-meta .status-text-downloading,
.task-meta .status-text-waiting { color: var(--accent); }
.task-meta .status-text-paused,
.task-meta .status-text-await_confirm,
.task-meta .status-text-await_source,
.task-meta .status-text-await_exist { color: var(--warning); }
.task-error { font-size: 12px; color: var(--error); margin-top: 2px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.task-error.warn { color: var(--warning); }
.task-error.errorish { color: var(--error); }
.task-error-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-await_confirm,
.status-await_source { color: var(--warning); }
.status-await_exist { color: var(--warning, var(--accent)); }

.task-progress {
  margin-top: 6px;
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.progress-bar {
  flex: 1 1 auto;
  min-width: 72px;
  height: 3px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  min-width: 0;
  background: var(--accent);
  transition: width 0.3s;
  border-radius: 2px;
}
.progress-text {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
  width: 36px;
  text-align: right;
}

.task-status { width: 30px; text-align: center; }
.status-completed { color: var(--success); }
.status-paused { color: var(--warning); }
.status-error { color: var(--error); }
.status-waiting { color: var(--text-muted); }

.task-status-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.task-status-actions .btn-sm {
  padding: 4px 10px;
  font-size: 12px;
}

.task-item :deep(.mobile-row-actions) {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  align-items: center;
  margin-left: auto;
}
.task-item :deep(.icon-action-btn:disabled) {
  opacity: 0.35;
  cursor: not-allowed;
}

.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.empty { text-align: center; padding: 60px 0; color: var(--text-muted); font-size: 14px; }

.toast {
  position: fixed;
  bottom: 80px;
  right: 24px;
  padding: 10px 20px;
  border-radius: var(--radius);
  font-size: 14px;
  z-index: 1000;
  box-shadow: var(--shadow);
}
.toast.success { background: var(--success); color: #fff; }
.toast.error { background: var(--error); color: #fff; }
.toast.info { background: var(--bg-card); border: 1px solid var(--border); }

@media (max-width: 768px) {
  .task-item {
    gap: 10px;
    padding: 8px 12px;
    align-items: center;
  }
  .task-cover {
    width: 46px;
    height: 46px;
    border-radius: 8px;
  }
  .task-info { min-width: 0; }
  .task-name { font-size: 14px; }
  .task-meta {
    margin-top: 2px;
    font-size: 11px;
  }
  .task-meta .meta-singer { max-width: 38%; }
  .task-progress { margin-top: 4px; }
  .task-status-actions { margin-top: 4px; }
  .task-item :deep(.mobile-row-actions) { gap: 2px; }
  .task-item :deep(.icon-action-btn) {
    width: 34px;
    height: 34px;
    padding: 0;
  }
  .toast {
    left: 12px;
    right: 12px;
    bottom: calc(var(--player-height) + var(--mobile-nav-height) + 16px);
  }
}
</style>
