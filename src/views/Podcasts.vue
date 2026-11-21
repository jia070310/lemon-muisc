<template>
  <div class="podcasts-page" @pointerdown="onPagePointerDown">
    <header class="page-head">
      <div class="title-line">
        <h1 class="page-title"><PodcastIcon :size="22" />播客</h1>
        <button type="button" class="back-btn" @click="goBack">← 返回</button>
        <button
          type="button"
          class="fav-entry"
          title="收藏"
          aria-label="收藏"
          @click="router.push('/podcasts/favorites')"
        >
          <span class="fav-entry-icon" aria-hidden="true" />
        </button>
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

    <div class="podcast-toolbar">
      <button type="button" class="btn-ghost btn-sm" :disabled="refreshingAll" @click="onRefreshAll">
        {{ refreshingAll ? '更新中…' : '刷新全部' }}
      </button>
      <button
        v-if="feeds.length"
        type="button"
        class="btn-ghost btn-sm"
        :disabled="exporting"
        @click="onExport"
      >
        {{ exporting ? '导出中…' : '导出订阅' }}
      </button>
    </div>

    <p v-if="error" class="form-error">{{ error }}</p>
    <p v-if="toast" class="form-toast" :class="toast.type">{{ toast.text }}</p>

    <section class="pod-section">
      <h2 class="section-label">播放历史</h2>
      <div v-if="!historyGroups.length" class="empty-hint card">听过的节目会出现在这里（按栏目汇总）</div>
      <div v-else class="history-rail">
        <button
          v-show="historyCanLeft"
          type="button"
          class="history-nav history-nav-left"
          title="向左滑动"
          aria-label="向左滑动"
          @click="scrollHistory(-1)"
        >‹</button>
        <div
          ref="historyScrollerEl"
          class="history-scroller"
          @wheel="onHistoryWheel"
          @scroll="refreshHistoryNav"
        >
          <button
            v-for="group in historyGroups"
            :key="group.feedId"
            type="button"
            class="history-card"
            :title="group.feedTitle"
            @click="openHistoryGroup(group)"
          >
            <div class="history-cover-wrap">
              <img
                v-if="group.feedImageUrl"
                class="history-cover"
                :src="coverSrc(group.feedImageUrl)"
                alt=""
              />
              <div v-else class="history-cover history-cover-empty"><PodcastIcon :size="22" /></div>
              <span class="history-badge count">{{ group.items.length }}</span>
            </div>
            <div class="history-title">{{ group.feedTitle }}</div>
            <div class="history-feed">{{ group.items.length }} 条记录</div>
          </button>
        </div>
        <button
          v-show="historyCanRight"
          type="button"
          class="history-nav history-nav-right"
          title="向右滑动"
          aria-label="向右滑动"
          @click="scrollHistory(1)"
        >›</button>
      </div>
    </section>

    <Teleport to="body">
      <div
        v-if="historySheet"
        class="history-sheet-overlay"
        @click.self="closeHistorySheet"
      >
        <div class="history-sheet card" role="dialog" aria-modal="true" :aria-label="historySheet.feedTitle">
          <div class="history-sheet-head">
            <img
              v-if="historySheet.feedImageUrl"
              class="history-sheet-cover"
              :src="coverSrc(historySheet.feedImageUrl)"
              alt=""
            />
            <div v-else class="history-sheet-cover history-cover-empty"><PodcastIcon :size="28" /></div>
            <div class="history-sheet-copy">
              <h3>{{ historySheet.feedTitle }}</h3>
              <p>{{ historySheet.items.length }} 条播放记录</p>
            </div>
            <button type="button" class="history-sheet-close" @click="closeHistorySheet">关闭</button>
          </div>
          <div class="history-sheet-list">
            <button
              v-for="item in historySheet.items"
              :key="item.id"
              type="button"
              class="continue-card card"
              @click="resumeFromHistorySheet(item)"
            >
              <img
                v-if="item.imageUrl || item.feedImageUrl"
                class="continue-cover"
                :src="coverSrc(item.imageUrl || item.feedImageUrl)"
                alt=""
              />
              <div v-else class="continue-cover feed-cover-empty"><PodcastIcon :size="20" /></div>
              <div class="continue-body">
                <div class="continue-title">{{ item.title }}</div>
                <div class="continue-meta">
                  <template v-if="item.progress?.completed">已听完</template>
                  <template v-else-if="(item.progress?.positionSec || 0) >= 5">已听到 {{ formatProgress(item.progress) }}</template>
                  <template v-else>刚开始</template>
                </div>
                <div
                  v-if="item.progress && !item.progress.completed && (item.progress.positionSec || 0) >= 5"
                  class="sheet-progress"
                >
                  <i :style="{ width: progressPct(item.progress) }" />
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <section v-if="updates.length" class="pod-section">
      <h2 class="section-label">最近更新</h2>
      <div class="history-rail">
        <button
          v-show="updatesCanLeft"
          type="button"
          class="history-nav history-nav-left"
          title="向左滑动"
          aria-label="向左滑动"
          @click="scrollUpdates(-1)"
        >‹</button>
        <div
          ref="updatesScrollerEl"
          class="history-scroller updates-scroller"
          @wheel="onUpdatesWheel"
          @scroll="refreshUpdatesNav"
        >
          <div class="update-chips">
            <button
              v-for="feed in updates"
              :key="'u-' + feed.id"
              type="button"
              class="update-chip card"
              @click="openFeed(feed)"
            >
              <img v-if="feed.imageUrl" class="chip-cover" :src="coverSrc(feed.imageUrl)" alt="" />
              <span class="chip-title">{{ feed.title }}</span>
              <span v-if="feed.unreadCount" class="chip-badge">{{ feed.unreadCount }} 新</span>
            </button>
          </div>
        </div>
        <button
          v-show="updatesCanRight"
          type="button"
          class="history-nav history-nav-right"
          title="向右滑动"
          aria-label="向右滑动"
          @click="scrollUpdates(1)"
        >›</button>
      </div>
    </section>

    <section class="pod-section">
      <h2 class="section-label">我的订阅</h2>
      <div v-if="loading && !feeds.length" class="empty card">正在加载订阅…</div>
      <div v-else-if="!feeds.length" class="empty card">
        还没有订阅。请贴 RSS/Atom 订阅源（如以 .xml / rss / feed 结尾）。专辑网页链接无法订阅。
      </div>
      <template v-else>
        <div ref="subGridWrapEl" class="sub-grid-wrap">
          <div
            class="sub-grid"
            :style="{ gridTemplateColumns: `repeat(${feedsCols}, ${SUB_CARD_W}px)` }"
          >
          <div
            v-for="feed in pagedFeeds"
            :key="feed.id"
            class="feed-row"
            :class="{ 'is-open': swipeOpenId === feed.id, 'is-revealing': Number(swipeOffset[feed.id] || 0) > 0.5 }"
          >
            <div class="feed-reveal" aria-hidden="true">
              <button
                type="button"
                class="reveal-btn reveal-edit"
                :disabled="busyId === feed.id"
                @click.stop="openEditFeed(feed)"
              >编辑</button>
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
              <img v-if="feed.imageUrl" class="feed-cover" :src="coverSrc(feed.imageUrl)" alt="" />
              <div v-else class="feed-cover feed-cover-empty"><PodcastIcon :size="26" /></div>
              <div class="feed-body">
                <div class="feed-title" :title="feed.title">
                  {{ feed.title }}
                  <span v-if="feed.unreadCount" class="unread-dot">{{ feed.unreadCount }}</span>
                </div>
                <div class="feed-meta">{{ feed.author || '未知作者' }} · {{ feed.episodeCount || 0 }} 期</div>
                <div v-if="feed.lastError" class="feed-err">{{ feed.lastError }}</div>
              </div>
            </button>
          </div>
          </div>
        </div>
        <ListPager
          v-if="feeds.length > feedsPageSize"
          class="sub-pager"
          :page="feedsPage"
          :page-size="feedsPageSize"
          :total="feeds.length"
          :show-size="false"
          :show-ends="true"
          :show-jump="true"
          aria-label="订阅分页"
          @change-page="onFeedsPageChange"
        />
      </template>
    </section>

    <Teleport to="body">
      <div v-if="ctxMenu" class="pod-ctx-overlay" @pointerdown.self="closeCtxMenu" @contextmenu.prevent="closeCtxMenu">
        <div
          class="pod-ctx card"
          :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
          @pointerdown.stop
        >
          <button type="button" :disabled="busyId === ctxMenu.feed.id" @click="openEditFeed(ctxMenu.feed)">编辑订阅</button>
          <button type="button" :disabled="busyId === ctxMenu.feed.id" @click="refreshFeed(ctxMenu.feed)">刷新节目</button>
          <button type="button" class="danger" :disabled="busyId === ctxMenu.feed.id" @click="unsubscribeFeed(ctxMenu.feed)">取消订阅</button>
        </div>
      </div>
    </Teleport>

    <PodcastFeedEditModal
      v-if="editFeed"
      :feed="editFeed"
      @close="editFeed = null"
      @saved="onFeedEdited"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onActivated, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import ListPager from '../components/ListPager.vue'
import PodcastFeedEditModal from '../components/PodcastFeedEditModal.vue'
import PodcastIcon from '../components/PodcastIcon.vue'
import { appConfirm } from '../stores/appDialog.js'
import { startPlayTracks } from '../stores/player.js'
import { toPlayableCoverUrl } from '../utils/coverDisplay.js'
import { currentUser } from '../utils/auth.js'
import {
  buildCacheKey,
  cacheUserPart,
  readScreenCache,
  writeScreenCache,
  runAfterPaint,
} from '../utils/screenDataCache.js'
import { onWS } from '../ws.js'

const PODCASTS_CACHE_BASE = 'lemon-podcasts-home-v1'
const REVEAL_W = 156
/** 订阅卡片固定宽度；屏宽变化只改列数，每页固定两行 */
const SUB_CARD_W = 156
const SUB_GAP = 12
const SUB_ROWS = 2
const router = useRouter()
const feeds = ref([])
const feedsPage = ref(1)
const feedsCols = ref(5)
const subGridWrapEl = ref(null)
let subGridObserver = null
const feedsPageSize = computed(() => Math.max(2, feedsCols.value) * SUB_ROWS)
const history = ref([])
const historySheet = ref(null)
const historyScrollerEl = ref(null)
const historyCanLeft = ref(false)
const historyCanRight = ref(false)
const updates = ref([])
const updatesScrollerEl = ref(null)
const updatesCanLeft = ref(false)
const updatesCanRight = ref(false)
const url = ref('')
const loading = ref(false)
const subscribing = ref(false)
const error = ref('')
const toast = ref(null)
const busyId = ref('')
const exporting = ref(false)
const refreshingAll = ref(false)
const editFeed = ref(null)
let offPodcastUpdated = null
const swipeOpenId = ref('')
const swipeOffset = reactive({})
const ctxMenu = ref(null)
/** 播放历史按栏目封面聚合 */
const historyGroups = computed(() => {
  const map = new Map()
  for (const item of history.value) {
    const feedId = String(item.feedId || item.podcastFeedId || '')
    if (!feedId) continue
    let group = map.get(feedId)
    if (!group) {
      group = {
        feedId,
        feedTitle: item.feedTitle || '播客',
        feedImageUrl: item.feedImageUrl || '',
        updatedAt: Number(item.progress?.updatedAt) || 0,
        items: [],
      }
      map.set(feedId, group)
    }
    group.items.push(item)
    const t = Number(item.progress?.updatedAt) || 0
    if (t > group.updatedAt) group.updatedAt = t
    if (!group.feedImageUrl && item.feedImageUrl) group.feedImageUrl = item.feedImageUrl
    if ((!group.feedTitle || group.feedTitle === '播客') && item.feedTitle) {
      group.feedTitle = item.feedTitle
    }
  }
  return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt)
})

function refreshHistoryNav() {
  const el = historyScrollerEl.value
  if (!el) {
    historyCanLeft.value = false
    historyCanRight.value = false
    return
  }
  const max = Math.max(0, el.scrollWidth - el.clientWidth)
  historyCanLeft.value = el.scrollLeft > 4
  historyCanRight.value = el.scrollLeft < max - 4
}

function scrollHistory(dir) {
  const el = historyScrollerEl.value
  if (!el) return
  const step = Math.max(180, Math.floor(el.clientWidth * 0.7))
  el.scrollBy({ left: dir * step, behavior: 'smooth' })
  setTimeout(refreshHistoryNav, 280)
}

/**
 * 电脑端：滚轮转为横向滑动。
 * 不用鼠标拖拽（setPointerCapture 会吃掉卡片 click）；触控走原生左右滑。
 */
function onHistoryWheel(e) {
  const el = historyScrollerEl.value
  if (!el) return
  const max = Math.max(0, el.scrollWidth - el.clientWidth)
  if (max <= 4) return
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  if (!delta) return
  const atStart = el.scrollLeft <= 0 && delta < 0
  const atEnd = el.scrollLeft >= max - 1 && delta > 0
  if (atStart || atEnd) return
  e.preventDefault()
  el.scrollLeft += delta
  refreshHistoryNav()
}

watch(historyGroups, async () => {
  await nextTick()
  refreshHistoryNav()
})

function refreshUpdatesNav() {
  const el = updatesScrollerEl.value
  if (!el) {
    updatesCanLeft.value = false
    updatesCanRight.value = false
    return
  }
  const max = Math.max(0, el.scrollWidth - el.clientWidth)
  updatesCanLeft.value = el.scrollLeft > 4
  updatesCanRight.value = el.scrollLeft < max - 4
}

function scrollUpdates(dir) {
  const el = updatesScrollerEl.value
  if (!el) return
  const step = Math.max(180, Math.floor(el.clientWidth * 0.7))
  el.scrollBy({ left: dir * step, behavior: 'smooth' })
  setTimeout(refreshUpdatesNav, 280)
}

/**
 * 电脑端：滚轮转为横向滑动。
 * 最近更新几乎全是可点芯片，不用鼠标拖拽（拖拽会 setPointerCapture 吃掉 click）；
 * 触控端走原生左右滑即可。
 */
function onUpdatesWheel(e) {
  const el = updatesScrollerEl.value
  if (!el) return
  const max = Math.max(0, el.scrollWidth - el.clientWidth)
  if (max <= 4) return
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  if (!delta) return
  const atStart = el.scrollLeft <= 0 && delta < 0
  const atEnd = el.scrollLeft >= max - 1 && delta > 0
  if (atStart || atEnd) return
  e.preventDefault()
  el.scrollLeft += delta
  refreshUpdatesNav()
}

watch(updates, async () => {
  await nextTick()
  refreshUpdatesNav()
})

/** 订阅已按服务端 created_at DESC（最新在前）；本地分页：列数×2 行 */
const pagedFeeds = computed(() => {
  const size = feedsPageSize.value
  const start = (Math.max(1, feedsPage.value) - 1) * size
  return feeds.value.slice(start, start + size)
})

const drag = reactive({
  id: '',
  x0: 0,
  y0: 0,
  start: 0,
  axis: '',
  active: false,
  moved: false,
})

function clampFeedsPage() {
  const max = Math.max(1, Math.ceil(feeds.value.length / feedsPageSize.value))
  if (feedsPage.value > max) feedsPage.value = max
}

function measureFeedsCols() {
  const el = subGridWrapEl.value
  const w = el?.clientWidth || 0
  if (!w) return
  const cols = Math.max(2, Math.floor((w + SUB_GAP) / (SUB_CARD_W + SUB_GAP)))
  if (cols === feedsCols.value) return
  feedsCols.value = cols
  clampFeedsPage()
}

function onFeedsPageChange(next) {
  const max = Math.max(1, Math.ceil(feeds.value.length / feedsPageSize.value))
  feedsPage.value = Math.min(max, Math.max(1, Number(next) || 1))
  closeSwipe()
}

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

function openFeed(feed) {
  if (!feed?.id) return
  router.push(`/podcasts/${encodeURIComponent(feed.id)}`)
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
  openFeed(feed)
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

function formatProgress(p) {
  const sec = Math.floor(Number(p?.positionSec) || 0)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function progressPct(p) {
  const pos = Number(p?.positionSec) || 0
  const dur = Number(p?.durationSec) || 0
  if (dur <= 0) return '0%'
  return `${Math.min(100, Math.round((pos / dur) * 100))}%`
}

function resumablePosition(progress) {
  if (!progress || progress.completed) return 0
  const pos = Number(progress.positionSec) || 0
  return pos >= 5 ? pos : 0
}

function toPodcastTrack(item) {
  return item.track || {
    ...item,
    source: 'podcast',
    podcastEpisodeId: item.id,
    podcastFeedId: item.feedId,
  }
}

function playPodcastTracks(tracks, { resumeTime = 0 } = {}) {
  return startPlayTracks(tracks, 'podcast', {
    dynamic: false,
    resumeTime: Number(resumeTime) || 0,
    podcastProgress: 'skip',
  }).catch((e) => {
    showToast(e.message || '播放失败', 'error')
  })
}

async function openHistoryGroup(group) {
  historySheet.value = group
  // 打开时刷新，带上刚写入的最新进度
  try {
    const h = await api.podcasts.history(40)
    history.value = h.data || []
    const next = historyGroups.value.find((g) => g.feedId === group.feedId)
    if (next) historySheet.value = next
  } catch {}
}

function closeHistorySheet() {
  historySheet.value = null
}

/** 播放历史：一律从上次进度续播 */
function resumeEpisode(item) {
  const pos = resumablePosition(item.progress)
  playPodcastTracks([toPodcastTrack(item)], { resumeTime: pos })
}

function resumeFromHistorySheet(item) {
  closeHistorySheet()
  resumeEpisode(item)
}

function podcastsCacheKey() {
  return buildCacheKey(PODCASTS_CACHE_BASE, [cacheUserPart(currentUser.value)])
}

function persistPodcastsCache() {
  writeScreenCache(podcastsCacheKey(), {
    feeds: (feeds.value || []).slice(0, 80),
    history: (history.value || []).slice(0, 40),
    updates: (updates.value || []).slice(0, 12),
  })
}

function hydratePodcastsFromCache() {
  const cached = readScreenCache(podcastsCacheKey())
  if (!cached) return false
  let hit = false
  if (!feeds.value.length && Array.isArray(cached.feeds) && cached.feeds.length) {
    feeds.value = cached.feeds
    clampFeedsPage()
    hit = true
  }
  if (!history.value.length && Array.isArray(cached.history) && cached.history.length) {
    history.value = cached.history
    hit = true
  }
  if (!updates.value.length && Array.isArray(cached.updates) && cached.updates.length) {
    updates.value = cached.updates
    hit = true
  }
  return hit
}

async function loadExtras() {
  try {
    const [h, u] = await Promise.all([
      api.podcasts.history(40),
      api.podcasts.updates(12),
    ])
    history.value = h.data || []
    updates.value = (u.data || []).filter((x) => x.unreadCount > 0 || x.newestPubDate)
    persistPodcastsCache()
  } catch {}
}

async function loadFeeds() {
  const hadCache = hydratePodcastsFromCache()
  // 有缓存先展示，不挡首屏；无缓存才亮整页 loading
  if (!hadCache) loading.value = true
  error.value = ''
  try {
    const res = await api.podcasts.list()
    // 服务端已按 created_at DESC，最新订阅在前
    feeds.value = res.data || res || []
    clampFeedsPage()
    persistPodcastsCache()
    runAfterPaint(() => { loadExtras() })
  } catch (e) {
    if (!feeds.value.length) error.value = e.message || '加载失败'
  } finally {
    loading.value = false
    await nextTick()
    measureFeedsCols()
  }
}

async function onRefreshAll() {
  if (refreshingAll.value) return
  refreshingAll.value = true
  try {
    const res = await api.podcasts.refreshAll()
    const n = res.updated?.length || 0
    await loadFeeds()
    showToast(n ? `有 ${n} 个频道更新了节目` : '已检查，暂无新节目', n ? 'success' : 'info')
  } catch (e) {
    showToast(e.message || '刷新失败', 'error')
  } finally {
    refreshingAll.value = false
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
    feedsPage.value = 1
    await loadFeeds()
  } catch (e) {
    error.value = e.message || '订阅失败'
  } finally {
    subscribing.value = false
  }
}

function coverSrc(url) {
  return toPlayableCoverUrl(url)
}

function openEditFeed(feed) {
  if (!feed?.id) return
  closeCtxMenu()
  closeSwipe()
  editFeed.value = { ...feed }
}

function onFeedEdited(next) {
  if (!next?.id) return
  feeds.value = feeds.value.map((f) => (f.id === next.id ? { ...f, ...next } : f))
  editFeed.value = null
  showToast('订阅已更新', 'success')
  loadExtras().catch(() => {})
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
    clampFeedsPage()
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
    closeHistorySheet()
    closeCtxMenu()
    closeSwipe()
  }
}

function bindSubGridObserver() {
  const el = subGridWrapEl.value
  if (!el || typeof ResizeObserver === 'undefined') {
    measureFeedsCols()
    return
  }
  if (subGridObserver) {
    subGridObserver.disconnect()
    subGridObserver = null
  }
  subGridObserver = new ResizeObserver(() => measureFeedsCols())
  subGridObserver.observe(el)
  measureFeedsCols()
}

watch(
  () => [feeds.value.length, loading.value],
  async () => {
    await nextTick()
    bindSubGridObserver()
  },
)

function onWindowResize() {
  refreshHistoryNav()
  measureFeedsCols()
}

onMounted(() => {
  loadFeeds()
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onWindowResize)
  offPodcastUpdated = onWS('podcast:updated', () => { loadFeeds() })
  nextTick(() => {
    refreshHistoryNav()
    refreshUpdatesNav()
    bindSubGridObserver()
  })
})
onActivated(() => {
  loadExtras()
  nextTick(() => {
    refreshHistoryNav()
    refreshUpdatesNav()
    bindSubGridObserver()
  })
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onWindowResize)
  subGridObserver?.disconnect?.()
  subGridObserver = null
  offPodcastUpdated?.()
})
</script>

<style scoped>
.podcasts-page { padding: 4px 0 24px; }
.page-head { margin-bottom: 14px; }
.section-label {
  margin: 18px 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
}
.empty-hint {
  padding: 14px 16px;
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
}
.pod-section { margin-top: 4px; }
.history-rail {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
}
.history-scroller {
  display: flex;
  flex-wrap: nowrap;
  gap: 10px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 2px 2px 8px;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  flex: 1;
  min-width: 0;
  cursor: default;
  scrollbar-width: thin;
}
.history-scroller::-webkit-scrollbar { height: 6px; }
.history-scroller::-webkit-scrollbar-thumb {
  background: var(--border-light);
  border-radius: 4px;
}
.history-nav {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-light);
  border-radius: 999px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}
.history-nav:hover {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border-light));
}
.history-card {
  flex: 0 0 96px;
  width: 96px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  scroll-snap-align: start;
}
.history-cover-wrap {
  position: relative;
  width: 96px;
  height: 96px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
}
.history-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.history-cover-empty {
  display: grid;
  place-items: center;
  color: var(--text-muted);
}
.history-badge {
  position: absolute;
  left: 6px;
  top: 6px;
  z-index: 1;
  font-size: 10px;
  line-height: 1;
  padding: 3px 5px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  backdrop-filter: blur(4px);
}
.history-badge.count {
  left: auto;
  right: 6px;
  background: rgba(0, 0, 0, 0.6);
}
.history-title {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.history-feed {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.history-sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 11000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.history-sheet {
  width: min(520px, 100%);
  max-height: min(78vh, 640px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  border-radius: 16px;
  overflow: hidden;
}
.history-sheet-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 14px 10px;
  border-bottom: 1px solid var(--border-light);
}
.history-sheet-cover {
  width: 56px;
  height: 56px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--bg-elevated);
}
.history-sheet-copy {
  min-width: 0;
  flex: 1;
}
.history-sheet-copy h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.history-sheet-copy p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}
.history-sheet-close {
  flex-shrink: 0;
  height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}
.history-sheet-list {
  overflow-y: auto;
  padding: 10px 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sheet-progress {
  margin-top: 6px;
  height: 3px;
  border-radius: 2px;
  background: var(--bg-input);
  overflow: hidden;
}
.sheet-progress i {
  display: block;
  height: 100%;
  background: var(--accent);
}
.continue-list { display: flex; flex-direction: column; gap: 8px; }
.continue-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  color: inherit;
}
.continue-cover {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}
.continue-body { min-width: 0; flex: 1; }
.continue-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.continue-meta {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-muted);
}
/* 最近更新：两行芯片，外层与播放历史同一套横向滚动条 */
.updates-scroller {
  align-items: stretch;
  cursor: default;
  gap: 0;
}
.update-chips {
  display: grid;
  grid-template-rows: repeat(2, auto);
  grid-auto-flow: column;
  grid-auto-columns: max-content;
  gap: 8px;
  width: max-content;
  flex: 0 0 auto;
  padding: 2px 0;
  pointer-events: auto;
}
.update-chip {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px 8px 8px;
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  color: inherit;
  cursor: pointer;
  max-width: 280px;
  scroll-snap-align: start;
  pointer-events: auto;
  position: relative;
  z-index: 1;
}
.chip-cover {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}
.chip-title {
  font-size: 13px;
  font-weight: 600;
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chip-badge, .unread-dot {
  flex-shrink: 0;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--accent-muted);
  color: var(--accent);
}
.unread-dot { margin-left: 6px; }
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
.fav-entry {
  margin-left: auto;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-elevated);
  padding: 0;
  cursor: pointer;
}
.fav-entry-icon {
  width: 22px;
  height: 22px;
  display: block;
  pointer-events: none;
  background: var(--accent);
  -webkit-mask: url('/icons/podcast-favorite-star.svg') center / contain no-repeat;
  mask: url('/icons/podcast-favorite-star.svg') center / contain no-repeat;
}
.fav-entry:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border-light));
}
.fav-entry:hover .fav-entry-icon {
  filter: brightness(1.08);
}
.fav-entry:active { opacity: 0.85; }
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
.sub-grid-wrap {
  width: 100%;
  min-width: 0;
}
.sub-grid {
  display: grid;
  gap: 12px;
  justify-content: start;
  align-content: start;
}
.sub-pager {
  margin-top: 12px;
}
.sub-pager :deep(.list-pager) {
  margin-top: 0;
}
.feed-row {
  position: relative;
  width: 156px;
  overflow: hidden;
  isolation: isolate;
  border-radius: 12px;
  background: var(--bg-elevated);
  touch-action: pan-y;
  transform: translateZ(0);
}
.feed-reveal {
  position: absolute;
  inset: 0;
  width: 100%;
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
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
  padding: 0 4px;
}
.reveal-edit { background: #546e7a; }
.reveal-refresh { background: var(--accent, #3b82f6); }
.reveal-unsub { background: #e53935; }
.reveal-btn:disabled { opacity: 0.55; }
.feed-card {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: stretch;
  text-align: left;
  cursor: pointer;
  padding: 10px;
  border: 0;
  width: 100%;
  height: 100%;
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
  width: 100%;
  aspect-ratio: 1;
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
.feed-body { min-width: 0; padding: 0 2px 2px; }
.feed-title {
  font-weight: 650;
  font-size: 13.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.feed-meta { font-size: 11.5px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.feed-err { font-size: 11px; color: var(--danger, #ef4444); margin-top: 2px; }

@media (max-width: 768px) {
  .podcasts-page {
    padding: 0 0 calc(12px + env(safe-area-inset-bottom, 0px));
  }
  .page-head { margin-bottom: 10px; }
  .page-title { font-size: 18px; gap: 6px; }
  .page-subtitle {
    display: none;
  }
  .title-line { gap: 8px; }
  .back-btn {
    height: 32px;
    padding: 0 10px;
    font-size: 13px;
  }
  .fav-entry {
    width: 38px;
    height: 38px;
  }
  .fav-entry-icon {
    width: 20px;
    height: 20px;
  }
  .subscribe-row {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }
  .subscribe-input {
    height: 42px;
    font-size: 16px;
    padding: 0 12px;
    border-radius: 10px;
  }
  .subscribe-btn {
    width: auto;
    height: 36px;
    padding: 0 12px;
    font-size: 13px;
  }
  .podcast-toolbar {
    margin: 0 0 10px;
    gap: 8px;
    flex-wrap: wrap;
  }
  .podcast-toolbar .btn-sm {
    height: 32px;
    padding: 0 10px;
    font-size: 12.5px;
  }
  .section-label {
    margin: 14px 0 8px;
    font-size: 13px;
  }
  .history-nav { display: none; }
  .history-scroller { cursor: default; }
  .history-card {
    flex: 0 0 84px;
    width: 84px;
  }
  .history-cover-wrap {
    width: 84px;
    height: 84px;
    border-radius: 10px;
  }
  .history-title { font-size: 11px; }
  .history-feed { font-size: 10px; }
  .update-chips {
    gap: 8px;
  }
  .update-chip {
    max-width: 200px;
    padding: 7px 12px 7px 7px;
    gap: 8px;
  }
  .chip-cover {
    width: 36px;
    height: 36px;
    border-radius: 7px;
  }
  .chip-title {
    max-width: 120px;
    font-size: 12.5px;
  }
  .feed-card { padding: 8px; gap: 6px; }
  .feed-title { font-size: 12.5px; }
  .feed-meta { font-size: 11px; }
  .feed-cover { border-radius: 9px; }
  .reveal-btn { font-size: 11.5px; padding: 0 4px; }
  .sub-pager {
    margin-top: 10px;
  }
  .sub-pager :deep(.list-pager) {
    justify-content: center;
    gap: 8px;
  }
  .sub-pager :deep(.list-pager-jump) {
    width: 100%;
    justify-content: center;
  }
  .history-sheet-overlay {
    align-items: center;
    justify-content: center;
    padding: max(16px, env(safe-area-inset-top, 0px)) 16px max(16px, env(safe-area-inset-bottom, 0px));
  }
  .history-sheet {
    width: min(520px, 100%);
    max-height: min(78vh, 640px);
    border-radius: 16px;
  }
}
@media (max-width: 420px) {
  .update-chip { max-width: 170px; }
  .chip-title { max-width: 96px; }
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
