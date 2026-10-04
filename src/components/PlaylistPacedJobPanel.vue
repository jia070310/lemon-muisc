<template>
  <div v-if="job && isOpenJob" class="paced-job-panel">
    <div class="paced-job-text">
      {{ kindLabel }}<span>{{ paused ? '已暂停' : '进行中' }}</span>
      <span v-if="job.playlistName && kind !== 'upgrade'">：{{ job.playlistName }}</span>
      · 已入队 {{ job.cursor }}/{{ job.total }} 首
      <span v-if="pendingCount"> · 还剩 {{ pendingCount }} 首</span>
      <span v-if="!paused && job.nextRunAt"> · 下一批约 {{ formatJobTime(job.nextRunAt) }}</span>
    </div>
    <div class="paced-job-actions">
      <button type="button" class="btn-ghost btn-sm" :disabled="busyView" @click="openPending">
        {{ busyView ? '加载中…' : '查看剩余' }}
      </button>
      <button
        v-if="paused"
        type="button"
        class="btn-ghost btn-sm"
        :disabled="busyContinue || !pendingCount"
        @click="onContinue"
      >
        {{ busyContinue ? '入队中…' : '继续' }}
      </button>
      <button
        v-else
        type="button"
        class="btn-ghost btn-sm"
        :disabled="busyPause || !pendingCount"
        @click="onPause"
      >
        {{ busyPause ? '暂停中…' : '暂停' }}
      </button>
      <button type="button" class="btn-ghost btn-sm" :disabled="busyCancel" @click="onCancel">
        {{ busyCancel ? '取消中…' : '取消任务' }}
      </button>
    </div>

    <Teleport to="body">
      <div v-if="showPending" class="paced-pending-overlay" @click.self="showPending = false">
        <div class="paced-pending-modal" role="dialog" aria-modal="true">
          <div class="paced-pending-head">
            <h3>尚未入队（{{ pendingTracks.length }}）</h3>
            <button type="button" class="btn-ghost btn-sm" @click="showPending = false">关闭</button>
          </div>
          <p class="paced-pending-hint">
            以下歌曲还在等待后续批次。进行中可暂停；暂停后点「继续」立即入队下一批；取消则停止后续批次。
          </p>
          <ul class="paced-pending-list">
            <li v-for="(t, i) in pendingTracks" :key="`${t.name}-${i}`">
              <span class="n">{{ i + 1 }}. {{ t.name || '未知曲目' }}</span>
              <span v-if="t.singer" class="s">{{ t.singer }}</span>
            </li>
          </ul>
          <div v-if="!pendingTracks.length" class="paced-pending-empty">没有剩余歌曲</div>
          <div class="paced-pending-foot">
            <button type="button" class="btn-ghost" :disabled="busyCancel" @click="onCancel">
              {{ busyCancel ? '取消中…' : '取消任务' }}
            </button>
            <button type="button" class="btn-ghost" @click="showPending = false">关闭</button>
            <button
              v-if="paused"
              type="button"
              class="btn-primary"
              :disabled="busyContinue || !pendingTracks.length"
              @click="onContinue"
            >
              {{ busyContinue ? '入队中…' : '继续下一批' }}
            </button>
            <button
              v-else
              type="button"
              class="btn-primary"
              :disabled="busyPause || !pendingTracks.length"
              @click="onPause"
            >
              {{ busyPause ? '暂停中…' : '暂停' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { api } from '../api.js'

const props = defineProps({
  job: { type: Object, default: null },
  kind: { type: String, default: 'playlist' },
})

const emit = defineEmits(['updated', 'cancelled', 'toast'])

const busyView = ref(false)
const busyContinue = ref(false)
const busyPause = ref(false)
const busyCancel = ref(false)
const showPending = ref(false)
const pendingTracks = ref([])

const kindLabel = computed(() => (props.kind === 'upgrade' ? '音质升级循序下载' : '歌单循序下载'))
const paused = computed(() => props.job?.status === 'paused')
const isOpenJob = computed(() => props.job?.status === 'active' || props.job?.status === 'paused')
const pendingCount = computed(() => Number(props.job?.pendingCount ?? Math.max(0, (props.job?.total || 0) - (props.job?.cursor || 0))))

watch(() => props.job?.id, () => {
  showPending.value = false
  pendingTracks.value = []
})

function formatJobTime(ts) {
  const n = Number(ts) || 0
  if (!n) return ''
  const d = new Date(n * 1000)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function refreshPendingIfOpen() {
  if (!showPending.value || !props.job?.id) return
  const detail = await api.download.getPlaylistJob(props.job.id, { includePending: true }).catch(() => null)
  pendingTracks.value = Array.isArray(detail?.job?.pendingTracks) ? detail.job.pendingTracks : []
}

async function openPending() {
  if (!props.job?.id) return
  busyView.value = true
  try {
    const res = await api.download.getPlaylistJob(props.job.id, { includePending: true })
    pendingTracks.value = Array.isArray(res?.job?.pendingTracks) ? res.job.pendingTracks : []
    showPending.value = true
    if (res?.job) emit('updated', res.job)
  } catch (e) {
    emit('toast', { text: e.message || '加载剩余列表失败', type: 'error' })
  } finally {
    busyView.value = false
  }
}

async function onPause() {
  if (!props.job?.id) return
  busyPause.value = true
  try {
    const res = await api.download.pausePlaylistJob(props.job.id)
    emit('updated', res?.job)
    emit('toast', { text: '已暂停后续批次（已入队的下载不受影响）', type: 'success' })
  } catch (e) {
    emit('toast', { text: e.message || '暂停失败', type: 'error' })
  } finally {
    busyPause.value = false
  }
}

async function onContinue() {
  if (!props.job?.id) return
  busyContinue.value = true
  try {
    const res = await api.download.continuePlaylistJob(props.job.id)
    const job = res?.job
    emit('updated', job)
    const added = res?.added || 0
    if (res?.done) {
      showPending.value = false
      emit('toast', { text: `已全部入队（本批 ${added} 首）`, type: 'success' })
    } else {
      emit('toast', { text: `已继续：本批入队 ${added} 首，还剩 ${job?.pendingCount || 0} 首`, type: 'success' })
      await refreshPendingIfOpen()
    }
  } catch (e) {
    emit('toast', { text: e.message || '继续失败', type: 'error' })
  } finally {
    busyContinue.value = false
  }
}

async function onCancel() {
  if (!props.job?.id) return
  busyCancel.value = true
  try {
    await api.download.cancelPlaylistJob(props.job.id)
    showPending.value = false
    emit('cancelled', props.job)
    emit('toast', { text: '已取消后续批次（已入队的下载不受影响）', type: 'success' })
  } catch (e) {
    emit('toast', { text: e.message || '取消失败', type: 'error' })
  } finally {
    busyCancel.value = false
  }
}
</script>

<style scoped>
.paced-job-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border-light));
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  font-size: 13px;
  color: var(--text-secondary);
}
.paced-job-text { min-width: 0; flex: 1; line-height: 1.5; }
.paced-job-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.paced-pending-overlay {
  position: fixed;
  inset: 0;
  z-index: 1300;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.paced-pending-modal {
  width: min(520px, 100%);
  max-height: min(80vh, 640px);
  display: flex;
  flex-direction: column;
  background: var(--bg-card, var(--bg));
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  box-shadow: var(--shadow);
}
.paced-pending-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.paced-pending-head h3 {
  margin: 0;
  font-size: 16px;
}
.paced-pending-hint {
  margin: 8px 0 12px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}
.paced-pending-list {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: auto;
  flex: 1;
  min-height: 120px;
}
.paced-pending-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-light, var(--border));
  font-size: 13px;
}
.paced-pending-list .n { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.paced-pending-list .s { flex-shrink: 0; color: var(--text-muted); max-width: 42%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.paced-pending-empty {
  padding: 24px 0;
  text-align: center;
  color: var(--text-muted);
}
.paced-pending-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
@media (max-width: 768px) {
  .paced-job-actions { width: 100%; }
  .paced-job-actions .btn-ghost { flex: 1; }
}
</style>
