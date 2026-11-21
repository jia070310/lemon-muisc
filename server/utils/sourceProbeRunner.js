/**
 * 周期 / 手动探针：对激活音源×平台做 search → musicUrl，记录耗时与成败。
 */
import { searchMusic, AVAILABLE_SOURCES } from '../musicSdk.js'
import { getActiveSources, requestSourceWithMeta } from '../sourceManager.js'
import { buildMusicInfo } from './musicInfo.js'
import { getUnionActiveSourceIds } from './activeSources.js'
import { getDB } from '../db.js'
import { isValidPlatformKey, PLATFORM_LABELS, CORE_PLATFORM_ORDER } from './platformCatalog.js'

const PROBEABLE_PLATFORMS = new Set([
  ...CORE_PLATFORM_ORDER,
  ...Object.keys(AVAILABLE_SOURCES || {}),
  ...Object.keys(PLATFORM_LABELS || {}),
])
import {
  getProbeConfig,
  setProbeConfig,
  setProbeMeta,
  recordProbeOutcome,
  getProbePublicBySource,
  FAIL_STREAK_DISABLE,
} from './sourceProbeStore.js'
import { applyPreviewAutoClose } from './enabledPlatforms.js'
import { logRuntime } from './runtimeLog.js'

const PROBE_KEYWORDS = ['晴天', '告白气球', '海阔天空', '夜曲']
const PROBE_TIMEOUT_MS = 18000
const CONCURRENCY = 2

let timer = null
let started = false
let running = false
let currentIntervalMin = 60

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function withTimeout(promise, ms, message) {
  let timerId
  return Promise.race([
    promise.finally(() => clearTimeout(timerId)),
    new Promise((_, reject) => {
      timerId = setTimeout(() => reject(new Error(message || '探针超时')), ms)
    }),
  ])
}

function pickKeyword() {
  const i = Math.floor(Date.now() / 60000) % PROBE_KEYWORDS.length
  return PROBE_KEYWORDS[i]
}

function listUsersWithSource(sourceId) {
  const sid = String(sourceId || '')
  const rows = getDB().prepare(
    `SELECT user_id, value FROM user_settings WHERE key = 'source.active'`,
  ).all()
  const out = []
  for (const row of rows) {
    try {
      const ids = JSON.parse(row.value || '[]')
      if (Array.isArray(ids) && ids.map(String).includes(sid)) out.push(row.user_id)
    } catch {}
  }
  return out
}

function collectProbeTargets() {
  const active = getActiveSources()
  const union = new Set(getUnionActiveSourceIds())
  const targets = []
  for (const entry of active) {
    if (!entry?.id || !entry?.handler) continue
    if (union.size && !union.has(entry.id)) continue
    const plats = Object.keys(entry.sources || {}).filter((k) => isValidPlatformKey(k))
    for (const platform of plats) {
      const info = entry.sources?.[platform]
      const actions = Array.isArray(info?.actions) ? info.actions : []
      // 未声明 actions 视为支持 musicUrl
      if (actions.length && !actions.includes('musicUrl')) continue
      const type = String(info?.type || 'music').toLowerCase()
      if (type && type !== 'music') continue
      // 跳过脚本杂项 key（如 git），只测已知音乐平台或明确声明的 music 平台
      if (!PROBEABLE_PLATFORMS.has(platform) && !info?.name) continue
      if (!PROBEABLE_PLATFORMS.has(platform) && !/music|song|audio/i.test(String(info?.name || ''))) continue
      targets.push({ sourceId: entry.id, platform, sourceName: entry.name || entry.id })
    }
  }
  return targets
}

async function probeOne({ sourceId, platform }) {
  const keyword = pickKeyword()
  const t0 = Date.now()
  try {
    const search = await withTimeout(
      searchMusic(keyword, platform, 1, 4, { allowedSourceIds: [sourceId] }),
      PROBE_TIMEOUT_MS,
      '搜索超时',
    )
    const track = Array.isArray(search?.list) ? search.list.find((t) => t && (t.songId || t.songmid || t.hash || t.id)) : null
    if (!track) {
      const ms = Date.now() - t0
      return recordAndMaybeDisable(sourceId, platform, {
        ok: false,
        ms,
        error: `搜索无结果（${keyword}）`,
      })
    }
    const musicInfo = buildMusicInfo({
      ...track,
      source: platform,
      quality: '128k',
    })
    await withTimeout(
      requestSourceWithMeta(platform, 'musicUrl', {
        type: '128k',
        quality: '128k',
        musicInfo,
      }, {
        preferredSourceId: sourceId,
        allowedSourceIds: [sourceId],
        fallbackMode: 'ask',
        userId: null,
      }),
      PROBE_TIMEOUT_MS,
      '取链超时',
    )
    const ms = Date.now() - t0
    return recordAndMaybeDisable(sourceId, platform, { ok: true, ms })
  } catch (e) {
    const ms = Date.now() - t0
    return recordAndMaybeDisable(sourceId, platform, {
      ok: false,
      ms,
      error: e?.message || String(e) || '探针失败',
    })
  }
}

function recordAndMaybeDisable(sourceId, platform, result) {
  const { shouldDisable, summary, failStreak } = recordProbeOutcome(sourceId, platform, result)
  const cfg = getProbeConfig()
  if (shouldDisable && cfg.autoDisable) {
    const label = `${platform} · 监测连续失败`
    for (const userId of listUsersWithSource(sourceId)) {
      try {
        applyPreviewAutoClose(userId, sourceId, platform, label)
      } catch {}
    }
    try {
      logRuntime('warn', 'source-probe', `自动关闭平台解析 ${sourceId}/${platform}（连续失败 ${failStreak}）`)
    } catch {}
  }
  return { sourceId, platform, ...result, summary, failStreak }
}

async function mapPool(items, limit, worker) {
  const results = []
  let i = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      results[idx] = await worker(items[idx])
    }
  })
  await Promise.all(runners)
  return results
}

/**
 * @param {{ reason?: string, sourceIds?: string[] }} [opts]
 * sourceIds：仅测这些音源（手动单测）；空则测全部激活音源
 */
export async function runSourceProbeRound({ reason = 'schedule', sourceIds = null } = {}) {
  if (running) {
    return { ok: false, skipped: true, reason: 'busy' }
  }
  running = true
  const startedAt = new Date().toISOString()
  try {
    const filterIds = Array.isArray(sourceIds)
      ? [...new Set(sourceIds.map((id) => String(id || '').trim()).filter(Boolean))]
      : []
    let targets = collectProbeTargets()
    if (filterIds.length) {
      const allow = new Set(filterIds)
      targets = targets.filter((t) => allow.has(String(t.sourceId)))
    }
    if (!targets.length) {
      setProbeMeta({
        lastRunAt: startedAt,
        lastReason: reason,
        lastOk: 0,
        lastFail: 0,
        lastTotal: 0,
        lastError: filterIds.length ? '指定音源无可测平台（需已激活且支持取链）' : '无激活音源可测',
      })
      return {
        ok: true,
        total: 0,
        okCount: 0,
        failCount: 0,
        results: [],
        sourceIds: filterIds,
      }
    }
    const results = await mapPool(targets, CONCURRENCY, probeOne)
    const ok = results.filter((r) => r?.ok).length
    const fail = results.length - ok
    setProbeMeta({
      lastRunAt: startedAt,
      lastFinishedAt: new Date().toISOString(),
      lastReason: reason,
      lastOk: ok,
      lastFail: fail,
      lastTotal: results.length,
      lastError: '',
    })
    console.log(`[source-probe] ${reason}${filterIds.length ? ` [${filterIds.join(',')}]` : ''}: ${ok}/${results.length} 成功`)
    return {
      ok: true,
      total: results.length,
      okCount: ok,
      failCount: fail,
      results,
      sourceIds: filterIds,
    }
  } catch (e) {
    setProbeMeta({
      lastRunAt: startedAt,
      lastReason: reason,
      lastError: e?.message || String(e),
    })
    console.warn('[source-probe]', e?.message || e)
    return { ok: false, error: e?.message || String(e) }
  } finally {
    running = false
  }
}

function clearTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export function rescheduleSourceProbe() {
  const cfg = getProbeConfig()
  currentIntervalMin = cfg.intervalMin
  clearTimer()
  if (!started || !cfg.enabled) return
  const ms = Math.max(15, cfg.intervalMin) * 60 * 1000
  timer = setInterval(() => {
    const live = getProbeConfig()
    if (!live.enabled) return
    runSourceProbeRound({ reason: 'schedule' }).catch(() => {})
  }, ms)
  timer.unref?.()
}

export function startSourceProbeScheduler() {
  if (started) return
  started = true
  const cfg = getProbeConfig()
  currentIntervalMin = cfg.intervalMin
  // 启动后错开，避开开机高峰
  setTimeout(() => {
    if (!getProbeConfig().enabled) return
    runSourceProbeRound({ reason: 'boot' }).catch(() => {})
  }, 3 * 60 * 1000).unref?.()
  rescheduleSourceProbe()
  console.log(`[source-probe] 已安排音源监测（${cfg.enabled ? `每 ${cfg.intervalMin} 分钟` : '已关闭'}）`)
}

export function stopSourceProbeScheduler() {
  clearTimer()
  started = false
}

export function updateProbeScheduleConfig(patch = {}) {
  const cfg = setProbeConfig(patch)
  if (started) rescheduleSourceProbe()
  return cfg
}

export function getSourceProbeStatus() {
  return {
    ...getProbePublicBySource(),
    running,
    scheduled: started,
    intervalMin: currentIntervalMin,
    failStreakDisable: FAIL_STREAK_DISABLE,
  }
}

export function isSourceProbeRunning() {
  return running
}
