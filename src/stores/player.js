import { ref, computed } from 'vue'
import { api } from '../api.js'
import { cleanTrackItem } from '../utils/text.js'
import { buildPlayPayload } from '../utils/musicPayload.js'
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
let audioGraphReady = false
/** @type {number[]} */
let playHistory = []
let lastSessionSave = 0

const QUEUE_STORAGE_KEY = 'lx-music-nas:play-queue'
const SESSION_STORAGE_KEY = 'lx-music-nas:play-session'
const VOLUME_KEY = 'lx-music-nas:volume'
const MUTE_KEY = 'lx-music-nas:muted'
let volumeBeforeMute = 0.8

function resetAudioGraph() {
  try { streamSource?.disconnect() } catch {}
  streamSource = null
  analyser = null
  audioGraphReady = false
}

async function resumeAudioPlayback() {
  try {
    if (audioCtx?.state === 'suspended') await audioCtx.resume()
  } catch {}
  if (!audio || isPaused.value || !hasMediaSrc) return
  if (audio.paused) {
    try { await audio.play() } catch {}
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
  if (activeLyricIdx.value < 0 || !lyricLines.value.length) return ''
  return lyricLines.value[activeLyricIdx.value]?.text || ''
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
  const id = item?.songmid || item?.hash || item?.songId || item?.copyrightId || item?.id
  const src = item?.source || source || ''
  return `${src}:${id}`
}

export function initPlayer() {
  if (inited) return
  inited = true

  audio = new Audio()
  audio.crossOrigin = 'anonymous'
  audio.setAttribute('playsinline', '')
  audio.setAttribute('webkit-playsinline', '')
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
  audio.addEventListener('timeupdate', () => {
    currentTime.value = audio.currentTime
    updateActiveLyric(audio.currentTime)
    syncDurationFromAudio()
    const now = Date.now()
    if (now - lastSessionSave > 2000) {
      lastSessionSave = now
      saveQueueState()
    }
  })
  audio.addEventListener('loadedmetadata', syncDurationFromAudio)
  audio.addEventListener('durationchange', syncDurationFromAudio)
  audio.addEventListener('canplay', syncDurationFromAudio)
  audio.addEventListener('ended', onTrackEnded)
  audio.addEventListener('error', () => {
    playerError.value = '音频加载失败，请尝试其他歌曲'
    loadingPlay.value = null
  })

  restoreSessionState()
  loadCoverStyle()
  loadVisualizerSetting()

  window.addEventListener('beforeunload', saveQueueState)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveQueueState()
      resetAudioGraph()
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

/** 建立 Web Audio 分析链路，用 captureStream 读取频谱，不劫持 audio 原生输出 */
export async function ensureAudioAnalyser() {
  if (!audio || !visualizerEnabled.value) return null
  if (document.visibilityState === 'hidden') return null
  if (audio.paused || !hasPlayableAudioSrc()) return null
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    if (!audioCtx) audioCtx = new AC()
    if (audioCtx.state === 'suspended') await audioCtx.resume()
    if (audioGraphReady && analyser) return analyser

    const capture = audio.captureStream || audio.mozCaptureStream
    if (typeof capture !== 'function') return null
    const stream = capture.call(audio)
    if (!stream.getAudioTracks().length) return null

    try { streamSource?.disconnect() } catch {}
    streamSource = audioCtx.createMediaStreamSource(stream)
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.72
    streamSource.connect(analyser)
    // 不连接 destination，避免音频必须走 AudioContext（后台/锁屏会被挂起）
    audioGraphReady = true
    return analyser
  } catch {
    resetAudioGraph()
    return null
  }
}

/** 播放开始后重建频谱分析（captureStream 必须在 play 之后才有音频轨） */
export function scheduleAudioAnalyserRefresh() {
  if (!visualizerEnabled.value || !audio) return
  resetAudioGraph()
  const trySetup = () => {
    ensureAudioAnalyser().catch(() => {})
  }
  const scheduleRetries = () => {
    trySetup()
    requestAnimationFrame(trySetup)
    setTimeout(trySetup, 80)
  }
  if (!audio.paused) scheduleRetries()
  else audio.addEventListener('playing', scheduleRetries, { once: true })
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

  // 刷新后 currentPlaying 已恢复但 audio 未加载，继续播放同一首
  if (idx >= 0 && currentPlaying.value && getTrackKey(currentPlaying.value, currentPlaying.value.source) === key) {
    currentQueueIndex.value = idx
    await playTrackAt(idx, { resumeTime: currentTime.value })
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
    const isLocal = Boolean(item.localPath) || source === 'local'
    let url = ''
    if (isLocal) {
      const res = await api.play.getUrl(buildPlayPayload(item, 'local', '128k', { localPath: item.localPath }))
      url = res.url
    } else {
      const res = await api.play.getUrl(buildPlayPayload(item, source, '128k'))
      url = res.url
    }
    if (!url) throw new Error('获取播放链接失败')

    if (!audio) initPlayer()
    if (!resumeTime) currentTime.value = 0
    duration.value = 0
    applyDurationFallback(item)

    audio.src = url
    hasMediaSrc = true
    resetAudioGraph()
    applyAudioOutput()
    await waitForAudioReady()
    if (resumeTime > 0) {
      try {
        audio.currentTime = resumeTime
        currentTime.value = resumeTime
      } catch {}
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
    scheduleAudioAnalyserRefresh()

    syncDurationFromAudio()
    applyDurationFallback(item)

    currentPlaying.value = cleanTrackItem(item)
    isPaused.value = false
    coverUrl.value = item.picUrl || item.img || ''
    lyricLines.value = []
    activeLyricIdx.value = -1

    if (isLocal && item.lyric) {
      lyricLines.value = parseLrc(item.lyric)
    } else if (!isLocal) {
      fetchLyric(item, source)
      if (!(item.picUrl || item.img)) fetchCover(item, source)
    }
    saveQueueState()
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
    isPaused.value = true
    saveQueueState()
  }
}

export function stopPlay() {
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
  try {
    const res = await api.play.getLyric({
      ...buildPlayPayload(item, source, '128k'),
      lyric: item.lyric,
    })
    if (res.lyric) lyricLines.value = parseLrc(res.lyric)
  } catch {}
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

function parseLrc(lrc) {
  if (!lrc) return []
  const lines = []
  for (const line of lrc.split('\n')) {
    const match = line.match(/^\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\](.*)$/)
    if (match) {
      const min = parseInt(match[1])
      const sec = parseInt(match[2])
      const ms = match[3] ? parseInt(match[3].padEnd(3, '0')) : 0
      const time = min * 60 + sec + ms / 1000
      const text = match[4].trim()
      lines.push({ time, text })
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
