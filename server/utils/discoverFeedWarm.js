/**
 * 发现页后台预热：周期性把推荐/新歌/新碟/榜单写入磁盘缓存，
 * 用户打开时优先读盘，避免当场打音源。
 *
 * 大曲库机器上：间隔必须长于单轮耗时，并对连续失败的源做冷却，避免事件循环被常驻预热占满。
 */
import {
  fetchNewSongs,
  fetchNewAlbums,
  fetchToplists,
} from '../discoverSdk.js'
import { AVAILABLE_SOURCES, fetchRecommendPlaylists } from '../musicSdk.js'
import { getActiveSources } from '../sourceManager.js'
import { createLimiter, withTimeout } from './asyncLimit.js'
import {
  buildDiscoverFeedKey,
  forceFetchDiscoverFeed,
  getDiscoverFeedCacheStats,
} from './discoverFeedCache.js'

const WARM_TIMEOUT_MS = 18000
/** 默认 6 小时一轮（可用 LEMON_DISCOVER_WARM_INTERVAL_MS 覆盖） */
const WARM_INTERVAL_MS = (() => {
  const raw = Number.parseInt(String(process.env.LEMON_DISCOVER_WARM_INTERVAL_MS || ''), 10)
  if (Number.isFinite(raw) && raw >= 60_000) return raw
  return 6 * 60 * 60 * 1000
})()
/** 启动后首次预热再等一会儿（可用环境变量覆盖，单位 ms） */
const WARM_INITIAL_DELAY_MS = (() => {
  const raw = Number.parseInt(String(process.env.LEMON_DISCOVER_WARM_INITIAL_MS || ''), 10)
  if (Number.isFinite(raw) && raw >= 0) return raw
  return 60 * 1000
})()
const FAIL_STREAK_COOL = 3
const SOURCE_COOL_MS = 30 * 60 * 1000

const warmLimiter = createLimiter(2)
let timer = null
let running = false
let lastRunAt = 0
let lastError = ''
/** @type {Map<string, number>} */
const failStreak = new Map()
/** @type {Map<string, number>} */
const coolUntil = new Map()

function defaultSongRegion(source) {
  if (source === 'tx') return 'latest'
  if (source === 'wy') return '0'
  return ''
}

function defaultAlbumRegion(source) {
  if (source === 'tx') return 'inland'
  if (source === 'wy') return 'ALL'
  return ''
}

function isSourceCooling(source) {
  const until = Number(coolUntil.get(source) || 0)
  return until > Date.now()
}

function noteSourceOk(source) {
  failStreak.set(source, 0)
  coolUntil.delete(source)
}

function noteSourceFail(source) {
  const n = (failStreak.get(source) || 0) + 1
  failStreak.set(source, n)
  if (n >= FAIL_STREAK_COOL) {
    coolUntil.set(source, Date.now() + SOURCE_COOL_MS)
    failStreak.set(source, 0)
    console.warn(`[discover-warm] source ${source} cooled ${SOURCE_COOL_MS / 60000}min after ${FAIL_STREAK_COOL} fails`)
  }
}

function listWarmSources() {
  const keys = new Set()
  for (const entry of getActiveSources() || []) {
    for (const key of Object.keys(entry.sources || {})) {
      if (AVAILABLE_SOURCES[key]) keys.add(key)
    }
  }
  // 无激活音源时仍预热常见平台，便于首次激活后立刻有盘缓存
  if (!keys.size) {
    for (const key of ['tx', 'wy', 'kg', 'kw', 'mg']) {
      if (AVAILABLE_SOURCES[key]) keys.add(key)
    }
  }
  return [...keys].filter((k) => !isSourceCooling(k))
}

function buildWarmJobs(source) {
  const jobs = []
  const songRegion = defaultSongRegion(source)
  const albumRegion = defaultAlbumRegion(source)

  for (const sort of ['new', 'hot']) {
    jobs.push({
      key: buildDiscoverFeedKey(['recommend', source, sort, 1, 20]),
      run: () => fetchRecommendPlaylists(source, sort, 1, 20),
      label: `recommend:${source}:${sort}`,
      source,
    })
  }
  jobs.push({
    key: buildDiscoverFeedKey(['newsongs', source, songRegion, 1, 27]),
    run: () => fetchNewSongs(source, songRegion, 1, 27),
    label: `newsongs:${source}`,
    source,
  })
  jobs.push({
    key: buildDiscoverFeedKey(['newalbums', source, albumRegion, 1, 20]),
    run: () => fetchNewAlbums(source, albumRegion, 1, 20),
    label: `newalbums:${source}`,
    source,
  })
  jobs.push({
    key: buildDiscoverFeedKey(['toplists', source]),
    run: () => fetchToplists(source),
    label: `toplists:${source}`,
    source,
  })
  return jobs
}

async function runWarmJob(job) {
  await forceFetchDiscoverFeed(job.key, () => warmLimiter(() => withTimeout(
    job.run(),
    WARM_TIMEOUT_MS,
    `${job.label} 预热超时`,
  )))
}

export async function warmDiscoverFeedsOnce({ reason = 'manual' } = {}) {
  if (running) return { skipped: true, reason: 'busy' }
  running = true
  lastError = ''
  const started = Date.now()
  const sources = listWarmSources()
  let ok = 0
  let fail = 0
  try {
    for (const source of sources) {
      if (isSourceCooling(source)) continue
      let sourceFail = 0
      let sourceOk = 0
      for (const job of buildWarmJobs(source)) {
        try {
          await runWarmJob(job)
          ok++
          sourceOk++
        } catch (e) {
          fail++
          sourceFail++
          lastError = e?.message || String(e)
        }
      }
      if (sourceOk > 0 && sourceFail === 0) noteSourceOk(source)
      else if (sourceFail > 0) noteSourceFail(source)
    }
    lastRunAt = Date.now()
    console.log(`[discover-warm] ${reason}: sources=${sources.join(',') || '-'} ok=${ok} fail=${fail} ${Date.now() - started}ms`)
    return { ok, fail, sources, ms: Date.now() - started }
  } finally {
    running = false
  }
}

export function startDiscoverFeedWarm() {
  if (timer) return
  const tick = () => {
    if (running) {
      console.log('[discover-warm] skip tick: previous round still running')
      return
    }
    warmDiscoverFeedsOnce({ reason: 'interval' }).catch(() => {})
  }
  setTimeout(() => {
    tick()
    timer = setInterval(tick, WARM_INTERVAL_MS)
    timer.unref?.()
  }, WARM_INITIAL_DELAY_MS).unref?.()
  console.log(`[discover-warm] scheduled (first in ${Math.round(WARM_INITIAL_DELAY_MS / 1000)}s, every ${Math.round(WARM_INTERVAL_MS / 60000)}min)`)
}

export function stopDiscoverFeedWarm() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export function getDiscoverFeedWarmStatus() {
  const cooling = [...coolUntil.entries()]
    .filter(([, until]) => until > Date.now())
    .map(([source, until]) => ({ source, until }))
  return {
    running,
    lastRunAt: lastRunAt || null,
    lastError: lastError || '',
    intervalMs: WARM_INTERVAL_MS,
    initialDelayMs: WARM_INITIAL_DELAY_MS,
    cooling,
    cache: getDiscoverFeedCacheStats(),
  }
}
