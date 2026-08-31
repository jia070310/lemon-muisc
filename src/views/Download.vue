<template>
  <div class="download-page">
    <div class="page-title">下载管理</div>
    <div class="page-subtitle">查看和管理下载任务，可直接试听</div>

    <div class="toolbar">
      <button class="btn-ghost btn-sm" @click="loadList">刷新</button>
      <button class="btn-ghost btn-sm" @click="resumeAll" :disabled="!pausableCount">全部继续</button>
      <button class="btn-ghost btn-sm" @click="pauseAll" :disabled="!activeCount">全部暂停</button>
      <button
        class="btn-ghost btn-sm"
        :class="{ active: batchMode }"
        @click="toggleBatchMode"
      >{{ batchMode ? '退出批量' : '批量' }}</button>
      <button class="btn-ghost btn-sm" @click="clearCompleted">清除已完成</button>
      <button class="btn-ghost btn-sm" @click="dismissAll" :disabled="!tasks.length">清理全部列表</button>
      <button class="btn-primary btn-sm" @click="playAllPlayable" :disabled="!playableTasks.length">试听全部</button>
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
      <span class="sep" v-if="countByStatus('error') || countByStatus('await_confirm') || countByStatus('await_source')">|</span>
      <span class="c-error" v-if="countByStatus('error')">失败 {{ countByStatus('error') }}</span>
      <span class="sep" v-if="countByStatus('error') && (countByStatus('await_confirm') || countByStatus('await_source'))">|</span>
      <span class="c-warning" v-if="countByStatus('await_confirm')">待确认降质 {{ countByStatus('await_confirm') }}</span>
      <span class="sep" v-if="countByStatus('await_confirm') && countByStatus('await_source')">|</span>
      <span class="c-warning" v-if="countByStatus('await_source')">待切换音源 {{ countByStatus('await_source') }}</span>
    </div>

    <div class="task-list card" v-if="tasks.length">
      <div
        v-for="task in tasks"
        :key="task.id"
        class="task-item"
        :class="{ playing: isPlayingTask(task), selected: isSelected(task.id) }"
      >
        <label v-if="batchMode" class="task-check">
          <input type="checkbox" :checked="isSelected(task.id)" @change="toggleSelect(task.id)" />
        </label>
        <div class="task-info">
          <div class="task-name">{{ task.name }}</div>
          <div class="task-meta">{{ task.singer }} · {{ task.quality }} · {{ statusText(task.status) }}</div>
          <div
            class="task-error"
            :class="{ warn: task.status === 'await_confirm' || task.status === 'await_source' }"
            v-if="task.status === 'error' || task.status === 'await_confirm' || task.status === 'await_source'"
          >{{ formatTaskError(task) }}</div>
        </div>
        <div class="task-progress" v-if="showTaskProgress(task)">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progressPercent(task) + '%' }"></div>
          </div>
          <span class="progress-text">{{ progressPercent(task) }}%</span>
        </div>
        <div class="task-status" v-else>
          <span :class="'status-' + task.status">{{ statusIcon(task.status) }}</span>
        </div>
        <div class="task-actions">
          <button
            class="play-btn"
            :disabled="!canPreview(task)"
            @click="togglePlay(task)"
            :title="previewTitle(task)"
          >
            <svg v-if="isPlayingTask(task) && !isPaused" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            <svg v-else-if="loadingPlay === trackId(task)" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10" stroke-dasharray="50" stroke-dashoffset="20"/></svg>
            <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
          </button>
          <button
            class="queue-add-btn"
            :class="{ added: isTaskInQueue(task) }"
            :disabled="!canPreview(task)"
            @click="addOneToQueue(task)"
            :title="isTaskInQueue(task) ? '已在试听列表' : '加入试听列表'"
          >
            <svg v-if="isTaskInQueue(task)" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2" fill="none"/></svg>
            <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button v-if="canResume(task)" class="btn-sm btn-ghost" @click="resume(task.id)" title="继续">继续</button>
          <button v-if="canPause(task)" class="btn-sm btn-ghost" @click="pause(task.id)" title="暂停">暂停</button>
          <button
            v-if="task.status === 'await_confirm'"
            class="btn-sm btn-ghost"
            @click="retrySameQuality(task)"
            title="保持原音质再试：失败常因音源/网络短暂中断，稍后重试可能成功"
          >重试原音质</button>
          <button
            v-if="task.status === 'await_confirm'"
            class="btn-sm btn-primary"
            @click="confirmDowngrade(task)"
            :title="downgradeTitle(task)"
          >降质下载</button>
          <button v-if="task.status === 'await_confirm'" class="btn-sm btn-ghost" @click="rejectDowngrade(task)" title="标记为失败，不再自动处理">放弃</button>
          <template v-if="task.status === 'await_source'">
            <button
              v-for="alt in sourceFallbackAlternatives(task)"
              :key="alt.id"
              class="btn-sm btn-primary"
              @click="confirmSourceSwitch(task, alt.id)"
            >切到「{{ alt.name }}」</button>
            <button class="btn-sm btn-ghost" @click="rejectSourceSwitch(task)">放弃</button>
          </template>
          <button v-if="task.status === 'error'" class="btn-sm btn-ghost" @click="resume(task.id)" title="按当前音质重新排队下载">重试</button>
          <button class="btn-sm btn-ghost" @click="dismiss(task.id)" title="移出列表，不删除已下载文件">移出</button>
          <button
            v-if="task.file_path"
            class="btn-sm btn-ghost btn-danger-hover"
            @click="remove(task.id)"
            title="删除列表记录并删除磁盘文件"
          >删文件</button>
        </div>
      </div>
    </div>

    <div v-else class="empty">暂无下载任务</div>

    <div v-if="toast" class="toast" :class="toast.type">{{ toast.text }}</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '../api.js'
import { onWS } from '../ws.js'
import {
  loadingPlay, isPaused, isPlayingItem, playItem, addToQueue, isInQueue,
} from '../stores/player.js'
import { formatUserError } from '../utils/userError.js'

const tasks = ref([])
const toast = ref(null)
const batchMode = ref(false)
const selectedIds = ref(new Set())

onMounted(() => loadList())

const selectedCount = computed(() => selectedIds.value.size)
const allSelected = computed(() => tasks.value.length > 0 && tasks.value.every(t => selectedIds.value.has(t.id)))
const someSelected = computed(() => selectedCount.value > 0)
const pausableCount = computed(() => tasks.value.filter(canResume).length)
const activeCount = computed(() => tasks.value.filter(canPause).length)
const selectedTasks = computed(() => tasks.value.filter(t => selectedIds.value.has(t.id)))
const selectedPausableCount = computed(() => selectedTasks.value.filter(canResume).length)
const selectedActiveCount = computed(() => selectedTasks.value.filter(canPause).length)
const selectedDeletableCount = computed(() => selectedTasks.value.filter(t => t.file_path).length)

const unsubs = []
unsubs.push(onWS('download:progress', (d) => {
  const t = tasks.value.find(x => x.id === d.id)
  if (t) {
    t.progress = d.total > 0 ? d.downloaded / d.total : (d.progress ?? t.progress)
    t.downloaded_size = d.downloaded
    t.total_size = d.total
    t.status = 'downloading'
  }
}))
unsubs.push(onWS('download:status', (d) => {
  const t = tasks.value.find(x => x.id === d.id)
  if (t) {
    t.status = d.status
    if (d.progress !== undefined) t.progress = d.progress
    if (d.error !== undefined) t.error = d.error
    if (d.quality) t.quality = d.quality
    if (d.downgradeOffer !== undefined) {
      t.meta = { ...(t.meta || {}), downgradeOffer: d.downgradeOffer }
    }
  }
}))
unsubs.push(onWS('download:removed', (d) => {
  tasks.value = tasks.value.filter(x => x.id !== d.id)
}))
unsubs.push(onWS('download:cleared', (d) => {
  if (d?.all) {
    tasks.value = []
    selectedIds.value = new Set()
    return
  }
  tasks.value = tasks.value.filter(x => x.status !== 'completed')
}))
onUnmounted(() => unsubs.forEach(fn => fn()))

const playableTasks = computed(() => tasks.value.filter(canPreview))

function taskToTrack(task) {
  const meta = task.meta || {}
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
    picUrl: meta.picUrl,
    qualitys: meta.qualitys || [],
  }
}

function trackId(task) {
  return taskToTrack(task).id
}

function canPreview(task) {
  const meta = task.meta || {}
  return !!(
    (task.source || meta.source)
    && (meta.songmid || meta.hash || meta.songId || meta.copyrightId)
  )
}

function isPlayingTask(task) {
  return isPlayingItem(taskToTrack(task))
}

function isTaskInQueue(task) {
  const track = taskToTrack(task)
  return isInQueue(track, track.source)
}

function previewTitle(task) {
  if (!canPreview(task)) return '缺少歌曲信息，无法试听'
  return isPlayingTask(task) && !isPaused.value ? '暂停' : '试听'
}

async function togglePlay(task) {
  if (!canPreview(task)) {
    showToast('该任务缺少歌曲信息，无法试听', 'error')
    return
  }
  const track = taskToTrack(task)
  try {
    await playItem(track, track.source)
  } catch (e) {
    showToast(e.message || '试听失败', 'error')
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
  return {
    ...task,
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
  return formatUserError(
    task.error || task.meta?.downgradeOffer?.reason || task.meta?.sourceFallbackOffer?.reason,
    '下载失败，请稍后重试',
  )
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
  }
  return m[s] || s
}
function statusIcon(s) {
  const m = { completed: '✓', paused: '⏸', waiting: '⏳', error: '✕', await_confirm: '?', await_source: '↪' }
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
  if (!confirm(`确定删除 ${ids.length} 个任务的磁盘文件吗？此操作不可恢复。`)) return
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
    showToast('已确认降质，重新排队下载', 'success')
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
  if (!confirm(`确定将 ${tasks.value.length} 个任务移出列表吗？已下载的文件不会删除。`)) return
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
  if (!confirm('确定删除该任务的磁盘文件吗？此操作不可恢复。')) return
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
  padding: 14px 18px;
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

.task-info { flex: 1; min-width: 0; }
.task-name { font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-meta { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.task-error { font-size: 12px; color: var(--error); margin-top: 2px; }
.task-error.warn { color: var(--warning); }
.status-await_confirm,
.status-await_source { color: var(--warning); }

.task-progress {
  width: 140px;
  min-width: 120px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.progress-bar {
  flex: 1 1 auto;
  min-width: 72px;
  height: 4px;
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

.task-actions { display: flex; gap: 4px; align-items: center; flex-shrink: 0; }

.play-btn,
.queue-add-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--border);
  transition: all 0.2s;
}
.queue-add-btn { border-radius: var(--radius); }
.play-btn:hover:not(:disabled),
.queue-add-btn:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-muted);
}
.play-btn:disabled,
.queue-add-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.task-item.playing .play-btn { color: var(--accent); border-color: var(--accent); background: var(--accent-muted); }
.queue-add-btn.added { color: var(--success); border-color: var(--success); background: rgba(52, 199, 89, 0.1); }

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
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 10px;
  }
  .task-info { width: 100%; }
  .task-name { white-space: normal; }
  .task-progress { width: 100%; order: 3; }
  .task-status { width: auto; }
  .task-actions {
    width: 100%;
    margin-left: 0;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .toast {
    left: 12px;
    right: 12px;
    bottom: calc(var(--player-height) + var(--mobile-nav-height) + 16px);
  }
}
</style>
