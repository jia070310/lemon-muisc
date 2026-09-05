import { ref, computed } from 'vue'
import { api } from '../api.js'
import { cleanTrackItem } from '../utils/text.js'
import { buildPlayPayload } from '../utils/musicPayload.js'
import { getCachedPlayUrl, setCachedPlayUrl, rememberLoadedPlayUrl, clearCachedPlayUrl } from '../utils/playUrlCache.js'
import { formatUserError } from '../utils/userError.js'
import {
  askSourceFallback,
  getSourceFallbackOffer,
  isSourceFallbackError,
  notifySourceSwitch,
} from './sourceFallback.js'
import { recordRecentPlay, localCoverUrl, bumpLibraryCoverVersion } from './library.js'
import { parseLyric } from '../utils/lrc.js'
import { formatArtists } from '../utils/text.js'
import { getTrackFilePath, isLocalTrack, isSameTrackPath } from '../utils/trackPath.js'
import { withStreamAuth, stripStreamAuth } from '../utils/streamAuth.js'
import { toPlayableCoverUrl } from '../utils/coverDisplay.js'
import {
  parseDurationSeconds as parseClipDuration,
  detectPreviewClip,
  formatPreviewClipMessage,
} from '../utils/audioDuration.js'

export const currentPlaying = ref(null)
export const loadingPlay = ref(null)
export const isPaused = ref(false)
/** 点击播放后、真正开始出声前的缓冲阶段 */
export const isBuffering = ref(false)
export const currentTime = ref(0)
export const duration = ref(0)
export const volume = ref(0.8)
export const isMuted = ref(false)
export const coverUrl = ref('')

function setCoverUrl(url) {
  coverUrl.value = toPlayableCoverUrl(url || '')
}

export const lyricLines = ref([])
export const activeLyricIdx = ref(-1)
export const coverStyle = ref('disc')
export const visualizerEnabled = ref(true)
/** 关闭频谱时自动启用后台播放（与 visualizerEnabled 互斥） */
export const backgroundPlayEnabled = computed(() => !visualizerEnabled.value)
export const showFullscreenPlayer = ref(false)
export const playerError = ref('')
/** 非致命提示（如试听片段时长警告） */
export const playerNotice = ref('')
let playerNoticeTimer = null
let previewWarnedTrackKey = ''

export function clearPlayerNotice() {
  if (playerNoticeTimer) {
    clearTimeout(playerNoticeTimer)
    playerNoticeTimer = null
  }
  playerNotice.value = ''
}

export function showPlayerNotice(text, ms = 10000) {
  const msg = String(text || '').trim()
  if (!msg) return
  playerNotice.value = msg
  if (playerNoticeTimer) clearTimeout(playerNoticeTimer)
  playerNoticeTimer = setTimeout(() => {
    if (playerNotice.value === msg) playerNotice.value = ''
    playerNoticeTimer = null
  }, ms)
}

/** 试听列表 @type {import('vue').Ref<Array<{ key: string, item: object, source: string }>>} */
export const playQueue = ref([])
export const currentQueueIndex = ref(-1)
/** @type {import('vue').Ref<'list'|'loop'|'single'|'random'>} */
export const playMode = ref('list')
export const showQueuePanel = ref(false)

export const playModeLabel = computed(() => {
  const labels = { list: '列表播放', loop: '列表循环', single: '单曲循环', random: '随机播放' }
  return labels[playMode.value] || '列表播放'
})

let audio = null
let inited = false
/** 是否已加载可播放的媒体地址（避免 audio.src='' 被解析成页面 URL 误判） */
let hasMediaSrc = false
/** @type {AudioContext | null} */
let audioCtx = null
/** @type {AnalyserNode | null} */
let analyser = null
/** @type {MediaElementAudioSourceNode | null} */
let mainMediaSource = null
/** @type {GainNode | null} */
let mainOutputGain = null
/** @type {HTMLAudioElement | null} */
let mainAudioTapElement = null
let audioGraphReady = false
let playbackGraphToken = 0
let playIntentToken = 0
/** @type {number[]} */
let playHistory = []
let lastSessionSave = 0
let mediaSessionInited = false

function isBackgroundPlayActive() {
  return !visualizerEnabled.value
}

const QUEUE_STORAGE_KEY = 'lx-music-nas:play-queue'
const SESSION_STORAGE_KEY = 'lx-music-nas:play-session'
const VOLUME_KEY = 'lx-music-nas:volume'
const MUTE_KEY = 'lx-music-nas:muted'
let volumeBeforeMute = 0.8
let lyricFetchToken = 0
let coverFetchToken = 0
let localMetaFetchToken = 0
const coverNetworkTried = new Set()
/** 当前 lyricLines 对应的曲目 key，用于避免切歌/重试后残留上一首歌词 */
let lyricTrackKey = ''
let analyserBoundSrc = ''
const PLAYBACK_GRAPH_RETRY_DELAYS = [0, 120, 300]
const MEDIA_AUDIO_CACHE_MAX = 5
/** @type {Map<string, { element: HTMLAudioElement, url: string, savedTime: number, mediaSource?: MediaElementAudioSourceNode | null }>} */
const mediaAudioCache = new Map()

function shouldUseCrossOrigin(url) {
  if (!url) return false
  return stripStreamAuth(url).includes('/api/play/proxy')
}

function applyAudioCrossOrigin(el, url) {
  if (!el) return
  if (shouldUseCrossOrigin(url)) {
    el.crossOrigin = 'anonymous'
  } else {
    el.removeAttribute('crossorigin')
  }
}

function resetAudioBeforeLoad(el) {
  if (!el) return
  try {
    el.pause()
    el.removeAttribute('src')
    el.load()
  } catch {}
}

function urlsMatch(a, b) {
  if (!a || !b) return false
  const left = stripStreamAuth(a)
  const right = stripStreamAuth(b)
  try {
    return new URL(left, window.location.href).href === new URL(right, window.location.href).href
  } catch {
    return left === right
  }
}

function detachPlaybackGraphKeepElement() {
  playbackGraphToken++
  analyserBoundSrc = ''
  audioGraphReady = false
  if (analyser) {
    try { analyser.disconnect() } catch {}
    analyser = null
  }
  if (mainMediaSource) {
    try { mainMediaSource.disconnect() } catch {}
  }
}

function destroyMediaAudioCacheEntry(key) {
  const entry = mediaAudioCache.get(key)
  if (!entry) return
  try {
    entry.element.pause()
    if (entry.mediaSource) {
      try { entry.mediaSource.disconnect() } catch {}
    }
    entry.element.removeAttribute('src')
    entry.element.load()
  } catch {}
  mediaAudioCache.delete(key)
}

function clearMediaAudioCache() {
  for (const key of [...mediaAudioCache.keys()]) {
    destroyMediaAudioCacheEntry(key)
  }
}

function trimMediaAudioCache() {
  while (mediaAudioCache.size > MEDIA_AUDIO_CACHE_MAX) {
    const oldestKey = mediaAudioCache.keys().next().value
    if (!oldestKey) break
    destroyMediaAudioCacheEntry(oldestKey)
  }
}

function stashMediaAudio(trackKey) {
  if (!audio || !hasMediaSrc || !trackKey) return
  if (audio.error || audio.readyState < 2) return
  const url = stripStreamAuth(audio.src)
  if (!url) return

  try { audio.pause() } catch {}

  const entry = {
    element: audio,
    url,
    savedTime: audio.currentTime || 0,
    mediaSource: mainAudioTapElement === audio ? mainMediaSource : null,
  }

  if (mainAudioTapElement === audio) {
    detachPlaybackGraphKeepElement()
    mainMediaSource = null
    mainAudioTapElement = null
  }

  mediaAudioCache.set(trackKey, entry)
  trimMediaAudioCache()

  audio = null
  hasMediaSrc = false
  invalidatePlaybackGraph()
}

function takeMediaAudioCache(trackKey, url) {
  const entry = mediaAudioCache.get(trackKey)
  if (!entry) return null
  if (!urlsMatch(entry.url, url)) {
    destroyMediaAudioCacheEntry(trackKey)
    return null
  }
  if (entry.element?.error) {
    destroyMediaAudioCacheEntry(trackKey)
    return null
  }
  mediaAudioCache.delete(trackKey)
  return entry
}

async function activateCachedAudio(entry, { resumeTime = 0 } = {}) {
  if (!audio) initPlayer()

  if (entry.mediaSource && !visualizerEnabled.value) {
    const url = entry.url
    const time = resumeTime > 0 ? resumeTime : (entry.savedTime || 0)
    try {
      entry.element.pause()
      entry.element.removeAttribute('src')
      entry.element.load()
    } catch {}
    await startPlaybackFromUrl(url, { resumeTime: time })
    return
  }

  audio = entry.element
  hasMediaSrc = true
  analyserBoundSrc = ''
  audioGraphReady = false

  if (entry.mediaSource) {
    mainMediaSource = entry.mediaSource
    mainAudioTapElement = audio
    entry.mediaSource = null
  }

  const targetTime = resumeTime > 0 ? resumeTime : (entry.savedTime || 0)
  syncDurationFromAudio()
  applyAudioOutput()

  if (targetTime > 0 && Number.isFinite(targetTime)) {
    try {
      audio.currentTime = targetTime
      currentTime.value = targetTime
    } catch {}
  } else {
    currentTime.value = audio.currentTime || 0
  }

  unlockAudioFromGesture()
  if (audio.readyState < 2) {
    await waitForAudioReady(withStreamAuth(entry.url), { isLocal: entry.url.includes('/api/play/local') })
  }

  try {
    await audio.play()
  } catch (playErr) {
    if (playErr?.name === 'NotAllowedError') {
      throw new Error('浏览器拦截了自动播放，请再点一次播放')
    }
    if (isBenignPlayInterrupt(playErr)) return
    throw playErr
  }

  clearPlaybackError()
  endPlaybackBuffer()
  applyAudioOutput()
  if (visualizerEnabled.value) {
    await ensurePlaybackGraph()
    scheduleAudioAnalyserRefresh()
  }
}

function normalizeLocalCover(pictureBase64, pictureMime) {
  if (!pictureBase64) return ''
  const raw = String(pictureBase64)
  if (raw.startsWith('data:') || raw.startsWith('http') || raw.startsWith('/')) return raw
  return `data:${pictureMime || 'image/jpeg'};base64,${raw}`
}

function patchQueueItem(trackKey, updates) {
  const idx = playQueue.value.findIndex(q => q.key === trackKey)
  if (idx < 0) return
  playQueue.value[idx] = {
    ...playQueue.value[idx],
    item: { ...playQueue.value[idx].item, ...updates },
  }
}

function patchQueueItemsByPath(filePath, updates) {
  if (!filePath || !updates || !Object.keys(updates).length) return false
  let changed = false
  playQueue.value = playQueue.value.map((entry) => {
    const fp = getTrackFilePath(entry.item)
    if (!fp || !isSameTrackPath(fp, filePath)) return entry
    changed = true
    return {
      ...entry,
      item: cleanTrackItem({ ...entry.item, ...updates }),
    }
  })
  return changed
}

function buildPlayerUpdatesFromTagMeta(data, filePath) {
  const updates = {}
  if (data.title !== undefined) updates.name = data.title
  if (data.artist !== undefined) updates.singer = data.artist
  if (data.album !== undefined) updates.album = data.album

  let pic = ''
  const coverTouched = Boolean(
    data.pictureBase64 || data.pic || data.picUrl || data.hasPicture !== undefined,
  )
  if (coverTouched) bumpLibraryCoverVersion(filePath)
  if (data.pictureBase64 || data.pic) {
    pic = normalizeLocalCover(data.pictureBase64 || data.pic, data.pictureMime)
  } else if (data.picUrl) {
    pic = data.picUrl
  } else if (coverTouched && data.hasPicture !== false) {
    pic = localCoverUrl(filePath)
  }
  if (pic) {
    updates.picUrl = pic
    updates.img = pic
  } else if (data.hasPicture === false) {
    updates.picUrl = ''
    updates.img = ''
  }

  if (data.lyric !== undefined) updates.lyric = data.lyric || ''
  return updates
}

function resetLyricState() {
  lyricFetchToken++
  coverFetchToken++
  lyricLines.value = []
  activeLyricIdx.value = -1
  lyricTrackKey = ''
  coverNetworkTried.clear()
}

function bindLyricsToTrack(trackKey, lyric) {
  lyricTrackKey = trackKey || ''
  lyricLines.value = lyric ? parseLyric(lyric) : []
  activeLyricIdx.value = -1
}

function applyLyricStateFromTagMeta(data) {
  if (!currentPlaying.value) return
  const key = getTrackKey(currentPlaying.value, currentPlaying.value.source)
  if (data.lyric !== undefined) {
    bindLyricsToTrack(key, data.lyric)
    if (audio && !audio.paused && lyricLines.value.some((line) => line.time > 0)) {
      updateActiveLyric(audio.currentTime)
    }
    return
  }
  if (data.hasLyrics === false) {
    bindLyricsToTrack(key, '')
  }
}

function applyLocalMetaToPlaying(data, filePath) {
  if (!data || !filePath) return
  const updates = buildPlayerUpdatesFromTagMeta(data, filePath)
  const queueChanged = patchQueueItemsByPath(filePath, updates)

  const playingPath = getTrackFilePath(currentPlaying.value)
  if (!playingPath || !isSameTrackPath(playingPath, filePath)) {
    if (queueChanged) saveQueueState()
    return
  }

  if (updates.picUrl !== undefined || updates.img !== undefined) {
    setCoverUrl(updates.picUrl || updates.img || '')
  }
  applyLyricStateFromTagMeta(data)

  if (Object.keys(updates).length) {
    currentPlaying.value = cleanTrackItem({ ...currentPlaying.value, ...updates })
  }
  saveQueueState()
}

/** 标签保存后刷新正在试听的本地文件信息 */
export async function refreshPlayingLocalMeta(filePath, meta) {
  if (!filePath) return
  localMetaFetchToken++
  if (meta) {
    applyLocalMetaToPlaying(meta, filePath)
    return
  }
  const playingPath = getTrackFilePath(currentPlaying.value)
  if (!playingPath || !isSameTrackPath(playingPath, filePath)) return
  const token = localMetaFetchToken
  try {
    const res = await api.tag.read(filePath)
    if (token !== localMetaFetchToken) return
    if (res?.error) return
    applyLocalMetaToPlaying(res?.data || res, filePath)
  } catch {}
}

async function fetchLocalMeta(item) {
  const filePath = getTrackFilePath(item)
  if (!filePath) return
  const token = ++localMetaFetchToken
  coverNetworkTried.delete(getTrackKey(item, item.source || 'local'))
  try {
    const res = await api.tag.read(filePath)
    if (token !== localMetaFetchToken) return
    const playingPath = getTrackFilePath(currentPlaying.value)
    if (!playingPath || !isSameTrackPath(playingPath, filePath)) return
    applyLocalMetaToPlaying(res?.data || res, filePath)
    await fillLocalGapsFromNetwork(filePath)
  } catch {}
}

function hasFileCover(item) {
  const pic = String(item?.picUrl || item?.img || coverUrl.value || '')
  return pic.startsWith('data:') || pic.includes('/api/tag/cover')
}

function hasPlayableLyric(item) {
  return Boolean(String(item?.lyric || '').trim()) || lyricLines.value.length > 0
}

async function fillLocalGapsFromNetwork(filePath) {
  const playing = currentPlaying.value
  if (!playing || !filePath) return
  if (!isSameTrackPath(getTrackFilePath(playing), filePath)) return

  if (!hasFileCover(playing)) {
    await fetchCover(playing, playing.source)
  }
  const after = currentPlaying.value
  if (!after || !isSameTrackPath(getTrackFilePath(after), filePath)) return
  if (!hasPlayableLyric(after)) {
    await fetchLyric(after, after.source)
  }
}

/** 内嵌封面加载失败时，按网络试听逻辑补封面 */
export function tryFillCoverFromNetwork() {
  const item = currentPlaying.value
  if (!item) return false
  const key = getTrackKey(item, item.source)
  if (coverNetworkTried.has(key)) return false
  const src = String(coverUrl.value || '')
  const fileCoverFailed = src.includes('/api/tag/cover') || src.startsWith('data:')
  if (!isLocalTrack(item, item.source) && !fileCoverFailed) return false
  if (!fileCoverFailed && src) return false
  coverNetworkTried.add(key)
  fetchCover(item, item.source, { force: true })
  return true
}

function beginPlaybackBuffer() {
  isBuffering.value = true
  isPaused.value = false
}

function endPlaybackBuffer() {
  isBuffering.value = false
}

function clearPlaybackError() {
  if (playerError.value) playerError.value = ''
}

function cancelPlaybackIntent() {
  playIntentToken++
  endPlaybackBuffer()
  isPaused.value = true
  loadingPlay.value = null
  if (audio) {
    try { audio.pause() } catch {}
  }
}

function invalidatePlaybackGraph() {
  analyserBoundSrc = ''
  audioGraphReady = false
}

function isMainAudioTapped() {
  return Boolean(mainMediaSource && mainAudioTapElement === audio)
}

function applyMainOutputGain() {
  if (!mainOutputGain) return
  const level = Math.min(1, Math.max(0, volume.value))
  const effective = isMuted.value || level <= 0.001 ? 0 : level
  mainOutputGain.gain.value = effective
}

function teardownPlaybackGraph() {
  playbackGraphToken++
  if (analyser) {
    try { analyser.disconnect() } catch {}
    analyser = null
  }
  if (mainMediaSource) {
    try { mainMediaSource.disconnect() } catch {}
    mainMediaSource = null
    mainAudioTapElement = null
  }
  audioGraphReady = false
}

function recreateMainAudioElement() {
  teardownPlaybackGraph()
  const old = audio
  audio = createAudioElement()
  if (old) {
    try {
      old.pause()
      old.removeAttribute('src')
      old.load()
    } catch {}
  }
}

const DEFAULT_PLAY_QUALITY = '128k'

function stopPlaybackGraph() {
  teardownPlaybackGraph()
  recreateMainAudioElement()
}

function bindAudioElementEvents(el) {
  el.addEventListener('timeupdate', () => {
    if (audio !== el) return
    currentTime.value = audio.currentTime
    updateActiveLyric(audio.currentTime)
    syncDurationFromAudio()
    const now = Date.now()
    if (now - lastSessionSave > 5000) {
      lastSessionSave = now
      saveQueueState()
    }
  })
  el.addEventListener('loadedmetadata', () => {
    if (audio !== el) return
    syncDurationFromAudio()
    maybeWarnPreviewClip(currentPlaying.value, currentPlaying.value?.source)
  })
  el.addEventListener('durationchange', () => {
    if (audio !== el) return
    syncDurationFromAudio()
    maybeWarnPreviewClip(currentPlaying.value, currentPlaying.value?.source)
  })
  el.addEventListener('canplay', () => {
    if (audio !== el) return
    syncDurationFromAudio()
    maybeWarnPreviewClip(currentPlaying.value, currentPlaying.value?.source)
  })
  el.addEventListener('playing', () => {
    if (audio !== el) return
    endPlaybackBuffer()
    clearPlaybackError()
    isPaused.value = false
    syncMediaSessionPlaybackState()
    if (visualizerEnabled.value) scheduleAudioAnalyserRefresh()
  })
  el.addEventListener('waiting', () => {
    if (audio !== el || isPaused.value) return
    if (!audio.paused) beginPlaybackBuffer()
  })
  el.addEventListener('pause', () => {
    if (audio !== el) return
    if (isPaused.value) endPlaybackBuffer()
  })
  el.addEventListener('ended', () => {
    if (audio === el) onTrackEnded()
  })
  el.addEventListener('error', () => {
    if (audio !== el) return
    endPlaybackBuffer()
    isPaused.value = true
    playerError.value = getAudioElementError(el) || '音频加载失败，请尝试其他歌曲'
    loadingPlay.value = null
  })
}

function createAudioElement() {
  const el = new Audio()
  el.setAttribute('playsinline', '')
  el.setAttribute('webkit-playsinline', '')
  bindAudioElementEvents(el)
  return el
}

function createAnalyserNode() {
  if (!audioCtx) return null
  const node = audioCtx.createAnalyser()
  node.fftSize = 512
  node.smoothingTimeConstant = 0.72
  node.minDecibels = -90
  node.maxDecibels = -8
  return node
}

async function ensureAudioContextRunning() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return false
    if (!audioCtx) audioCtx = new AC()
    if (audioCtx.state === 'suspended') await audioCtx.resume()
    return audioCtx.state === 'running'
  } catch {
    return false
  }
}

async function restoreNativeAudioOutput() {
  if (!audio || !isMainAudioTapped()) return
  const src = audio.src
  const time = audio.currentTime || 0
  const wasPlaying = !audio.paused && !isPaused.value
  recreateMainAudioElement()
  if (!src || !hasMediaSrc) {
    applyAudioOutput()
    return
  }
  applyAudioCrossOrigin(audio, src)
  audio.src = src
  try {
    await waitForAudioReady(src, { isLocal: src.includes('/api/play/local') })
    if (time > 0) {
      audio.currentTime = time
      currentTime.value = time
    }
  } catch {}
  applyAudioOutput()
  if (wasPlaying) {
    try { await audio.play() } catch {}
  }
}

/** 主音频 Web Audio 直通：播放与频谱共用同一时钟，同步最佳 */
async function ensurePlaybackGraph() {
  if (!visualizerEnabled.value) {
    if (isMainAudioTapped()) await restoreNativeAudioOutput()
    return null
  }
  if (!audio || !hasPlayableAudioSrc() || audio.paused || isPaused.value) return null
  if (audio.readyState < 2) return null

  const token = playbackGraphToken
  const src = audio.src || ''

  try {
    if (!(await ensureAudioContextRunning()) || !audioCtx) return null
    if (token !== playbackGraphToken) return null

    if (audioGraphReady && isMainAudioTapped() && analyserBoundSrc === src) {
      applyMainOutputGain()
      return visualizerEnabled.value ? analyser : null
    }

    if (isMainAudioTapped() && mainAudioTapElement !== audio) {
      teardownPlaybackGraph()
    }

    if (!mainMediaSource || mainAudioTapElement !== audio) {
      try {
        mainMediaSource = audioCtx.createMediaElementSource(audio)
        mainAudioTapElement = audio
      } catch {
        if (mainMediaSource && mainAudioTapElement === audio) {
          // already bound on this element
        } else {
          return null
        }
      }
    }

    if (!mainOutputGain) {
      mainOutputGain = audioCtx.createGain()
      mainOutputGain.connect(audioCtx.destination)
    }
    applyMainOutputGain()

    try { mainMediaSource.disconnect() } catch {}

    if (visualizerEnabled.value) {
      if (!analyser) analyser = createAnalyserNode()
      if (!analyser) return null
      mainMediaSource.connect(analyser)
      analyser.connect(mainOutputGain)
    } else {
      if (analyser) {
        try { analyser.disconnect() } catch {}
        analyser = null
      }
      mainMediaSource.connect(mainOutputGain)
    }

    if (token !== playbackGraphToken) return null
    audioGraphReady = true
    analyserBoundSrc = src
    applyAudioOutput()
    return visualizerEnabled.value ? analyser : null
  } catch {
    teardownPlaybackGraph()
    return null
  }
}

async function resumeAudioPlayback() {
  if (visualizerEnabled.value) {
    try {
      if (audioCtx?.state === 'suspended') await audioCtx.resume()
    } catch {}
  }
  if (!audio || isPaused.value || !hasMediaSrc) return
  if (isBackgroundPlayActive() && !audio.paused) {
    syncMediaSessionPlaybackState()
    return
  }
  if (audio.paused) {
    try { await audio.play() } catch {}
  }
  if (visualizerEnabled.value) await ensurePlaybackGraph()
  syncMediaSessionPlaybackState()
}

/** 在用户手势同步调用栈内解锁 AudioContext */
export function unlockAudioFromGesture() {
  if (!audio) initPlayer()
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (AC && !audioCtx) audioCtx = new AC()
    if (audioCtx?.state === 'suspended') {
      audioCtx.resume().catch(() => {})
    }
  } catch {}
}

export async function unlockAudioFromGestureAsync() {
  unlockAudioFromGesture()
  return ensureAudioContextRunning()
}

function hasPlayableAudioSrc() {
  return Boolean(audio && hasMediaSrc)
}

function resolveQueueIndexForCurrent() {
  if (currentQueueIndex.value >= 0 && currentQueueIndex.value < playQueue.value.length) {
    return currentQueueIndex.value
  }
  if (!currentPlaying.value) return -1
  const key = getTrackKey(currentPlaying.value, currentPlaying.value.source)
  return playQueue.value.findIndex(q => q.key === key)
}

function applyAudioOutput() {
  if (!audio) return
  if (isMainAudioTapped() && mainOutputGain) {
    applyMainOutputGain()
    audio.volume = 1
    audio.muted = false
    return
  }
  const level = Math.min(1, Math.max(0, volume.value))
  audio.volume = level > 0 ? level : 1
  audio.muted = isMuted.value || level <= 0.001
}

function initMediaSession() {
  if (mediaSessionInited || !('mediaSession' in navigator)) return
  mediaSessionInited = true
  try {
    navigator.mediaSession.setActionHandler('play', () => { togglePause().catch(() => {}) })
    navigator.mediaSession.setActionHandler('pause', () => { togglePause().catch(() => {}) })
    navigator.mediaSession.setActionHandler('previoustrack', () => { playPrev().catch(() => {}) })
    navigator.mediaSession.setActionHandler('nexttrack', () => { playNext().catch(() => {}) })
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime != null && Number.isFinite(details.seekTime)) {
        seekTo(details.seekTime)
      }
    })
  } catch {}
}

function buildMediaSessionArtwork() {
  if (!coverUrl.value) return []
  const url = coverUrl.value
  return [
    { src: url, sizes: '96x96', type: 'image/png' },
    { src: url, sizes: '256x256', type: 'image/png' },
    { src: url, sizes: '512x512', type: 'image/png' },
  ]
}

function updateMediaSession() {
  if (!isBackgroundPlayActive() || !currentPlaying.value) return
  if (!('mediaSession' in navigator)) return
  initMediaSession()
  const item = currentPlaying.value
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.name || '未知歌曲',
      artist: formatArtists(item.singer) || '未知艺术家',
      album: item.album || item.albumName || '',
      artwork: buildMediaSessionArtwork(),
    })
    syncMediaSessionPlaybackState()
  } catch {}
}

function syncMediaSessionPlaybackState() {
  if (!isBackgroundPlayActive() || !('mediaSession' in navigator)) return
  try {
    navigator.mediaSession.playbackState = (isPaused.value || isBuffering.value) ? 'paused' : 'playing'
  } catch {}
}

function clearMediaSession() {
  if (!('mediaSession' in navigator)) return
  try {
    navigator.mediaSession.metadata = null
    navigator.mediaSession.playbackState = 'none'
  } catch {}
}

async function applyBackgroundPlayMode() {
  if (!isBackgroundPlayActive()) {
    clearMediaSession()
    return
  }
  if (isMainAudioTapped()) {
    await restoreNativeAudioOutput()
  }
  updateMediaSession()
}

function pickItemFields(item, queueKey = '') {
  if (!item) return null
  const cleaned = cleanTrackItem(item)
  const localPath = cleaned.localPath || getTrackFilePath(cleaned) || ''
  const key = queueKey || cleaned.key || (localPath ? `local:${localPath}` : '')
  return {
    id: cleaned.id,
    name: cleaned.name,
    singer: cleaned.singer,
    source: cleaned.source,
    key,
    songmid: cleaned.songmid,
    hash: cleaned.hash,
    songId: cleaned.songId,
    copyrightId: cleaned.copyrightId,
    strMediaMid: cleaned.strMediaMid,
    albumAudioId: cleaned.albumAudioId,
    albumId: cleaned.albumId,
    albumMid: cleaned.albumMid,
    albummid: cleaned.albummid,
    img: cleaned.img,
    musicId: cleaned.musicId,
    rid: cleaned.rid,
    dcTargetId: cleaned.dcTargetId,
    duration: cleaned.duration,
    types: cleaned.types,
    qualitys: cleaned.qualitys,
    picUrl: cleaned.picUrl,
    interval: cleaned.interval,
    album: cleaned.album,
    albumName: cleaned.albumName,
    localPath,
    lyric: cleaned.lyric || '',
  }
}

let saveQueueTimer = null

function persistQueueState() {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify({
      queue: playQueue.value.map(e => ({
        key: e.key,
        source: e.source,
        item: pickItemFields(e.item, e.key),
      })),
      currentIndex: currentQueueIndex.value,
      playMode: playMode.value,
    }))
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      currentPlaying: currentPlaying.value ? pickItemFields(currentPlaying.value) : null,
      isPaused: isPaused.value,
      currentTime: currentTime.value,
    }))
  } catch {}
}

function saveQueueState({ immediate = false } = {}) {
  if (immediate) {
    if (saveQueueTimer) {
      clearTimeout(saveQueueTimer)
      saveQueueTimer = null
    }
    persistQueueState()
    return
  }
  if (saveQueueTimer) clearTimeout(saveQueueTimer)
  saveQueueTimer = setTimeout(() => {
    saveQueueTimer = null
    persistQueueState()
  }, 800)
}

function syncCurrentPlayingFromQueue(forcePaused = false) {
  if (currentQueueIndex.value < 0 || !playQueue.value[currentQueueIndex.value]) return
  const { item, source } = playQueue.value[currentQueueIndex.value]
  const cleaned = cleanTrackItem({ ...item, source: item.source || source })
  currentPlaying.value = cleaned
  setCoverUrl(cleaned.picUrl || cleaned.img || '')
  bindLyricsToTrack(getTrackKey(cleaned, source), cleaned.lyric || '')
  applyDurationFallback(cleaned)
  if (forcePaused) isPaused.value = true
}

function restoreSessionState() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      if (data.currentPlaying?.name) {
        currentPlaying.value = cleanTrackItem(data.currentPlaying)
        setCoverUrl(data.currentPlaying.picUrl || data.currentPlaying.img || '')
        bindLyricsToTrack(
          getTrackKey(currentPlaying.value, currentPlaying.value.source),
          data.currentPlaying.lyric || '',
        )
        currentTime.value = Number(data.currentTime) || 0
        applyDurationFallback(currentPlaying.value)
        if (currentPlaying.value.localPath) {
          fetchLocalMeta(currentPlaying.value)
        } else if (!lyricLines.value.length) {
          fetchLyric(currentPlaying.value, currentPlaying.value.source)
        }
        if (!currentPlaying.value.localPath) {
          fetchCover(currentPlaying.value, currentPlaying.value.source)
        }
        // 刷新后默认暂停，用户可点播放继续
        isPaused.value = true
        // 同步队列下标，避免 currentPlaying 有值但 index=-1 导致按钮无效
        const key = getTrackKey(currentPlaying.value, currentPlaying.value.source)
        const idx = playQueue.value.findIndex(q => q.key === key)
        if (idx >= 0) currentQueueIndex.value = idx
        else if (currentQueueIndex.value < 0 && playQueue.value.length) {
          currentQueueIndex.value = 0
        }
        return
      }
    }
  } catch {}

  if (currentQueueIndex.value >= 0) {
    syncCurrentPlayingFromQueue(true)
  }
}

function loadQueueState() {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    if (Array.isArray(data.queue)) {
      playQueue.value = data.queue.filter(e => e?.key && e?.item?.name).map(e => ({
        ...e,
        item: pickItemFields(e.item) || e.item,
      }))
    }
    if (typeof data.currentIndex === 'number' && data.currentIndex >= 0 && data.currentIndex < playQueue.value.length) {
      currentQueueIndex.value = data.currentIndex
    }
    if (data.playMode && ['list', 'loop', 'single', 'random'].includes(data.playMode)) {
      playMode.value = data.playMode
    }
  } catch {}
}

loadQueueState()

export const currentLyricText = computed(() => {
  if (!lyricLines.value.length) return ''
  const idx = activeLyricIdx.value
  if (idx >= 0) return lyricLines.value[idx]?.text || ''
  return lyricLines.value[0]?.text || ''
})

/** 当前可编辑标签的本地文件路径（兼容队列 key / 会话恢复） */
export const currentLocalTrackPath = computed(() => {
  const fromPlaying = getTrackFilePath(currentPlaying.value)
  if (fromPlaying) return fromPlaying
  const idx = currentQueueIndex.value
  if (idx < 0 || idx >= playQueue.value.length) return ''
  const entry = playQueue.value[idx]
  if (entry?.key?.startsWith('local:')) return entry.key.slice(6)
  return getTrackFilePath(entry?.item)
})

export const displayDuration = computed(() => {
  if (duration.value && isFinite(duration.value) && duration.value > 0) return duration.value
  return parseIntervalToSeconds(currentPlaying.value?.interval)
})

function parseIntervalToSeconds(interval) {
  if (interval == null || interval === '') return 0
  if (typeof interval === 'number' && isFinite(interval)) return interval
  const str = String(interval).trim()
  const parts = str.split(':').map(Number)
  if (parts.length === 2 && parts.every(n => !isNaN(n))) {
    return parts[0] * 60 + parts[1]
  }
  if (parts.length === 3 && parts.every(n => !isNaN(n))) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  const n = parseFloat(str)
  return isNaN(n) ? 0 : n
}

function syncDurationFromAudio() {
  if (!audio) return
  const d = audio.duration
  if (d && isFinite(d) && d > 0) duration.value = d
}

function applyDurationFallback(item) {
  if (duration.value && isFinite(duration.value) && duration.value > 0) return
  const fallback = parseIntervalToSeconds(item?.interval || item?.duration)
  if (fallback > 0) duration.value = fallback
}

function maybeWarnPreviewClip(item, source) {
  if (!item || isLocalTrack(item, source)) return
  const trackKey = getTrackKey(item, source)
  if (!trackKey || previewWarnedTrackKey === trackKey) return
  // 只用真实音频元数据时长，避免被曲目标注时长回退污染
  const actual = audio?.duration
  if (!(actual > 0 && isFinite(actual))) return
  const expected = parseClipDuration(item.interval || item.duration)
  const info = detectPreviewClip(actual, expected)
  if (!info) return
  previewWarnedTrackKey = trackKey
  showPlayerNotice(formatPreviewClipMessage(info))
}

function pickRandomIndex(exclude = -1) {
  const len = playQueue.value.length
  if (len <= 0) return -1
  if (len === 1) return 0
  let idx
  do { idx = Math.floor(Math.random() * len) } while (idx === exclude)
  return idx
}

function resolveNextIndex(fromAuto = false) {
  const len = playQueue.value.length
  if (!len) return -1
  if (playMode.value === 'random') return pickRandomIndex(currentQueueIndex.value)
  let next = currentQueueIndex.value + 1
  if (next >= len) {
    if (playMode.value === 'loop') next = 0
    else if (fromAuto) return -1
    else return -1
  }
  return next
}

export function getTrackKey(item, source) {
  const filePath = getTrackFilePath(item)
  if (filePath) return `local:${filePath}`
  if (item?.key) return String(item.key)
  const id = item?.songmid || item?.hash || item?.songId || item?.musicId || item?.copyrightId || item?.id
  const src = item?.source || source || ''
  return `${src}:${id}`
}

export function initPlayer() {
  if (inited) return
  inited = true

  audio = createAudioElement()
  try {
    const savedVolRaw = localStorage.getItem(VOLUME_KEY)
    const savedMute = localStorage.getItem(MUTE_KEY)
    if (savedVolRaw != null && savedVolRaw !== '') {
      const savedVol = Number(savedVolRaw)
      if (Number.isFinite(savedVol) && savedVol > 0.001) {
        volume.value = Math.min(1, Math.max(0, Math.round(savedVol * 100) / 100))
        volumeBeforeMute = volume.value
      } else if (Number.isFinite(savedVol) && savedVol <= 0.001) {
        // 兼容旧版：曾把静音存成 volume=0
        volume.value = 0.8
        volumeBeforeMute = 0.8
        isMuted.value = true
      }
    }
    if (savedMute === 'true') isMuted.value = true
    else if (savedMute === 'false') isMuted.value = false
  } catch {}
  applyAudioOutput()

  restoreSessionState()
  loadCoverStyle()
  loadPlayerSettings()

  window.addEventListener('beforeunload', () => saveQueueState({ immediate: true }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveQueueState({ immediate: true })
      if (isBackgroundPlayActive() && audio && !audio.paused && !isPaused.value) {
        syncMediaSessionPlaybackState()
      }
      return
    }
    if (audio && !audio.paused && hasMediaSrc && visualizerEnabled.value) {
      ensureAudioContextRunning().then(() => ensurePlaybackGraph()).catch(() => {})
    } else if (isBackgroundPlayActive() && audio && !audio.paused) {
      syncMediaSessionPlaybackState()
    }
  })
  window.addEventListener('focus', () => { resumeAudioPlayback() })
  window.addEventListener('pageshow', () => { resumeAudioPlayback() })
}

async function onTrackEnded() {
  if (playMode.value === 'single' && audio) {
    audio.currentTime = 0
    applyAudioOutput()
    beginPlaybackBuffer()
    await audio.play()
    if (visualizerEnabled.value) scheduleAudioAnalyserRefresh()
    isPaused.value = false
    return
  }
  await playNextAuto()
}

async function playNextAuto() {
  if (!playQueue.value.length) {
    isPaused.value = true
    return
  }
  const next = resolveNextIndex(true)
  if (next < 0) {
    isPaused.value = true
    return
  }
  try {
    await playTrackAt(next)
  } catch {
    isPaused.value = true
  }
}

export async function loadCoverStyle() {
  try {
    const settings = await api.settings.get()
    if (settings['player.coverStyle'] === 'card' || settings['player.coverStyle'] === 'disc') {
      coverStyle.value = settings['player.coverStyle']
    }
  } catch {}
}

export async function loadVisualizerSetting() {
  const prev = visualizerEnabled.value
  try {
    const settings = await api.settings.get()
    visualizerEnabled.value = settings['player.visualizer'] !== 'false'
  } catch {
    visualizerEnabled.value = true
  }
  if (prev && !visualizerEnabled.value) {
    await restoreNativeAudioOutput()
  } else if (visualizerEnabled.value && audio && !audio.paused) {
    await ensurePlaybackGraph()
    scheduleAudioAnalyserRefresh()
  }
  await applyBackgroundPlayMode()
}

export async function loadPlayerSettings() {
  await loadVisualizerSetting()
}

export function openFullscreenPlayer() {
  if (!currentPlaying.value) return
  showFullscreenPlayer.value = true
  showQueuePanel.value = false
}

export function closeFullscreenPlayer() {
  showFullscreenPlayer.value = false
}

/** 建立 Web Audio 播放/分析链路（主音频直通） */
export async function ensureAudioAnalyser() {
  return ensurePlaybackGraph()
}

export function prepareAnalyserSample() {}

export function scheduleAudioAnalyserRefresh() {
  if (!visualizerEnabled.value || !audio || audio.paused) return
  const trySetup = () => { ensurePlaybackGraph().catch(() => {}) }
  trySetup()
  requestAnimationFrame(trySetup)
  for (const delay of PLAYBACK_GRAPH_RETRY_DELAYS) {
    setTimeout(trySetup, delay)
  }
}

export function resetAudioAnalyserForTrack() {
  invalidatePlaybackGraph()
  scheduleAudioAnalyserRefresh()
}

export function promoteElementAnalyser() {
  scheduleAudioAnalyserRefresh()
}

export function getAnalyserMode() {
  return visualizerEnabled.value && analyser ? 'direct' : null
}

export function getAnalyser() {
  return analyser
}

export function getFrequencyData(target) {
  if (!analyser) return null
  const buf = target || new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteFrequencyData(buf)
  return buf
}

export function isPlayingItem(item) {
  if (!item || !currentPlaying.value) return false
  const key = getTrackKey(item, item.source)
  const curKey = getTrackKey(currentPlaying.value, currentPlaying.value.source)
  return key === curKey
}

export function isActiveTrack(item, source) {
  if (!item || currentQueueIndex.value < 0) return false
  const entry = playQueue.value[currentQueueIndex.value]
  if (!entry) return false
  return entry.key === getTrackKey(item, source || item.source)
}

export function isInQueue(item, source) {
  const key = getTrackKey(item, source)
  return playQueue.value.some(q => q.key === key)
}

let playUrlAbort = null

function cancelPlayUrlFetch() {
  playUrlAbort?.abort()
  playUrlAbort = null
}

async function resolvePlayUrl(item, source, quality = DEFAULT_PLAY_QUALITY, options = {}) {
  if (isLocalTrack(item, source)) {
    const res = await api.play.getUrl(buildPlayPayload(item, 'local', quality), { signal: options.signal })
    return res.url || ''
  }

  const cached = getCachedPlayUrl(item, source, quality)
  if (cached && !options.sourceApiId) return cached

  const payload = buildPlayPayload(item, source, quality)
  if (options.sourceApiId) payload.sourceApiId = options.sourceApiId
  if (options.skipSourceIds?.length) payload.skipSourceIds = options.skipSourceIds

  try {
    const res = await api.play.getUrl(payload, { signal: options.signal })
    if (options.intent != null && options.intent !== playIntentToken) return ''
    if (res.sourceInfo?.switched) notifySourceSwitch(res.sourceInfo)
    const url = res.url || ''
    if (url) setCachedPlayUrl(item, source, quality, url)
    return url
  } catch (e) {
    if (e.aborted) {
      const err = new Error('播放已取消')
      err.aborted = true
      throw err
    }
    if (!options._fallbackHandled && isSourceFallbackError(e)) {
      const offer = getSourceFallbackOffer(e)
      const picked = await askSourceFallback(offer, { item, source, quality })
      if (!picked) throw new Error('已取消切换音源')
      return resolvePlayUrl(item, source, quality, {
        sourceApiId: picked,
        skipSourceIds: [...(options.skipSourceIds || []), offer?.failedId].filter(Boolean),
        _fallbackHandled: true,
      })
    }
    throw e
  }
}

function canReuseLoadedAudio(url, item, source) {
  if (!audio || !hasMediaSrc || !url) return false
  if (!urlsMatch(audio.src, url)) return false
  if (!currentPlaying.value) return false
  return getTrackKey(currentPlaying.value, currentPlaying.value.source)
    === getTrackKey(item, source)
}

async function startPlaybackFromUrl(url, { resumeTime = 0, item, source, isLocal = false } = {}) {
  if (!audio) {
    if (!inited) initPlayer()
    else audio = createAudioElement()
  }

  if (!resumeTime) currentTime.value = 0
  duration.value = 0
  if (item) applyDurationFallback(item)
  const authedUrl = withStreamAuth(url)
  if (!urlsMatch(audio.src, url)) {
    invalidatePlaybackGraph()
    resetAudioBeforeLoad(audio)
  }
  applyAudioCrossOrigin(audio, url)
  audio.src = authedUrl
  hasMediaSrc = true
  if (audio.readyState < 2) {
    await waitForAudioReady(authedUrl, { isLocal })
  }

  applyAudioOutput()
  if (resumeTime > 0) {
    try {
      audio.currentTime = resumeTime
      currentTime.value = resumeTime
    } catch {}
  } else {
    currentTime.value = 0
  }

  unlockAudioFromGesture()
  try {
    await audio.play()
  } catch (playErr) {
    if (playErr?.name === 'NotAllowedError') {
      throw new Error('浏览器拦截了自动播放，请再点一次播放')
    }
    throw playErr
  }

  clearPlaybackError()
  applyAudioOutput()
  rememberLoadedPlayUrl(item, source, url, DEFAULT_PLAY_QUALITY)
  if (visualizerEnabled.value) {
    await ensurePlaybackGraph()
    scheduleAudioAnalyserRefresh()
  }
}

export function addToQueue(item, source, { play = false, replace = false } = {}) {
  const cleaned = cleanTrackItem(item)
  const src = cleaned.source || source
  const key = getTrackKey(cleaned, src)
  let idx = playQueue.value.findIndex(q => q.key === key)

  if (idx === -1) {
    playQueue.value.push({ key, item: cleaned, source: src })
    idx = playQueue.value.length - 1
  } else if (replace) {
    playQueue.value[idx] = { key, item: cleaned, source: src }
  }

  if (play) return playTrackAt(idx)
  saveQueueState()
  return idx
}

export function removeFromQueue(index) {
  if (index < 0 || index >= playQueue.value.length) return
  playQueue.value.splice(index, 1)
  if (currentQueueIndex.value === index) {
    if (playQueue.value.length) {
      const next = Math.min(index, playQueue.value.length - 1)
      playTrackAt(next).catch(() => stopPlay())
    } else {
      stopPlay()
    }
  } else if (currentQueueIndex.value > index) {
    currentQueueIndex.value--
  }
  saveQueueState()
}

export function clearQueue() {
  playQueue.value = []
  playHistory = []
  currentQueueIndex.value = -1
  stopPlay()
  saveQueueState()
}

export function togglePlayMode() {
  const modes = ['list', 'loop', 'single', 'random']
  const i = modes.indexOf(playMode.value)
  playMode.value = modes[(i + 1) % modes.length]
  saveQueueState()
}

export async function playItem(item, activeSource) {
  const key = getTrackKey(item, activeSource)
  const idx = playQueue.value.findIndex(q => q.key === key)

  if (isPlayingItem(item)) {
    await resumeOrTogglePause()
    return
  }

  // 同一首已暂停且媒体已加载：直接续播，不重新拉链接
  if (idx >= 0 && currentPlaying.value && getTrackKey(currentPlaying.value, currentPlaying.value.source) === key) {
    currentQueueIndex.value = idx
    if (hasPlayableAudioSrc() && isPaused.value) {
      await resumeOrTogglePause()
      return
    }
    await playTrackAt(idx, { resumeTime: hasPlayableAudioSrc() ? currentTime.value : 0 })
    return
  }

  await addToQueue(item, activeSource, { play: true, replace: true })
}

export async function resumeOrTogglePause() {
  unlockAudioFromGesture()
  if (!currentPlaying.value) return
  if (!hasPlayableAudioSrc()) {
    const idx = resolveQueueIndexForCurrent()
    if (idx >= 0) {
      await playTrackAt(idx, { resumeTime: currentTime.value })
    }
    return
  }
  await togglePause()
}

export async function playTrackAt(index, { fromHistory = false, resumeTime = 0 } = {}) {
  if (index < 0 || index >= playQueue.value.length) return

  unlockAudioFromGesture()

  const prevIndex = currentQueueIndex.value
  if (!fromHistory && prevIndex >= 0 && prevIndex !== index) {
    playHistory.push(prevIndex)
  }

  const { item, source } = playQueue.value[index]
  const trackKey = getTrackKey(item, source)
  const intent = ++playIntentToken

  if (lyricTrackKey !== trackKey) {
    resetLyricState()
  }

  if (prevIndex >= 0 && prevIndex !== index) {
    const prevEntry = playQueue.value[prevIndex]
    if (prevEntry?.key) stashMediaAudio(prevEntry.key)
  }

  currentQueueIndex.value = index

  const enrichedItem = { ...item }
  if (!getTrackFilePath(enrichedItem) && trackKey.startsWith('local:')) {
    enrichedItem.localPath = trackKey.slice(6)
  }
  currentPlaying.value = cleanTrackItem(enrichedItem)
  setCoverUrl(item.picUrl || item.img || '')
  const filePath = getTrackFilePath(item)
  if (!coverUrl.value && filePath && item.hasPicture !== false) {
    setCoverUrl(localCoverUrl(filePath))
  }

  beginPlaybackBuffer()
  saveQueueState()

  cancelPlayUrlFetch()
  const playUrlController = new AbortController()
  playUrlAbort = playUrlController

  loadingPlay.value = item.id
  playerError.value = ''
  clearPlayerNotice()
  previewWarnedTrackKey = ''
  const isLocal = isLocalTrack(item, source)
  const quality = DEFAULT_PLAY_QUALITY
  const maxAttempts = isLocal ? 2 : 1

  try {
    let lastError = null
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (intent !== playIntentToken) return
      if (attempt > 0) {
        clearCachedPlayUrl(item, source, quality)
        destroyMediaAudioCacheEntry(trackKey)
        if (audio) resetAudioBeforeLoad(audio)
      }

      try {
        const cachedUrl = attempt === 0 ? getCachedPlayUrl(item, source, quality) : ''
        const cachedMedia = cachedUrl ? takeMediaAudioCache(trackKey, cachedUrl) : null
        if (cachedMedia) {
          await activateCachedAudio(cachedMedia, { resumeTime })
          rememberLoadedPlayUrl(item, source, cachedUrl, quality)
        } else if (attempt === 0 && canReuseLoadedAudio(cachedUrl, item, source)) {
          await startPlaybackFromUrl(cachedUrl, { resumeTime, item, source, isLocal })
        } else {
          const url = cachedUrl || await resolvePlayUrl(item, source, quality, {
            signal: playUrlController.signal,
            intent,
          })
          if (!url) {
            if (intent !== playIntentToken) return
            throw new Error('获取播放链接失败')
          }
          await startPlaybackFromUrl(url, { resumeTime, item, source, isLocal })
        }

        if (intent !== playIntentToken) {
          try { audio?.pause() } catch {}
          return
        }

        syncDurationFromAudio()
        applyDurationFallback(item)
        maybeWarnPreviewClip(enrichedItem, source)

        currentPlaying.value = cleanTrackItem(enrichedItem)
        isPaused.value = false
        recordRecentPlay({ ...currentPlaying.value, source })
        setCoverUrl(item.picUrl || item.img || '')
        if (isLocal) {
          if (item.lyric) bindLyricsToTrack(trackKey, item.lyric)
          if (!coverUrl.value && filePath && item.hasPicture !== false) {
            setCoverUrl(item.picUrl || item.img || localCoverUrl(filePath))
          }
          fetchLocalMeta(item)
        } else {
          fetchCover(item, source)
          ensureLyricsForTrack(item, source, trackKey)
        }
        updateActiveLyric(audio?.currentTime || 0)
        saveQueueState()
        updateMediaSession()
        return
      } catch (e) {
        if (e.aborted || intent !== playIntentToken) throw e
        lastError = e
        if (attempt + 1 >= maxAttempts) throw e
      }
    }
    if (lastError) throw lastError
  } catch (e) {
    if (intent === playIntentToken) {
      if (e.aborted) return
      endPlaybackBuffer()
      isPaused.value = true
      const message = formatPlayClientError(e)
      playerError.value = message
      if (!message) return
      throw new Error(message)
    }
  } finally {
    if (intent === playIntentToken) loadingPlay.value = null
  }
}

function formatPlayClientError(e) {
  if (isBenignPlayInterrupt(e)) return ''
  return formatUserError(e, '播放失败，请稍后重试')
}

const AUDIO_ELEMENT_ERROR_TEXT = {
  1: '音频加载被中止',
  2: '网络异常，无法加载音频',
  3: '音频解码失败，文件可能已损坏',
  4: '浏览器无法播放该音频格式',
}

function getAudioElementError(el = audio) {
  const code = el?.error?.code
  if (code && AUDIO_ELEMENT_ERROR_TEXT[code]) return AUDIO_ELEMENT_ERROR_TEXT[code]
  return ''
}

function isBenignPlayInterrupt(error) {
  const text = String(error?.message || error || '')
  return /The play\(\) request was interrupted by a call to pause\(\)/i.test(text)
    || /play\(\) request was interrupted/i.test(text)
}

function waitForAudioReady(expectedUrl = '', { isLocal = false } = {}) {
  const timeoutMs = isLocal ? 20000 : 8000
  return new Promise((resolve, reject) => {
    if (!audio) { resolve(); return }
    if (audio.readyState >= 1 && !audio.error) {
      syncDurationFromAudio()
      resolve()
      return
    }
    let settled = false
    const isStale = () => expectedUrl && audio && !urlsMatch(audio.src, expectedUrl)
    const cleanup = () => {
      audio?.removeEventListener('loadedmetadata', finish)
      audio?.removeEventListener('canplay', finish)
      audio?.removeEventListener('durationchange', finish)
      audio?.removeEventListener('error', onError)
    }
    const fail = (err) => {
      if (settled) return
      settled = true
      cleanup()
      if (isStale()) {
        reject(Object.assign(new Error('播放已取消'), { aborted: true }))
        return
      }
      reject(err instanceof Error ? err : new Error(formatPlayClientError(err)))
    }
    const finish = () => {
      if (settled) return
      if (isStale()) {
        fail(Object.assign(new Error('播放已取消'), { aborted: true }))
        return
      }
      settled = true
      cleanup()
      if (audio.error) {
        const detail = getAudioElementError(audio)
        fail(new Error(detail || '音频加载失败，请尝试其他歌曲'))
        return
      }
      syncDurationFromAudio()
      resolve()
    }
    const onError = () => {
      if (isStale()) {
        fail(Object.assign(new Error('播放已取消'), { aborted: true }))
        return
      }
      const detail = getAudioElementError(audio)
      fail(new Error(detail || '音频加载失败，请尝试其他歌曲'))
    }
    audio.addEventListener('loadedmetadata', finish)
    audio.addEventListener('canplay', finish)
    audio.addEventListener('durationchange', finish)
    audio.addEventListener('error', onError)
    setTimeout(() => {
      if (settled) return
      if (isStale()) {
        fail(Object.assign(new Error('播放已取消'), { aborted: true }))
        return
      }
      if (audio.error) {
        onError()
        return
      }
      if (audio.readyState >= 1) finish()
      else fail(new Error(isLocal ? '本地音频加载超时，请检查文件是否存在或路径是否有效' : '音频加载超时，请检查网络或文件路径'))
    }, timeoutMs)
  })
}

export async function playNext() {
  if (!playQueue.value.length) return
  const next = resolveNextIndex(false)
  if (next < 0) {
    if (playMode.value === 'loop') await playTrackAt(0)
    return
  }
  await playTrackAt(next)
}

export async function playPrev() {
  if (!playQueue.value.length) return
  if (audio && audio.currentTime > 3) {
    seekTo(0)
    return
  }
  if (playMode.value === 'random' && playHistory.length) {
    const idx = playHistory.pop()
    await playTrackAt(idx, { fromHistory: true })
    return
  }
  let prev = currentQueueIndex.value - 1
  if (prev < 0) {
    if (playMode.value === 'loop' || playMode.value === 'random') prev = playQueue.value.length - 1
    else return
  }
  await playTrackAt(prev, { fromHistory: true })
}

export async function togglePause() {
  if (!currentPlaying.value) return
  unlockAudioFromGesture()

  if (isBuffering.value) {
    cancelPlaybackIntent()
    syncMediaSessionPlaybackState()
    saveQueueState()
    return
  }

  if (!hasPlayableAudioSrc()) {
    const idx = resolveQueueIndexForCurrent()
    if (idx >= 0) {
      try {
        await playTrackAt(idx, { resumeTime: currentTime.value })
      } catch (e) {
        playerError.value = e?.message || '播放失败'
      }
    }
    return
  }
  if (audio.paused) {
    beginPlaybackBuffer()
    applyAudioOutput()
    try {
      unlockAudioFromGesture()
      await audio.play()
      clearPlaybackError()
      isPaused.value = false
      saveQueueState()
      if (visualizerEnabled.value) {
        await ensurePlaybackGraph()
        scheduleAudioAnalyserRefresh()
      }
    } catch (e) {
      endPlaybackBuffer()
      isPaused.value = true
      syncMediaSessionPlaybackState()
      if (isBenignPlayInterrupt(e)) {
        playerError.value = ''
      } else if (e?.name === 'NotAllowedError') {
        playerError.value = '浏览器拦截了自动播放，请再点一次播放'
      } else {
        playerError.value = formatPlayClientError(e) || '播放失败'
      }
    }
  } else {
    audio.pause()
    endPlaybackBuffer()
    isPaused.value = true
    syncMediaSessionPlaybackState()
    saveQueueState()
  }
  syncMediaSessionPlaybackState()
}

export function stopPlay() {
  cancelPlaybackIntent()
  clearMediaAudioCache()
  stopPlaybackGraph()
  if (audio) {
    audio.pause()
    audio.removeAttribute('src')
    try { audio.load() } catch {}
  }
  hasMediaSrc = false
  currentPlaying.value = null
  currentQueueIndex.value = -1
  isPaused.value = true
  currentTime.value = 0
  duration.value = 0
  setCoverUrl('')
  resetLyricState()
  playerError.value = ''
  clearMediaSession()
  saveQueueState()
}

export function seekTo(time) {
  if (audio) audio.currentTime = time
  currentTime.value = time
  saveQueueState()
}

export function setVolume(val) {
  const next = Math.min(1, Math.max(0, Number(val)))
  const rounded = Math.round(next * 100) / 100
  if (rounded <= 0.001) {
    volumeBeforeMute = volume.value > 0.001 ? volume.value : volumeBeforeMute
    isMuted.value = true
  } else {
    volume.value = rounded
    volumeBeforeMute = rounded
    isMuted.value = false
  }
  applyAudioOutput()
  try {
    localStorage.setItem(VOLUME_KEY, String(volumeBeforeMute > 0.001 ? volumeBeforeMute : rounded || 0.8))
    localStorage.setItem(MUTE_KEY, String(isMuted.value))
  } catch {}
}

export function toggleMute() {
  if (isMuted.value) {
    isMuted.value = false
    if (volume.value <= 0.001) {
      volume.value = volumeBeforeMute > 0.001 ? volumeBeforeMute : 0.8
    }
  } else {
    volumeBeforeMute = volume.value > 0.001 ? volume.value : volumeBeforeMute
    isMuted.value = true
  }
  applyAudioOutput()
  try { localStorage.setItem(MUTE_KEY, String(isMuted.value)) } catch {}
}

export function fmtTime(sec) {
  if (sec == null || isNaN(sec) || !isFinite(sec) || sec < 0) return '00:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function toggleQueuePanel() {
  showQueuePanel.value = !showQueuePanel.value
}

function ensureLyricsForTrack(item, source, trackKey) {
  if (lyricTrackKey === trackKey && lyricLines.value.length) return
  if (item.lyric) {
    bindLyricsToTrack(trackKey, item.lyric)
    return
  }
  fetchLyric(item, source)
}

async function fetchLyric(item, activeSource) {
  const source = item.source || activeSource
  const trackKey = getTrackKey(item, source)
  const token = ++lyricFetchToken

  const applyLyric = (lyric) => {
    if (!lyric || token !== lyricFetchToken) return
    if (!currentPlaying.value) return
    if (getTrackKey(currentPlaying.value, currentPlaying.value.source) !== trackKey) return
    bindLyricsToTrack(trackKey, lyric)
    currentPlaying.value = { ...currentPlaying.value, lyric }
    patchQueueItem(trackKey, { lyric })
    saveQueueState()
    if (audio && !audio.paused) updateActiveLyric(audio.currentTime)
  }

  const payload = buildPlayPayload(item, source, '128k')
  const nameForSearch = normalizeLyricSearchName(item.name)
  for (let attempt = 0; attempt < 2; attempt++) {
    if (token !== lyricFetchToken) return
    try {
      const res = await api.play.getLyric({
        ...payload,
        name: attempt > 0 && nameForSearch ? nameForSearch : payload.name,
      })
      if (res.lyric) {
        applyLyric(res.lyric)
        return
      }
    } catch {}
    if (attempt < 1) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
}

async function fetchCover(item, activeSource, { force = false } = {}) {
  const source = item.source || activeSource
  const trackKey = getTrackKey(item, source)
  if (!force && hasFileCover(item)) return
  const token = ++coverFetchToken
  try {
    const res = await api.play.getCover(buildPlayPayload(item, source, '128k'))
    if (token !== coverFetchToken) return
    if (res.url && currentPlaying.value) {
      const same = getTrackKey(currentPlaying.value, currentPlaying.value.source) === trackKey
      if (same) {
        setCoverUrl(res.url)
        currentPlaying.value = { ...currentPlaying.value, picUrl: res.url, img: res.url }
        patchQueueItem(trackKey, { picUrl: res.url, img: res.url })
        saveQueueState()
        updateMediaSession()
      }
    } else if (force && token === coverFetchToken) {
      const same = currentPlaying.value
        && getTrackKey(currentPlaying.value, currentPlaying.value.source) === trackKey
      if (same && hasFileCover(currentPlaying.value)) setCoverUrl('')
    }
  } catch {}
}

function normalizeLyricSearchName(name) {
  if (!name) return ''
  return String(name)
    .replace(/[《》「」『』【】[\]()（）]/g, ' ')
    .replace(/\s*(国语|粤语|英语|伴奏|纯音乐|DJ|Live|live|版|合唱版|低频公益版|3D环绕版)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function updateActiveLyric(time) {
  if (!lyricLines.value.length) return
  if (lyricLines.value.every((line) => line.time === 0)) {
    if (activeLyricIdx.value !== -1) activeLyricIdx.value = -1
    return
  }
  let idx = -1
  for (let i = lyricLines.value.length - 1; i >= 0; i--) {
    if (time >= lyricLines.value[i].time) { idx = i; break }
  }
  if (idx !== activeLyricIdx.value) activeLyricIdx.value = idx
}
