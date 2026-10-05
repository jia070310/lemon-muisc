import { getDB } from '../db.js'
import {
  applyPreviewAutoClose,
  clearPreviewAutoCloseSkip,
} from './enabledPlatforms.js'

const HEALTH_KEY = 'source.health'
const WINDOW = 20
const MIN_SAMPLES = 5
const UNHEALTHY_RATIO = 0.5
/** 有「完整」与「试听」两类平台并存时，标为混合 */
const MIXED_OK_RATIO = 0.35

const PLATFORM_LABELS = {
  kw: '酷我',
  kg: '酷狗',
  tx: 'QQ音乐',
  wy: '网易云',
  mg: '咪咕',
}

function readAll() {
  const row = getDB().prepare('SELECT value FROM settings WHERE key = ?').get(HEALTH_KEY)
  if (!row?.value) return {}
  try {
    const parsed = JSON.parse(row.value)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(map) {
  getDB().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(HEALTH_KEY, JSON.stringify(map))
}

function emptyPlatformBucket() {
  return { outcomes: [] }
}

function emptyEntry() {
  return {
    outcomes: [], // legacy overall window (still maintained)
    byPlatform: {},
    unhealthy: false,
    dismissed: false,
    previewCount: 0,
    sampleCount: 0,
    ratio: 0,
    level: 'unknown',
    updatedAt: '',
  }
}

function normalizePlatform(platform) {
  const p = String(platform || '').trim().toLowerCase()
  if (!p || p === 'local' || p === 'all') return ''
  return p.slice(0, 16)
}

function platformLabel(key) {
  return PLATFORM_LABELS[key] || key
}

function summarizeOutcomes(outcomes) {
  const list = Array.isArray(outcomes) ? outcomes : []
  const sampleCount = list.length
  const previewCount = list.filter((x) => x === 1).length
  const ratio = sampleCount ? previewCount / sampleCount : 0
  const marked = sampleCount >= MIN_SAMPLES && ratio >= UNHEALTHY_RATIO
  const okEnough = sampleCount >= MIN_SAMPLES && ratio <= MIXED_OK_RATIO
  return {
    sampleCount,
    previewCount,
    ratio: Math.round(ratio * 1000) / 1000,
    marked,
    okEnough,
  }
}

function buildPlatformViews(byPlatform) {
  const views = []
  for (const [id, bucket] of Object.entries(byPlatform || {})) {
    const s = summarizeOutcomes(bucket?.outcomes)
    if (!s.sampleCount) continue
    let level = 'unknown'
    if (s.marked) level = 'preview'
    else if (s.okEnough) level = 'ok'
    else if (s.sampleCount >= MIN_SAMPLES) level = 'watch'
    views.push({
      id,
      label: platformLabel(id),
      level,
      sampleCount: s.sampleCount,
      previewCount: s.previewCount,
      ratio: s.ratio,
    })
  }
  views.sort((a, b) => b.sampleCount - a.sampleCount)
  return views
}

function deriveLevel(overall, platforms) {
  const previewPlatforms = platforms.filter((p) => p.level === 'preview')
  const okPlatforms = platforms.filter((p) => p.level === 'ok')
  if (previewPlatforms.length && okPlatforms.length) return 'mixed'
  if (overall.marked) return okPlatforms.length ? 'mixed' : 'preview'
  if (previewPlatforms.length) return 'preview'
  return 'ok'
}

function buildTip(level, overall, platforms) {
  if (level !== 'preview' && level !== 'mixed') return ''
  const pct = Math.round((overall.ratio || 0) * 100)
  const base = overall.sampleCount
    ? `近 ${overall.sampleCount} 次取链中约 ${pct}% 为试听片段`
    : '近期多次检测到试听片段'

  const previewNames = platforms.filter((p) => p.level === 'preview').map((p) => p.label)
  const okNames = platforms.filter((p) => p.level === 'ok').map((p) => p.label)

  if (level === 'mixed') {
    const previewPart = previewNames.length ? `${previewNames.join('、')} 多为试听` : '部分平台多为试听'
    const okPart = okNames.length ? `${okNames.join('、')} 较完整` : '另有平台相对完整'
    return `${base}。此音源内平台质量不一：${previewPart}，${okPart}。可继续使用，但下载/播放时注意平台；建议同时激活其他更完整的音源作兜底。`
  }

  if (previewNames.length) {
    return `${base}（${previewNames.join('、')}）。多数情况下只能听短片段，完整曲请换其他音源或同时激活备用音源。`
  }
  return `${base}，音源可能主要为试听。完整曲请更换或额外激活其他音源。`
}

function summarize(entry) {
  const outcomes = Array.isArray(entry.outcomes) ? entry.outcomes : []
  const byPlatform = entry.byPlatform && typeof entry.byPlatform === 'object' ? entry.byPlatform : {}
  const overall = summarizeOutcomes(outcomes)
  const platforms = buildPlatformViews(byPlatform)
  let level = deriveLevel(overall, platforms)
  if (overall.sampleCount < MIN_SAMPLES && !platforms.some((p) => p.level === 'preview')) {
    level = 'unknown'
  }
  const shouldWarn = (level === 'preview' || level === 'mixed') && !entry.dismissed
  return {
    ...entry,
    outcomes,
    byPlatform,
    sampleCount: overall.sampleCount,
    previewCount: overall.previewCount,
    ratio: overall.ratio,
    level,
    unhealthy: shouldWarn,
    platforms,
    tip: shouldWarn ? buildTip(level, overall, platforms) : '',
    badge: level === 'mixed' ? '部分平台试听' : (level === 'preview' ? '多为试听' : ''),
    updatedAt: entry.updatedAt || '',
  }
}

function pushOutcome(list, isPreview) {
  const next = Array.isArray(list) ? [...list] : []
  next.push(isPreview ? 1 : 0)
  while (next.length > WINDOW) next.shift()
  return next
}

/** Record one outcome for a source. isPreview=true means clip/trial length. */
export function recordSourceHealthOutcome(sourceId, isPreview, platform = '', userId = null) {
  const id = String(sourceId || '').trim()
  if (!id) return null
  const map = readAll()
  const prev = map[id] || emptyEntry()
  const outcomes = pushOutcome(prev.outcomes, isPreview)
  const byPlatform = { ...(prev.byPlatform && typeof prev.byPlatform === 'object' ? prev.byPlatform : {}) }
  const plat = normalizePlatform(platform)
  if (plat) {
    const bucket = byPlatform[plat] || emptyPlatformBucket()
    byPlatform[plat] = { outcomes: pushOutcome(bucket.outcomes, isPreview) }
  }

  let dismissed = Boolean(prev.dismissed)
  const draft = summarize({
    ...prev,
    outcomes,
    byPlatform,
    dismissed,
    updatedAt: new Date().toISOString(),
  })
  // recovered → clear dismiss; still bad → keep dismissed until user sees again after new samples
  if (draft.level === 'ok' || draft.level === 'unknown') dismissed = false

  const next = summarize({
    ...prev,
    outcomes,
    byPlatform,
    dismissed,
    updatedAt: new Date().toISOString(),
  })
  map[id] = next
  writeAll(map)

  if (userId && plat) {
    const platView = (next.platforms || []).find((p) => p.id === plat)
    if (platView?.level === 'preview') {
      applyPreviewAutoClose(userId, id, plat, platView.label)
    } else if (platView?.level === 'ok') {
      clearPreviewAutoCloseSkip(userId, id, plat)
    }
  }
  return next
}

export function getSourceHealth(sourceId) {
  const id = String(sourceId || '').trim()
  if (!id) return null
  const map = readAll()
  if (!map[id]) return null
  return summarize(map[id])
}

export function getAllSourceHealth() {
  const map = readAll()
  const out = {}
  for (const [id, entry] of Object.entries(map)) {
    out[id] = summarize(entry)
  }
  return out
}

/** User dismisses the badge until health recovers or worsens again after new samples. */
export function dismissSourceHealth(sourceId) {
  const id = String(sourceId || '').trim()
  if (!id) return null
  const map = readAll()
  const prev = map[id] || emptyEntry()
  const next = summarize({
    ...prev,
    dismissed: true,
    updatedAt: new Date().toISOString(),
  })
  next.unhealthy = false
  next.tip = ''
  next.badge = ''
  map[id] = { ...next, dismissed: true }
  writeAll(map)
  return getSourceHealth(id)
}

export function clearSourceHealth(sourceId) {
  const id = String(sourceId || '').trim()
  if (!id) return
  const map = readAll()
  delete map[id]
  writeAll(map)
}

export function sourceHealthPublicView(entry) {
  if (!entry) return null
  const summarized = entry.level ? entry : summarize(entry)
  return {
    unhealthy: Boolean(summarized.unhealthy),
    level: summarized.level || 'unknown',
    badge: summarized.unhealthy ? (summarized.badge || '') : '',
    tip: summarized.unhealthy ? (summarized.tip || '') : '',
    previewCount: summarized.previewCount || 0,
    sampleCount: summarized.sampleCount || 0,
    ratio: summarized.ratio || 0,
    platforms: (summarized.platforms || []).map((p) => ({
      id: p.id,
      label: p.label,
      level: p.level,
      sampleCount: p.sampleCount,
      previewCount: p.previewCount,
      ratio: p.ratio,
    })),
  }
}
