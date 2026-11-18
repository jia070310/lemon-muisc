<template>
  <div class="fav-page">
    <header class="page-head">
      <div class="title-line">
        <h1 class="page-title">★ 收藏</h1>
        <button type="button" class="back-btn" @click="goBack">← 返回</button>
      </div>
      <p class="page-subtitle">收藏的频道与单集</p>
    </header>

    <p v-if="error" class="form-error">{{ error }}</p>
    <p v-if="toast" class="form-toast">{{ toast }}</p>

    <div v-if="loading" class="empty card">正在加载收藏…</div>
    <template v-else>
      <section class="pod-section">
        <h2 class="section-label">收藏频道 <span v-if="feeds.length" class="count">{{ feeds.length }}</span></h2>
        <div v-if="!feeds.length" class="empty-hint card">还没有收藏频道</div>
        <div v-else class="feed-grid">
          <button
            v-for="feed in feeds"
            :key="feed.id"
            type="button"
            class="feed-card card"
            @click="openFeed(feed)"
          >
            <img v-if="feed.imageUrl" class="feed-cover" :src="feed.imageUrl" alt="" />
            <div v-else class="feed-cover feed-cover-empty"><PodcastIcon :size="26" /></div>
            <div class="feed-body">
              <div class="feed-title">{{ feed.title }}</div>
              <div class="feed-meta">{{ feed.author || '未知作者' }} · {{ feed.episodeCount || 0 }} 期</div>
            </div>
          </button>
        </div>
      </section>

      <section class="pod-section">
        <h2 class="section-label">收藏单集 <span v-if="episodes.length" class="count">{{ episodes.length }}</span></h2>
        <div v-if="!episodes.length" class="empty-hint card">还没有收藏单集</div>
        <div v-else class="ep-list">
          <button
            v-for="item in episodes"
            :key="item.id"
            type="button"
            class="ep-card card"
            @click="playEpisode(item)"
          >
            <img
              v-if="item.imageUrl || item.feedImageUrl"
              class="ep-cover"
              :src="item.imageUrl || item.feedImageUrl"
              alt=""
            />
            <div v-else class="ep-cover feed-cover-empty"><PodcastIcon :size="20" /></div>
            <div class="ep-body">
              <div class="ep-title">{{ item.title }}</div>
              <div class="ep-meta">
                {{ item.feedTitle || '播客' }}
                <template v-if="item.progress?.completed"> · 已听完</template>
                <template v-else-if="(item.progress?.positionSec || 0) >= 5">
                  · 已听到 {{ formatDur(item.progress.positionSec) }}
                </template>
              </div>
            </div>
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import PodcastIcon from '../components/PodcastIcon.vue'
import { appConfirm } from '../stores/appDialog.js'
import { startPlayTracks } from '../stores/player.js'

const router = useRouter()
const feeds = ref([])
const episodes = ref([])
const loading = ref(false)
const error = ref('')
const toast = ref('')

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/podcasts')
}

function openFeed(feed) {
  if (!feed?.id) return
  router.push(`/podcasts/${encodeURIComponent(feed.id)}`)
}

function formatDur(sec) {
  const n = Math.floor(Number(sec) || 0)
  const m = Math.floor(n / 60)
  const s = n % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function showToast(text) {
  toast.value = text
  setTimeout(() => { toast.value = '' }, 2800)
}

function toTrack(item) {
  return item.track || {
    ...item,
    source: 'podcast',
    podcastEpisodeId: item.id,
    podcastFeedId: item.feedId,
  }
}

async function playEpisode(item) {
  const progress = item.progress
  const pos = (!progress?.completed && (Number(progress?.positionSec) || 0) >= 5)
    ? Number(progress.positionSec)
    : 0
  let resumeTime = 0
  if (pos > 0) {
    const ok = await appConfirm({
      title: '检测到播放记录',
      message: `「${item.title || '本集'}」已听到 ${formatDur(pos)}，是否继续？`,
      hint: '继续播放将从上次进度开始；重新播放从头开始。',
      cover: item.imageUrl || item.feedImageUrl || '',
      confirmText: '继续播放',
      cancelText: '重新播放',
    })
    resumeTime = ok ? pos : 0
  }
  startPlayTracks([toTrack(item)], 'podcast', {
    dynamic: false,
    resumeTime,
    podcastProgress: 'skip',
  }).catch((e) => showToast(e.message || '播放失败'))
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.podcasts.favorites()
    feeds.value = res.data?.feeds || []
    episodes.value = res.data?.episodes || []
  } catch (e) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.fav-page { padding: 4px 0 28px; }
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
.page-subtitle {
  margin: 8px 0 0;
  color: var(--text-muted);
  font-size: 13px;
}
.section-label {
  margin: 18px 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
}
.count {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
}
.empty-hint, .empty {
  padding: 14px 16px;
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
}
.form-error { color: var(--danger, #ef4444); font-size: 13px; }
.form-toast { color: var(--accent); font-size: 13px; }
.feed-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}
.feed-card {
  display: flex;
  gap: 12px;
  align-items: center;
  text-align: left;
  padding: 12px;
  border: 0;
  cursor: pointer;
  color: inherit;
  background: var(--bg-elevated);
}
.feed-cover {
  width: 56px;
  height: 56px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--bg);
}
.feed-cover-empty {
  display: grid;
  place-items: center;
  color: var(--text-muted);
}
.feed-body { min-width: 0; flex: 1; }
.feed-title {
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.feed-meta { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
.ep-list { display: flex; flex-direction: column; gap: 8px; }
.ep-card {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 10px 12px;
  text-align: left;
  border: 0;
  cursor: pointer;
  color: inherit;
  background: var(--bg-card);
}
.ep-cover {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--bg-elevated);
}
.ep-body { min-width: 0; flex: 1; }
.ep-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ep-meta { margin-top: 2px; font-size: 11px; color: var(--text-muted); }
@media (max-width: 768px) {
  .fav-page {
    padding: 0 0 calc(12px + env(safe-area-inset-bottom, 0px));
  }
  .page-head { margin-bottom: 10px; }
  .page-title { font-size: 18px; }
  .page-subtitle { font-size: 12.5px; }
  .back-btn {
    height: 32px;
    padding: 0 10px;
  }
  .section-label {
    margin: 14px 0 8px;
    font-size: 13px;
  }
  .feed-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .feed-card {
    padding: 10px;
    gap: 10px;
    border-radius: 12px;
  }
  .feed-cover {
    width: 52px;
    height: 52px;
    border-radius: 9px;
  }
  .feed-title { font-size: 14px; }
  .feed-meta { font-size: 11.5px; }
  .ep-list { gap: 6px; }
  .ep-card {
    padding: 10px;
    border-radius: 10px;
  }
  .ep-cover {
    width: 44px;
    height: 44px;
  }
  .ep-title { font-size: 13.5px; }
  .ep-meta { font-size: 11px; }
}
</style>
