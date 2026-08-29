import { ref, computed } from 'vue'
import { api } from '../api.js'
import { cleanTrackItem } from '../utils/text.js'
import { buildPlayPayload } from '../utils/musicPayload.js'
import { getCachedPlayUrl, setCachedPlayUrl, rememberLoadedPlayUrl } from '../utils/playUrlCache.js'
import { formatUserError } from '../utils/userError.js'

export const currentPlaying = ref(null)
export const loadingPlay = ref(null)
export const isPaused = ref(false)
export const currentTime = ref(0)
export const duration = ref(0)
export const volume = ref(0.8)
export const isMuted = ref(false)
export const coverUrl = ref('')
export const lyricLines = ref([])
export const activeLyricIdx = ref(-1)
export const coverStyle = ref('disc')
export const visualizerEnabled = ref(true)
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
/** @type {MediaStreamAudioSourceNode | null} */
let streamSource = null
/** @type {HTMLAudioElement | null} */
let analyserAudio = null
/** @type {MediaElementAudioSourceNode | null} */
let analyserElementSource = null
/** @type {GainNode | null} */
let analyserSinkGain = null
/** @type {'capture' | 'element' | null} */
let analyserMode = null
let audioGraphReady = false
/** @type {number[]} */
let playHistory = []
let lastSessionSave = 0

const QUEUE_STORAGE_KEY = 'lx-music-nas:play-queue'
const SESSION_STORAGE_KEY = 'lx-music-nas:play-session'
const VOLUME_KEY = 'lx-music-nas:volume'
const MUTE_KEY = 'lx-music-nas:muted'
let volumeBeforeMute = 0.8
let lyricFetchToken = 0
let analyserBoundSrc = ''
let analyserSetupToken = 0
/** @type {ReturnType<typeof setTimeout> | 0} */
let analyserHealthTimer = 0
const ANALYSER_RETRY_DELAYS = [0, 50, 120, 250, 500, 1000, 2000, 4000, 6000]
const DEFAULT_PLAY_QUALITY = '128k'

function resetAudioGraph() {
  try { streamSource?.disconnect() } catch {}
  streamSource = null
  if (analyser) {
    try { analyser.disconnect() } catch {}
  }
  analyser = null
  audioGraphReady = false
}

function ensureAnalyserAudio() {
  if (!analyserAudio) {
    analyserAudio = new Audio()
    analyserAudio.crossOrigin = 'anonymous'
    analyserAudio.setAttribute('playsinline', '')
    analyserAudio.setAttribute('webkit-playsinline', '')
    analyserAudio.muted = true
    analyserAudio.volume = 0
    analyserAudio.preload = 'auto'
  }
  return analyserAudio
}

function pauseAnalyserAudio() {
  if (!analyserAudio) return
  try { analyserAudio.pause() } catch {}
}

function pauseAndResetAnalyserGraph() {
  analyserSetupToken++
  resetAudioGraph()
  analyserMode = null
  analyserBoundSrc = ''
  stopAnalyserHealthCheck()
  pauseAnalyserAudio()
}

function stopAnalyserPlayback() {
  pauseAndResetAnalyserGraph()
  if (analyserAudio) {
    try {
      analyserAudio.removeAttribute('src')
      analyserAudio.load()
    } catch {}
  }
}

function syncAnalyserAudioFromMain() {
  if (!audio || !hasPlayableAudioSrc() || audio.paused || isPaused.value) {
    pauseAnalyserAudio()
    return Promise.resolve(false)
  }
  if (document.visibilityState === 'hidden') {
    pauseAnalyserAudio()
    return Promise.resolve(false)
  }

  const el = ensureAnalyserAudio()
  const src = audio.src
  const time = audio.currentTime
  const needsSrc = el.src !== src
  if (needsSrc) {
    try {
      el.pause()
      el.src = src
      el.load()
    } catch {}
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = (ok) => {
      if (settled) return
      settled = true
      resolve(ok)
    }

    const playSynced = () => {
      try {
        if (time > 0 && (needsSrc || Math.abs(el.currentTime - time) > 0.25)) {
          el.currentTime = time
        }
      } catch {}
      const playPromise = el.play()
      if (playPromise?.then) {
        playPromise.then(() => finish(true)).catch(() => finish(false))
      } else {
        finish(!el.paused)
      }
    }

    const timer = setTimeout(() => finish(!el.paused), 1500)

    if (!needsSrc && !el.paused && el.readyState >= 2) {
      clearTimeout(timer)
      finish(true)
      return
    }

    if (el.readyState >= 2) {
      playSynced()
    } else {
      el.addEventListener('playing', () => {
        clearTimeout(timer)
        finish(true)
      }, { once: true })
      el.addEventListener('canplay', playSynced, { once: true })
      if (!needsSrc) playSynced()
    }
  })
}

function bindAudioElementEvents(el) {
  el.addEventListener('timeupdate', () => {
    if (audio !== el) return
    currentTime.value = audio.currentTime
    updateActiveLyric(audio.currentTime)
    syncDurationFromAudio()
    if (analyserMode === 'element' && analyserAudio && !analyserAudio.paused && !audio.paused) {
      if (Math.abs(analyserAudio.currentTime - audio.currentTime) > 0.35) {
        try { analyserAudio.currentTime = audio.currentTime } catch {}
      }
    }
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
    scheduleAudioAnalyserRefresh()
  })
  el.addEventListener('ended', () => {
    if (audio === el) onTrackEnded()
  })
  el.addEventListener('error', () => {
    if (audio !== el) return
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

function canUseCaptureStream() {
  if (!audio) return false
  const capture = audio.captureStream || audio.mozCaptureStream
  return typeof capture === 'function'
}

function shouldPreferElementAnalyser() {
  // 统一走静音副本 + MediaElementSource，切歌比 captureStream 稳定
  return document.visibilityState !== 'hidden'
}

function createAnalyserNode() {
  if (!audioCtx) return null
  const node = audioCtx.createAnalyser()
  node.fftSize = 256
  node.smoothingTimeConstant = 0.72
  return node
}

function ensureAnalyserSink() {
  if (!audioCtx) return null
  if (!analyserSinkGain) {
    analyserSinkGain = audioCtx.createGain()
    analyserSinkGain.gain.value = 0
    analyserSinkGain.connect(audioCtx.destination)
  }
  return analyserSinkGain
}

function connectAnalyserOutput(node) {
  const sink = ensureAnalyserSink()
  if (!sink) return false
  try { node.connect(sink) } catch { return false }
  return true
}

async function setupCaptureAnalyser() {
  if (!audio || !visualizerEnabled.value) return null
  if (audio.paused || !hasPlayableAudioSrc()) return null
  pauseAnalyserAudio()
  const capture = audio.captureStream || audio.mozCaptureStream
  if (typeof capture !== 'function') return null
  const stream = capture.call(audio)
  if (!stream.getAudioTracks().length) return null

  try { streamSource?.disconnect() } catch {}
  streamSource = audioCtx.createMediaStreamSource(stream)
  analyser = createAnalyserNode()
  if (!analyser) return null
  streamSource.connect(analyser)
  if (!connectAnalyserOutput(analyser)) return null
  analyserMode = 'capture'
  audioGraphReady = true
  return analyser
}

async function waitAnalyserSignal(maxWaitMs = 400, stepMs = 80) {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    if (analyserHasSignal()) return true
    await new Promise(resolve => setTimeout(resolve, stepMs))
  }
  return analyserHasSignal()
}

async function setupElementAnalyser() {
  if (!audio || !audioCtx || !visualizerEnabled.value) return null
  if (!hasPlayableAudioSrc() || audio.paused) return null
  try {
    const synced = await syncAnalyserAudioFromMain()
    if (!synced) return null
    const el = ensureAnalyserAudio()
    if (!analyserElementSource) {
      analyserElementSource = audioCtx.createMediaElementSource(el)
    }
    try { streamSource?.disconnect() } catch {}
    streamSource = null
    if (analyser) {
      try { analyser.disconnect() } catch {}
    }
    analyser = createAnalyserNode()
    if (!analyser) return null
    try { analyserElementSource.disconnect() } catch {}
    analyserElementSource.connect(analyser)
    if (!connectAnalyserOutput(analyser)) return null
    analyserMode = 'element'
    audioGraphReady = true
    return analyser
  } catch {
    return null
  }
}

async function resumeAudioPlayback() {
  try {
    if (audioCtx?.state === 'suspended') await audioCtx.resume()
  } catch {}
  if (!audio || isPaused.value || !hasMediaSrc) return
  if (audio.paused) {
    try { await audio.play() } catch {}
  }
  if (document.visibilityState !== 'visible' || !visualizerEnabled.value) return

  const src = audio.src || ''
  if (analyser && analyserBoundSrc === src && analyserMode === 'element') {
    await syncAnalyserAudioFromMain()
    if (analyserHasSignal()) {
      startAnalyserHealthCheck()
      return
    }
  }
  scheduleAudioAnalyserRefresh()
}

/** 在用户手势同步调用栈内解锁 AudioContext，避免异步拉链后 mobile 无法 play */
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
  const level = Math.min(1, Math.max(0, volume.value))
  audio.volume = level > 0 ? level : 1
  audio.muted = isMuted.value || level <= 0.001
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
        if (!lyricLines.value.length && currentPlaying.value.source !== 'local' && !currentPlaying.value.localPath) {
          fetchLyric(currentPlaying.value, currentPlaying.value.source)
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
  loadVisualizerSetting()

  window.addEventListener('beforeunload', saveQueueState)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveQueueState()
      pauseAnalyserAudio()
      try { audioCtx?.suspend() } catch {}
      return
    }
    resumeAudioPlayback()
  })
  window.addEventListener('focus', () => { resumeAudioPlayback() })
  window.addEventListener('pageshow', () => { resumeAudioPlayback() })
}

async function onTrackEnded() {
  if (playMode.value === 'single' && audio) {
    audio.currentTime = 0
    applyAudioOutput()
    await audio.play()
    scheduleAudioAnalyserRefresh()
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
  try {
    const settings = await api.settings.get()
    visualizerEnabled.value = settings['player.visualizer'] !== 'false'
  } catch {
    visualizerEnabled.value = true
  }
}

export function openFullscreenPlayer() {
  if (!currentPlaying.value) return
  showFullscreenPlayer.value = true
  showQueuePanel.value = false
}

export function closeFullscreenPlayer() {
  showFullscreenPlayer.value = false
}

function analyserHasSignal() {
  if (!analyser) return false
  const buf = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteFrequencyData(buf)
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] > 0) return true
  }
  return false
}

function stopAnalyserHealthCheck() {
  if (analyserHealthTimer) {
    clearInterval(analyserHealthTimer)
    analyserHealthTimer = 0
  }
}

function startAnalyserHealthCheck() {
  stopAnalyserHealthCheck()
  if (!visualizerEnabled.value || !audio || audio.paused) return
  analyserHealthTimer = setInterval(() => {
    if (!visualizerEnabled.value || !audio || audio.paused || document.visibilityState === 'hidden') return
    if (analyser && analyserBoundSrc === (audio.src || '') && analyserHasSignal()) return
    scheduleAudioAnalyserRefresh()
  }, 2000)
}

/** 建立 Web Audio 分析链路；使用静音副本音频，主播放器保持原生输出 */
export async function ensureAudioAnalyser() {
  if (!audio || !visualizerEnabled.value) return null
  if (document.visibilityState === 'hidden') return null
  if (audio.paused || !hasPlayableAudioSrc()) return null

  const src = audio.src || ''
  const token = analyserSetupToken

  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    if (!audioCtx) audioCtx = new AC()
    if (audioCtx.state === 'suspended') await audioCtx.resume()
    if (token !== analyserSetupToken) return null

    if (audioGraphReady && analyser && analyserBoundSrc === src) {
      if (analyserHasSignal()) return analyser
      if (analyserMode === 'element') {
        const synced = await syncAnalyserAudioFromMain()
        if (token !== analyserSetupToken) return null
        if (synced && await waitAnalyserSignal(350, 40)) {
          startAnalyserHealthCheck()
          return analyser
        }
      }
    }

    resetAudioGraph()
    analyserMode = null

    if (shouldPreferElementAnalyser()) {
      const node = await setupElementAnalyser()
      if (token !== analyserSetupToken) return null
      if (node && await waitAnalyserSignal(500, 60)) {
        analyserBoundSrc = src
        startAnalyserHealthCheck()
        return node
      }
      resetAudioGraph()
      analyserMode = null
    }

    if (!canUseCaptureStream()) return null
    const captured = await setupCaptureAnalyser()
    if (token !== analyserSetupToken) return null
    if (captured && await waitAnalyserSignal(400, 60)) {
      analyserBoundSrc = src
      startAnalyserHealthCheck()
      return captured
    }

    resetAudioGraph()
    analyserMode = null
    const fallback = await setupElementAnalyser()
    if (token !== analyserSetupToken) return null
    if (fallback && await waitAnalyserSignal(800, 80)) {
      analyserBoundSrc = src
      startAnalyserHealthCheck()
      return fallback
    }

    resetAudioGraph()
    analyserMode = null
    return null
  } catch {
    resetAudioGraph()
    analyserMode = null
    return null
  }
}

/** captureStream 无数据时切换到 MediaElementSource */
export function promoteElementAnalyser() {
  if (!audio || !visualizerEnabled.value) return
  if (document.visibilityState === 'hidden') return
  pauseAndResetAnalyserGraph()
  scheduleAudioAnalyserRefresh()
}

export function getAnalyserMode() {
  return analyserMode
}

/** 播放开始后重建频谱分析 */
export function scheduleAudioAnalyserRefresh() {
  if (!visualizerEnabled.value || !audio) return
  if (document.visibilityState === 'hidden') return

  const trySetup = () => {
    ensureAudioAnalyser().catch(() => {})
  }
  const scheduleRetries = () => {
    trySetup()
    requestAnimationFrame(trySetup)
    for (const delay of ANALYSER_RETRY_DELAYS) {
      setTimeout(trySetup, delay)
    }
  }
  if (!audio.paused) scheduleRetries()
  else audio.addEventListener('playing', scheduleRetries, { once: true })
}

/** 切歌后强制重建频谱（供可视化组件调用） */
export function resetAudioAnalyserForTrack() {
  if (!visualizerEnabled.value) return
  pauseAndResetAnalyserGraph()
  scheduleAudioAnalyserRefresh()
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

async function resolvePlayUrl(item, source, quality = DEFAULT_PLAY_QUALITY) {
  const isLocal = Boolean(item.localPath) || source === 'local'
  if (isLocal) {
    const res = await api.play.getUrl(buildPlayPayload(item, 'local', quality, { localPath: item.localPath }))
    return res.url || ''
  }

  const cached = getCachedPlayUrl(item, source, quality)
  if (cached) return cached

  const res = await api.play.getUrl(buildPlayPayload(item, source, quality))
  const url = res.url || ''
  if (url) setCachedPlayUrl(item, source, quality, url)
  return url
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

  const sameSrc = audio.src === url && hasMediaSrc
  if (!sameSrc) {
    if (!resumeTime) currentTime.value = 0
    duration.value = 0
    if (item) applyDurationFallback(item)
    audio.src = url
    hasMediaSrc = true
    pauseAndResetAnalyserGraph()
    await waitForAudioReady()
  } else if (audio.readyState < 2) {
    await waitForAudioReady()
  }

  applyAudioOutput()
  if (resumeTime > 0) {
    try {
      audio.currentTime = resumeTime
      currentTime.value = resumeTime
    } catch {}
  } else if (!sameSrc) {
    currentTime.value = 0
  }

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
  currentQueueIndex.value = index
  saveQueueState()

  loadingPlay.value = item.id
  playerError.value = ''
  try {
    const quality = DEFAULT_PLAY_QUALITY
    const cachedUrl = getCachedPlayUrl(item, source, quality)
    if (canReuseLoadedAudio(cachedUrl, item, source)) {
      await startPlaybackFromUrl(cachedUrl, { resumeTime, item, source })
    } else {
      const url = cachedUrl || await resolvePlayUrl(item, source, quality)
      if (!url) throw new Error('获取播放链接失败')
      await startPlaybackFromUrl(url, { resumeTime, item, source })
    }

    syncDurationFromAudio()
    applyDurationFallback(item)

    const trackKey = getTrackKey(item, source)
    const keepLyrics = lyricLines.value.length > 0
      && currentPlaying.value
      && getTrackKey(currentPlaying.value, currentPlaying.value.source) === trackKey

    currentPlaying.value = cleanTrackItem(item)
    isPaused.value = false
    coverUrl.value = item.picUrl || item.img || ''
    if (!keepLyrics) {
      lyricLines.value = []
      activeLyricIdx.value = -1
    }

    const isLocal = Boolean(item.localPath) || source === 'local'
    if (isLocal && item.lyric) {
      lyricLines.value = parseLrc(item.lyric)
    } else if (!isLocal) {
      if (!lyricLines.value.length) fetchLyric(item, source)
      if (!(item.picUrl || item.img) && !coverUrl.value) fetchCover(item, source)
    } else if (!lyricLines.value.length) {
      fetchLyric(item, source)
    }
    updateActiveLyric(audio?.currentTime || 0)
    saveQueueState()
    scheduleAudioAnalyserRefresh()
  } catch (e) {
    const message = formatPlayClientError(e)
    playerError.value = message
    throw new Error(message)
  } finally {
    loadingPlay.value = null
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
    applyAudioOutput()
    try {
      await audio.play()
      isPaused.value = false
      saveQueueState()
      scheduleAudioAnalyserRefresh()
    } catch (e) {
      if (e?.name === 'NotAllowedError') {
        playerError.value = '浏览器拦截了自动播放，请再点一次播放'
      } else {
        playerError.value = e?.message || '播放失败'
      }
    }
  } else {
    audio.pause()
    pauseAnalyserAudio()
    stopAnalyserHealthCheck()
    resetAudioGraph()
    analyserMode = null
    isPaused.value = true
    saveQueueState()
  }
}

export function stopPlay() {
  stopAnalyserPlayback()
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
  saveQueueState()
}

export function seekTo(time) {
  if (audio) audio.currentTime = time
  if (analyserAudio?.src) {
    try { analyserAudio.currentTime = time } catch {}
  }
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
        lyric: item.lyric,
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
      const same = getTrackKey(currentPlaying.value, currentPlaying.value.source)
        === getTrackKey(item, source)
      if (same) {
        coverUrl.value = res.url
        currentPlaying.value = { ...currentPlaying.value, picUrl: res.url, img: res.url }
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

function parseLrc(lrc) {
  if (!lrc) return []
  const normalized = String(lrc).replace(/\uFEFF/g, '').replace(/\r/g, '')
  const lines = []
  for (const rawLine of normalized.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    if (/^\[(?:ti|ar|al|by|offset|id):/i.test(line)) continue
    const match = line.match(/^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)$/)
    if (match) {
      const min = parseInt(match[1], 10)
      const sec = parseInt(match[2], 10)
      const msRaw = match[3] || ''
      const ms = msRaw ? parseInt(msRaw.padEnd(3, '0').slice(0, 3), 10) : 0
      const time = min * 60 + sec + ms / 1000
      const text = match[4].trim()
      if (text) lines.push({ time, text })
    }
  }
  lines.sort((a, b) => a.time - b.time)
  return lines
}

function updateActiveLyric(time) {
  if (!lyricLines.value.length) return
  let idx = -1
  for (let i = lyricLines.value.length - 1; i >= 0; i--) {
    if (time >= lyricLines.value[i].time) { idx = i; break }
  }
  if (idx !== activeLyricIdx.value) activeLyricIdx.value = idx
}
