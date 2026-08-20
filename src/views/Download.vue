<template>
  <div class="download-page">
    <div class="page-title">下载管理</div>
    <div class="page-subtitle">查看和管理下载任务</div>

    <div class="toolbar">
      <button class="btn-ghost btn-sm" @click="loadList">刷新</button>
      <button class="btn-ghost btn-sm" @click="clearCompleted">清除已完成</button>
    </div>

    <div class="stats card" v-if="tasks.length">
      <span>总计 {{ tasks.length }} 项</span>
      <span class="sep">|</span>
      <span class="c-success">已完成 {{ countByStatus('completed') }}</span>
      <span class="sep">|</span>
      <span class="c-accent">下载中 {{ countByStatus('downloading') }}</span>
      <span class="sep">|</span>
      <span class="c-warning">等待中 {{ countByStatus('waiting') }}</span>
      <span class="sep" v-if="countByStatus('error')">|</span>
      <span class="c-error" v-if="countByStatus('error')">失败 {{ countByStatus('error') }}</span>
    </div>

    <div class="task-list card" v-if="tasks.length">
      <div v-for="task in tasks" :key="task.id" class="task-item">
        <div class="task-info">
          <div class="task-name">{{ task.name }}</div>
          <div class="task-meta">{{ task.singer }} · {{ task.quality }} · {{ statusText(task.status) }}</div>
          <div class="task-error" v-if="task.status === 'error'">{{ task.error }}</div>
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
          <button v-if="task.status === 'paused'" class="btn-sm btn-ghost" @click="resume(task.id)" title="继续">▶</button>
          <button v-if="task.status === 'downloading' || task.status === 'waiting'" class="btn-sm btn-ghost" @click="pause(task.id)" title="暂停">⏸</button>
          <button v-if="task.status === 'error'" class="btn-sm btn-ghost" @click="resume(task.id)" title="重试">↻</button>
          <button class="btn-sm btn-ghost" @click="remove(task.id)" title="删除">✕</button>
        </div>
      </div>
    </div>

    <div v-else class="empty">暂无下载任务</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { api } from '../api.js'
import { onWS } from '../ws.js'

const tasks = ref([])

onMounted(() => loadList())

const unsubs = []
unsubs.push(onWS('download:progress', (d) => {
  const t = tasks.value.find(x => x.id === d.id)
  if (t) { t.progress = d.progress; t.status = 'downloading' }
}))
unsubs.push(onWS('download:status', (d) => {
  const t = tasks.value.find(x => x.id === d.id)
  if (t) { t.status = d.status; if (d.progress !== undefined) t.progress = d.progress; if (d.error) t.error = d.error }
}))
unsubs.push(onWS('download:removed', (d) => {
  tasks.value = tasks.value.filter(x => x.id !== d.id)
}))
unsubs.push(onWS('download:cleared', () => {
  tasks.value = tasks.value.filter(x => x.status !== 'completed')
}))
onUnmounted(() => unsubs.forEach(fn => fn()))

async function loadList() {
  try { tasks.value = await api.download.list() } catch {}
}

function countByStatus(s) { return tasks.value.filter(t => t.status === s).length }

function statusText(s) {
  const m = { waiting: '等待中', downloading: '下载中', completed: '已完成', paused: '已暂停', error: '失败' }
  return m[s] || s
}
function statusIcon(s) {
  const m = { completed: '✓', paused: '⏸', waiting: '⏳', error: '✕' }
  return m[s] || ''
}

async function pause(id) { try { await api.download.pause(id) } catch {} }
async function resume(id) { try { await api.download.resume(id) } catch {} }
async function remove(id) { try { await api.download.remove(id); tasks.value = tasks.value.filter(t => t.id !== id) } catch {} }
async function clearCompleted() { try { await api.download.clearCompleted(); tasks.value = tasks.value.filter(t => t.status !== 'completed') } catch {} }
</script>

<style scoped>
.download-page { max-width: 900px; }

.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
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

.task-info { flex: 1; min-width: 0; }
.task-name { font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-meta { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.task-error { font-size: 12px; color: var(--error); margin-top: 2px; }

.task-progress { width: 140px; display: flex; align-items: center; gap: 8px; }
.progress-bar { flex: 1; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--accent); transition: width 0.3s; border-radius: 2px; }
.progress-text { font-size: 12px; color: var(--text-muted); width: 36px; text-align: right; }

.task-status { width: 30px; text-align: center; }
.status-completed { color: var(--success); }
.status-paused { color: var(--warning); }
.status-error { color: var(--error); }
.status-waiting { color: var(--text-muted); }

.task-actions { display: flex; gap: 4px; }

.empty { text-align: center; padding: 60px 0; color: var(--text-muted); font-size: 14px; }
</style>
