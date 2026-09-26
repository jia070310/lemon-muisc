import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { assertFfmpegFeatureReady } from './apePlay.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT_PATH = path.join(__dirname, '../scripts/mood_essentia_predict.py')

/** AI 通道算法版本（与启发式版本隔离，切换引擎会触发重分析） */
export const MOOD_ESSENTIA_VERSION = 204

/**
 * Essentia 官方两段式情绪模型（配合使用，非二选一）：
 * 1) MusiCNN：Million Song 预训练，把音频编成 embedding（「听成」向量）
 * 2) emoMusic：接在 MusiCNN 后，预测 arousal（唤醒/激昂）与 valence（效价/开心）
 * 运行时需 essentia-tensorflow；本文件只负责下载 .pb 与调用 Python 脚本。
 */
const MODEL_FILES = [
  {
    name: 'msd-musicnn-1.pb',
    // MusiCNN 特征提取器
    url: 'https://essentia.upf.edu/models/feature-extractors/musicnn/msd-musicnn-1.pb',
  },
  {
    name: 'emomusic-msd-musicnn-2.pb',
    // emoMusic 分类头：embedding → arousal / valence
    url: 'https://essentia.upf.edu/models/classification-heads/emomusic/emomusic-msd-musicnn-2.pb',
  },
]

function modelsDir() {
  const persist = process.env.CONFIG_PATH || path.join(process.cwd(), 'config')
  return path.join(persist, 'mood-models')
}

function legacyModelsDir() {
  return path.resolve(process.cwd(), 'data', 'mood-models')
}

/** 旧模型目录迁到 CONFIG_PATH，卸载保留数据时可复用 */
function migrateLegacyMoodModelsIfNeeded() {
  const dest = modelsDir()
  const legacy = legacyModelsDir()
  if (!fs.existsSync(legacy)) return
  try {
    ensureDir(dest)
    for (const name of fs.readdirSync(legacy)) {
      const from = path.join(legacy, name)
      const to = path.join(dest, name)
      if (fs.existsSync(to)) continue
      try { fs.renameSync(from, to) } catch {
        try { fs.copyFileSync(from, to) } catch {}
      }
    }
  } catch {}
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

async function downloadFile(url, dest, onProgress) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`下载失败 ${res.status}: ${url}`)
  const total = Number(res.headers.get('content-length') || 0)
  if (!res.body || typeof res.body.getReader !== 'function') {
    const buf = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(dest, buf)
    onProgress?.(1)
    return dest
  }
  const reader = res.body.getReader()
  const bufs = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bufs.push(Buffer.from(value))
    received += value.length
    if (onProgress && total) onProgress(received / total)
  }
  fs.writeFileSync(dest, Buffer.concat(bufs))
  return dest
}

export function getMoodModelsStatus() {
  migrateLegacyMoodModelsIfNeeded()
  const dir = modelsDir()
  const files = MODEL_FILES.map((m) => {
    const filePath = path.join(dir, m.name)
    const ok = fs.existsSync(filePath) && fs.statSync(filePath).size > 1000
    return { name: m.name, ok, path: filePath, size: ok ? fs.statSync(filePath).size : 0 }
  })
  return {
    dir,
    ready: files.every((f) => f.ok),
    files,
  }
}

export async function ensureMoodModels({ onProgress } = {}) {
  migrateLegacyMoodModelsIfNeeded()
  const dir = modelsDir()
  ensureDir(dir)
  const status = getMoodModelsStatus()
  if (status.ready) return status

  let i = 0
  for (const m of MODEL_FILES) {
    const dest = path.join(dir, m.name)
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      i += 1
      continue
    }
    const tmp = `${dest}.part`
    await downloadFile(m.url, tmp, (p) => {
      onProgress?.({
        file: m.name,
        index: i,
        total: MODEL_FILES.length,
        progress: p,
      })
    })
    fs.renameSync(tmp, dest)
    i += 1
  }
  return getMoodModelsStatus()
}

function resolvePythonCandidates() {
  const envBin = String(process.env.MOOD_PYTHON || process.env.PYTHON || '').trim()
  if (envBin) return [envBin]
  if (process.platform === 'win32') return ['py', 'python', 'python3']
  return ['python3', 'python', '/usr/bin/python3']
}

function runProcess(command, args, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch {}
      reject(new Error('AI 情绪分析超时'))
    }, timeoutMs)
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

async function listPythonBins() {
  const bins = []
  try {
    const { resolveMoodAiPython, getMoodAiPaths, migrateLegacyMoodAiIfNeeded } = await import('./moodAiInstall.js')
    migrateLegacyMoodAiIfNeeded()
    const managed = await resolveMoodAiPython()
    if (managed) bins.push(managed)
    const { venvBin, portableBin } = getMoodAiPaths()
    if (venvBin) bins.push(venvBin)
    if (portableBin) bins.push(portableBin)
  } catch {}
  bins.push(...resolvePythonCandidates())
  return [...new Set(bins.filter(Boolean))]
}

export async function probeEssentiaAi() {
  const models = getMoodModelsStatus()
  const candidates = await listPythonBins()
  let pythonOk = false
  let essentiaOk = false
  let detail = ''
  let py = candidates[0] || 'python3'

  for (const bin of candidates) {
    const args = bin === 'py'
      ? ['-3', '-c', 'import essentia, essentia.standard; print("ok")']
      : ['-c', 'import essentia, essentia.standard; print("ok")']
    try {
      const r = await runProcess(bin, args, { timeoutMs: 20000 })
      pythonOk = true
      py = bin
      if (/ok/.test(r.stdout)) {
        essentiaOk = true
        detail = ''
        break
      }
      detail = (r.stderr || r.stdout || '').slice(-500)
    } catch (e) {
      detail = e.message || String(e)
    }
  }

  return {
    python: py,
    pythonOk,
    essentiaOk,
    models,
    ready: pythonOk && essentiaOk && models.ready,
    hint: !pythonOk
      ? '未检测到 Python，请点「准备 AI」'
      : !essentiaOk
        ? '未安装 AI 依赖，请点「准备 AI」'
        : !models.ready
          ? '缺少模型文件，请点「准备 AI」'
          : 'AI 已就绪',
    detail: detail || undefined,
  }
}

async function extractWavForAi(filePath) {
  const ffmpeg = await assertFfmpegFeatureReady('进行 AI 情绪分析')
  const tmp = path.join(os.tmpdir(), `lemon-mood-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`)
  const args = [
    '-hide_banner', '-nostdin', '-y',
    '-ss', '12',
    '-i', filePath,
    '-t', '45',
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-f', 'wav',
    tmp,
  ]
  const r = await runProcess(ffmpeg, args, { timeoutMs: 60000 })
  if (!fs.existsSync(tmp) || fs.statSync(tmp).size < 1000) {
    throw new Error(r.stderr?.split('\n').filter(Boolean).slice(-1)[0] || 'ffmpeg 抽取音频失败')
  }
  return tmp
}

/**
 * 用 Essentia emoMusic 头预测 valence/arousal ∈ [-1,1]
 */
export async function predictMoodWithEssentia(filePath) {
  const probe = await probeEssentiaAi()
  if (!probe.ready) {
    return { ok: false, error: probe.hint, probe }
  }

  let wav = ''
  try {
    wav = await extractWavForAi(filePath)
    const probePy = probe.python || (await listPythonBins())[0]
    const args = probePy === 'py'
      ? ['-3', SCRIPT_PATH, '--audio', wav, '--models-dir', modelsDir()]
      : [SCRIPT_PATH, '--audio', wav, '--models-dir', modelsDir()]

    const r = await runProcess(probePy, args, { timeoutMs: 180000 })
    const line = String(r.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() || ''
    let data
    try {
      data = JSON.parse(line)
    } catch {
      return {
        ok: false,
        error: r.stderr?.slice(-400) || r.stdout?.slice(-400) || 'AI 输出无法解析',
        code: r.code,
      }
    }
    if (!data?.ok) {
      return { ok: false, error: data?.error || 'AI 分析失败', data }
    }
    return {
      ok: true,
      valence: Number(data.valence),
      arousal: Number(data.arousal),
      engine: data.engine || 'essentia-emomusic',
      raw: data.raw,
      version: MOOD_ESSENTIA_VERSION,
    }
  } finally {
    if (wav) {
      try { fs.unlinkSync(wav) } catch {}
    }
  }
}
