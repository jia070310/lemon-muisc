<template>
  <div class="podcasts-page" @pointerdown="onPagePointerDown">
    <header class="page-head">
      <div class="title-line">
        <h1 class="page-title"><PodcastIcon :size="22" />播客</h1>
        <button type="button" class="back-btn" @click="goBack">← 返回</button>
      </div>
      <p class="page-subtitle">订阅 RSS，节目进入播放队列，不经过音乐库扫描</p>
    </header>

    <form class="subscribe-row" @submit.prevent="onSubscribe">
      <input
        v-model="url"
        class="subscribe-input"
        type="url"
        placeholder="粘贴 RSS/Atom 订阅源，不要贴网页链接"
        autocomplete="off"
        enterkeyhint="done"
      />
      <button class="btn-primary btn-sm subscribe-btn" type="submit" :disabled="subscribing || !url.trim()">
        {{ subscribing ? '解析中…' : '订阅' }}
      </button>
    </form>

    <div v-if="feeds.length" class="podcast-toolbar">
      <button type="button" class="btn-ghost btn-sm" :disabled="exporting" @click="onExport">
        {{ exporting ? '导出中…' : '导出订阅' }}
      </button>
    </div>

    <p v-if="error" class="form-error">{{ error }}</p>
    <p v-if="toast" class="form-toast" :class="toast.type">{{ toast.text }}</p>

    <div v-if="loading && !feeds.length" class="empty card">正在加载订阅…</div>
    <div v-else-if="!feeds.length" class="empty card">
      还没有订阅。请贴 RSS/Atom 订阅源（如以 .xml / rss / feed 结尾）。专辑网页链接无法订阅。
    </div>
    <div v-else class="feed-grid">
      <div
        v-for="feed in feeds"
        :key="feed.id"
        class="feed-row"
        :class="{ 'is-open': swipeOpenId === feed.id, 'is-revealing': Number(swipeOffset[feed.id] || 0) > 0.5 }"
      >
        <div class="feed-reveal" aria-hidden="true">
          <button
            type="button"
            class="reveal-btn reveal-refresh"
            :disabled="busyId === feed.id"
            @click.stop="refreshFeed(feed)"
          >刷新</button>
          <button
            type="button"
            class="reveal-btn reveal-unsub"
            :disabled="busyId === feed.id"
            @click.stop="unsubscribeFeed(feed)"
          >取消订阅</button>
        </div>
        <button
          type="button"
          class="feed-card card"
          :class="{ dragging: drag.id === feed.id && drag.axis === 'x' }"
          :style="frontStyle(feed.id)"
          @click="onCardClick(feed)"
          @contextmenu.prevent="openCtxMenu($event, feed)"
          @pointerdown="onSwipeDown($event, feed)"
          @pointermove="onSwipeMove($event, feed)"
          @pointerup="onSwipeUp($event, feed)"
          @pointercancel="onSwipeUp($event, feed)"
        >
          <img v-if="feed.imageUrl" class="feed-cover" :src="feed.imageUrl" alt="" />
          <div v-else class="feed-cover feed-cover-empty"><PodcastIcon :size="26" /></div>
          <div class="feed-body">
            <div class="feed-title" :title="feed.title">{{ feed.title }}</div>
            <div class="feed-meta">{{ feed.author || '未知作者' }} · {{ feed.episodeCount || 0 }} 期</div>
            <div v-if="feed.lastError" class="feed-err">{{ feed.lastError }}</div>
          </div>
        </button>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="ctxMenu" class="pod-ctx-overlay" @pointerdown.self="closeCtxMenu" @contextmenu.prevent="closeCtxMenu">
        <div
          class="pod-ctx card"
          :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
          @pointerdown.stop
        >
          <button type="button" :disabled="busyId === ctxMenu.feed.id" @click="refreshFeed(ctxMenu.feed)">刷新节目</button>
          <button type="button" class="danger" :disabled="busyId === ctxMenu.feed.id" @click="unsubscribeFeed(ctxMenu.feed)">取消订阅</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import PodcastIcon from '../components/PodcastIcon.vue'
import { appConfirm } from '../stores/appDialog.js'

const REVEAL_W = 152
const router = useRouter()
const feeds = ref([])
const url = ref('')
const loading = ref(false)
const subscribing = ref(false)
const error = ref('')
const toast = ref(null)
const busyId = ref('')
const exporting = ref(false)
const swipeOpenId = ref('')
const swipeOffset = reactive({})
const ctxMenu = ref(null)
const drag = reactive({
  id: '',
  x0: 0,
  y0: 0,
  start: 0,
  axis: '',
  active: false,
  moved: false,
})

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/library')
}

function showToast(text, type = 'info') {
  toast.value = { text, type }
  setTimeout(() => { toast.value = null }, 2800)
}

function closeSwipe() {
  if (swipeOpenId.value) swipeOffset[swipeOpenId.value] = 0
  swipeOpenId.value = ''
}

function closeCtxMenu() {
  ctxMenu.value = null
}

function frontStyle(id) {
  const x = Number(swipeOffset[id] || 0)
  return {
    transform: x ? `translate3d(${-x}px,0,0)` : 'none',
  }
}

function onPagePointerDown(e) {
  if (ctxMenu.value && !e.target.closest?.('.pod-ctx')) closeCtxMenu()
  if (swipeOpenId.value && !e.target.closest?.('.feed-row')) closeSwipe()
}

function openCtxMenu(e, feed) {
  closeSwipe()
  const pad = 8
  const w = 168
  const h = 88
  let x = e.clientX
  let y = e.clientY
  if (x + w > window.innerWidth - pad) x = window.innerWidth - w - pad
  if (y + h > window.innerHeight - pad) y = window.innerHeight - h - pad
  ctxMenu.value = { x: Math.max(pad, x), y: Math.max(pad, y), feed }
}

function onSwipeDown(e, feed) {
  if (e.pointerType !== 'touch') return
  if (e.button != null && e.button !== 0) return
  closeCtxMenu()
  if (swipeOpenId.value && swipeOpenId.value !== feed.id) closeSwipe()
  drag.id = feed.id
  drag.x0 = e.clientX
  drag.y0 = e.clientY
  drag.start = swipeOpenId.value === feed.id ? REVEAL_W : 0
  drag.axis = ''
  drag.active = true
  drag.moved = false
}

function onSwipeMove(e, feed) {
  if (!drag.active || drag.id !== feed.id) return
  const dx = e.clientX - drag.x0
  const dy = e.clientY - drag.y0
  if (!drag.axis) {
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
    drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    if (drag.axis === 'y') {
      drag.active = false
      return
    }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
  }
  if (drag.axis !== 'x') return
  e.preventDefault()
  drag.moved = true
  swipeOffset[feed.id] = Math.min(REVEAL_W, Math.max(0, drag.start - dx))
}

function onSwipeUp(e, feed) {
  if (drag.id !== feed.id) return
  const x = Number(swipeOffset[feed.id] || 0)
  const open = x > REVEAL_W * 0.38
  if (open) {
    swipeOpenId.value = feed.id
    swipeOffset[feed.id] = REVEAL_W
  } else {
    swipeOffset[feed.id] = 0
    if (swipeOpenId.value === feed.id) swipeOpenId.value = ''
  }
  drag.active = false
  drag.id = ''
  drag.axis = ''
}

function onCardClick(feed) {
  if (drag.moved) {
    drag.moved = false
    return
  }
  if (swipeOpenId.value === feed.id) {
    closeSwipe()
    return
  }
  if (swipeOpenId.value) {
    closeSwipe()
    return
  }
  router.push(`/podcasts/${encodeURIComponent(feed.id)}`)
}

async function onExport() {
  if (exporting.value) return
  exporting.value = true
  try {
    const res = await api.podcasts.exportAll()
    const count = res?.payload?.data?.podcastFeeds?.length || 0
    if (!count) {
      showToast('暂无可导出的订阅', 'info')
      return
    }
    const blob = new Blob([JSON.stringify(res.payload, null, 2)], { type: 'application/json' })
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = res?.filename || 'lemon-podcasts.json'
    a.click()
    URL.revokeObjectURL(objectUrl)
    showToast(`已导出 ${count} 个订阅`, 'success')
  } catch (e) {
    showToast(e.message || '导出失败', 'error')
  } finally {
    exporting.value = false
  }
}

async function loadFeeds() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.podcasts.list()
    feeds.value = res.data || res || []
  } catch (e) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

async function onSubscribe() {
  const feedUrl = url.value.trim()
  if (!feedUrl) return
  subscribing.value = true
  error.value = ''
  try {
    await api.podcasts.subscribe(feedUrl)
    url.value = ''
    showToast('已订阅', 'success')
    await loadFeeds()
  } catch (e) {
    error.value = e.message || '订阅失败'
  } finally {
    subscribing.value = false
  }
}

async function refreshFeed(feed) {
  if (!feed?.id || busyId.value) return
  closeCtxMenu()
  busyId.value = feed.id
  error.value = ''
  try {
    await api.podcasts.refresh(feed.id)
    await loadFeeds()
    showToast(`「${feed.title || '播客'}」节目已更新`, 'success')
  } catch (e) {
    error.value = e.message || '刷新失败'
  } finally {
    busyId.value = ''
    closeSwipe()
  }
}

async function unsubscribeFeed(feed) {
  if (!feed?.id || busyId.value) return
  closeCtxMenu()
  const ok = await appConfirm({
    title: '取消订阅',
    message: `确定取消「${feed.title || '该播客'}」？节目列表会从本账号移除。`,
    confirmText: '取消订阅',
    cancelText: '再想想',
    danger: true,
  })
  if (!ok) return
  busyId.value = feed.id
  try {
    await api.podcasts.unsubscribe(feed.id)
    feeds.value = feeds.value.filter((f) => f.id !== feed.id)
    showToast('已取消订阅', 'success')
  } catch (e) {
    error.value = e.message || '取消失败'
  } finally {
    busyId.value = ''
    closeSwipe()
  }
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    closeCtxMenu()
    closeSwipe()
  }
}

onMounted(() => {
  loadFeeds()
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.podcasts-page { padding: 4px 0 24px; }
.page-head { margin-bottom: 14px; }
.title-line {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.page-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
  line-height: 1.2;
}
.back-btn {
  flex-shrink: 0;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}
.back-btn:active { opacity: 0.7; }
.page-subtitle {
  margin: 8px 0 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.45;
}
.subscribe-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 14px;
}
.podcast-toolbar {
  display: flex;
  justify-content: flex-end;
  margin: -6px 0 12px;
}
.subscribe-input {
  flex: 1;
  min-width: 0;
  height: 44px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text);
  padding: 0 14px;
  font-size: 16px;
}
.subscribe-btn {
  flex: 0 0 auto;
  width: auto;
  min-width: 0;
  height: 36px;
  padding: 0 12px;
  font-size: 13px;
  white-space: nowrap;
}
.form-error { color: var(--danger, #ef4444); font-size: 13px; margin: 0 0 12px; }
.form-toast { font-size: 13px; margin: 0 0 12px; color: var(--text-muted); }
.form-toast.success { color: var(--accent); }
.empty { padding: 28px 16px; text-align: center; color: var(--text-muted); }
.feed-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}
.feed-row {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  border-radius: 12px;
  background: var(--bg-elevated);
  touch-action: pan-y;
  transform: translateZ(0);
}
.feed-reveal {
  position: absolute;
  inset: 0 0 0 auto;
  width: 152px;
  display: flex;
  z-index: 0;
  visibility: hidden;
  pointer-events: none;
}
.feed-row.is-open .feed-reveal,
.feed-row.is-revealing .feed-reveal {
  visibility: visible;
  pointer-events: auto;
}
.reveal-btn {
  flex: 1;
  border: 0;
  color: #fff;
  font-size: 12.5px;
  font-weight: 650;
  cursor: pointer;
  padding: 0 6px;
}
.reveal-refresh { background: var(--accent, #3b82f6); }
.reveal-unsub { background: #e53935; }
.reveal-btn:disabled { opacity: 0.55; }
.feed-card {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 12px;
  align-items: center;
  text-align: left;
  cursor: pointer;
  padding: 12px;
  border: 0;
  width: 100%;
  margin: 0;
  box-shadow: none;
  color: inherit;
  background: var(--bg-elevated);
  will-change: transform;
  transition: transform 0.2s ease;
  -webkit-tap-highlight-color: transparent;
  touch-action: pan-y;
}
.feed-card.dragging { transition: none; }
.feed-card:hover { filter: brightness(1.04); }
.feed-card:active { opacity: 0.92; }
.feed-cover {
  width: 64px;
  height: 64px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--bg);
}
.feed-cover-empty {
  display: grid;
  place-items: center;
  font-weight: 700;
  color: var(--text-muted);
}
.feed-body { min-width: 0; flex: 1; }
.feed-title {
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.feed-meta { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
.feed-err { font-size: 12px; color: var(--danger, #ef4444); margin-top: 4px; }

@media (max-width: 768px) {
  .podcasts-page { padding: 0 0 12px; }
  .page-title { font-size: 20px; }
  .page-subtitle { font-size: 12.5px; }
  .subscribe-row {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }
  .subscribe-input {
    height: 46px;
    font-size: 16px;
    padding: 0 14px;
  }
  .subscribe-btn {
    width: auto;
    height: 34px;
    padding: 0 10px;
    font-size: 13px;
  }
  .feed-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .feed-card { padding: 10px; }
  .feed-cover { width: 56px; height: 56px; }
}
</style>

<style>
.pod-ctx-overlay {
  position: fixed;
  inset: 0;
  z-index: 1800;
}
.pod-ctx {
  position: fixed;
  min-width: 160px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-shadow: var(--shadow, 0 8px 28px rgba(0,0,0,.28));
}
.pod-ctx button {
  border: 0;
  background: transparent;
  color: var(--text);
  text-align: left;
  padding: 9px 10px;
  border-radius: 8px;
  font-size: 13.5px;
  cursor: pointer;
}
.pod-ctx button:hover { background: var(--bg-hover); }
.pod-ctx button.danger { color: #e53935; }
.pod-ctx button:disabled { opacity: 0.5; }
</style>
