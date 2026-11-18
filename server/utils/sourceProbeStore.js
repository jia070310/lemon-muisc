/**
 * 音源平台探针结果：按 sourceId|platform 记录近期成败与耗时，供权重排序与状态面板。
 */
import { getDB } from '../db.js'
import { platformDisplayName, PLATFORM_LABELS, CORE_PLATFORM_ORDER } from './platformCatalog.js'

const KNOWN_MUSIC_PLATFORMS = new Set([
  ...CORE_PLATFORM_ORDER,
  ...Object.keys(PLATFORM_LABELS || {}),
])

const PROBE_KEY = 'source.probe'
const WINDOW = 12
const FAIL_STREAK_DISABLE = 3

function readRaw() {
  const row = getDB().prepare('SELECT value FROM settings WHERE key = ?').get(PROBE_KEY)
  if (!row?.value) return { config: {}, cells: {}, meta: {} }
  try {
    const parsed = JSON.parse(row.value)
    return parsed && typeof parsed === 'object'
      ? {
          config: parsed.config && typeof parsed.config === 'object' ? parsed.config : {},
          cells: parsed.cells && typeof parsed.cells === 'object' ? parsed.cells : {},
          meta: parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {},
        }
      : { config: {}, cells: {}, meta: {} }
  } catch {
    return { config: {}, cells: {}, meta: {} }
  }
}

function writeRaw(data) {
  getDB().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(PROBE_KEY, JSON.stringify(data))
}

export function getProbeConfig() {
  const { config } = readRaw()
  const enabled = config.enabled !== false && config.enabled !== 'false'
  const intervalMin = Math.max(15, Math.min(24 * 60, Number(config.intervalMin) || 60))
  const autoDisable = config.autoDisable !== false && config.autoDisable !== 'false'
  return { enabled, intervalMin, autoDisable }
}

export function setProbeConfig(patch = {}) {
  const data = readRaw()
  const next = { ...data.config }
  if (patch.enabled != null) next.enabled = Boolean(patch.enabled)
  if (patch.intervalMin != null) {
    next.intervalMin = Math.max(15, Math.min(24 * 60, Number(patch.intervalMin) || 60))
  }
  if (patch.autoDisable != null) next.autoDisable = Boolean(patch.autoDisable)
  data.config = next
  writeRaw(data)
  return getProbeConfig()
}

export function probeCellKey(sourceId, platform) {
  return `${String(sourceId || '').trim()}|${String(platform || '').trim().toLowerCase()}`
}

function emptyCell() {
  return {
    outcomes: [], // { ok: 0|1, ms: number, at: iso, error?: string }
    failStreak: 0,
    updatedAt: '',
  }
}

function summarizeCell(cell) {
  const outcomes = Array.isArray(cell?.outcomes) ? cell.outcomes : []
  const sampleCount = outcomes.length
  const okCount = outcomes.filter((x) => x && x.ok).length
  const failCount = sampleCount - okCount
  const okRatio = sampleCount ? okCount / sampleCount : 0
  const recentOk = outcomes.length ? Boolean(outcomes[outcomes.length - 1]?.ok) : null
  const latencies = outcomes.filter((x) => x?.ok && Number(x.ms) > 0).map((x) => Number(x.ms))
  const avgMs = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : 0
  const lastMs = outcomes.length ? Number(outcomes[outcomes.length - 1]?.ms) || 0 : 0
  const lastError = outcomes.length && !outcomes[outcomes.length - 1]?.ok
    ? String(outcomes[outcomes.length - 1]?.error || '')
    : ''
  let level = 'unknown'
  if (sampleCount >= 1) {
    if (recentOk === false && (cell?.failStreak || 0) >= FAIL_STREAK_DISABLE) level = 'down'
    else if (recentOk === false) level = 'fail'
    else if (okRatio >= 0.7) level = 'ok'
    else if (okRatio >= 0.4) level = 'watch'
    else level = 'fail'
  }
  return {
    sampleCount,
    okCount,
    failCount,
    okRatio: Math.round(okRatio * 1000) / 1000,
    avgMs,
    lastMs,
    recentOk,
    failStreak: Number(cell?.failStreak) || 0,
    level,
    lastError: lastError.slice(0, 160),
    updatedAt: cell?.updatedAt || '',
    history: outcomes.slice(-WINDOW).map((x) => ({
      ok: Boolean(x?.ok),
      ms: Number(x?.ms) || 0,
      at: x?.at || '',
    })),
  }
}

/** 记录一次探针结果；返回是否刚达到应自动关闭的连续失败阈值 */
export function recordProbeOutcome(sourceId, platform, { ok, ms = 0, error = '' } = {}) {
  const sid = String(sourceId || '').trim()
  const plat = String(platform || '').trim().toLowerCase()
  if (!sid || !plat) return { shouldDisable: false, summary: null }

  const data = readRaw()
  const key = probeCellKey(sid, plat)
  const prev = data.cells[key] || emptyCell()
  const outcomes = Array.isArray(prev.outcomes) ? [...prev.outcomes] : []
  outcomes.push({
    ok: ok ? 1 : 0,
    ms: Math.max(0, Math.round(Number(ms) || 0)),
    at: new Date().toISOString(),
    error: ok ? '' : String(error || '').slice(0, 200),
  })
  while (outcomes.length > WINDOW) outcomes.shift()

  const failStreak = ok ? 0 : (Number(prev.failStreak) || 0) + 1
  const cell = {
    outcomes,
    failStreak,
    updatedAt: new Date().toISOString(),
  }
  data.cells[key] = cell
  writeRaw(data)

  const summary = summarizeCell(cell)
  const crossed = !ok && failStreak >= FAIL_STREAK_DISABLE && (Number(prev.failStreak) || 0) < FAIL_STREAK_DISABLE
  return { shouldDisable: crossed, summary, failStreak }
}

export function getProbeCell(sourceId, platform) {
  const data = readRaw()
  const key = probeCellKey(sourceId, platform)
  const cell = data.cells[key]
  if (!cell) return null
  return summarizeCell(cell)
}

/**
 * 取链权重分：成功越快越高；失败/宕机大幅降权。
 * 与播放健康分叠加使用。
 */
export function getProbeScore(sourceId, platform) {
  const summary = getProbeCell(sourceId, platform)
  if (!summary || summary.sampleCount < 1) return 0
  if (summary.level === 'down') return -220
  if (summary.level === 'fail') return -120
  if (summary.level === 'watch') return 10
  // ok：按延迟给 20~80
  const ms = summary.avgMs || summary.lastMs || 5000
  if (ms <= 1500) return 80
  if (ms <= 3000) return 55
  if (ms <= 6000) return 35
  if (ms <= 12000) return 20
  return 10
}

export function setProbeMeta(patch = {}) {
  const data = readRaw()
  data.meta = { ...(data.meta || {}), ...patch, updatedAt: new Date().toISOString() }
  writeRaw(data)
  return data.meta
}

export function getProbeMeta() {
  return readRaw().meta || {}
}

function platformLabel(key) {
  return PLATFORM_LABELS[key] || platformDisplayName(key) || key
}

/** 按音源聚合的公开视图 */
export function getProbePublicBySource(sourceIds = null) {
  const data = readRaw()
  const allow = Array.isArray(sourceIds) && sourceIds.length
    ? new Set(sourceIds.map(String))
    : null
  const bySource = {}
  for (const [key, cell] of Object.entries(data.cells || {})) {
    const [sid, plat] = String(key).split('|')
    if (!sid || !plat) continue
    if (allow && !allow.has(sid)) continue
    // 面板不展示脚本杂项平台（如 git）
    if (!KNOWN_MUSIC_PLATFORMS.has(plat)) continue
    const summary = summarizeCell(cell)
    if (!bySource[sid]) bySource[sid] = { platforms: [] }
    bySource[sid].platforms.push({
      id: plat,
      label: platformLabel(plat),
      ...summary,
    })
  }
  for (const entry of Object.values(bySource)) {
    entry.platforms.sort((a, b) => a.label.localeCompare(b.label, 'zh'))
    const plats = entry.platforms
    const ok = plats.filter((p) => p.level === 'ok').length
    const down = plats.filter((p) => p.level === 'down' || p.level === 'fail').length
    entry.okCount = ok
    entry.downCount = down
    entry.total = plats.length
    entry.level = down && ok
      ? 'mixed'
      : (down ? 'down' : (ok ? 'ok' : 'unknown'))
  }
  return {
    config: getProbeConfig(),
    meta: getProbeMeta(),
    sources: bySource,
  }
}

export { FAIL_STREAK_DISABLE, WINDOW as PROBE_WINDOW }
