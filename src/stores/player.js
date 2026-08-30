import { ref, computed } from 'vue'
import { api } from '../api.js'
import { cleanTrackItem } from '../utils/text.js'
import { buildPlayPayload } from '../utils/musicPayload.js'
import { getCachedPlayUrl, setCachedPlayUrl, rememberLoadedPlayUrl } from '../utils/playUrlCache.js'
import { formatUserError } from '../utils/userError.js'
import {
  askSourceFallback,
  getSourceFallbackOffer,
  isSourceFallbackError,
  notifySourceSwitch,
} from './sourceFallback.js'
import { recordRecentPlay, localCoverUrl, bumpLibraryCoverVersion } from './library.js'
import { parseLrc } from '../utils/lrc.js'
import { formatArtists } from '../utils/text.js'

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
export const lyricLines = ref([])
export const activeLyricIdx = ref(-1)
export const coverStyle = ref('disc')
export const visualizerEnabled = ref(true)
/** 关闭频谱时自动启用后台播放（与 visualizerEnabled 互斥） */
export const backgroundPlayEnabled = computed(() => !visualizerEnabled.value)
export const showFullscreenPlayer = ref(false)
export const playerError = ref('')

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
let localMetaFetchToken = 0
let analyserBoundSrc = ''
const PLAYBACK_GRAPH_RETRY_DELAYS = [0, 60, 150, 400]

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

function applyLocalMetaToPlaying(data, filePath) {
  if (!data || !filePath || !currentPlaying.value) return
  const trackKey = `local:${filePath}`
  if (getTrackKey(currentPlaying.value, 'local') !== trackKey) return

  const updates = {}
  if (data.title) updates.name = data.title
  if (data.artist) updates.singer = data.artist
  if (data.album) updates.album = data.album

  let pic = ''
  const coverTouched = Boolean(
    data.pictureBase64 || data.pic || data.picUrl || data.hasPicture !== undefined,
  )
  if (coverTouched) bumpLibraryCoverVersion(filePath)
  if (data.pictureBase64 || data.pic) {
    pic = normalizeLocalCover(data.pictureBase64 || data.pic, data.pictureMime)
  } else if (data.picUrl) {
    pic = data.picUrl
  } else if (data.hasPicture !== false) {
    pic = localCoverUrl(filePath)
  }
  if (pic) {
    coverUrl.value = pic
    updates.picUrl = pic
    updates.img = pic
  } else if (data.hasPicture === false) {
    coverUrl.value = ''
    updates.picUrl = ''
    updates.img = ''
  }

  const lyric = data.lyric || ''
  if (lyric) {
    lyricLines.value = parseLrc(lyric)
    updates.lyric = lyric
    activeLyricIdx.value = -1
    if (audio && !audio.paused) updateActiveLyric(audio.currentTime)
  } else if (data.hasLyrics === false) {
    lyricLines.value = []
    updates.lyric = ''
    activeLyricIdx.value = -1
  }

  if (Object.keys(updates).length) {
    currentPlaying.value = cleanTrackItem({ ...currentPlaying.value, ...updates })
    patchQueueItem(trackKey, updates)
    saveQueueState()
  }
}

/** 标签保存后刷新正在试听的本地文件信息 */
export async function refreshPlayingLocalMeta(filePath, meta) {
  if (!filePath || !currentPlaying.value?.localPath) return
  if (currentPlaying.value.localPath !== filePath) return
  if (meta) {
    applyLocalMetaToPlaying(meta, filePath)
    return
  }
  try {
    const res = await api.tag.read(filePath)
    if (res?.error) return
    applyLocalMetaToPlaying(res, filePath)
  } catch {}
}

async function fetchLocalMeta(item) {
  const filePath = item?.localPath
  if (!filePath) return
  const trackKey = getTrackKey(item, 'local')
  const token = ++localMetaFetchToken
  try {
    const res = await api.tag.read(filePath)
    if (token !== localMetaFetchToken) return
    if (!currentPlaying.value || getTrackKey(currentPlaying.value, 'local') !== trackKey) return
    applyLocalMetaToPlaying(res, filePath)
  } catch {}
}
function beginPlaybackBuffer() {
  isBuffering.value = true
  isPaused.value = false
}

function endPlaybackBuffer() {
  isBuffering.value = false
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
    if (now - lastSessionSave > 2000) {
      lastSessionSave = now
      saveQueueState()
    }
  })
  el.addEventListener('loadedmetadata', () => {
    if (audio === el) syncDurationFromAudio()
  })
  el.addEventListener('durationchange', () => {
    if (audio === el) syncDurationFromAudio()
  })
  el.addEventListener('canplay', () => {
    if (audio === el) syncDurationFromAudio()
  })
  el.addEventListener('playing', () => {
    if (audio !== el) return
    endPlaybackBuffer()
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
    playerError.value = '音频加载失败，请尝试其他歌曲'
    loadingPlay.value = null
  })
}

function createAudioElement() {
  const el = new Audio()
  el.crossOrigin = 'anonymous'
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
  audio.src = src
  try {
    await waitForAudioReady()
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
      mainMediaSource = audioCtx.createMediaElementSource(audio)
      mainAudioTapElement = audio
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

function pickItemFields(item) {
  if (!item) return null
  const cleaned = cleanTrackItem(item)
  return {
    id: cleaned.id,
    name: cleaned.name,
    singer: cleaned.singer,
    source: cleaned.source,
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
    localPath: cleaned.localPath || '',
    lyric: cleaned.lyric || '',
  }
}

function saveQueueState() {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify({
      queue: playQueue.value.map(e => ({
        key: e.key,
        source: e.source,
        item: pickItemFields(e.item),
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

function syncCurrentPlayingFromQueue(forcePaused = false) {
  if (currentQueueIndex.value < 0 || !playQueue.value[currentQueueIndex.value]) return
  const { item, source } = playQueue.value[currentQueueIndex.value]
  const cleaned = cleanTrackItem({ ...item, source: item.source || source })
  currentPlaying.value = cleaned
  coverUrl.value = cleaned.picUrl || cleaned.img || ''
  lyricLines.value = cleaned.lyric ? parseLrc(cleaned.lyric) : []
  activeLyricIdx.value = -1
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
        coverUrl.value = data.currentPlaying.picUrl || data.currentPlaying.img || ''
        lyricLines.value = data.currentPlaying.lyric ? parseLrc(data.currentPlaying.lyric) : []
        activeLyricIdx.value = -1
        currentTime.value = Number(data.currentTime) || 0
        applyDurationFallback(currentPlaying.value)
        if (currentPlaying.value.localPath) {
          fetchLocalMeta(currentPlaying.value)
        } else if (!lyricLines.value.length) {
          fetchLyric(currentPlaying.value, currentPlaying.value.source)
        }
        if (!currentPlaying.value.localPath && !coverUrl.value) {
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
  if (item?.localPath) return `local:${item.localPath}`
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

  window.addEventListener('beforeunload', saveQueueState)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveQueueState()
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

async function resolvePlayUrl(item, source, quality = DEFAULT_PLAY_QUALITY, options = {}) {
  const isLocal = Boolean(item.localPath) || source === 'local'
  if (isLocal) {
    const res = await api.play.getUrl(buildPlayPayload(item, 'local', quality, { localPath: item.localPath }))
    return res.url || ''
  }

  const cached = getCachedPlayUrl(item, source, quality)
  if (cached && !options.sourceApiId) return cached

  const payload = buildPlayPayload(item, source, quality)
  if (options.sourceApiId) payload.sourceApiId = options.sourceApiId
  if (options.skipSourceIds?.length) payload.skipSourceIds = options.skipSourceIds

  try {
    const res = await api.play.getUrl(payload)
    if (res.sourceInfo?.switched) notifySourceSwitch(res.sourceInfo)
    const url = res.url || ''
    if (url) setCachedPlayUrl(item, source, quality, url)
    return url
  } catch (e) {
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
  if (audio.src !== url) return false
  if (!currentPlaying.value) return false
  return getTrackKey(currentPlaying.value, currentPlaying.value.source)
    === getTrackKey(item, source)
}

async function startPlaybackFromUrl(url, { resumeTime = 0, item, source } = {}) {
  if (!audio) initPlayer()

  if (!resumeTime) currentTime.value = 0
  duration.value = 0
  if (item) applyDurationFallback(item)
  if (audio.src !== url) {
    invalidatePlaybackGraph()
  }
  audio.src = url
  hasMediaSrc = true
  await waitForAudioReady()

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
  const intent = ++playIntentToken
  currentQueueIndex.value = index

  currentPlaying.value = cleanTrackItem(item)
  coverUrl.value = item.picUrl || item.img || ''
  if (!coverUrl.value && item.localPath && item.hasPicture !== false) {
    coverUrl.value = localCoverUrl(item.localPath)
  }

  beginPlaybackBuffer()
  saveQueueState()

  loadingPlay.value = item.id
  playerError.value = ''
  try {
    const quality = DEFAULT_PLAY_QUALITY
    const cachedUrl = getCachedPlayUrl(item, source, quality)
    if (canReuseLoadedAudio(cachedUrl, item, source)) {
      await startPlaybackFromUrl(cachedUrl, { resumeTime, item, source })
    } else {
      const url = await resolvePlayUrl(item, source, quality)
      if (!url) throw new Error('获取播放链接失败')
      await startPlaybackFromUrl(url, { resumeTime, item, source })
    }

    if (intent !== playIntentToken) {
      try { audio?.pause() } catch {}
      return
    }

    syncDurationFromAudio()
    applyDurationFallback(item)

    const trackKey = getTrackKey(item, source)
    const keepLyrics = lyricLines.value.length > 0
      && getTrackKey(currentPlaying.value, currentPlaying.value.source) === trackKey

    currentPlaying.value = cleanTrackItem(item)
    isPaused.value = false
    recordRecentPlay({ ...currentPlaying.value, source })
    coverUrl.value = item.picUrl || item.img || ''
    if (!keepLyrics) {
      lyricLines.value = []
      activeLyricIdx.value = -1
    }

    const isLocal = Boolean(item.localPath) || source === 'local'
    if (isLocal) {
      if (item.lyric && !keepLyrics) lyricLines.value = parseLrc(item.lyric)
      if (!coverUrl.value && item.localPath && item.hasPicture !== false) {
        coverUrl.value = item.picUrl || item.img || localCoverUrl(item.localPath)
      }
      fetchLocalMeta(item)
    } else {
      if (!keepLyrics) fetchLyric(item, source)
      if (!coverUrl.value) fetchCover(item, source)
    }
    updateActiveLyric(audio?.currentTime || 0)
    saveQueueState()
    updateMediaSession()
  } catch (e) {
    if (intent === playIntentToken) {
      endPlaybackBuffer()
      isPaused.value = true
      const message = formatPlayClientError(e)
      playerError.value = message
      throw new Error(message)
    }
  } finally {
    if (intent === playIntentToken) loadingPlay.value = null
  }
}

function formatPlayClientError(e) {
  return formatUserError(e, '试听失败，请确认音源已激活')
}

function waitForAudioReady() {
  return new Promise((resolve, reject) => {
    if (!audio) { resolve(); return }
    if (audio.readyState >= 1 && !audio.error) {
      syncDurationFromAudio()
      resolve()
      return
    }
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      if (audio.error) {
        reject(new Error(formatPlayClientError({ name: 'NotSupportedError' })))
        return
      }
      syncDurationFromAudio()
      resolve()
    }
    const onError = () => {
      if (settled) return
      settled = true
      reject(new Error(formatPlayClientError({ name: 'NotSupportedError' })))
    }
    audio.addEventListener('loadedmetadata', finish, { once: true })
    audio.addEventListener('canplay', finish, { once: true })
    audio.addEventListener('durationchange', finish, { once: true })
    audio.addEventListener('error', onError, { once: true })
    setTimeout(finish, 8000)
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
      saveQueueState()
      if (visualizerEnabled.value) {
        await ensurePlaybackGraph()
        scheduleAudioAnalyserRefresh()
      }
    } catch (e) {
      endPlaybackBuffer()
      isPaused.value = true
      syncMediaSessionPlaybackState()
      if (e?.name === 'NotAllowedError') {
        playerError.value = '浏览器拦截了自动播放，请再点一次播放'
      } else {
        playerError.value = e?.message || '播放失败'
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
  coverUrl.value = ''
  lyricLines.value = []
  activeLyricIdx.value = -1
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

async function fetchLyric(item, activeSource) {
  const source = item.source || activeSource
  const trackKey = getTrackKey(item, source)
  const token = ++lyricFetchToken

  const applyLyric = (lyric) => {
    if (!lyric || token !== lyricFetchToken) return
    if (!currentPlaying.value) return
    if (getTrackKey(currentPlaying.value, currentPlaying.value.source) !== trackKey) return
    const lines = parseLrc(lyric)
    lyricLines.value = lines
    activeLyricIdx.value = -1
    currentPlaying.value = { ...currentPlaying.value, lyric }
    patchQueueItem(trackKey, { lyric })
    saveQueueState()
    if (audio && !audio.paused) updateActiveLyric(audio.currentTime)
  }

  const payload = buildPlayPayload(item, source, '128k')
  const nameForSearch = normalizeLyricSearchName(item.name)
  for (let attempt = 0; attempt < 3; attempt++) {
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
    if (attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)))
    }
  }
}

async function fetchCover(item, activeSource) {
  const source = item.source || activeSource
  try {
    const res = await api.play.getCover(buildPlayPayload(item, source, '128k'))
    if (res.url && currentPlaying.value) {
      const trackKey = getTrackKey(item, source)
      const same = getTrackKey(currentPlaying.value, currentPlaying.value.source) === trackKey
      if (same) {
        coverUrl.value = res.url
        currentPlaying.value = { ...currentPlaying.value, picUrl: res.url, img: res.url }
        patchQueueItem(trackKey, { picUrl: res.url, img: res.url })
        saveQueueState()
        updateMediaSession()
      }
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
  let idx = -1
  for (let i = lyricLines.value.length - 1; i >= 0; i--) {
    if (time >= lyricLines.value[i].time) { idx = i; break }
  }
  if (idx !== activeLyricIdx.value) activeLyricIdx.value = idx
}
