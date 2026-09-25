/**
 * 车机 / 弱网流畅播放：将本地高码率无损转成 AAC 缓存后流式输出。
 * 无线 CarPlay 与 NAS 抢同一路 WiFi 时，直出 FLAC 容易缓冲欠载一卡一卡。
 *
 * 码率取 128k（原 192k）：无线 CarPlay 本身已占大量 WiFi，再叠 NAS 拉无损易欠载；
 * 128k AAC 约 16KB/s，对同网争用更友好。
 */
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn } from 'child_process'
import { assertFfmpegFeatureReady } from './apePlay.js'

/** 需要转码降码率的扩展名 */
export const SMOOTH_PLAY_EXTS = new Set([
  '.flac', '.wav', '.aiff', '.aif', '.ape', '.dsf', '.dff', '.wv', '.tak',
])

/** AAC 目标码率（kbps）；改动需同步 cacheKey 后缀 */
export const SMOOTH_AAC_BITRATE = 128

export function needsSmoothPlayTranscode(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase()
  return SMOOTH_PLAY_EXTS.has(ext)
}

function cacheDir() {
  const dir = path.join(os.tmpdir(), 'lemon-smooth-play-cache')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function cacheKey(filePath, stat) {
  return crypto
    .createHash('sha1')
    .update(`${filePath}|${stat.size}|${stat.mtimeMs}|aac${SMOOTH_AAC_BITRATE}`)
    .digest('hex')
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
      else reject(new Error(`ffmpeg 转码失败${err ? `：${err.split('\n').filter(Boolean).slice(-2).join(' ')}` : ''}`))
    })
  })
}

/**
 * 将本地高码率文件转成 AAC/M4A，缓存到临时目录。
 * @returns {Promise<string>} m4a path
 */
export async function ensureSmoothPlayAac(filePath) {
  const ffmpeg = await assertFfmpegFeatureReady('车机流畅播放（需转码为 AAC）')
  const resolved = path.resolve(filePath)
  const stat = fs.statSync(resolved)
  const out = path.join(cacheDir(), `${cacheKey(resolved, stat)}.m4a`)
  if (fs.existsSync(out)) {
    try {
      const ost = fs.statSync(out)
      if (ost.size > 1024) return out
    } catch {}
  }

  const tmp = `${out}.partial`
  try {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
  } catch {}

  // 优先速度：NAS CPU 弱时尽快出缓存，便于连播预热
  await runFfmpeg(ffmpeg, [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', resolved,
    '-vn',
    '-c:a', 'aac',
    '-b:a', `${SMOOTH_AAC_BITRATE}k`,
    '-ac', '2',
    '-ar', '44100',
    '-movflags', '+faststart',
    '-f', 'ipod',
    tmp,
  ])
  fs.renameSync(tmp, out)
  return out
}

/** 仅预热缓存（不返回文件内容），供连播下一首 */
export async function warmSmoothPlayAac(filePath) {
  if (!needsSmoothPlayTranscode(filePath)) return { warmed: false, reason: 'skip' }
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) return { warmed: false, reason: 'missing' }
  const out = await ensureSmoothPlayAac(resolved)
  return { warmed: true, path: out }
}
