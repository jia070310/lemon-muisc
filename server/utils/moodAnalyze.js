import { spawn } from 'child_process'
import fs from 'fs'
import { assertFfmpegFeatureReady } from './apePlay.js'

/** 算法版本： bump 后会触发全库重分析 */
export const MOOD_ALGO_VERSION = 1

const SAMPLE_RATE = 22050
const MAX_SECONDS = 60
const FRAME = 1024
const HOP = 512
const ANALYZE_TIMEOUT_MS = 45000

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}

function decodePcmS16le(filePath, { sampleRate = SAMPLE_RATE, maxSeconds = MAX_SECONDS } = {}) {
  return (async () => {
    const ffmpeg = await assertFfmpegFeatureReady('进行情绪分析')
    if (!fs.existsSync(filePath)) {
      throw new Error('文件不存在')
    }

    const args = [
      '-hide_banner',
      '-nostdin',
      '-i', filePath,
      '-t', String(maxSeconds),
      '-vn',
      '-ac', '1',
      '-ar', String(sampleRate),
      '-f', 's16le',
      '-acodec', 'pcm_s16le',
      'pipe:1',
    ]

    return new Promise((resolve, reject) => {
      const child = spawn(ffmpeg, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })

      const chunks = []
      let total = 0
      const maxBytes = sampleRate * maxSeconds * 2 + 4096
      let settled = false
      const timer = setTimeout(() => {
        try { child.kill('SIGKILL') } catch {}
        if (!settled) {
          settled = true
          reject(new Error('分析超时'))
        }
      }, ANALYZE_TIMEOUT_MS)

      child.stdout.on('data', (buf) => {
        if (total >= maxBytes) return
        const slice = total + buf.length > maxBytes ? buf.subarray(0, maxBytes - total) : buf
        chunks.push(slice)
        total += slice.length
      })

      let errText = ''
      child.stderr?.on('data', (d) => {
        errText += d.toString()
        if (errText.length > 3000) errText = errText.slice(-3000)
      })

      child.on('error', (e) => {
        clearTimeout(timer)
        if (!settled) {
          settled = true
          reject(e)
        }
      })

      child.on('close', (code) => {
        clearTimeout(timer)
        if (settled) return
        settled = true
        if (code !== 0 && total < sampleRate) {
          reject(new Error(`ffmpeg 解码失败${errText ? `：${errText.split('\n').filter(Boolean).slice(-1)[0]}` : ''}`))
          return
        }
        resolve(Buffer.concat(chunks, total))
      })
    })
  })()
}

function bufferToFloat32(pcmBuf) {
  const n = Math.floor(pcmBuf.length / 2)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i += 1) {
    out[i] = pcmBuf.readInt16LE(i * 2) / 32768
  }
  return out
}

/** 简易实数 FFT（Cooley–Tukey，长度须为 2 的幂）；返回幅度谱前半 */
function fftMagnitudes(frame) {
  const n = frame.length
  const re = new Float32Array(n)
  const im = new Float32Array(n)
  re.set(frame)

  // bit reverse
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr
      const ti = im[i]; im[i] = im[j]; im[j] = ti
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len
    const wlenRe = Math.cos(ang)
    const wlenIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let wRe = 1
      let wIm = 0
      for (let j = 0; j < len / 2; j += 1) {
        const uRe = re[i + j]
        const uIm = im[i + j]
        const vRe = re[i + j + len / 2] * wRe - im[i + j + len / 2] * wIm
        const vIm = re[i + j + len / 2] * wIm + im[i + j + len / 2] * wRe
        re[i + j] = uRe + vRe
        im[i + j] = uIm + vIm
        re[i + j + len / 2] = uRe - vRe
        im[i + j + len / 2] = uIm - vIm
        const nextWRe = wRe * wlenRe - wIm * wlenIm
        wIm = wRe * wlenIm + wIm * wlenRe
        wRe = nextWRe
      }
    }
  }

  const half = n / 2
  const mag = new Float32Array(half)
  for (let i = 0; i < half; i += 1) {
    mag[i] = Math.hypot(re[i], im[i])
  }
  return mag
}

function hannWindow(n) {
  const w = new Float32Array(n)
  for (let i = 0; i < n; i += 1) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)))
  }
  return w
}

function extractFeatures(samples, sampleRate = SAMPLE_RATE) {
  if (!samples?.length || samples.length < FRAME * 2) {
    return null
  }

  const window = hannWindow(FRAME)
  const frameCount = Math.floor((samples.length - FRAME) / HOP) + 1
  if (frameCount < 4) return null

  let sumRms = 0
  let sumCentroid = 0
  let sumZcr = 0
  const onsetEnv = new Float32Array(frameCount)
  let prevFlux = 0
  let prevMag = null

  for (let f = 0; f < frameCount; f += 1) {
    const start = f * HOP
    const frame = new Float32Array(FRAME)
    let energy = 0
    let zcr = 0
    for (let i = 0; i < FRAME; i += 1) {
      const s = samples[start + i] || 0
      const w = s * window[i]
      frame[i] = w
      energy += w * w
      if (i > 0) {
        const prev = samples[start + i - 1] || 0
        if ((s >= 0) !== (prev >= 0)) zcr += 1
      }
    }
    const rms = Math.sqrt(energy / FRAME)
    sumRms += rms
    sumZcr += zcr / FRAME

    const mag = fftMagnitudes(frame)
    let weighted = 0
    let total = 0
    for (let k = 1; k < mag.length; k += 1) {
      const m = mag[k]
      weighted += k * m
      total += m
    }
    const centroidHz = total > 1e-9
      ? (weighted / total) * (sampleRate / FRAME)
      : 0
    sumCentroid += centroidHz

    let flux = 0
    if (prevMag) {
      for (let k = 0; k < mag.length; k += 1) {
        const d = mag[k] - prevMag[k]
        if (d > 0) flux += d
      }
    }
    prevMag = mag
    const onset = Math.max(0, flux - prevFlux * 0.5)
    prevFlux = flux
    onsetEnv[f] = onset
  }

  const meanRms = sumRms / frameCount
  const meanCentroid = sumCentroid / frameCount
  const meanZcr = sumZcr / frameCount
  const bpm = estimateBpm(onsetEnv, sampleRate, HOP)

  return { meanRms, meanCentroid, meanZcr, bpm, frameCount }
}

function estimateBpm(onsetEnv, sampleRate, hop) {
  const n = onsetEnv.length
  if (n < 16) return 90

  // 平滑
  const smooth = new Float32Array(n)
  for (let i = 0; i < n; i += 1) {
    const a = onsetEnv[i - 1] || 0
    const b = onsetEnv[i]
    const c = onsetEnv[i + 1] || 0
    smooth[i] = (a + b + c) / 3
  }

  const fps = sampleRate / hop
  const minLag = Math.round((60 / 180) * fps) // 180 BPM
  const maxLag = Math.round((60 / 60) * fps)  // 60 BPM
  let bestLag = Math.round((60 / 100) * fps)
  let bestScore = -1

  for (let lag = minLag; lag <= maxLag && lag < n; lag += 1) {
    let corr = 0
    let count = 0
    for (let i = 0; i + lag < n; i += 1) {
      corr += smooth[i] * smooth[i + lag]
      count += 1
    }
    const score = count ? corr / count : 0
    if (score > bestScore) {
      bestScore = score
      bestLag = lag
    }
  }

  const bpm = (60 * fps) / (bestLag || 1)
  return clamp(bpm, 60, 180)
}

function featuresToMood(features) {
  // centroid：人声/流行常见 1k–4k；更高更「亮」
  const centroidNorm = clamp((features.meanCentroid - 800) / 4200, 0, 1)
  const zcrNorm = clamp(features.meanZcr / 0.25, 0, 1)
  const valence = clamp((centroidNorm * 0.7 + zcrNorm * 0.3) * 2 - 1, -1, 1)

  const bpmNorm = clamp((features.bpm - 70) / 80, 0, 1) // 70→0, 150→1
  const energyNorm = clamp(features.meanRms / 0.18, 0, 1)
  const arousal = clamp((bpmNorm * 0.6 + energyNorm * 0.4) * 2 - 1, -1, 1)

  return {
    valence: Math.round(valence * 1000) / 1000,
    arousal: Math.round(arousal * 1000) / 1000,
    bpm: Math.round(features.bpm * 10) / 10,
  }
}

/**
 * 分析单个音频文件的情绪坐标
 * @returns {Promise<{ status: string, valence?: number, arousal?: number, bpm?: number, version: number }>}
 */
export async function analyzeTrackMood(filePath) {
  let pcm
  try {
    pcm = await decodePcmS16le(filePath)
  } catch (e) {
    return {
      status: 'error',
      version: MOOD_ALGO_VERSION,
      error: e.message || String(e),
    }
  }

  const samples = bufferToFloat32(pcm)
  if (samples.length < SAMPLE_RATE * 3) {
    return { status: 'skipped', version: MOOD_ALGO_VERSION, reason: 'too-short' }
  }

  const features = extractFeatures(samples, SAMPLE_RATE)
  if (!features) {
    return { status: 'skipped', version: MOOD_ALGO_VERSION, reason: 'no-features' }
  }

  const mood = featuresToMood(features)
  return {
    status: 'ok',
    version: MOOD_ALGO_VERSION,
    ...mood,
  }
}
