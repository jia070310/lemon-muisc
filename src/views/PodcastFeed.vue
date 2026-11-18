<template>
  <div class="podcast-feed-page">
    <div class="feed-head">
      <div class="title-line">
        <router-link to="/podcasts" class="page-title"><PodcastIcon :size="20" />播客</router-link>
        <button type="button" class="back-btn" @click="goBack">← 返回</button>
      </div>
      <div v-if="feed" class="feed-hero">
        <div class="hero-top">
          <img v-if="feed.imageUrl" class="hero-cover" :src="coverSrc(feed.imageUrl)" alt="" />
          <div v-else class="hero-cover hero-cover-empty"><PodcastIcon :size="40" /></div>
          <div class="hero-copy">
            <h2>{{ feed.title }}</h2>
            <p class="hero-meta">{{ feed.author }} · {{ total }} 期</p>
          </div>
        </div>
        <p v-if="feed.description" class="hero-desc">{{ feed.description }}</p>
        <div class="hero-actions">
          <button class="btn-primary btn-sm play-btn" type="button" :disabled="!tracks.length" @click="playAll">
            <span class="play-label-full">从最新播放</span>
            <span class="play-label-short">播放</span>
          </button>
          <button
            class="btn-ghost btn-sm"
            type="button"
            :disabled="favBusy"
            @click="toggleFeedFavorite"
          >
            <span class="act-full">{{ feed.favorited ? '★ 已收藏频道' : '☆ 收藏频道' }}</span>
            <span class="act-short">{{ feed.favorited ? '★ 已藏' : '☆ 收藏' }}</span>
          </button>
          <button class="btn-ghost btn-sm" type="button" @click="openEdit">
            <span class="act-full">编辑订阅</span>
            <span class="act-short">编辑</span>
          </button>
          <button
            class="btn-ghost btn-sm"
            type="button"
            :disabled="refreshing"
            title="重新请求 RSS，拉取最新节目"
            @click="onRefresh"
          >
            <span class="act-full">{{ refreshing ? '拉取中…' : '拉取最新' }}</span>
            <span class="act-short">{{ refreshing ? '拉取中' : '刷新' }}</span>
          </button>
          <button class="btn-ghost btn-sm" type="button" @click="onUnsubscribe">
            <span class="act-full">取消订阅</span>
            <span class="act-short">退订</span>
          </button>
        </div>
      </div>
    </div>

    <p v-if="error" class="form-error">{{ error }}</p>
    <p v-if="toast" class="form-toast">{{ toast }}</p>

    <div v-if="loading && !episodes.length" class="empty card">正在读取节目…</div>
    <div v-else-if="!episodes.length" class="empty card">没有可播放的音频节目</div>
    <template v-else>
      <div class="ep-toolbar">
        <span class="ep-range">{{ pageRangeText }}</span>
        <ListPager
          :page="page"
          :page-size="PAGE_SIZE"
          :total="total"
          :show-size="false"
          :show-ends="true"
          :show-jump="true"
          aria-label="播客节目分页"
          @change-page="onPageChange"
        />
      </div>
      <div class="ep-list" :class="{ 'is-loading': loading }">
        <div
          v-for="(ep, i) in episodes"
          :key="ep.id"
          class="ep-row"
          :class="{ done: ep.progress?.completed }"
        >
          <button type="button" class="ep-main" @click="playFrom(i)">
            <span class="ep-idx">{{ episodeIndex(i) }}</span>
            <div class="ep-info">
              <div class="ep-title">{{ ep.title }}</div>
              <div class="ep-meta">
                <span v-if="ep.pubDate">{{ formatDate(ep.pubDate) }}</span>
                <span v-if="ep.duration">{{ formatDur(ep.duration) }}</span>
                <span v-if="ep.progress?.completed">已听完</span>
                <span v-else-if="ep.progress?.positionSec >= 5">已听到 {{ formatDur(ep.progress.positionSec) }}</span>
              </div>
              <div
                v-if="ep.progress && !ep.progress.completed && ep.progress.positionSec >= 5"
                class="ep-progress"
              >
                <i :style="{ width: progressPct(ep.progress) }" />
              </div>
            </div>
          </button>
          <button
            type="button"
            class="ep-fav"
            :title="ep.favorited ? '取消收藏' : '收藏本集'"
            @click.stop="toggleEpisodeFavorite(ep)"
          >{{ ep.favorited ? '★' : '☆' }}</button>
        </div>
      </div>
      <div v-if="totalPages > 1" class="ep-toolbar ep-toolbar-bottom">
        <span class="ep-range">{{ pageRangeText }}</span>
        <ListPager
          :page="page"
          :page-size="PAGE_SIZE"
          :total="total"
          :show-size="false"
          :show-ends="true"
          :show-jump="true"
          aria-label="播客节目分页"
          @change-page="onPageChange"
        />
      </div>
    </template>

    <div v-if="canScrollUp || canScrollDown" class="feed-jump" aria-label="当前页滚动">
      <button
        v-show="canScrollUp"
        type="button"
        class="feed-jump-btn"
        title="滚到当前页顶部"
        aria-label="滚到当前页顶部"
        :disabled="jumpBusy"
        @click="jumpToTop"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <polyline
            points="6 14 12 8 18 14"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <button
        v-show="canScrollDown"
        type="button"
        class="feed-jump-btn"
        title="滚到当前页底部"
        aria-label="滚到当前页底部"
        :disabled="jumpBusy"
        @click="jumpToBottom"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <polyline
            points="6 10 12 16 18 10"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>

    <PodcastFeedEditModal
      v-if="editOpen && feed"
      :feed="feed"
      @close="editOpen = false"
      @saved="onFeedEdited"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api.js'
import ListPager from '../components/ListPager.vue'
import PodcastFeedEditModal from '../components/PodcastFeedEditModal.vue'
import PodcastIcon from '../components/PodcastIcon.vue'
import { appConfirm } from '../stores/appDialog.js'
import { startPlayTracks } from '../stores/player.js'
import { toPlayableCoverUrl } from '../utils/coverDisplay.js'

const PAGE_SIZE = 20
const route = useRoute()
const router = useRouter()
const feed = ref(null)
const episodes = ref([])
const tracks = ref([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const refreshing = ref(false)
const favBusy = ref(false)
const jumpBusy = ref(false)
const canScrollUp = ref(false)
const canScrollDown = ref(false)
const editOpen = ref(false)
const error = ref('')
const toast = ref('')
let scrollTarget = null

function coverSrc(url) {
  return toPlayableCoverUrl(url)
}

function openEdit() {
  if (!feed.value) return
  editOpen.value = true
}

function onFeedEdited(next) {
  if (!next) return
  feed.value = { ...feed.value, ...next }
  editOpen.value = false
  showToast('订阅已更新')
  loadPage(page.value).catch(() => {})
}

function onScroll() {
  refreshScrollState()
}

const totalPages = computed(() => Math.max(1, Math.ceil((Number(total.value) || 0) / PAGE_SIZE)))
const pageRangeText = computed(() => {
  const t = Number(total.value) || 0
  if (!t) return '暂无节目'
  const start = (Math.max(1, page.value) - 1) * PAGE_SIZE + 1
  const end = Math.min(t, start + episodes.value.length - 1)
  return `第 ${start}–${end} 条 · 共 ${t} 期 · 每页 ${PAGE_SIZE}`
})
function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/podcasts')
}

function readScrollMetrics(el) {
  if (!el) return { top: 0, max: 0 }
  const top = Number(el.scrollTop) || 0
  const max = Math.max(0, (Number(el.scrollHeight) || 0) - (Number(el.clientHeight) || 0))
  return { top, max }
}

/** 在候选里选真正在滚的那个（main.content 或 window） */
function getScrollParent() {
  const main = document.querySelector('main.content')
  const doc = document.scrollingElement || document.documentElement
  const candidates = [main, doc].filter(Boolean)
  let best = candidates[0] || null
  let bestMax = -1
  for (const el of candidates) {
    const { max } = readScrollMetrics(el)
    if (max > bestMax) {
      bestMax = max
      best = el
    }
  }
  // 都不够溢出时仍优先 main.content，便于之后内容变高
  return best || main || doc
}

function bindScrollTarget() {
  const next = getScrollParent()
  if (scrollTarget === next) return
  scrollTarget?.removeEventListener?.('scroll', onScroll)
  scrollTarget = next
  scrollTarget?.addEventListener?.('scroll', onScroll, { passive: true })
}

function refreshScrollState() {
  if (jumpBusy.value) return
  bindScrollTarget()
  const { top, max } = readScrollMetrics(getScrollParent())
  canScrollUp.value = max > 8 && top > 8
  canScrollDown.value = max > 8 && top < max - 8
}

function scrollToEdge(edge, { smooth = true } = {}) {
  const el = getScrollParent()
  if (!el) return
  const { max } = readScrollMetrics(el)
  const top = edge === 'bottom' ? max : 0
  try {
    el.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
  } catch {
    el.scrollTop = top
  }
}

function waitScrollNear(edge, timeoutMs = 900) {
  return new Promise((resolve) => {
    const el = getScrollParent()
    if (!el) {
      resolve()
      return
    }
    const started = Date.now()
    const check = () => {
      const { top, max } = readScrollMetrics(el)
      const done = edge === 'bottom'
        ? max <= 8 || top >= max - 8
        : top <= 8
      if (done || Date.now() - started > timeoutMs) {
        resolve()
        return
      }
      requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  })
}

/** 仅滚动当前页内容顶部，不翻页 */
async function jumpToTop() {
  if (jumpBusy.value || !canScrollUp.value) return
  jumpBusy.value = true
  try {
    scrollToEdge('top')
    await waitScrollNear('top')
  } finally {
    jumpBusy.value = false
    refreshScrollState()
    canScrollUp.value = false
  }
}

/** 仅滚动当前页内容底部，不翻页 */
async function jumpToBottom() {
  if (jumpBusy.value || !canScrollDown.value) return
  jumpBusy.value = true
  try {
    scrollToEdge('bottom')
    await waitScrollNear('bottom')
  } finally {
    jumpBusy.value = false
    refreshScrollState()
    canScrollDown.value = false
  }
}

function formatDate(ms) {
  if (!ms) return ''
  try {
    return new Date(ms).toLocaleDateString()
  } catch {
    return ''
  }
}

function formatDur(sec) {
  const n = Math.floor(Number(sec) || 0)
  const h = Math.floor(n / 3600)
  const m = Math.floor((n % 3600) / 60)
  const s = n % 60
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function progressPct(p) {
  const pos = Number(p?.positionSec) || 0
  const dur = Number(p?.durationSec) || 0
  if (dur <= 0) return '0%'
  return `${Math.min(100, Math.round((pos / dur) * 100))}%`
}

function showToast(text) {
  toast.value = text
  setTimeout(() => { toast.value = '' }, 2800)
}

function episodeIndex(i) {
  return (Math.max(1, page.value) - 1) * PAGE_SIZE + i + 1
}

async function loadPage(nextPage = page.value) {
  const id = String(route.params.id || '')
  if (!id) return
  const pg = Math.max(1, Number(nextPage) || 1)
  loading.value = true
  error.value = ''
  try {
    const res = await api.podcasts.episodes(id, { page: pg, limit: PAGE_SIZE })
    const data = res.data || {}
    feed.value = data.feed || null
    total.value = Number(data.total) || 0
    episodes.value = data.episodes || []
    tracks.value = data.tracks || []
    page.value = Number(data.page) || pg
    // 打开频道即清除未读角标
    if (pg === 1 && feed.value?.unreadCount) {
      api.podcasts.markRead(id).catch(() => {})
      feed.value = { ...feed.value, unreadCount: 0 }
    }
  } catch (e) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
    await nextTick()
    requestAnimationFrame(() => {
      bindScrollTarget()
      refreshScrollState()
    })
  }
}

function resumablePosition(progress) {
  if (!progress || progress.completed) return 0
  const pos = Number(progress.positionSec) || 0
  return pos >= 5 ? pos : 0
}

async function playFrom(index) {
  const list = tracks.value.slice(index)
  if (!list.length) return
  const ep = episodes.value[index]
  const pos = resumablePosition(ep?.progress)
  let resumeTime = 0
  if (pos > 0) {
    const continuePlay = await appConfirm({
      title: '检测到播放记录',
      message: `「${ep?.title || '本集'}」已听到 ${formatDur(pos)}，是否继续？`,
      hint: '继续播放将从上次进度开始；重新播放从头开始。',
      cover: ep?.imageUrl || feed.value?.imageUrl || '',
      confirmText: '继续播放',
      cancelText: '重新播放',
    })
    resumeTime = continuePlay ? pos : 0
  }
  startPlayTracks(list, 'podcast', {
    dynamic: false,
    resumeTime,
    podcastProgress: 'skip',
  }).catch((e) => {
    showToast(e.message || '播放失败')
  })
}

async function playAll() {
  if (page.value !== 1) await loadPage(1)
  playFrom(0)
}

async function onPageChange(next) {
  const pg = Math.max(1, Number(next) || 1)
  if (pg === page.value && episodes.value.length) return
  await loadPage(pg)
  scrollToEdge('top')
}

async function toggleFeedFavorite() {
  if (!feed.value?.id || favBusy.value) return
  favBusy.value = true
  try {
    const res = await api.podcasts.toggleFavorite('feed', feed.value.id)
    feed.value = { ...feed.value, favorited: Boolean(res.favorited) }
    showToast(res.favorited ? '已收藏频道' : '已取消收藏')
  } catch (e) {
    showToast(e.message || '操作失败')
  } finally {
    favBusy.value = false
  }
}

async function toggleEpisodeFavorite(ep) {
  if (!ep?.id) return
  try {
    const res = await api.podcasts.toggleFavorite('episode', ep.id)
    const favorited = Boolean(res.favorited)
    episodes.value = episodes.value.map((item) => (
      item.id === ep.id ? { ...item, favorited } : item
    ))
    showToast(favorited ? '已收藏本集' : '已取消收藏')
  } catch (e) {
    showToast(e.message || '操作失败')
  }
}

async function onRefresh() {
  refreshing.value = true
  try {
    const res = await api.podcasts.refresh(String(route.params.id))
    await loadPage(1)
    const n = Number(res.inserted) || 0
    showToast(n ? `新增 ${n} 期节目` : '节目已更新')
  } catch (e) {
    error.value = e.message || '刷新失败'
  } finally {
    refreshing.value = false
  }
}

async function onUnsubscribe() {
  if (!window.confirm('取消订阅后节目列表会从本账号移除，确定吗？')) return
  try {
    await api.podcasts.unsubscribe(String(route.params.id))
    router.push('/podcasts')
  } catch (e) {
    error.value = e.message || '取消失败'
  }
}

watch(() => route.params.id, () => { loadPage(1) })
watch([episodes, page, total], () => {
  nextTick(() => {
    bindScrollTarget()
    refreshScrollState()
  })
})

onMounted(() => {
  bindScrollTarget()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', refreshScrollState)
  loadPage(1)
})
onUnmounted(() => {
  scrollTarget?.removeEventListener?.('scroll', onScroll)
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', refreshScrollState)
})
</script>

<style scoped>
.podcast-feed-page { padding: 4px 0 36px; position: relative; }
.feed-jump {
  position: fixed;
  right: 18px;
  bottom: calc(var(--player-height, 72px) + var(--mobile-nav-height, 0px) + 20px);
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.feed-jump-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  box-shadow: 0 6px 18px color-mix(in srgb, var(--accent) 35%, transparent);
  transition: transform 0.15s ease, filter 0.15s ease, opacity 0.15s ease;
}
.feed-jump-btn:hover:not(:disabled) {
  filter: brightness(1.06);
  transform: translateY(-1px);
}
.feed-jump-btn:active:not(:disabled) {
  transform: translateY(0);
  filter: brightness(0.96);
}
.feed-jump-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}
.feed-jump-btn svg {
  display: block;
}
.ep-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin: 4px 0 10px;
}
.ep-toolbar-bottom { margin: 14px 0 0; }
.ep-range {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
}
.ep-toolbar :deep(.list-pager) {
  margin-top: 0;
  justify-content: flex-end;
}
.title-line {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
  color: inherit;
  text-decoration: none;
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
.feed-hero {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 14px 0 12px;
}
.hero-top {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.hero-copy { min-width: 0; flex: 1; }
.hero-cover {
  width: 96px;
  height: 96px;
  border-radius: 12px;
  object-fit: cover;
  flex-shrink: 0;
}
.hero-cover-empty {
  display: grid;
  place-items: center;
  background: var(--bg-elevated);
  color: var(--text-muted);
  border: 1px solid var(--border-light);
}
.feed-hero h2 {
  margin: 0 0 6px;
  font-size: 20px;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.hero-meta { margin: 0; color: var(--text-muted); font-size: 13px; }
.hero-desc {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.play-btn { min-width: 88px; }
.play-label-short { display: none; }
.act-short { display: none; }
.form-error { color: var(--danger, #ef4444); font-size: 13px; }
.form-toast { color: var(--accent); font-size: 13px; }
.empty { padding: 24px; text-align: center; color: var(--text-muted); }
.ep-list { display: flex; flex-direction: column; gap: 0; }
.ep-row {
  display: flex;
  gap: 4px;
  align-items: stretch;
  width: 100%;
  padding: 4px 0;
  border-radius: 10px;
}
.ep-row:hover { background: var(--bg-hover); }
.ep-row.done .ep-title { color: var(--text-muted); }
.ep-main {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  flex: 1;
  min-width: 0;
  text-align: left;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 8px 4px;
  border-radius: 10px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.ep-main:active { opacity: 0.85; }
.ep-fav {
  flex-shrink: 0;
  width: 36px;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 16px;
  cursor: pointer;
  border-radius: 8px;
}
.ep-fav:hover { background: var(--bg-elevated); }
.ep-idx {
  width: 24px;
  flex-shrink: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
  padding-top: 1px;
}
.ep-info { min-width: 0; flex: 1; }
.ep-title {
  font-weight: 600;
  font-size: 14.5px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.ep-meta { font-size: 12px; color: var(--text-muted); margin-top: 3px; display: flex; flex-wrap: wrap; gap: 10px; }
.ep-progress {
  margin-top: 6px;
  height: 3px;
  border-radius: 2px;
  background: var(--bg-input);
  overflow: hidden;
}
.ep-progress i {
  display: block;
  height: 100%;
  background: var(--accent);
}
.ep-list.is-loading { opacity: 0.65; pointer-events: none; }
@media (max-width: 768px) {
  .podcast-feed-page {
    padding: 0 0 calc(12px + env(safe-area-inset-bottom, 0px));
  }
  .page-title { font-size: 17px; }
  .back-btn {
    height: 32px;
    padding: 0 10px;
  }
  .feed-hero { gap: 10px; margin: 10px 0 10px; }
  .hero-top { gap: 12px; }
  .hero-cover { width: 72px; height: 72px; border-radius: 10px; }
  .feed-hero h2 { font-size: 16px; margin: 0 0 4px; }
  .hero-meta { font-size: 12px; }
  .hero-desc {
    -webkit-line-clamp: 2;
    font-size: 12.5px;
    line-height: 1.45;
  }
  .hero-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .hero-actions .btn-sm {
    width: 100%;
    height: 36px;
    padding: 0 8px;
    font-size: 13px;
    min-width: 0;
  }
  .play-btn { min-width: 0; }
  .play-label-full { display: none; }
  .play-label-short { display: inline; }
  .act-full { display: none; }
  .act-short { display: inline; }
  .ep-toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    margin: 2px 0 8px;
  }
  .ep-toolbar :deep(.list-pager) {
    justify-content: center;
    width: 100%;
  }
  .ep-toolbar :deep(.list-pager-jump) {
    width: 100%;
    justify-content: center;
  }
  .ep-range {
    text-align: center;
    font-size: 11.5px;
  }
  .ep-row { padding: 6px 0; gap: 4px; }
  .ep-main { padding: 10px 4px; gap: 8px; }
  .ep-idx { width: 20px; font-size: 12px; }
  .ep-title { font-size: 14px; }
  .ep-meta { gap: 8px; font-size: 11.5px; }
  .ep-fav {
    width: 40px;
    font-size: 17px;
  }
  .feed-jump {
    right: 12px;
    bottom: calc(var(--player-height, 72px) + var(--mobile-nav-height, 56px) + 16px + env(safe-area-inset-bottom, 0px));
    gap: 8px;
  }
  .feed-jump-btn {
    width: 40px;
    height: 40px;
  }
}
</style>
