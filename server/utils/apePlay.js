import { spawn } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'
import { getGlobalSettings, setGlobalSettings } from './userSettings.js'

const require = createRequire(import.meta.url)

let cachedFfmpeg = undefined

function managedFfmpegBin() {
  try {
    const root = process.env.CONFIG_PATH || path.join(process.cwd(), 'config')
    const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    return path.join(root, 'bin', name)
  } catch {
    return ''
  }
}

/** 系统常见路径 + PATH（不含应用便携版） */
function systemFfmpegCandidates() {
  const home = os.homedir()
  return [
    process.env.FFMPEG_PATH,
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
    path.join(home, 'scoop', 'apps', 'ffmpeg', 'current', 'bin', 'ffmpeg.exe'),
    path.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'),
    path.join(process.cwd(), 'tools', 'ffmpeg', 'ffmpeg.exe'),
    path.join(process.cwd(), 'tools', 'ffmpeg', 'ffmpeg'),
    'ffmpeg',
    'ffmpeg.exe',
  ].filter(Boolean)
}

/** 应用内便携版 / npm 可选包（仅作系统缺失时的回退） */
function fallbackFfmpegCandidates() {
  const list = []
  const managed = managedFfmpegBin()
  if (managed && fs.existsSync(managed)) list.push(managed)
  try {
    const bin = require('ffmpeg-static')
    if (bin && fs.existsSync(bin)) list.push(bin)
  } catch {}
  return list
}

async function firstRunnable(candidates) {
  for (const bin of candidates) {
    if (!bin) continue
    // 绝对/相对路径若不存在则跳过；PATH 命令名留给 canRun 探测
    if ((bin.includes('/') || bin.includes('\\')) && !fs.existsSync(bin)) continue
    if (await canRun(bin)) return bin
  }
  return null
}

/** 仅探测系统自带（飞牛通常已有） */
export async function resolveSystemFfmpegBin() {
  return firstRunnable(systemFfmpegCandidates())
}

/** @returns {Promise<string|null>} 优先系统，其次便携版 */
export async function resolveFfmpegBin() {
  if (cachedFfmpeg !== undefined) return cachedFfmpeg
  const bin = (await firstRunnable(systemFfmpegCandidates()))
    || (await firstRunnable(fallbackFfmpegCandidates()))
  cachedFfmpeg = bin || null
  return cachedFfmpeg
}

export function isManagedFfmpegPath(bin) {
  const managed = managedFfmpegBin()
  if (!bin || !managed) return false
  try {
    return path.resolve(String(bin)) === path.resolve(managed)
  } catch {
    return false
  }
}

/** 测试后清缓存（例如刚装完 ffmpeg） */
export function resetFfmpegBinCache() {
  cachedFfmpeg = undefined
}

const FFMPEG_ENABLED_KEY = 'ffmpeg.enabled'

/**
 * 功能是否允许使用 ffmpeg：
 * - 未写过设置 / 为 true → 允许（有系统自带时开箱即用，无需先点设置）
 * - 显式 false → 停用
 */
function isFfmpegUsageAllowed() {
  try {
    const v = getGlobalSettings()[FFMPEG_ENABLED_KEY]
    if (v === 'false') return false
    return true
  } catch {
    return true
  }
}

/** 用到 APE / 情绪分析时的引导（装包阶段绝不下载） */
export function getFfmpegInstallHint() {
  return '请到「设置 → 文件路径」点击「检测并准备 ffmpeg」：优先用系统自带；没有时再按提示下载便携版。'
}

/** 未找到 ffmpeg 时的用户提示（仅在真正用到相关功能时出现） */
export function getFfmpegMissingMessage(feature = '') {
  const head = feature
    ? `当前无法${feature}（未找到可用的 ffmpeg）。`
    : '未找到可用的 ffmpeg。'
  return `${head}${getFfmpegInstallHint()}`
}

export function getFfmpegDisabledMessage(feature = '') {
  const what = feature ? `（${feature}）` : ''
  return `ffmpeg 相关功能已停用${what}。可到「设置 → 文件路径」重新「检测并准备 ffmpeg」。`
}

/** @returns {Promise<{ available: boolean, path: string, enabled: boolean, settingEnabled: boolean, source: string, installHint: string }>} */
export async function getFfmpegRuntimeStatus({ refresh = false } = {}) {
  if (refresh) resetFfmpegBinCache()
  const bin = await resolveFfmpegBin()
  const allowed = isFfmpegUsageAllowed()
  const settingRaw = (() => {
    try { return getGlobalSettings()[FFMPEG_ENABLED_KEY] } catch { return undefined }
  })()
  let source = 'none'
  if (bin) source = isManagedFfmpegPath(bin) ? 'managed' : 'system'
  return {
    available: Boolean(bin),
    path: bin || '',
    // 对用户：有二进制且未显式停用即视为可用
    enabled: Boolean(bin) && allowed,
    settingEnabled: settingRaw === 'true',
    settingDisabled: settingRaw === 'false',
    source,
    installHint: getFfmpegInstallHint(),
  }
}

/** 管理员标记启用 / 停用（启用时必须已能探测到二进制） */
export async function setFfmpegFeatureEnabled(on) {
  if (on) {
    resetFfmpegBinCache()
    const bin = await resolveFfmpegBin()
    if (!bin) {
      throw new Error(`尚未检测到 ffmpeg，无法启用。${getFfmpegInstallHint()}`)
    }
    setGlobalSettings({ [FFMPEG_ENABLED_KEY]: 'true' })
    return getFfmpegRuntimeStatus()
  }
  setGlobalSettings({ [FFMPEG_ENABLED_KEY]: 'false' })
  return getFfmpegRuntimeStatus()
}

/**
 * APE / 情绪分析入口：
 * - 有系统或便携 ffmpeg 且未显式停用 → 直接可用
 * - 没有 → 提示去设置准备（用不到这些功能则永远不会走到这里）
 */
export async function assertFfmpegFeatureReady(feature = '') {
  if (!isFfmpegUsageAllowed()) throw new Error(getFfmpegDisabledMessage(feature))
  const bin = await resolveFfmpegBin()
  if (!bin) throw new Error(getFfmpegMissingMessage(feature))
  return bin
}

function canRun(bin) {
  return new Promise((resolve) => {
    const child = spawn(bin, ['-version'], { stdio: 'ignore', windowsHide: true })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
}

function cacheDir() {
  const dir = path.join(os.tmpdir(), 'lemon-ape-play-cache')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function cacheKey(filePath, stat) {
  return crypto
    .createHash('sha1')
    .update(`${filePath}|${stat.size}|${stat.mtimeMs}`)
    .digest('hex')
}

/**
 * 将 APE 转码为可浏览器播放的 WAV（缓存到临时目录）
 * @returns {Promise<string>} wav path
 */
export async function ensureApePlayWav(filePath) {
  const ffmpeg = await assertFfmpegFeatureReady('播放 APE（需转码为 WAV）')

  const resolved = path.resolve(filePath)
  const stat = fs.statSync(resolved)
  const out = path.join(cacheDir(), `${cacheKey(resolved, stat)}.wav`)
  if (fs.existsSync(out)) {
    try {
      const ost = fs.statSync(out)
      if (ost.size > 44) return out
    } catch {}
  }

  const tmp = `${out}.partial`
  await runFfmpeg(ffmpeg, [
    '-y',
    '-i', resolved,
    '-vn',
    '-acodec', 'pcm_s16le',
    '-f', 'wav',
    tmp,
  ])
  fs.renameSync(tmp, out)
  return out
}

function runFfmpeg(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
    let err = ''
    child.stderr?.on('data', (d) => {
      err += d.toString()
      if (err.length > 4000) err = err.slice(-4000)
    })
    child.on('error', (e) => reject(e))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg 转码 APE 失败${err ? `：${err.split('\n').filter(Boolean).slice(-2).join(' ')}` : ''}`))
    })
  })
}
