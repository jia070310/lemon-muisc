import { spawn } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

let cachedFfmpeg = undefined

function bundledFfmpegCandidates() {
  const list = []
  try {
    // 可选依赖：未安装时忽略
    const bin = require('ffmpeg-static')
    if (bin && fs.existsSync(bin)) list.push(bin)
  } catch {}
  const home = os.homedir()
  const extras = [
    path.join(process.cwd(), 'tools', 'ffmpeg', 'ffmpeg.exe'),
    path.join(process.cwd(), 'tools', 'ffmpeg', 'ffmpeg'),
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
    path.join(home, 'scoop', 'apps', 'ffmpeg', 'current', 'bin', 'ffmpeg.exe'),
    path.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'),
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
  ]
  for (const p of extras) {
    if (p && fs.existsSync(p)) list.push(p)
  }
  return list
}

/** @returns {Promise<string|null>} */
export async function resolveFfmpegBin() {
  if (cachedFfmpeg !== undefined) return cachedFfmpeg
  const candidates = [
    process.env.FFMPEG_PATH,
    ...bundledFfmpegCandidates(),
    'ffmpeg',
    'ffmpeg.exe',
  ].filter(Boolean)

  for (const bin of candidates) {
    const ok = await canRun(bin)
    if (ok) {
      cachedFfmpeg = bin
      return bin
    }
  }
  cachedFfmpeg = null
  return null
}

/** 测试后清缓存（例如刚装完 ffmpeg） */
export function resetFfmpegBinCache() {
  cachedFfmpeg = undefined
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
  const ffmpeg = await resolveFfmpegBin()
  if (!ffmpeg) {
    throw new Error('浏览器无法直接播放 APE。请在 NAS/主机安装 ffmpeg，或将文件转换为 FLAC/WAV 后再播放')
  }

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
