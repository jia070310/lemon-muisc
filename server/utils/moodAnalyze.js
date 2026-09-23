import { spawn } from 'child_process'
import fs from 'fs'
import { assertFfmpegFeatureReady } from './apePlay.js'

/**
 * 算法版本：bump 后会触发全库重分析。
 * v2：跳过前奏、多频段能量、谱滚降/带宽、onset 密度、更稳的 BPM 与映射。
 */
export const MOOD_ALGO_VERSION = 2

const SAMPLE_RATE = 22050
const MAX_SECONDS = 50
const INTRO_SKIP_SEC = 14
const FRAME = 1024
const HOP = 512
const ANALYZE_TIMEOUT_MS = 50000

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}

/** 平滑映射到 [-1,1]，中间更敏感、两端压缩 */
function softMap01ToSigned(x01) {
  const x = clamp(x01, 0, 1)
  // 略作 S 形，避免大量点挤在 0 附近
  const curved = x * x * (3 - 2 * x)
  return curved * 2 - 1
}

function decodePcmS16le(filePath, { sampleRate = SAMPLE_RATE, maxSeconds = MAX_SECONDS, startSec = 0 } = {}) {
  return (async () => {
    const ffmpeg = await assertFfmpegFeatureReady('进行情绪分析')
    if (!fs.existsSync(filePath)) {
      throw new Error('文件不存在')
    }

    const args = ['-hide_banner', '-nostdin']
    // 输入前 seek：长文件跳过前奏；短文件回退时用 startSec=0
    if (startSec > 0.05) {
      args.push('-ss', String(startSec))
    }
    args.push(
      '-i', filePath,
      '-t', String(maxSeconds),
      '-vn',
      '-ac', '1',
      '-ar', String(sampleRate),
      '-f', 's16le',
      '-acodec', 'pcm_s16le',
      'pipe:1',
    )

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

function hzToBin(hz, sampleRate, nfft) {
  return Math.max(1, Math.min(nfft / 2 - 1, Math.round((hz * nfft) / sampleRate)))
}

function bandEnergy(mag, sampleRate, loHz, hiHz) {
  const lo = hzToBin(loHz, sampleRate, FRAME)
  const hi = hzToBin(hiHz, sampleRate, FRAME)
  let sum = 0
  for (let k = lo; k <= hi; k += 1) sum += mag[k] * mag[k]
  return sum
}

function spectralRolloff(mag, sampleRate, fraction = 0.85) {
  let total = 0
  for (let k = 1; k < mag.length; k += 1) total += mag[k]
  if (total < 1e-12) return 0
  const target = total * fraction
  let acc = 0
  for (let k = 1; k < mag.length; k += 1) {
    acc += mag[k]
    if (acc >= target) return (k * sampleRate) / FRAME
  }
  return sampleRate / 2
}

function spectralBandwidth(mag, sampleRate, centroidHz) {
  let total = 0
  let varSum = 0
  for (let k = 1; k < mag.length; k += 1) {
    const m = mag[k]
    const hz = (k * sampleRate) / FRAME
    const d = hz - centroidHz
    varSum += m * d * d
    total += m
  }
  if (total < 1e-12) return 0
  return Math.sqrt(varSum / total)
}

/**
 * 在已解码样本中取能量最高的一段（约 windowSec），避开前奏淡入。
 */
function pickEnergeticWindow(samples, sampleRate, windowSec = 36) {
  const win = Math.min(samples.length, Math.floor(windowSec * sampleRate))
  if (samples.length <= win + sampleRate) return samples

  const step = Math.floor(sampleRate * 1.5)
  let bestStart = 0
  let bestScore = -1
  for (let start = 0; start + win <= samples.length; start += step) {
    let energy = 0
    // 粗采样估计能量
    for (let i = start; i < start + win; i += 64) {
      const s = samples[i]
      energy += s * s
    }
    if (energy > bestScore) {
      bestScore = energy
      bestStart = start
    }
  }
  return samples.subarray(bestStart, bestStart + win)
}

function extractFeatures(samples, sampleRate = SAMPLE_RATE) {
  if (!samples?.length || samples.length < FRAME * 2) {
    return null
  }

  const window = hannWindow(FRAME)
  const frameCount = Math.floor((samples.length - FRAME) / HOP) + 1
  if (frameCount < 8) return null

  let sumRms = 0
  let sumRmsSq = 0
  let sumCentroid = 0
  let sumRolloff = 0
  let sumBandwidth = 0
  let sumZcr = 0
  let sumFlux = 0
  let sumLow = 0
  let sumMid = 0
  let sumHigh = 0
  let onsetCount = 0
  const onsetEnv = new Float32Array(frameCount)
  let prevFlux = 0
  let prevMag = null
  let fluxPeak = 0

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
    sumRmsSq += rms * rms
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
    sumRolloff += spectralRolloff(mag, sampleRate, 0.85)
    sumBandwidth += spectralBandwidth(mag, sampleRate, centroidHz)

    const low = bandEnergy(mag, sampleRate, 20, 250)
    const mid = bandEnergy(mag, sampleRate, 250, 2000)
    const high = bandEnergy(mag, sampleRate, 2000, 8000)
    sumLow += low
    sumMid += mid
    sumHigh += high

    let flux = 0
    if (prevMag) {
      for (let k = 0; k < mag.length; k += 1) {
        const d = mag[k] - prevMag[k]
        if (d > 0) flux += d
      }
    }
    prevMag = mag
    sumFlux += flux
    if (flux > fluxPeak) fluxPeak = flux

    const onset = Math.max(0, flux - prevFlux * 0.45)
    prevFlux = flux
    onsetEnv[f] = onset
  }

  // onset 阈值：相对峰值的阈值
  const onsetThresh = Math.max(fluxPeak * 0.18, 1e-6)
  for (let f = 1; f < frameCount - 1; f += 1) {
    if (onsetEnv[f] > onsetThresh && onsetEnv[f] >= onsetEnv[f - 1] && onsetEnv[f] >= onsetEnv[f + 1]) {
      onsetCount += 1
    }
  }

  const meanRms = sumRms / frameCount
  const rmsVar = Math.max(0, sumRmsSq / frameCount - meanRms * meanRms)
  const rmsStd = Math.sqrt(rmsVar)
  const meanCentroid = sumCentroid / frameCount
  const meanRolloff = sumRolloff / frameCount
  const meanBandwidth = sumBandwidth / frameCount
  const meanZcr = sumZcr / frameCount
  const meanFlux = sumFlux / frameCount
  const bandTotal = sumLow + sumMid + sumHigh + 1e-12
  const lowRatio = sumLow / bandTotal
  const midRatio = sumMid / bandTotal
  const highRatio = sumHigh / bandTotal
  const durationSec = (frameCount * HOP) / sampleRate
  const onsetRate = durationSec > 0.5 ? onsetCount / durationSec : 0
  const bpm = estimateBpm(onsetEnv, sampleRate, HOP)

  return {
    meanRms,
    rmsStd,
    meanCentroid,
    meanRolloff,
    meanBandwidth,
    meanZcr,
    meanFlux,
    lowRatio,
    midRatio,
    highRatio,
    onsetRate,
    bpm,
    frameCount,
  }
}

function estimateBpm(onsetEnv, sampleRate, hop) {
  const n = onsetEnv.length
  if (n < 24) return 100

  const smooth = new Float32Array(n)
  for (let i = 0; i < n; i += 1) {
    const a = onsetEnv[i - 1] || 0
    const b = onsetEnv[i]
    const c = onsetEnv[i + 1] || 0
    smooth[i] = (a + 2 * b + c) / 4
  }

  const fps = sampleRate / hop
  const minLag = Math.round((60 / 190) * fps)
  const maxLag = Math.round((60 / 55) * fps)
  const scores = []

  for (let lag = minLag; lag <= maxLag && lag < n; lag += 1) {
    let corr = 0
    let energy = 0
    let count = 0
    for (let i = 0; i + lag < n; i += 1) {
      corr += smooth[i] * smooth[i + lag]
      energy += smooth[i] * smooth[i]
      count += 1
    }
    if (!count) continue
    const norm = energy > 1e-12 ? corr / energy : 0
    scores.push({ lag, score: norm })
  }

  if (!scores.length) return 100
  scores.sort((a, b) => b.score - a.score)

  // 取前若干峰，做半拍/双拍修正，偏好流行常见 70–160
  let best = scores[0]
  const top = scores.slice(0, Math.min(8, scores.length))
  for (const cand of top) {
    const bpm = (60 * fps) / (cand.lag || 1)
    const preferred = bpm >= 72 && bpm <= 155 ? 1.08 : 1
    const half = top.find((x) => Math.abs(x.lag - cand.lag * 2) <= 2)
    const dbl = top.find((x) => Math.abs(x.lag * 2 - cand.lag) <= 2)
    let score = cand.score * preferred
    if (half) score += half.score * 0.15
    if (dbl) score += dbl.score * 0.1
    if (score > best.score * 1.02 || (score >= best.score && preferred > 1)) {
      best = { ...cand, score }
    }
  }

  let bpm = (60 * fps) / (best.lag || 1)
  // 倍速折叠到合理区间
  while (bpm < 65 && bpm > 0) bpm *= 2
  while (bpm > 175) bpm /= 2
  return clamp(bpm, 55, 185)
}

function featuresToMood(features) {
  // —— 亮度 / 音色（偏 valence）——
  const centroidN = clamp((features.meanCentroid - 900) / 3800, 0, 1)
  const rolloffN = clamp((features.meanRolloff - 2500) / 7000, 0, 1)
  const highN = clamp((features.highRatio - 0.08) / 0.35, 0, 1)
  const lowDark = clamp((features.lowRatio - 0.22) / 0.45, 0, 1) // 低频占比高 → 更「沉」
  const zcrN = clamp(features.meanZcr / 0.22, 0, 1)
  const bright = clamp(centroidN * 0.4 + rolloffN * 0.25 + highN * 0.25 + zcrN * 0.1, 0, 1)
  // 慢歌略偏负向，快歌略偏正向（弱权重，避免 BPM 主导情绪）
  const tempoValence = clamp((features.bpm - 85) / 70, -0.35, 0.35)

  let valence01 = clamp(
    bright * 0.72
    + (1 - lowDark) * 0.18
    + (tempoValence + 0.35) / 0.7 * 0.1,
    0,
    1,
  )

  // —— 激活度（偏 arousal）——
  const bpmN = clamp((features.bpm - 68) / 95, 0, 1)
  const energyN = clamp(features.meanRms / 0.16, 0, 1)
  const onsetN = clamp(features.onsetRate / 3.2, 0, 1)
  const fluxN = clamp(features.meanFlux / (features.meanFlux + 8), 0, 1)
  // 动态起伏：过大可能偏「激烈」，过平偏「平静」
  const dynN = clamp(features.rmsStd / (features.meanRms + 1e-4) / 0.85, 0, 1)

  let arousal01 = clamp(
    bpmN * 0.38
    + energyN * 0.28
    + onsetN * 0.22
    + fluxN * 0.07
    + dynN * 0.05,
    0,
    1,
  )

  // 极暗且慢：略压 arousal，避免「沉重慢歌」被标成兴奋
  if (lowDark > 0.55 && bpmN < 0.35) {
    arousal01 = clamp(arousal01 * 0.82, 0, 1)
  }
  // 很亮且打击密：略抬 arousal
  if (highN > 0.45 && onsetN > 0.55) {
    arousal01 = clamp(arousal01 * 1.08, 0, 1)
  }

  const valence = softMap01ToSigned(valence01)
  const arousal = softMap01ToSigned(arousal01)

  // 轻微打散同质堆积：用带宽作极小扰动（稳定、同曲可复现）
  const jitter = clamp((features.meanBandwidth - 1200) / 8000, -0.04, 0.04)

  return {
    valence: Math.round(clamp(valence + jitter * 0.5, -1, 1) * 1000) / 1000,
    arousal: Math.round(clamp(arousal + jitter * 0.35, -1, 1) * 1000) / 1000,
    bpm: Math.round(features.bpm * 10) / 10,
  }
}

async function loadAnalysisSamples(filePath) {
  // 优先取跳过前奏的主体；太短则从头再解
  let pcm = await decodePcmS16le(filePath, { startSec: INTRO_SKIP_SEC, maxSeconds: MAX_SECONDS })
  let samples = bufferToFloat32(pcm)
  if (samples.length < SAMPLE_RATE * 10) {
    pcm = await decodePcmS16le(filePath, { startSec: 0, maxSeconds: 60 })
    samples = bufferToFloat32(pcm)
  }
  if (samples.length < SAMPLE_RATE * 3) return samples
  return pickEnergeticWindow(samples, SAMPLE_RATE, 36)
}

/**
 * 分析单个音频文件的情绪坐标
 * @returns {Promise<{ status: string, valence?: number, arousal?: number, bpm?: number, version: number }>}
 */
export async function analyzeTrackMood(filePath) {
  let samples
  try {
    samples = await loadAnalysisSamples(filePath)
  } catch (e) {
    return {
      status: 'error',
      version: MOOD_ALGO_VERSION,
      error: e.message || String(e),
    }
  }

  if (!samples?.length || samples.length < SAMPLE_RATE * 3) {
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
