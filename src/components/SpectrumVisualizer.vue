<template>
  <canvas
    ref="canvasRef"
    class="spectrum-canvas"
    :class="[`mode-${mode}`]"
    aria-hidden="true"
  />
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { getAnalyser, getFrequencyData, isPaused, scheduleAudioAnalyserRefresh } from '../stores/player.js'

const props = defineProps({
  /** @type {'full' | 'bar'} */
  mode: { type: String, default: 'full' },
  active: { type: Boolean, default: true },
})

const canvasRef = ref(null)
let rafId = 0
let idlePhase = 0
let analyserRetryTick = 0
let silentAnalyserFrames = 0
/** @type {number[] | null} */
let prevHeights = null
/** @type {Uint8Array | null} */
let freqBuf = null
let resizeObserver = null

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const parent = canvas.parentElement
  if (!parent) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = parent.clientWidth || 1
  const h = parent.clientHeight || 1
  canvas.width = Math.floor(w * dpr)
  canvas.height = Math.floor(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  const ctx = canvas.getContext('2d')
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function barCountForMode() {
  return props.mode === 'bar' ? 96 : 64
}

function buildIdleHeights(count) {
  idlePhase += 0.045
  const heights = new Array(count)
  for (let i = 0; i < count; i++) {
    const t = i / count
    const wave =
      0.35 * Math.sin(idlePhase + t * Math.PI * 2.2) +
      0.22 * Math.sin(idlePhase * 1.4 + t * Math.PI * 4.1) +
      0.18 * Math.sin(idlePhase * 0.7 + t * Math.PI * 1.3)
    heights[i] = Math.max(0.06, 0.28 + wave * 0.35)
  }
  return heights
}

function smoothHeights(next, count) {
  if (!prevHeights || prevHeights.length !== count) {
    prevHeights = next.slice()
    return next
  }
  for (let i = 0; i < count; i++) {
    prevHeights[i] = prevHeights[i] * 0.22 + next[i] * 0.78
  }
  return prevHeights
}

function decayHeights(count) {
  if (!prevHeights || prevHeights.length !== count) {
    return new Array(count).fill(0.06)
  }
  for (let i = 0; i < count; i++) {
    prevHeights[i] *= 0.88
    if (prevHeights[i] < 0.05) prevHeights[i] = 0.05
  }
  return prevHeights
}

function sampleHeights(count) {
  const analyser = getAnalyser()
  if (!analyser || isPaused.value) {
    if (!isPaused.value) {
      analyserRetryTick++
      if (analyserRetryTick % 24 === 0) scheduleAudioAnalyserRefresh()
      return decayHeights(count)
    }
    return buildIdleHeights(count)
  }
  analyserRetryTick = 0

  if (!freqBuf || freqBuf.length !== analyser.frequencyBinCount) {
    freqBuf = new Uint8Array(analyser.frequencyBinCount)
  }
  getFrequencyData(freqBuf)

  let peak = 0
  for (let i = 0; i < freqBuf.length; i++) {
    if (freqBuf[i] > peak) peak = freqBuf[i]
  }
  if (peak === 0) {
    silentAnalyserFrames++
    const silentLimit = /iPhone|iPad|iPod/i.test(navigator.userAgent || '') ? 90 : 45
    if (silentAnalyserFrames > silentLimit) {
      silentAnalyserFrames = 0
      scheduleAudioAnalyserRefresh()
    }
    return decayHeights(count)
  }
  silentAnalyserFrames = 0

  const usable = Math.floor(freqBuf.length * 0.82)
  const heights = new Array(count)
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i / count) * usable)
    const end = Math.floor(((i + 1) / count) * usable)
    let sum = 0
    let max = 0
    let n = 0
    for (let j = start; j < Math.max(end, start + 1); j++) {
      sum += freqBuf[j]
      if (freqBuf[j] > max) max = freqBuf[j]
      n++
    }
    const avg = (sum / Math.max(n, 1)) / 255
    const peakNorm = max / 255
    const mixed = avg * 0.55 + peakNorm * 0.45
    const boost = 0.72 + 0.28 * Math.sin((i / (count - 1)) * Math.PI)
    heights[i] = Math.max(0.04, Math.min(1, mixed * 1.35 * boost))
  }
  return smoothHeights(heights, count)
}

function drawFrame() {
  const canvas = canvasRef.value
  if (!canvas || !props.active) {
    rafId = requestAnimationFrame(drawFrame)
    return
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    rafId = requestAnimationFrame(drawFrame)
    return
  }

  const w = canvas.clientWidth || 1
  const h = canvas.clientHeight || 1
  ctx.clearRect(0, 0, w, h)

  const count = barCountForMode()
  const heights = sampleHeights(count)
  const gap = props.mode === 'bar' ? 1 : 3
  const barW = props.mode === 'bar'
    ? Math.max(1, (w - gap * (count - 1)) / count)
    : Math.max(2, (w - gap * (count - 1)) / count)
  const mirror = props.mode === 'full'
  const baseline = mirror ? h * 0.58 : h * 0.92
  const maxUp = mirror ? h * 0.52 : h * 0.85
  const maxDown = mirror ? h * 0.28 : 0
  const radius = Math.min(barW / 2, props.mode === 'bar' ? 1 : 4)

  for (let i = 0; i < count; i++) {
    const x = i * (barW + gap)
    const amp = heights[i]
    const upH = Math.max(radius * 2, amp * maxUp)
    const t = i / Math.max(count - 1, 1)
    const color = barColor(t, props.mode === 'bar' ? 0.55 : 0.95)

    ctx.fillStyle = color
    roundRect(ctx, x, baseline - upH, barW, upH, radius)
    ctx.fill()

    if (mirror && maxDown > 0) {
      const downH = Math.max(radius, upH * (maxDown / maxUp))
      ctx.fillStyle = barColor(t, 0.28)
      roundRect(ctx, x, baseline + 2, barW, downH, radius)
      ctx.fill()
    }
  }

  rafId = requestAnimationFrame(drawFrame)
}

function barColor(t, alpha) {
  // 蓝 → 青 → 绿 → 亮绿
  let r, g, b
  if (t < 0.33) {
    const u = t / 0.33
    r = lerp(47, 34, u)
    g = lerp(128, 211, u)
    b = lerp(237, 238, u)
  } else if (t < 0.66) {
    const u = (t - 0.33) / 0.33
    r = lerp(34, 34, u)
    g = lerp(211, 197, u)
    b = lerp(238, 94, u)
  } else {
    const u = (t - 0.66) / 0.34
    r = lerp(34, 163, u)
    g = lerp(197, 230, u)
    b = lerp(94, 53, u)
  }
  return `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha})`
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function startLoop() {
  cancelAnimationFrame(rafId)
  scheduleAudioAnalyserRefresh()
  rafId = requestAnimationFrame(drawFrame)
}

function stopLoop() {
  cancelAnimationFrame(rafId)
  rafId = 0
}

onMounted(() => {
  resizeCanvas()
  if (typeof ResizeObserver !== 'undefined' && canvasRef.value?.parentElement) {
    resizeObserver = new ResizeObserver(() => resizeCanvas())
    resizeObserver.observe(canvasRef.value.parentElement)
  }
  if (props.active) startLoop()
})

onUnmounted(() => {
  stopLoop()
  resizeObserver?.disconnect()
  resizeObserver = null
})

watch(() => props.active, (on) => {
  if (on) {
    resizeCanvas()
    startLoop()
  } else {
    stopLoop()
    const canvas = canvasRef.value
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
})

</script>

<style scoped>
.spectrum-canvas {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
