/**
 * 应用内一键安装便携 ffmpeg（写入 CONFIG_PATH/bin，不走系统 apt / npm 大包）。
 * 用户主动点击后下载，避免 FPK 安装阶段卡住。
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import zlib from 'zlib'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import {
  getFfmpegRuntimeStatus,
  resetFfmpegBinCache,
  setFfmpegFeatureEnabled,
  resolveFfmpegBin,
  resolveSystemFfmpegBin,
  isManagedFfmpegPath,
} from './apePlay.js'

const FFMPEG_STATIC_TAG = 'b6.1'
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000

/** @type {{
 *  phase: string,
 *  progress: number,
 *  message: string,
 *  error: string,
 *  startedAt: number,
 *  finishedAt: number,
 *  log: string[],
 * }} */
let installState = {
  phase: 'idle',
  progress: 0,
  message: '',
  error: '',
  startedAt: 0,
  finishedAt: 0,
  log: [],
}

let installPromise = null

function configRoot() {
  return process.env.CONFIG_PATH || path.join(process.cwd(), 'config')
}

/** 便携 ffmpeg 安装目录与可执行文件路径 */
export function getManagedFfmpegPaths() {
  const dir = path.join(configRoot(), 'bin')
  const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  return { dir, bin: path.join(dir, name) }
}

function platformAsset() {
  const plat = process.platform
  const arch = process.arch
  if (plat === 'linux' && arch === 'x64') return 'ffmpeg-linux-x64.gz'
  if (plat === 'linux' && (arch === 'arm64' || arch === 'aarch64')) return 'ffmpeg-linux-arm64.gz'
  if (plat === 'darwin' && arch === 'arm64') return 'ffmpeg-darwin-arm64.gz'
  if (plat === 'darwin' && arch === 'x64') return 'ffmpeg-darwin-x64.gz'
  if (plat === 'win32' && arch === 'x64') return 'ffmpeg-win32-x64.gz'
  if (plat === 'win32' && (arch === 'arm64' || arch === 'aarch64')) return 'ffmpeg-win32-ia32.gz'
  return ''
}

function downloadUrls(asset) {
  return [
    `https://cdn.npmmirror.com/binaries/ffmpeg-static/${FFMPEG_STATIC_TAG}/${asset}`,
    `https://registry.npmmirror.com/-/binary/ffmpeg-static/${FFMPEG_STATIC_TAG}/${asset}`,
    `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_STATIC_TAG}/${asset}`,
  ]
}

function pushLog(line) {
  const text = String(line || '').trim()
  if (!text) return
  installState.log = [...installState.log.slice(-40), text]
}

function setPhase(phase, message, progress = installState.progress) {
  installState = {
    ...installState,
    phase,
    message: String(message || ''),
    progress: Math.max(0, Math.min(100, Number(progress) || 0)),
    error: phase === 'error' ? String(message || installState.error || '') : '',
  }
  pushLog(message)
}

export function getFfmpegInstallStatus() {
  return {
    ...installState,
    running: Boolean(installPromise),
    managedBin: getManagedFfmpegPaths().bin,
    asset: platformAsset() || '',
  }
}

async function downloadToFile(url, destPath, onProgress) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), INSTALL_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'lemon-music-ffmpeg-installer/1.0' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const total = Number(res.headers.get('content-length') || 0)
    if (!res.body) throw new Error('空响应')

    const tmp = `${destPath}.part`
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    const file = fs.createWriteStream(tmp)
    const nodeReadable = Readable.fromWeb(res.body)
    let received = 0
    nodeReadable.on('data', (chunk) => {
      received += chunk.length
      if (total > 0 && typeof onProgress === 'function') {
        onProgress(received / total)
      }
    })
    await pipeline(nodeReadable, file)
    fs.renameSync(tmp, destPath)
    return destPath
  } finally {
    clearTimeout(timer)
  }
}

async function gunzipFile(srcGz, destBin) {
  await pipeline(
    fs.createReadStream(srcGz),
    zlib.createGunzip(),
    fs.createWriteStream(destBin),
  )
  try { fs.unlinkSync(srcGz) } catch {}
  if (process.platform !== 'win32') {
    try { fs.chmodSync(destBin, 0o755) } catch {}
  }
}

async function downloadManagedFfmpeg() {
  const asset = platformAsset()
  if (!asset) {
    throw new Error(`当前平台暂不支持一键安装（${process.platform}/${process.arch}）。请改用系统包管理器安装 ffmpeg。`)
  }
  const { dir, bin } = getManagedFfmpegPaths()
  fs.mkdirSync(dir, { recursive: true })
  const gzPath = path.join(dir, asset)
  const urls = downloadUrls(asset)
  let lastErr = null
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    setPhase('download', `正在下载便携 ffmpeg（源 ${i + 1}/${urls.length}）…`, 15 + i * 5)
    try {
      await downloadToFile(url, gzPath, (ratio) => {
        setPhase('download', `正在下载便携 ffmpeg… ${Math.round(ratio * 100)}%`, 20 + Math.round(ratio * 55))
      })
      setPhase('extract', '正在解压…', 80)
      await gunzipFile(gzPath, bin)
      return bin
    } catch (e) {
      lastErr = e
      pushLog(`下载失败：${e.message || e}`)
      try { fs.unlinkSync(gzPath) } catch {}
      try { fs.unlinkSync(`${gzPath}.part`) } catch {}
    }
  }
  throw new Error(lastErr?.message || '下载 ffmpeg 失败，请检查网络后重试')
}

/**
 * 分步：检测系统 → 必要时下载便携版 → 验证 → 启用
 */
export async function runFfmpegInstallWizard() {
  if (installPromise) return installPromise

  installState = {
    phase: 'prepare',
    progress: 2,
    message: '准备安装…',
    error: '',
    startedAt: Date.now(),
    finishedAt: 0,
    log: [],
  }

  installPromise = (async () => {
    try {
      setPhase('detect', '优先检测系统自带 ffmpeg…', 8)
      resetFfmpegBinCache()
      // 明确只先看系统；有则绝不下载
      let bin = await resolveSystemFfmpegBin()
      let usedSystem = Boolean(bin)

      if (!bin) {
        // 系统没有时，才考虑已有便携版或重新下载
        resetFfmpegBinCache()
        bin = await resolveFfmpegBin()
        if (bin && isManagedFfmpegPath(bin)) {
          setPhase('detect', `未找到系统 ffmpeg，将使用已有便携版：${bin}`, 70)
        } else if (!bin) {
          setPhase('download', '未检测到系统 ffmpeg，开始下载便携版作为回退…', 12)
          bin = await downloadManagedFfmpeg()
        } else {
          usedSystem = true
          setPhase('detect', `已找到 ffmpeg：${bin}`, 70)
        }
      } else {
        setPhase('detect', `已找到系统自带 ffmpeg：${bin}`, 70)
      }

      setPhase('verify', '正在验证 ffmpeg…', 88)
      resetFfmpegBinCache()
      const ok = await resolveFfmpegBin()
      if (!ok) throw new Error('验证失败：仍无法运行 ffmpeg，请重试')

      setPhase('enable', '正在启用…', 95)
      await setFfmpegFeatureEnabled(true)

      const doneMsg = usedSystem || (ok && !isManagedFfmpegPath(ok))
        ? '已使用系统自带 ffmpeg，相关功能可用'
        : '已准备便携 ffmpeg（系统未自带时的回退），相关功能可用'
      setPhase('done', doneMsg, 100)
      installState.finishedAt = Date.now()
      return getFfmpegInstallStatus()
    } catch (e) {
      setPhase('error', e.message || '安装失败', installState.progress)
      installState.finishedAt = Date.now()
      throw e
    } finally {
      installPromise = null
    }
  })()

  return installPromise
}

export async function getFfmpegSetupSnapshot() {
  const runtime = await getFfmpegRuntimeStatus()
  const install = getFfmpegInstallStatus()
  return {
    ...runtime,
    install,
    canInstall: Boolean(platformAsset()) || runtime.available,
    steps: [
      '应用安装时不下载 ffmpeg（避免卡住）',
      '优先检测并使用系统自带（飞牛一般已有，开箱即可用）',
      '仅当要用 APE / 情绪分析且系统没有时，再在此下载便携版',
    ],
  }
}
