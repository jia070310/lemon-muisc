import { ref, computed } from 'vue'
import { api } from '../api.js'
import { cleanTrackItem } from '../utils/text.js'
import { buildPlayPayload } from '../utils/musicPayload.js'

export const currentPlaying = ref(null)
export const loadingPlay = ref(null)
export const isPaused = ref(false)
export const currentTime = ref(0)
export const duration = ref(0)
export const volume = ref(0.8)
export const coverUrl = ref('')
export const lyricLines = ref([])
export const activeLyricIdx = ref(-1)
export const coverStyle = ref('disc')
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
/** @type {number[]} */
let playHistory = []
let lastSessionSave = 0

const QUEUE_STORAGE_KEY = 'lx-music-nas:play-queue'
const SESSION_STORAGE_KEY = 'lx-music-nas:play-session'

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
  coverUrl.value = cleaned.picUrl || ''
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
        coverUrl.value = data.currentPlaying.picUrl || ''
        lyricLines.value = data.currentPlaying.lyric ? parseLrc(data.currentPlaying.lyric) : []
        activeLyricIdx.value = -1
        currentTime.value = Number(data.currentTime) || 0
        applyDurationFallback(currentPlaying.value)
        // 刷新后默认暂停，用户可点播放继续
        isPaused.value = true
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
  audio.volume = volume.value
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

  window.addEventListener('beforeunload', saveQueueState)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveQueueState()
  })
}

async function onTrackEnded() {
  if (playMode.value === 'single' && audio) {
    audio.currentTime = 0
    await audio.play()
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
  if (!currentPlaying.value) return
  if (!audio?.src) {
    if (currentQueueIndex.value >= 0) {
      await playTrackAt(currentQueueIndex.value, { resumeTime: currentTime.value })
    }
    return
  }
  togglePause()
}

export async function playTrackAt(index, { fromHistory = false, resumeTime = 0 } = {}) {
  if (index < 0 || index >= playQueue.value.length) return

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
    await waitForAudioReady()
    if (resumeTime > 0) {
      try {
        audio.currentTime = resumeTime
        currentTime.value = resumeTime
      } catch {}
    }
    await audio.play()

    syncDurationFromAudio()
    applyDurationFallback(item)

    currentPlaying.value = cleanTrackItem(item)
    isPaused.value = false
    coverUrl.value = item.picUrl || ''
    lyricLines.value = []
    activeLyricIdx.value = -1

    if (isLocal && item.lyric) {
      lyricLines.value = parseLrc(item.lyric)
    } else if (!isLocal) {
      fetchLyric(item, source)
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
  const msg = e?.message || ''
  if (e?.name === 'NotSupportedError' || /no supported sources/i.test(msg)) {
    return '浏览器无法播放该音频，请尝试其他歌曲或音质'
  }
  if (/failed to load|network|audio/i.test(msg)) {
    return '音频加载失败，请检查网络或更换歌曲'
  }
  return msg || '试听失败，请确认音源已激活'
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

export function togglePause() {
  if (!currentPlaying.value) return
  if (!audio?.src) {
    if (currentQueueIndex.value >= 0) {
      playTrackAt(currentQueueIndex.value, { resumeTime: currentTime.value }).catch(() => {})
    }
    return
  }
  if (audio.paused) {
    audio.play()
    isPaused.value = false
  } else {
    audio.pause()
    isPaused.value = true
  }
  saveQueueState()
}

export function stopPlay() {
  if (audio) { audio.pause(); audio.src = '' }
  currentPlaying.value = null
  currentQueueIndex.value = -1
  isPaused.value = true
  currentTime.value = 0
  duration.value = 0
  coverUrl.value = ''
  lyricLines.value = []
  activeLyricIdx.value = -1
  saveQueueState()
}

export function seekTo(time) {
  if (audio) audio.currentTime = time
  currentTime.value = time
  saveQueueState()
}

export function setVolume(val) {
  volume.value = val
  if (audio) audio.volume = val
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
