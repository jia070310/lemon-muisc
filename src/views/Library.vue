<template>
  <div class="library-page">
    <div class="library-topbar">
      <form class="library-search-form" @submit.prevent="applySearch">
        <SearchInput
          ref="librarySearchRef"
          v-model="keyword"
          :history-key="SEARCH_HISTORY_KEYS.library"
          variant="pill"
          show-search-icon
          placeholder="搜索音乐库：歌曲 / 歌手 / 专辑 / 歌单"
          @clear="clearSearch"
          @select="applySearch"
        />
      </form>
      <button type="button" class="btn-ghost btn-sm" :disabled="libraryScanning" @click="refreshLibrary">
        {{ scanButtonLabel }}
      </button>
      <button type="button" class="btn-primary btn-sm" @click="openCreatePlaylist">创建歌单</button>
    </div>
    <div v-if="scanSummary || showScanStatus" class="library-scan-summary">
      <span v-if="scanSummary" class="library-scan-summary-main">
        {{ scanSummary }}
        <router-link to="/settings" class="library-scan-link">管理目录</router-link>
      </span>
      <span
        v-if="showScanStatus"
        class="library-scan-status"
        role="status"
        :aria-label="scanStatusHint"
      >{{ scanStatusHint }}</span>
    </div>

    <section class="daily-mix">
      <div class="daily-mix-copy">
        <div class="daily-mix-kicker">Daily Mix</div>
        <h2 class="daily-mix-title">
          每日推荐
          <span class="daily-mix-date">{{ dailyMix.dateLabel || '今天' }}</span>
        </h2>
        <p class="daily-mix-desc daily-mix-desc--full">{{ dailyMixDesc }}</p>
        <p class="daily-mix-desc daily-mix-desc--short">{{ dailyMixShort }}</p>
        <div class="daily-mix-actions">
          <button type="button" class="daily-play-btn" :disabled="!dailyMix.count" @click="playDailyMix">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="7,4 20,12 7,20"/></svg>
            播放全部
          </button>
          <button
            type="button"
            class="daily-refresh-btn"
            :disabled="dailyRefreshDisabled"
            :aria-label="dailyRefreshLabel"
            @click="onRefreshDailyMix"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.6-6.2"/>
              <polyline points="21 3 21 9 15 9"/>
            </svg>
            {{ dailyRefreshLabel }}
          </button>
          <button
            type="button"
            class="daily-save-btn"
            :class="{ saved: !!dailyMix.savedId }"
            :disabled="!dailyMix.count"
            :aria-label="dailyMix.savedId ? '已收藏' : '收藏歌单'"
            @click="saveDailyMix"
          >
            <svg class="daily-save-icon" viewBox="0 0 24 24" width="16" height="16" :fill="dailyMix.savedId ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
              <path d="M6 4h12v16l-6-3.4L6 20V4z"/>
            </svg>
            <span class="daily-save-label">{{ dailyMix.savedId ? '已收藏' : '收藏歌单' }}</span>
          </button>
        </div>
      </div>
      <div class="daily-mix-bars" aria-hidden="true">
        <span v-for="n in 7" :key="n"></span>
      </div>
    </section>

    <section class="reco-section">
      <div class="section-head">
        <h2>推荐歌单</h2>
      </div>
      <div class="reco-grid">
        <button
          v-for="card in recoPlaylists"
          :key="card.id"
          type="button"
          class="reco-card"
          :class="[`tone-${card.tone}`, { locked: card.locked }]"
          @click="openRecoPlaylist(card)"
        >
          <span class="reco-icon" aria-hidden="true">
            <svg v-if="card.locked" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="5" y="11" width="14" height="10" rx="2"/>
              <path d="M8 11V8a4 4 0 0 1 8 0v3"/>
            </svg>
            <svg v-else-if="card.icon === 'flame'" viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M12 2s4 4.2 4 8.2c0 2.2-1.2 4-3.1 5 .4-1.6.2-3.2-.7-4.5-1.4 2.1-3.2 3.6-3.2 6.3 0 2.5 2 4.5 4.5 4.5s4.5-2 4.5-5.2C18 10.2 12 2 12 2z"/>
            </svg>
            <svg v-else-if="card.icon === 'night'" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M21 12.8A8.2 8.2 0 1 1 11.2 3 6.6 6.6 0 0 0 21 12.8z"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="3" y="11" width="18" height="8" rx="2"/>
              <path d="M5 11 8 6h8l3 5"/>
              <circle cx="7.5" cy="19" r="1.6"/><circle cx="16.5" cy="19" r="1.6"/>
            </svg>
          </span>
          <span class="reco-meta">
            <span class="reco-name">{{ card.name }}</span>
            <span class="reco-sub">{{ card.subtitle }}</span>
          </span>
        </button>
      </div>
    </section>

    <section class="playlist-row-wrap">
      <div class="section-head">
        <h2>歌单</h2>
        <div class="section-head-actions">
          <AppSelect
            v-model="playlistSort"
            :options="playlistSortOptions"
            title="歌单排序"
            size="sm"
          />
          <button
            v-if="showPlaylistMoreBtn"
            type="button"
            class="section-more-btn"
            :class="{ expanded: showAllPlaylistCards }"
            @click="showAllPlaylistCards = !showAllPlaylistCards"
          >
            <span>{{ showAllPlaylistCards ? '收起' : '更多' }}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <button
            v-else-if="isNarrow && sortedPlaylistCards.length"
            type="button"
            class="section-more-btn"
            @click="openAllPlaylists"
          >
            <span>全部</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
      <div class="horizontal-scroll playlist-scroll">
        <div ref="playlistGridEl" class="playlist-row">
          <button
            v-for="card in visiblePlaylistCards"
            :key="card.id"
            class="playlist-card"
            @click="openPlaylist(card)"
          >
            <PlaylistCover
              :size="isNarrow ? 'compact' : 'row'"
              :cover-style="card.coverStyle"
              :cover-url="card.coverUrl"
              :cover-urls="card.coverUrls"
              :gradient="card.gradient"
              :icon="card.icon"
              :name="card.name"
              :count="card.count"
              :show-meta="!isNarrow"
            />
          </button>
        </div>
      </div>
    </section>

    <section class="genre-section" v-if="visibleGenres.length">
      <div class="section-head">
        <h2>音乐风格</h2>
        <div class="section-head-actions">
          <button
            type="button"
            class="section-more-btn"
            title="查看全部风格"
            @click="openAllGenres"
          >
            <span>所有风格</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
      <div class="horizontal-scroll genre-scroll">
        <div class="genre-pill-row">
          <button
            v-for="genre in visibleGenres"
            :key="genre.id"
            type="button"
            class="genre-pill"
            :style="genrePillStyle(genre)"
            @click="openGenre(genre)"
          >
            <span class="genre-pill-name">{{ genre.name }}</span>
            <span class="genre-pill-play" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>
            </span>
          </button>
        </div>
      </div>
    </section>

    <section class="artist-section" v-if="visibleArtists.length">
      <div class="section-head">
        <h2>歌手</h2>
        <div class="section-head-actions">
          <button
            type="button"
            class="section-more-btn"
            title="查看全部歌手"
            @click="openAllArtists"
          >
            <span>所有歌手</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
      <div class="horizontal-scroll artist-scroll">
        <div class="artist-pill-row">
          <button
            v-for="artist in visibleArtists"
            :key="artist.id"
            type="button"
            class="artist-pill"
            @click="openArtist(artist)"
          >
            <span class="artist-pill-name">{{ artist.name }}</span>
            <span class="artist-pill-meta">{{ artist.trackCount }} 首</span>
            <span class="artist-pill-play" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>
            </span>
          </button>
        </div>
      </div>
    </section>

    <section class="album-section" v-if="sortedDisplayAlbums.length">
      <div class="section-head">
        <h2>最近添加专辑</h2>
        <div class="section-head-actions">
          <AppSelect
            v-model="albumSort"
            :options="albumSortOptions"
            title="专辑排序"
            size="sm"
          />
          <button
            type="button"
            class="section-more-btn"
            title="查看全部专辑"
            @click="openAllAlbums"
          >
            <span>所有专辑</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
      <div class="album-row">
        <button
          v-for="album in visibleAlbums"
          :key="album.id"
          class="album-card"
          @click="openAlbum(album)"
        >
          <div class="album-cover">
            <CoverArt :src="album.cover" />
          </div>
          <div class="album-name" :title="album.name">{{ album.name }}</div>
          <div class="album-artist" :title="album.artist">{{ album.artist }}</div>
          <div class="album-tags" v-if="formatAlbumTags(album)">{{ formatAlbumTags(album) }}</div>
        </button>
      </div>
    </section>

    <section class="song-section">
      <div class="section-head">
        <h2>歌曲</h2>
        <div class="section-head-actions">
          <AppSelect
            v-model="songSort"
            :options="songSortOptions"
            title="歌曲排序"
            size="sm"
          />
          <span class="song-total" v-if="sortedFilteredSongs.length">{{ sortedFilteredSongs.length }} 首</span>
        </div>
      </div>

      <div v-if="libraryLoading && !libraryTracks.length" class="library-loading card">正在扫描音乐库… {{ loadProgress }}</div>
      <div v-else-if="!libraryTracks.length" class="empty card">
        <p>暂无本地音乐</p>
        <p class="empty-hint">请先在「设置 → 文件路径」添加音乐库目录</p>
        <router-link to="/settings" class="btn-ghost btn-sm">打开设置</router-link>
      </div>
      <template v-else>
        <div v-if="libraryMetaLoading" class="library-meta-loading">
          <span>{{ loadProgress || '正在更新标签…' }}</span>
          <span v-if="libraryScanTotal > 0" class="library-meta-loading-pct">{{ libraryScanPercent }}%</span>
        </div>
        <div class="song-grid" :class="'song-cols-' + songColumns">
          <div
            v-for="song in pagedSongs"
            :key="song.key"
            class="song-item"
            :class="{ active: isPlayingSong(song), hovered: hoverKey === song.key }"
            @mouseenter="hoverKey = song.key"
            @mouseleave="hoverKey = ''"
            @dblclick="playSong(song)"
          >
            <button
              class="song-cover-btn"
              :class="{ rippling: tappingSongKey === song.key }"
              @click="onSongCoverClick(song)"
            >
              <div class="song-cover-media">
                <CoverArt :src="song.picUrl || song.img" />
              </div>
              <span class="song-cover-ripple" aria-hidden="true" />
              <span
                class="song-play-overlay"
                v-if="showCoverOverlay(song)"
              >
                <svg v-if="isCoverPauseIcon(song)" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="5" width="4" height="14" rx="1"/>
                  <rect x="14" y="5" width="4" height="14" rx="1"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <polygon points="7,3 21,12 7,21"/>
                </svg>
              </span>
            </button>
            <div class="song-meta">
              <div class="song-title" :title="song.name">{{ song.name }}</div>
              <TrackMetaLinks
                class="song-artist"
                :singer="song.singer"
                :album="song.album"
              />
              <div class="song-tags" :title="formatTrackTags({ ...song, album: '' })">{{ formatTrackTags({ ...song, album: '' }) }}</div>
            </div>
            <MobileRowActions
              :open="actionsOpenKey === song.key"
              @toggle="toggleRowActions(song.key)"
              @close="actionsOpenKey = ''"
            >
              <button
                type="button"
                class="icon-action-btn"
                title="加入试听列表"
                @click.stop="addToQueueSong(song)"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <button
                type="button"
                class="icon-action-btn"
                title="加入歌单"
                @click.stop="openPickPlaylist(song)"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15V6"/><path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/><path d="M12 12H3"/><path d="M16 6H3"/><path d="M12 18H3"/></svg>
              </button>
              <button
                type="button"
                class="icon-action-btn"
                :class="{ 'fav-active': isFavorite(song) }"
                :title="isFavorite(song) ? '取消收藏' : '收藏'"
                @click.stop="toggleFavorite(song)"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" :fill="isFavorite(song) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </button>
            </MobileRowActions>
          </div>
        </div>
        <div class="pager" v-if="totalPages > 1">
          <button class="btn-ghost btn-sm" :disabled="page <= 1" @click="page--">上一页</button>
          <span>{{ page }} / {{ totalPages }}</span>
          <button class="btn-ghost btn-sm" :disabled="page >= totalPages" @click="page++">下一页</button>
        </div>
      </template>
    </section>

    <div v-if="toast" class="toast" :class="toast.type">{{ toast.text }}</div>

    <CreatePlaylistModal
      v-if="showCreateModal"
      :api="api"
      @close="showCreateModal = false"
      @created="onPlaylistCreated"
      @imported="onPlaylistImported"
    />

    <PickPlaylistModal
      v-if="pickPlaylistTrack"
      :track="pickPlaylistTrack"
      source="local"
      @close="pickPlaylistTrack = null"
      @added="onAddedToPlaylist"
    />

    <ConfirmModal
      :open="dailyRefreshTipOpen"
      mode="alert"
      title="每日推荐刷新次数"
      message="每天最多可换一批 20 次。不喜欢当前推荐时可以更换；用完后将继续播放当前这一批。"
      :hint="`本次确认后今日还剩 ${Math.max(0, dailyRefreshUi.remaining - 1)} 次。`"
      confirm-text="知道了，换一批"
      @confirm="confirmDailyRefreshTip"
      @cancel="dailyRefreshTipOpen = false"
    />

  </div>
</template>

<script setup>
defineOptions({ name: 'Library' })
import { ref, computed, watch, onMounted, onUnmounted, onActivated } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api.js'
import PlaylistCover from '../components/PlaylistCover.vue'
import CoverArt from '../components/CoverArt.vue'
import MobileRowActions from '../components/MobileRowActions.vue'
import TrackMetaLinks from '../components/TrackMetaLinks.vue'
import CreatePlaylistModal from '../components/CreatePlaylistModal.vue'
import PickPlaylistModal from '../components/PickPlaylistModal.vue'
import ConfirmModal from '../components/ConfirmModal.vue'
import AppSelect from '../components/AppSelect.vue'
import SearchInput from '../components/SearchInput.vue'
import { SEARCH_HISTORY_KEYS } from '../composables/useSearchHistory.js'
import { formatTrackTags, formatAlbumTags } from '../utils/format.js'
import { getTrackFilePath } from '../utils/trackPath.js'
import { countAutoFillColumns } from '../utils/grid.js'
import { playItem, addToQueue, isInQueue, isPlayingItem, isPaused, startPlayTracks } from '../stores/player.js'
import {
  libraryTracks, libraryTrackTotal, libraryLoading, libraryMetaLoading, libraryLoadProgress,
  libraryScanning, libraryScanPhase, libraryScanCurrent, libraryScanTotal, libraryScanPercent,
  getGenreTheme, buildPlaylistCards, sortPlaylistCards,
  sortLibrarySongs,
  PLAYLIST_SORT_OPTIONS, ALBUM_SORT_OPTIONS, SONG_SORT_OPTIONS,
  scanLibrary, isFavorite, toggleFavorite,
  librarySongColumns, loadLibrarySongColumns,
  fetchLibraryTracksPage, fetchLibraryArtists, fetchLibraryAlbums, fetchLibraryGenres,
  libraryBrowseRevision,
  loadPlaylistCardsFromServer,
  rebuildPlaylistCardsLocal,
  playlistCardsRevision,
  refreshLibraryTrackTotal,
  setLibraryTrackTotal,
} from '../stores/library.js'
import {
  dailyMix,
  dailyMixDesc,
  dailyRefreshUi,
  recoPlaylists,
  refreshLibraryMix,
  saveDailyMixPlaylist,
  loadNetworkPlaylistTracks,
  regenerateDailyMix,
  peekDailyRefreshGate,
  markDailyRefreshWarned,
  DAILY_REFRESH_COOLDOWN_SEC,
} from '../stores/libraryMix.js'

const dailyMixShort = computed(() => {
  const mix = dailyMix.value
  if (!mix.count) return '本地 + 平台约各一半'
  const onlineN = (mix.tracks || []).filter((t) => t?.source && t.source !== 'local' && !t.filePath && !t.localPath).length
  const bits = [`${mix.count} 首`]
  if (onlineN) bits.push(`平台 ${onlineN}`)
  bits.push(`还可换 ${dailyRefreshUi.value.remaining} 次`)
  return bits.join(' · ')
})

const dailyRefreshTipOpen = ref(false)
let dailyRefreshCooldownTimer = 0

const dailyRefreshLabel = computed(() => {
  const ui = dailyRefreshUi.value
  if (ui.busy) return '生成中…'
  if (ui.cooldownLeft > 0) return `${ui.cooldownLeft}s`
  if (ui.remaining <= 0) return '今日已用完'
  return '换一批'
})

const dailyRefreshDisabled = computed(() => {
  const ui = dailyRefreshUi.value
  return !dailyMix.value.count || ui.busy || ui.cooldownLeft > 0 || ui.remaining <= 0
})

function startDailyRefreshCooldown(sec = DAILY_REFRESH_COOLDOWN_SEC) {
  if (dailyRefreshCooldownTimer) {
    clearInterval(dailyRefreshCooldownTimer)
    dailyRefreshCooldownTimer = 0
  }
  dailyRefreshUi.value = { ...dailyRefreshUi.value, cooldownLeft: sec }
  dailyRefreshCooldownTimer = window.setInterval(() => {
    const left = Math.max(0, (dailyRefreshUi.value.cooldownLeft || 0) - 1)
    dailyRefreshUi.value = { ...dailyRefreshUi.value, cooldownLeft: left }
    if (left <= 0) {
      clearInterval(dailyRefreshCooldownTimer)
      dailyRefreshCooldownTimer = 0
    }
  }, 1000)
}

async function runDailyRefreshAndPlay() {
  const res = await regenerateDailyMix()
  if (!res.ok) {
    if (res.reason === 'exhausted') {
      showToast('今日刷新次数已用完，继续播放当前推荐', 'info')
    } else {
      showToast('暂时换不出新推荐，请稍后再试', 'info')
    }
    return
  }
  try {
    await startPlayTracks(res.tracks, '', { dynamic: false })
    showToast(`已换一批并播放（今日还可换 ${res.remaining} 次）`, 'success')
  } catch (e) {
    showToast(e?.message || '播放失败', 'error')
  }
  startDailyRefreshCooldown()
}

async function onRefreshDailyMix() {
  const gate = peekDailyRefreshGate()
  if (gate.exhausted) {
    showToast('今日刷新次数已用完，继续播放当前推荐', 'info')
    return
  }
  if (gate.needQuotaTip) {
    dailyRefreshTipOpen.value = true
    return
  }
  await runDailyRefreshAndPlay()
}

async function confirmDailyRefreshTip() {
  dailyRefreshTipOpen.value = false
  markDailyRefreshWarned()
  await runDailyRefreshAndPlay()
}

const PLAYLIST_SORT_KEY = 'lemon-library-playlist-sort'
const ALBUM_SORT_KEY = 'lemon-library-album-sort'
const SONG_SORT_KEY = 'lemon-library-song-sort'

const route = useRoute()
const router = useRouter()
const librarySearchRef = ref(null)
const keyword = ref('')
const page = ref(1)
const pageSize = 20
const hoverKey = ref('')
const actionsOpenKey = ref('')

function toggleRowActions(key) {
  actionsOpenKey.value = actionsOpenKey.value === key ? '' : key
}
const tappingSongKey = ref('')
const coverPendingPauseKey = ref('')
const toast = ref(null)
const loadProgress = libraryLoadProgress
const songColumns = computed(() => librarySongColumns.value)
const scanButtonLabel = computed(() => {
  if (!libraryScanning.value) return '刷新库'
  if (libraryScanPhase.value === 'tags' && libraryScanTotal.value > 0) {
    return `扫描中 ${libraryScanCurrent.value}/${libraryScanTotal.value}`
  }
  return '扫描中…'
})
const scanStatusHint = computed(() => {
  if (libraryScanPhase.value === 'tags' && libraryScanTotal.value > 0) {
    return `读取标签 ${libraryScanCurrent.value}/${libraryScanTotal.value}（${libraryScanPercent.value}%）`
  }
  return loadProgress.value || ''
})
const showScanStatus = computed(() => libraryScanning.value && !!scanStatusHint.value)

function notifyScanComplete(result, { force = false } = {}) {
  if (!result) return
  const total = result.totalTracks || 0
  if (force) {
    showToast(total ? `音乐库已刷新，共 ${total} 首` : '音乐库已刷新', 'success')
    return
  }
  if (result.hadPending) {
    showToast(total ? `扫描完成，共 ${total} 首` : '扫描完成', 'success')
  }
}
const showCreateModal = ref(false)
const pickPlaylistTrack = ref(null)
const scanSummary = ref('')
const showAllPlaylistCards = ref(false)
const playlistGridEl = ref(null)
const playlistCols = ref(4)
const PLAYLIST_GRID_ROWS = 2
const playlistPreviewLimit = computed(() => Math.max(PLAYLIST_GRID_ROWS, playlistCols.value * PLAYLIST_GRID_ROWS))
const playlistSort = ref(localStorage.getItem(PLAYLIST_SORT_KEY) || 'default')
const albumPreviewLimit = 12
const albumPreviewLimitMobile = 4
const albumSort = ref(localStorage.getItem(ALBUM_SORT_KEY) || 'recent')
const songSort = ref(localStorage.getItem(SONG_SORT_KEY) || 'recent')
const isNarrow = ref(false)
let narrowMq = null
let playlistGridRo = null

function updatePlaylistCols() {
  const w = playlistGridEl.value?.clientWidth || 0
  playlistCols.value = countAutoFillColumns(w, { minSize: 260, gap: 18 })
}

function updateNarrow() {
  isNarrow.value = narrowMq?.matches ?? window.innerWidth <= 768
}

const genrePreviewLimit = 16
const previewArtists = ref([])
const previewAlbums = ref([])
const previewGenres = ref([])
const playlistCards = ref([])
const songTotal = ref(0)
const songsLoading = ref(false)

const allGenres = computed(() => previewGenres.value)
const visibleGenres = computed(() => allGenres.value.slice(0, genrePreviewLimit))

const artistPreviewLimit = 20
const allArtists = computed(() => previewArtists.value)
const visibleArtists = computed(() => allArtists.value.slice(0, artistPreviewLimit))

const allAlbums = computed(() => previewAlbums.value)
const playlistSortOptions = computed(() => PLAYLIST_SORT_OPTIONS.map(o => ({ value: o.id, label: o.label })))
const albumSortOptions = computed(() => ALBUM_SORT_OPTIONS.map(o => ({ value: o.id, label: o.label })))
const songSortOptions = computed(() => SONG_SORT_OPTIONS.map(o => ({ value: o.id, label: o.label })))
const allPlaylistCards = computed(() => playlistCards.value)
const sortedPlaylistCards = computed(() =>
  sortPlaylistCards(allPlaylistCards.value, playlistSort.value).filter((c) => !c.hidden)
)
const visiblePlaylistCards = computed(() => {
  if (isNarrow.value) return sortedPlaylistCards.value
  return showAllPlaylistCards.value
    ? sortedPlaylistCards.value
    : sortedPlaylistCards.value.slice(0, playlistPreviewLimit.value)
})
const showPlaylistMoreBtn = computed(() => (
  !isNarrow.value && sortedPlaylistCards.value.length > playlistPreviewLimit.value
))

const displayAlbums = computed(() => allAlbums.value)
const sortedDisplayAlbums = computed(() => displayAlbums.value)
const visibleAlbums = computed(() => {
  const limit = isNarrow.value ? albumPreviewLimitMobile : albumPreviewLimit
  return sortedDisplayAlbums.value.slice(0, limit)
})

const filteredSongs = computed(() => libraryTracks.value)
const sortedFilteredSongs = computed(() => sortLibrarySongs(filteredSongs.value, songSort.value))

const totalPages = computed(() => Math.max(1, Math.ceil((songTotal.value || libraryTrackTotal.value || 0) / pageSize)))
const pagedSongs = computed(() => sortedFilteredSongs.value)

async function loadSongPage() {
  songsLoading.value = true
  try {
    const sortMap = { recent: 'mtime', title: 'title', artist: 'artist', album: 'album' }
    const res = await fetchLibraryTracksPage(api, {
      page: page.value,
      limit: pageSize,
      sort: sortMap[songSort.value] || 'mtime',
      replace: true,
      // 若已跳到歌手/专辑页，勿用全库 total 冲掉栏目角标
      syncNavBadge: route.path === '/library' || route.path === '/library/',
    })
    songTotal.value = res.total
    if (route.path === '/library' || route.path === '/library/') {
      if (res.total > 0) setLibraryTrackTotal(res.total)
      else refreshLibraryTrackTotal(api).catch(() => {})
    }
  } catch {
    /* 保留已有工作集 */
  } finally {
    songsLoading.value = false
  }
}

async function loadBrowsePreviews() {
  try {
    const [artistsRes, albumsRes, genresRes, cards] = await Promise.all([
      fetchLibraryArtists(api, { page: 1, limit: artistPreviewLimit, sort: 'count' }),
      fetchLibraryAlbums(api, {
        page: 1,
        limit: Math.max(albumPreviewLimit, albumPreviewLimitMobile),
        sort: albumSort.value === 'name' ? 'name' : (albumSort.value === 'artist' ? 'artist' : 'recent'),
      }),
      fetchLibraryGenres(api, { page: 1, limit: genrePreviewLimit, sort: 'count' }),
      loadPlaylistCardsFromServer(api).catch(() => buildPlaylistCards([])),
    ])
    previewArtists.value = artistsRes.items
    previewAlbums.value = albumsRes.items
    previewGenres.value = genresRes.items
    playlistCards.value = cards
  } catch {
    previewArtists.value = []
    previewAlbums.value = []
    previewGenres.value = []
  }
}
watch(playlistCardsRevision, () => {
  if (!playlistCards.value.length) return
  playlistCards.value = rebuildPlaylistCardsLocal(playlistCards.value)
})

watch(playlistSort, (value) => {
  try { localStorage.setItem(PLAYLIST_SORT_KEY, value) } catch {}
  showAllPlaylistCards.value = false
  loadBrowsePreviews()
})

watch(albumSort, (value) => {
  try { localStorage.setItem(ALBUM_SORT_KEY, value) } catch {}
  loadBrowsePreviews()
})

watch(libraryBrowseRevision, () => {
  loadBrowsePreviews()
  loadSongPage()
  loadScanSummary()
  refreshLibraryMix().catch(() => {})
})

watch(songSort, (value) => {
  try { localStorage.setItem(SONG_SORT_KEY, value) } catch {}
  page.value = 1
  loadSongPage()
})

watch(page, () => {
  loadSongPage()
})

async function loadScanSummary() {
  try {
    const res = await api.paths.stats()
    const d = res.data
    if (!d?.musicDirs) {
      scanSummary.value = ''
      return
    }
    if (!d.totalTracks) {
      scanSummary.value = `已配置 ${d.musicDirs} 个音乐库目录，暂未发现音频文件`
      return
    }
    const dirHint = (d.dirs || [])
      .filter(x => x.readable && x.count > 0)
      .map(x => `${shortPath(x.path)} ${x.count} 首`)
      .join('；')
    scanSummary.value = dirHint
      ? `扫描 ${d.musicDirs} 个目录，共 ${d.totalTracks} 首：${dirHint}`
      : `扫描 ${d.musicDirs} 个目录，共 ${d.totalTracks} 首歌曲`
  } catch {
    scanSummary.value = ''
  }
}

function shortPath(p) {
  const s = String(p || '')
  if (s.length <= 36) return s
  return '…' + s.slice(-34)
}

onMounted(() => {
  narrowMq = window.matchMedia('(max-width: 768px)')
  updateNarrow()
  narrowMq.addEventListener('change', updateNarrow)
  if (typeof ResizeObserver !== 'undefined') {
    playlistGridRo = new ResizeObserver(() => updatePlaylistCols())
    if (playlistGridEl.value) playlistGridRo.observe(playlistGridEl.value)
  }
  updatePlaylistCols()
  loadLibrarySongColumns(api).catch(() => {})
  loadScanSummary()
  loadBrowsePreviews()
  loadSongPage()
  refreshLibraryMix().catch(() => {})
  scanLibrary(api, {
    resync: true,
    onError: (msg) => showToast(msg, 'error'),
    onComplete: (result, meta) => {
      loadScanSummary()
      loadBrowsePreviews()
      loadSongPage()
      refreshLibraryMix().catch(() => {})
      notifyScanComplete(result, meta)
    },
  }).catch(() => {})
})

onActivated(() => {
  // keep-alive 从歌手/专辑页返回：校正侧栏角标，并刷新首页歌曲总数展示
  refreshLibraryTrackTotal(api).then((n) => {
    if (n > 0) songTotal.value = n
  }).catch(() => {})
  loadSongPage()
})

onUnmounted(() => {
  narrowMq?.removeEventListener('change', updateNarrow)
  playlistGridRo?.disconnect()
  playlistGridRo = null
  if (dailyRefreshCooldownTimer) {
    clearInterval(dailyRefreshCooldownTimer)
    dailyRefreshCooldownTimer = 0
  }
})

async function refreshLibrary() {
  try {
    const result = await scanLibrary(api, {
      force: true,
      scanAll: true,
      onComplete: (r, meta) => notifyScanComplete(r, meta),
    })
    await loadScanSummary()
    refreshLibraryMix().catch(() => {})
    if (!result) showToast('正在扫描中，请稍候', 'info')
  } catch {}
}

function applySearch() {
  librarySearchRef.value?.remember?.()
  const q = keyword.value.trim()
  if (!q) return
  router.push({ path: '/library/search', query: { q } })
}

function clearSearch() {
  keyword.value = ''
}

function trackPayload(song) {
  const filePath = getTrackFilePath(song)
  return {
    key: song.key || (filePath ? `local:${filePath}` : ''),
    name: song.name,
    singer: song.singer,
    album: song.album,
    localPath: filePath,
    filePath,
    source: 'local',
    picUrl: song.picUrl,
    lyric: song.lyric,
  }
}

function isPlayingSong(song) {
  return isPlayingItem(trackPayload(song)) && !isPaused.value
}

function isCurrentSong(song) {
  return isPlayingItem(trackPayload(song))
}

function showCoverOverlay(song) {
  return isNarrow.value || hoverKey.value === song.key || isCurrentSong(song)
}

function isCoverPauseIcon(song) {
  if (coverPendingPauseKey.value === song.key) return true
  if (!isCurrentSong(song)) return false
  return !isPaused.value
}

async function playSong(song) {
  try {
    await playItem(trackPayload(song), 'local')
  } catch (e) {
    showToast(e.message || '播放失败', 'error')
  }
}

async function onSongCoverClick(song) {
  const key = song?.key || ''
  const payload = trackPayload(song)
  tappingSongKey.value = key
  setTimeout(() => {
    if (tappingSongKey.value === key) tappingSongKey.value = ''
  }, 560)

  if (isCurrentSong(song) && !isPaused.value) {
    coverPendingPauseKey.value = ''
  } else {
    coverPendingPauseKey.value = key
  }

  try {
    await playSong(song)
  } finally {
    if (coverPendingPauseKey.value === key) coverPendingPauseKey.value = ''
  }
}

function openAlbum(album) {
  if (!album?.id) return
  router.push({ path: '/library/album', query: { id: album.id } })
}

function openGenre(genre) {
  if (!genre?.id) return
  router.push({ path: '/library/genre', query: { id: genre.id } })
}

function openAllGenres() {
  router.push({ path: '/library/genres' })
}

function openArtist(artist) {
  if (!artist?.id) return
  router.push({ path: '/library/artist', query: { id: artist.id } })
}

function openAllArtists() {
  router.push({ path: '/library/artists' })
}

function openAllAlbums() {
  router.push({ path: '/library/albums' })
}

function genrePillStyle(genre) {
  const theme = genre.theme || getGenreTheme(genre.name)
  return {
    borderColor: theme.border,
    background: theme.bg,
    '--genre-accent': theme.border,
  }
}

function addToQueueSong(song) {
  const track = trackPayload(song)
  if (isInQueue(track, 'local')) {
    showToast('已在试听列表', 'info')
    return
  }
  addToQueue(track, 'local')
  showToast(`已加入列表: ${song.name}`, 'success')
}

function openPickPlaylist(song) {
  pickPlaylistTrack.value = trackPayload(song)
}

function onAddedToPlaylist({ playlist, duplicate }) {
  pickPlaylistTrack.value = null
  if (duplicate) showToast('歌曲已在歌单中', 'info')
  else showToast(`已加入歌单：${playlist?.name || ''}`, 'success')
}

async function playDailyMix() {
  if (!dailyMix.value.tracks.length) {
    showToast('暂无可播放的每日推荐', 'info')
    return
  }
  try {
    await startPlayTracks(dailyMix.value.tracks, '', { dynamic: false })
    showToast(`正在播放每日推荐 ${dailyMix.value.count} 首`, 'success')
  } catch (e) {
    showToast(e?.message || '播放失败', 'error')
  }
}

function saveDailyMix() {
  const pl = saveDailyMixPlaylist()
  if (!pl) {
    showToast('暂无可收藏的每日推荐', 'info')
    return
  }
  loadBrowsePreviews()
  showToast(`已收藏到歌单「${pl.name}」`, 'success')
}

async function openRecoPlaylist(card) {
  if (card?.locked) {
    showToast('深夜电台将在晚间 22:00 后生成', 'info')
    return
  }
  if (card?.network?.id) {
    showToast('正在获取网络歌单…', 'info')
    try {
      const tracks = await loadNetworkPlaylistTracks(card)
      if (!tracks.length) {
        showToast('网络歌单暂无曲目', 'info')
        return
      }
      await startPlayTracks(tracks, card.network.source, { dynamic: false })
      showToast(`正在播放「${card.network.name}」${tracks.length} 首`, 'success')
    } catch (e) {
      showToast(e?.message || '获取网络歌单失败', 'error')
    }
    return
  }
  if (!card?.tracks?.length) {
    showToast('曲库曲目不足，暂时无法生成该歌单', 'info')
    return
  }
  try {
    await startPlayTracks(card.tracks, 'local', { dynamic: false })
    showToast(`正在播放「${card.name}」${card.tracks.length} 首`, 'success')
  } catch (e) {
    showToast(e?.message || '播放失败', 'error')
  }
}

function openPlaylist(card) {
  // 漫游播放入口：进入歌单页后自动开播
  if (card?.id === 'random-start') {
    router.push({ path: '/library/playlists', query: { id: 'random-start' } })
    return
  }
  router.push({ path: '/library/playlists', query: { id: card.id } })
}

function openAllPlaylists() {
  router.push({ path: '/library/playlists' })
}

function onPlaylistCreated({ playlist }) {
  showCreateModal.value = false
  showToast(`已创建歌单：${playlist.name}`, 'success')
  router.push({ path: '/library/playlists', query: { id: playlist.id } })
}

function onPlaylistImported({ playlist, total, localMatched }) {
  showCreateModal.value = false
  const localText = localMatched > 0 ? `，已匹配本地 ${localMatched} 首` : ''
  showToast(`已导入 ${total} 首歌曲${localText}`, 'success')
  if (playlist?.id) {
    router.push({ path: '/library/playlists', query: { id: playlist.id } })
  }
}

function openCreatePlaylist() {
  showCreateModal.value = true
}

function showToast(text, type = 'info') {
  toast.value = { text, type }
  setTimeout(() => { toast.value = null }, 2800)
}

</script>

<style scoped>
.library-page {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: hidden;
}

.library-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
  min-width: 0;
}
.library-scan-summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin: 0 0 18px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
  min-width: 0;
}
.library-scan-summary-main {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.library-scan-status {
  flex-shrink: 0;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--text-muted);
}
.library-scan-link {
  margin-left: 8px;
  color: var(--accent);
  text-decoration: none;
}
.library-scan-link:hover { text-decoration: underline; }

.daily-mix {
  --daily-play: #e6392f;
  position: relative;
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 24px;
  margin: 0 0 22px;
  padding: 24px;
  min-height: 168px;
  border-radius: 24px;
  overflow: hidden;
  isolation: isolate;
  border: 1px solid #232329;
  background: linear-gradient(90deg, #2c1113 0%, #1a1418 50%, #121218 100%);
  color: #fff;
}
.daily-mix-copy,
.daily-mix-bars {
  position: relative;
  z-index: 1;
}
.daily-mix-copy { min-width: 0; flex: 1; }
.daily-mix-kicker {
  font-size: 11px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: #f0453c;
  font-weight: 600;
}
.daily-mix-title {
  margin: 8px 0 6px;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: 0.02em;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 10px;
}
.daily-mix-date {
  font-size: 15px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.82);
}
.daily-mix-desc {
  margin: 0 0 20px;
  max-width: 520px;
  font-size: 13px;
  line-height: 1.65;
  color: #9a9aa5;
}
.daily-mix-desc--short { display: none; }
.daily-save-icon { display: none; }
.daily-mix-actions { display: flex; flex-wrap: wrap; gap: 12px; }
.daily-play-btn,
.daily-refresh-btn,
.daily-save-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 20px;
  border-radius: 999px;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
}
.daily-play-btn {
  border: 0;
  color: #fff;
  background: #e6392f;
}
.daily-play-btn:hover { background: #f0453c; }
.daily-refresh-btn {
  border: 1px solid #3a3a44;
  color: #f2f2f6;
  background: rgba(255, 255, 255, 0.06);
  min-width: 7.5em;
  justify-content: center;
}
.daily-refresh-btn:hover:not(:disabled) {
  border-color: #50505c;
  background: rgba(255, 255, 255, 0.1);
}
.daily-save-btn {
  border: 1px solid #2f2f38;
  color: #c8c8d2;
  background: transparent;
}
.daily-save-btn:hover {
  border-color: #3d3d48;
  color: #fff;
  background: transparent;
}
.daily-save-btn.saved { color: #f0453c; border-color: #3d3d48; }
.daily-play-btn:disabled,
.daily-refresh-btn:disabled,
.daily-save-btn:disabled { opacity: 0.45; cursor: default; }
.daily-mix-bars {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 8px 4px 0;
  flex-shrink: 0;
  min-height: 112px;
}
.daily-mix-bars span {
  display: block;
  width: 8px;
  border-radius: 99px;
  transform-origin: center center;
  animation: daily-bar 1.1s ease-in-out infinite alternate;
}
.daily-mix-bars span:nth-child(1) { height: 36px; background: #7a2428; animation-delay: 0.00s; }
.daily-mix-bars span:nth-child(2) { height: 72px; background: #c43a32; animation-delay: 0.08s; }
.daily-mix-bars span:nth-child(3) { height: 52px; background: #e24a3a; animation-delay: 0.16s; }
.daily-mix-bars span:nth-child(4) { height: 88px; background: #f0453c; animation-delay: 0.24s; }
.daily-mix-bars span:nth-child(5) { height: 64px; background: #ff6a52; animation-delay: 0.32s; }
.daily-mix-bars span:nth-child(6) { height: 108px; background: #ff7a5c; animation-delay: 0.40s; }
.daily-mix-bars span:nth-child(7) { height: 44px; background: #8a2c2c; animation-delay: 0.48s; }
@keyframes daily-bar {
  from { transform: scaleY(0.7); opacity: 0.85; }
  to { transform: scaleY(1); opacity: 1; }
}

.reco-section { margin: 0 0 24px; }
.reco-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.reco-card {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 88px;
  padding: 16px 18px;
  text-align: left;
  border-radius: 16px;
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  color: var(--text);
  cursor: pointer;
}
.reco-card:hover { border-color: color-mix(in srgb, var(--accent) 35%, var(--border-light)); }
.reco-card.locked { opacity: 0.78; }
.reco-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  flex-shrink: 0;
  color: #fff;
}
.reco-card.tone-orange .reco-icon { background: linear-gradient(135deg, #ff8a3d, #e6392f); }
.reco-card.tone-purple .reco-icon { background: linear-gradient(135deg, #7b61ff, #33228f); }
.reco-card.tone-green .reco-icon { background: linear-gradient(135deg, #25c26e, #0f7a46); }
.reco-meta { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.reco-name { font-size: 15px; font-weight: 650; }
.reco-sub { font-size: 12px; color: var(--text-muted); }

.library-search-form {
  flex: 1 1 200px;
  min-width: 0;
  display: flex;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
  min-width: 0;
}
.section-head h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  flex-shrink: 0;
}
.section-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-shrink: 0;
}
.section-head-actions :deep(.app-select) {
  flex-shrink: 0;
  min-width: 88px;
}
.section-more-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.section-more-btn svg {
  width: 14px;
  height: 14px;
  transition: transform 0.2s ease;
}
.section-more-btn.expanded svg { transform: rotate(180deg); }
.section-more-btn:hover {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border-light));
  background: var(--accent-muted);
}

.horizontal-scroll {
  max-width: 100%;
  min-width: 0;
}

.playlist-row-wrap { margin-bottom: 32px; }
.playlist-scroll {
  overflow: visible;
}
.playlist-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 18px;
}
.playlist-card {
  position: relative;
  padding: 0;
  border: none;
  border-radius: 16px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  min-width: 0;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.playlist-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
}

.genre-section { margin-bottom: 28px; }
.genre-scroll {
  overflow: visible;
}
.genre-pill-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.genre-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-radius: 999px;
  border: 1.5px solid;
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.genre-pill:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
}
.genre-pill-name {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.genre-pill-play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--genre-accent, var(--accent));
  opacity: 0.9;
  line-height: 0;
}

.album-section { margin-bottom: 32px; }

.artist-section { margin-bottom: 28px; }
.artist-scroll { overflow: visible; }
.artist-pill-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.artist-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border-radius: 999px;
  border: 1.5px solid var(--border-light);
  background: var(--bg-card, var(--bg-elevated));
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.artist-pill:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  border-color: var(--accent);
}
.artist-pill-name {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.artist-pill-meta {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}
.artist-pill-play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  opacity: 0.9;
  line-height: 0;
}
.album-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
  gap: 22px 18px;
}
.album-card {
  border: none;
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}
.album-cover {
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-elevated);
  margin-bottom: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
}
.album-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.album-cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34px;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-muted);
}
.album-name, .song-title {
  font-size: 16px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.album-artist, .song-artist {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.album-tags, .song-tags {
  margin-top: 5px;
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.92;
}

.song-section { margin-bottom: 24px; min-width: 0; }
.song-total { font-size: 13px; color: var(--text-muted); white-space: nowrap; }
.library-loading, .empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted);
}
.library-meta-loading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-muted);
  background: var(--bg-elevated, rgba(255,255,255,0.04));
  border-radius: 8px;
}
.library-meta-loading-pct {
  font-variant-numeric: tabular-nums;
  color: var(--accent, #60a5fa);
}
.empty-hint { margin: 8px 0 14px; font-size: 13px; }

.song-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 18px;
}
.song-grid.song-cols-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.song-grid.song-cols-4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.song-item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 12px;
  transition: background 0.15s ease;
}
.song-item:hover,
.song-item.active,
.song-item.hovered {
  background: var(--bg-hover);
}
.song-cover-btn {
  position: relative;
  width: 56px;
  height: 56px;
  padding: 0;
  border: none;
  border-radius: 10px;
  overflow: visible;
  flex-shrink: 0;
  background: var(--bg-elevated);
  cursor: pointer;
}
.song-cover-media {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  background: var(--bg-elevated);
}
.song-cover-ripple {
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
.song-cover-btn.rippling .song-cover-ripple {
  animation: song-cover-ripple 0.65s cubic-bezier(0.2, 0.7, 0.2, 1);
}
@keyframes song-cover-ripple {
  0% {
    transform: translate(-50%, -50%) scale(0.35);
    opacity: 0.95;
  }
  100% {
    transform: translate(-50%, -50%) scale(2.2);
    opacity: 0;
  }
}
.song-cover-btn img { width: 100%; height: 100%; object-fit: cover; display: block; }
.song-cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
  color: var(--accent);
}
.song-play-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.42);
  color: #fff;
  z-index: 4;
  transition: background 0.18s ease, backdrop-filter 0.18s ease;
  backdrop-filter: saturate(1);
}
.song-play-overlay svg {
  transition: transform 0.22s ease, opacity 0.18s ease;
}
.song-cover-btn.rippling .song-play-overlay {
  background: color-mix(in srgb, var(--accent) 48%, rgba(0, 0, 0, 0.26));
  backdrop-filter: saturate(1.35);
}
.song-cover-btn.rippling .song-play-overlay svg {
  transform: scale(1.28);
}
.song-meta { min-width: 0; flex: 1; }
.song-actions,
.mobile-row-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  align-items: center;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 18px;
  font-size: 13px;
  color: var(--text-muted);
}


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

@media (max-width: 1200px) {
  .song-grid.song-cols-4 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 1100px) {
  .song-grid.song-cols-3,
  .song-grid.song-cols-4 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .reco-card { min-height: 76px; padding: 12px 14px; gap: 10px; }
  .reco-icon { width: 40px; height: 40px; }
}

@media (max-width: 768px) {
  .daily-mix {
    position: relative;
    align-items: flex-start;
    gap: 0;
    margin: 4px 0 16px;
    padding: 14px 14px 14px 16px;
    min-height: 0;
    border-radius: 16px;
  }
  .daily-mix-kicker { font-size: 10px; letter-spacing: 0.16em; }
  .daily-mix-title {
    margin: 4px 0 4px;
    font-size: 20px;
    line-height: 1.25;
    padding-right: 56px;
  }
  .daily-mix-date { font-size: 13px; }
  .daily-mix-desc--full { display: none; }
  .daily-mix-desc--short {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin: 0 0 12px;
    padding-right: 48px;
    font-size: 12px;
    line-height: 1.45;
  }
  .daily-mix-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    width: auto;
  }
  .daily-play-btn,
  .daily-save-btn {
    height: 28px;
    justify-content: center;
  }
  .daily-play-btn {
    width: auto;
    padding: 0 12px;
    font-size: 12px;
    gap: 4px;
  }
  .daily-play-btn svg { width: 11px; height: 11px; }
  .daily-save-btn { padding: 0; width: 28px; }
  .daily-save-label { display: none; }
  .daily-save-icon { display: block; }
  .daily-mix-bars {
    position: absolute;
    right: 12px;
    top: 14px;
    height: 44px;
    gap: 3px;
    padding: 0;
    pointer-events: none;
  }
  .daily-mix-bars span { width: 3px; }
  .daily-mix-bars span:nth-child(1) { height: 12px; }
  .daily-mix-bars span:nth-child(2) { height: 20px; }
  .daily-mix-bars span:nth-child(3) { height: 28px; }
  .daily-mix-bars span:nth-child(4) { height: 16px; }
  .daily-mix-bars span:nth-child(5) { height: 24px; }
  .daily-mix-bars span:nth-child(6) { height: 32px; }
  .daily-mix-bars span:nth-child(7) { height: 14px; }

  .reco-section { margin: 0 0 18px; }
  .reco-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .reco-card {
    flex-direction: column;
    align-items: flex-start;
    min-height: 0;
    height: 100%;
    padding: 10px 10px 12px;
    gap: 8px;
    border-radius: 14px;
  }
  .reco-icon {
    width: 34px;
    height: 34px;
    border-radius: 10px;
  }
  .reco-icon svg { width: 16px; height: 16px; }
  .reco-meta { width: 100%; gap: 2px; }
  .reco-name {
    font-size: 12px;
    font-weight: 650;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .reco-sub {
    font-size: 10px;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .library-topbar {
    gap: 8px;
  }
  .library-scan-summary {
    gap: 8px;
  }
  .library-scan-summary-main {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .library-search-form {
    flex: 1 1 100%;
  }
  .library-search-form :deep(.clearable-input--pill) {
    height: 42px;
    padding: 0 14px;
  }
  .library-topbar .btn-ghost,
  .library-topbar .btn-primary {
    flex: 1;
    min-width: 0;
    padding: 8px 10px;
    font-size: 13px;
  }

  .section-head {
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .section-head h2 { font-size: 18px; }
  .section-head-actions {
    margin-left: auto;
  }

  .playlist-scroll {
    margin: 0 -14px;
    padding: 0 14px 4px;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }
  .playlist-scroll::-webkit-scrollbar { display: none; }
  .playlist-row {
    display: flex;
    gap: 12px;
    width: max-content;
    min-width: 100%;
  }
  .playlist-card {
    flex: 0 0 112px;
    width: 112px;
    border-radius: 0;
    box-shadow: none;
  }
  .playlist-card:hover {
    transform: none;
    box-shadow: none;
  }

  .genre-section,
  .artist-section { margin-bottom: 16px; }
  .genre-scroll {
    margin: 0 -14px;
    padding: 0 14px 4px;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }
  .genre-scroll::-webkit-scrollbar { display: none; }
  .genre-pill-row {
    flex-wrap: nowrap;
    gap: 6px;
    width: max-content;
    min-width: 100%;
  }
  .genre-pill {
    gap: 4px;
    padding: 4px 10px;
    font-size: 12px;
    border-width: 1px;
  }
  .genre-pill-name { max-width: 96px; }
  .genre-pill-play svg { width: 10px; height: 10px; }

  .artist-scroll {
    margin: 0 -14px;
    padding: 0 14px 4px;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }
  .artist-scroll::-webkit-scrollbar { display: none; }
  .artist-pill-row {
    flex-wrap: nowrap;
    gap: 6px;
    width: max-content;
    min-width: 100%;
  }
  .artist-pill {
    gap: 5px;
    padding: 4px 10px;
    font-size: 12px;
    border-width: 1px;
  }
  .artist-pill-name { max-width: 88px; }
  .artist-pill-meta { font-size: 10px; }
  .artist-pill-play svg { width: 10px; height: 10px; }

  .album-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px 12px;
  }
  .album-cover {
    border-radius: 10px;
    margin-bottom: 8px;
  }
  .album-name { font-size: 14px; }
  .album-artist { font-size: 12px; margin-top: 2px; }
  .album-tags { display: none; }

  .song-grid,
  .song-grid.song-cols-3,
  .song-grid.song-cols-4 {
    grid-template-columns: 1fr;
    gap: 0;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--border-light);
    background: var(--bg-card, var(--bg-elevated));
  }
  .song-item {
    padding: 10px 12px;
    gap: 10px;
    border-radius: 0;
    border-bottom: 1px solid var(--border-light);
  }
  .song-item:last-child { border-bottom: none; }
  .song-item:hover,
  .song-item.active,
  .song-item.hovered {
    background: var(--bg-hover);
  }
  .song-cover-btn {
    width: 48px;
    height: 48px;
    border-radius: 8px;
  }
  .song-title { font-size: 15px; }
  .song-artist { font-size: 12px; }
  .song-tags { display: none; }
  .song-actions,
  .mobile-row-actions { gap: 2px; }
  .song-actions .icon-action-btn,
  .mobile-row-actions .icon-action-btn {
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
