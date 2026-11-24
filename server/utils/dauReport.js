/**
 * 日活上报：实例心跳（启动 + 每 15 分钟），带在线时长与上海时区日/小时。
 *
 * 环境变量：
 *   LEMON_DAU_URL     接收端地址，如 http://host:8099/api/dau/ping
 *   LEMON_DAU_TOKEN   与接收端 DAU_TOKEN 一致
 *   LEMON_DAU_DISABLED=1  关闭上报
 */
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'
import { getAppVersion } from './version.js'
import { getDeployEdition } from './filePaths.js'
import {
  drainFeatureCounts,
  drainQualityCounts,
  peekClientSurface,
  restoreFeatureCounts,
  restoreQualityCounts,
} from './featureUsage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const HEARTBEAT_MS = 15 * 60 * 1000
const BOOT_DELAY_MS = 5 * 1000
const MAX_ACTIVE_SEC = 30 * 60
const TZ = 'Asia/Shanghai'

let timer = null
let bootTimer = null
let lastBeatAt = 0
let inflight = false

function shanghaiParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  )
  let hour = Number(parts.hour)
  if (hour === 24) hour = 0
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
  }
}

function resolveConfigPath() {
  return process.env.CONFIG_PATH || path.join(__dirname, '..', '..', 'config')
}

function installIdPath(configPath) {
  return path.join(configPath, 'dau-install-id.json')
}

function lastBeatPath(configPath) {
  return path.join(configPath, 'dau-last-beat.json')
}

export function getOrCreateInstallId(configPath = resolveConfigPath()) {
  const file = installIdPath(configPath)
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    const id = String(raw?.installId || '').trim()
    if (id.length >= 8) return id
  } catch {}
  const installId = randomUUID()
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ installId, createdAt: new Date().toISOString() }, null, 2), 'utf8')
  } catch (e) {
    console.warn('[dau] 无法写入 installId:', e?.message || e)
  }
  return installId
}

function readLastBeatAt(configPath) {
  try {
    const raw = JSON.parse(fs.readFileSync(lastBeatPath(configPath), 'utf8'))
    const n = Number(raw?.at)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

function writeLastBeatAt(configPath, at) {
  try {
    fs.writeFileSync(
      lastBeatPath(configPath),
      JSON.stringify({ at, iso: new Date(at).toISOString() }, null, 2),
      'utf8',
    )
  } catch {}
}

function isDisabled() {
  const flag = String(process.env.LEMON_DAU_DISABLED || '').trim().toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'yes'
}

function getEndpoint() {
  return String(process.env.LEMON_DAU_URL || '').trim()
}

function getToken() {
  return String(process.env.LEMON_DAU_TOKEN || '').trim()
}

/**
 * @param {{ configPath?: string, event?: string, force?: boolean }} [opts]
 */
export async function reportDailyActive(opts = {}) {
  if (isDisabled()) return { skipped: true, reason: 'disabled' }
  const url = getEndpoint()
  if (!url) return { skipped: true, reason: 'no-url' }
  if (inflight && !opts.force) return { skipped: true, reason: 'inflight' }

  const configPath = opts.configPath || resolveConfigPath()
  const now = Date.now()
  const event = String(opts.event || 'heartbeat')
  const prev = lastBeatAt || readLastBeatAt(configPath) || now
  let activeSec = Math.floor((now - prev) / 1000)
  if (!Number.isFinite(activeSec) || activeSec < 0) activeSec = 0
  if (event === 'boot') activeSec = 0
  if (activeSec > MAX_ACTIVE_SEC) activeSec = MAX_ACTIVE_SEC

  const { day, hour } = shanghaiParts(new Date(now))
  const installId = getOrCreateInstallId(configPath)
  const features = drainFeatureCounts()
  const quality = drainQualityCounts()
  const clientSurfaceSnap = peekClientSurface()
  const body = {
    installId,
    appVersion: getAppVersion(),
    platform: process.platform,
    edition: getDeployEdition(),
    event,
    day,
    hour,
    activeSec,
    ts: now,
  }
  if (Object.keys(features).length) body.features = features
  if (quality) body.quality = quality
  // 当日访问端绝对值（按登录用户 + UA 粗分）；失败无需回滚
  if (clientSurfaceSnap?.day) {
    body.clientSurface = {
      day: clientSurfaceSnap.day,
      users: clientSurfaceSnap.users,
      hits: clientSurfaceSnap.hits,
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  const token = getToken()
  if (token) headers['X-DAU-Token'] = token

  inflight = true
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 12000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ac.signal,
    })
    if (!res.ok) {
      restoreFeatureCounts(features)
      restoreQualityCounts(quality)
      const text = await res.text().catch(() => '')
      console.warn(`[dau] 上报失败 HTTP ${res.status}: ${text.slice(0, 160)}`)
      return { ok: false, status: res.status }
    }
    lastBeatAt = now
    writeLastBeatAt(configPath, now)
    return { ok: true, day, hour, activeSec, event, features, quality, clientSurface: body.clientSurface }
  } catch (e) {
    restoreFeatureCounts(features)
    restoreQualityCounts(quality)
    if (e?.name !== 'AbortError') {
      console.warn('[dau] 上报失败:', e?.message || e)
    }
    return { ok: false, error: e?.message || String(e) }
  } finally {
    clearTimeout(t)
    inflight = false
  }
}

/**
 * 启动后上报 boot，并每 15 分钟 heartbeat。
 * @param {{ configPath?: string }} [opts]
 */
export function startDauReporter(opts = {}) {
  if (isDisabled()) {
    console.info('[dau] 已禁用（LEMON_DAU_DISABLED），跳过上报')
    return () => {}
  }
  if (!getEndpoint()) {
    console.info('[dau] 未配置 LEMON_DAU_URL，跳过上报（发行包需在构建时注入）')
    return () => {}
  }
  console.info(`[dau] 上报已启用 → ${getEndpoint()} · edition=${getDeployEdition()}`)

  const configPath = opts.configPath || resolveConfigPath()
  lastBeatAt = Date.now()

  const beat = (event) => {
    reportDailyActive({ configPath, event }).catch(() => {})
  }

  if (bootTimer) clearTimeout(bootTimer)
  bootTimer = setTimeout(() => beat('boot'), BOOT_DELAY_MS)
  bootTimer.unref?.()

  if (timer) clearInterval(timer)
  timer = setInterval(() => beat('heartbeat'), HEARTBEAT_MS)
  timer.unref?.()

  const onExit = () => {
    // best-effort；进程退出时不一定等得到
    try {
      reportDailyActive({ configPath, event: 'shutdown', force: true })
    } catch {}
  }
  process.once('SIGINT', onExit)
  process.once('SIGTERM', onExit)

  return () => {
    if (bootTimer) clearTimeout(bootTimer)
    if (timer) clearInterval(timer)
    bootTimer = null
    timer = null
  }
}
