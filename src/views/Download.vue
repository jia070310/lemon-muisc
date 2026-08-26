<template>
  <div class="download-page">
    <div class="page-title">下载管理</div>
    <div class="page-subtitle">查看和管理下载任务，可直接试听</div>

    <div class="toolbar">
      <button class="btn-ghost btn-sm" @click="loadList">刷新</button>
      <button class="btn-ghost btn-sm" @click="clearCompleted">清除已完成</button>
      <button class="btn-primary btn-sm" @click="playAllPlayable" :disabled="!playableTasks.length">试听全部</button>
    </div>

    <div class="stats card" v-if="tasks.length">
      <span>总计 {{ tasks.length }} 项</span>
      <span class="sep">|</span>
      <span class="c-success">已完成 {{ countByStatus('completed') }}</span>
      <span class="sep">|</span>
      <span class="c-accent">下载中 {{ countByStatus('downloading') }}</span>
      <span class="sep">|</span>
      <span class="c-warning">等待中 {{ countByStatus('waiting') }}</span>
      <span class="sep" v-if="countByStatus('error') || countByStatus('await_confirm')">|</span>
      <span class="c-error" v-if="countByStatus('error')">失败 {{ countByStatus('error') }}</span>
      <span class="sep" v-if="countByStatus('error') && countByStatus('await_confirm')">|</span>
      <span class="c-warning" v-if="countByStatus('await_confirm')">待确认 {{ countByStatus('await_confirm') }}</span>
    </div>

    <div class="task-list card" v-if="tasks.length">
      <div
        v-for="task in tasks"
        :key="task.id"
        class="task-item"
        :class="{ playing: isPlayingTask(task) }"
      >
        <div class="task-info">
          <div class="task-name">{{ task.name }}</div>
          <div class="task-meta">{{ task.singer }} · {{ task.quality }} · {{ statusText(task.status) }}</div>
          <div
            class="task-error"
            :class="{ warn: task.status === 'await_confirm' }"
            v-if="task.status === 'error' || task.status === 'await_confirm'"
          >{{ formatTaskError(task) }}</div>
        </div>
        <div class="task-progress" v-if="task.status === 'downloading'">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: (task.progress * 100) + '%' }"></div>
          </div>
          <span class="progress-text">{{ Math.round(task.progress * 100) }}%</span>
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
          <button v-if="task.status === 'paused'" class="btn-sm btn-ghost" @click="resume(task.id)" title="继续">继续</button>
          <button v-if="task.status === 'downloading' || task.status === 'waiting'" class="btn-sm btn-ghost" @click="pause(task.id)" title="暂停">暂停</button>
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
          <button v-if="task.status === 'error'" class="btn-sm btn-ghost" @click="resume(task.id)" title="按当前音质重新排队下载">重试</button>
          <button class="btn-sm btn-ghost" @click="remove(task.id)" title="删除">删除</button>
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

onMounted(() => loadList())

const unsubs = []
unsubs.push(onWS('download:progress', (d) => {
  const t = tasks.value.find(x => x.id === d.id)
  if (t) { t.progress = d.progress; t.status = 'downloading' }
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
unsubs.push(onWS('download:cleared', () => {
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

async function loadList() {
  try { tasks.value = await api.download.list() } catch {}
}

function countByStatus(s) { return tasks.value.filter(t => t.status === s).length }

function formatTaskError(task) {
  // 优先完整任务文案（含降质建议）；再回退到 offer.reason
  return formatUserError(
    task.error || task.meta?.downgradeOffer?.reason,
    '下载失败，请稍后重试',
  )
}

function statusText(s) {
  const m = {
    waiting: '等待中',
    downloading: '下载中',
    completed: '已完成',
    paused: '已暂停',
    error: '失败',
    await_confirm: '待确认降质',
  }
  return m[s] || s
}
function statusIcon(s) {
  const m = { completed: '✓', paused: '⏸', waiting: '⏳', error: '✕', await_confirm: '?' }
  return m[s] || ''
}

async function pause(id) { try { await api.download.pause(id) } catch {} }
async function resume(id) { try { await api.download.resume(id) } catch {} }
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
async function remove(id) { try { await api.download.remove(id); tasks.value = tasks.value.filter(t => t.id !== id) } catch {} }
async function clearCompleted() { try { await api.download.clearCompleted(); tasks.value = tasks.value.filter(t => t.status !== 'completed') } catch {} }

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

.task-info { flex: 1; min-width: 0; }
.task-name { font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-meta { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.task-error { font-size: 12px; color: var(--error); margin-top: 2px; }
.task-error.warn { color: var(--warning); }
.status-await_confirm { color: var(--warning); }

.task-progress { width: 140px; display: flex; align-items: center; gap: 8px; }
.progress-bar { flex: 1; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--accent); transition: width 0.3s; border-radius: 2px; }
.progress-text { font-size: 12px; color: var(--text-muted); width: 36px; text-align: right; }

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
