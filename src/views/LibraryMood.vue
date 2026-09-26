<template>
  <div class="mood-page">
    <div class="page-header-row">
      <button class="btn-ghost btn-sm" type="button" @click="$router.back()">← 返回</button>
      <div class="page-title">情绪地图</div>
      <div class="mood-actions">
        <AppSelect
          v-model="analyzer"
          :options="analyzerOptions"
          title="分析引擎"
          size="sm"
          min-width="148px"
          :disabled="analyzing || preparingAi"
          @change="onAnalyzerChange"
        />
        <button
          v-if="analyzer === 'essentia' && !aiReady"
          class="btn-ghost btn-sm"
          type="button"
          :disabled="preparingAi || analyzing"
          @click="prepareAi"
        >
          {{ preparingAi ? '准备中…' : '准备 AI' }}
        </button>
        <button
          v-if="!analyzing && stats.pending > 0"
          class="btn-primary btn-sm"
          type="button"
          :disabled="starting || (analyzer === 'essentia' && !aiReady)"
          @click="startAnalyze"
        >
          补分析（待 {{ stats.pending }}）
        </button>
        <button
          v-else-if="analyzing"
          class="btn-ghost btn-sm"
          type="button"
          @click="stopAnalyze"
        >
          停止分析
        </button>
      </div>
    </div>

    <p class="mood-hint">
      横轴悲伤 ↔ 开心，纵轴平静 ↔ 激昂。点击封面可播放或加入列表；心情连播时在底部播放栏用心形 / 破碎心反馈。滚轮或两指缩放，Shift 拖动平移。偏好约 20 分钟衰减。
      新入库文件会自动后台分析，一般无需手动点分析。
      <template v-if="analyzer === 'essentia'">
        当前为 AI 通道（Essentia + MusiCNN + emoMusic）。
        <span class="mood-hint-detail">Essentia：音频分析框架；MusiCNN：把片段编成音乐特征向量；emoMusic：由向量预测开心↔悲伤、平静↔激昂。缺依赖点「准备 AI」（约 280MB）。仅 Linux x86_64 / macOS。AI 未就绪时自动回退本地启发式。</span>
      </template>
      <template v-else>
        当前为本地启发式（v5）：按本库相对分布铺开。需要更准可切 AI（Linux x86_64 / macOS）。
      </template>
    </p>

    <div v-if="aiStatusText" class="mood-ai-status" :class="{ ready: aiReady, bad: analyzer === 'essentia' && !aiReady }">
      {{ aiStatusText }}
    </div>

    <div v-if="progressText" class="mood-progress" role="status">{{ progressText }}</div>

    <div v-if="loading && !points.length" class="loading card">正在加载情绪地图…</div>
    <div v-else-if="!points.length" class="empty card">
      <p>{{ stats.pending ? '情绪分析进行中或等待自动补分析' : '暂无已分析曲目' }}</p>
      <p class="empty-hint">
        新入库 / 下载的文件会自动后台分析，无需手动点击。可离开此页，完成后刷新地图。
        若提示需要 ffmpeg，再到「设置 → 文件路径」点「检测并准备 ffmpeg」。
      </p>
      <button
        v-if="stats.pending > 0 && !analyzing"
        class="btn-primary btn-sm"
        type="button"
        :disabled="starting || (analyzer === 'essentia' && !aiReady)"
        @click="startAnalyze"
      >
        立即补分析（待 {{ stats.pending }}）
      </button>
      <button
        v-else-if="analyzing"
        class="btn-ghost btn-sm"
        type="button"
        @click="stopAnalyze"
      >
        停止分析
      </button>
    </div>
    <div v-else class="mood-map-wrap mood-map-enter">
      <div class="mood-axis-label top">快</div>
      <div class="mood-axis-label bottom">慢</div>
      <div class="mood-axis-label left">悲伤</div>
      <div class="mood-axis-label right">开心</div>
      <div class="mood-zoom-controls" aria-label="地图缩放">
        <button type="button" class="mood-zoom-btn" title="放大" aria-label="放大" @click="zoomStep(1.25)">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            <line x1="11" y1="8" x2="11" y2="14"/>
            <line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
        <button type="button" class="mood-zoom-btn" title="缩小" aria-label="缩小" @click="zoomStep(1 / 1.25)">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            <line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
        <button
          type="button"
          class="mood-zoom-btn"
          title="适应点分布"
          aria-label="适应点分布"
          @click="resetView"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
            <path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
            <path d="M3 16v3a2 2 0 0 0 2 2h3"/>
            <path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
            <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
            <circle cx="9" cy="10.5" r="1" fill="currentColor" stroke="none" opacity="0.7"/>
            <circle cx="14.5" cy="13.5" r="1" fill="currentColor" stroke="none" opacity="0.7"/>
          </svg>
        </button>
      </div>
      <canvas
        ref="canvasEl"
        class="mood-canvas"
        :class="{ 'is-panning': gestureMode === 'pan' }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerleave="onPointerLeave"
        @dblclick="onDblClick"
      />
      <Transition name="mood-tip">
        <div v-if="hoverTip && !pointMenu" class="mood-tip" :style="hoverTip.style">
          <img v-if="hoverTip.cover" class="mood-tip-cover" :src="hoverTip.cover" alt="" />
          <div class="mood-tip-text">
            <strong>{{ hoverTip.title }}</strong>
            <span>{{ hoverTip.artist }}</span>
          </div>
        </div>
      </Transition>
      <div
        v-if="pointMenu"
        class="mood-point-menu"
        :style="pointMenu.style"
        @pointerdown.stop
      >
        <div class="mood-point-menu-meta">
          <strong>{{ pointMenu.title }}</strong>
          <span>{{ pointMenu.artist }}</span>
        </div>
        <button type="button" class="mood-point-menu-btn" @click="menuPlay">播放心情</button>
        <button type="button" class="mood-point-menu-btn ghost" @click="menuAddQueue">加入列表</button>
      </div>
      <div class="mood-legend">
        已分析 {{ stats.analyzed }} / {{ stats.total }}
        · 图上 {{ points.length }} 点
        <template v-if="coverReadyCount"> · 封面 {{ coverReadyCount }}</template>
        <template v-if="viewZoom > 1.05"> · 缩放 {{ viewZoom.toFixed(1) }}×</template>
        <template v-if="moodRadioActive"> · 心情连播中</template>
      </div>
    </div>
  </div>
</template>

<script setup>
defineOptions({ name: 'LibraryMood' })
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { api } from '../api.js'
import { onWS } from '../ws.js'
import { localCoverUrl } from '../stores/library.js'
import AppSelect from '../components/AppSelect.vue'
import {
  addMoodPointToQueue,
  moodRadioActive,
  moodRadioNow,
  setMoodCatalog,
  startMoodRadio,
} from '../stores/moodRadio.js'

const analyzerOptions = [
  { value: 'heuristic', label: '本地启发式' },
  { value: 'essentia', label: 'AI（Essentia）' },
]

const canvasEl = ref(null)
const points = ref([])
const stats = ref({ total: 0, analyzed: 0, pending: 0, skipped: 0, error: 0 })
const loading = ref(false)
const starting = ref(false)
const analyzing = ref(false)
const progressText = ref('')
const analyzer = ref('heuristic')
const preparingAi = ref(false)
const aiReady = ref(false)
const aiStatusText = ref('')
const hoverTip = ref(null)
const hoverKey = ref('')
const coverReadyCount = ref(0)
/** @type {import('vue').Ref<null | { point: object, title: string, artist: string, style: Record<string, string> }>} */
const pointMenu = ref(null)

/** 点击判定：按下位置 */
let pointerDownAt = null
const CLICK_MOVE_PX = 10

/** 视口：半宽/半高（数据坐标），(cx,cy) 为中心。独立 half 可按点分布填满画面 */
const HALF_MIN = 0.08
const HALF_MAX = 1
const view = ref({ cx: 0, cy: 0, halfX: 1, halfY: 1 })
const viewZoom = computed(() => {
  const zx = 1 / Math.max(HALF_MIN, view.value.halfX)
  const zy = 1 / Math.max(HALF_MIN, view.value.halfY)
  return Math.max(zx, zy)
})
const gestureMode = ref('')
/** @type {Map<number, { x: number, y: number }>} */
const activePointers = new Map()
/** @type {null | { mode: string, dist0?: number, halfX0?: number, halfY0?: number, anchor?: { x: number, y: number }, x0?: number, y0?: number, cx0?: number, cy0?: number }} */
let gesture = null
/** 用户手动缩放/平移后，增量刷新地图时不再强行重新适应 */
let userAdjustedView = false

let offProgress = null
let offComplete = null
let resizeObs = null
let statusTimer = null
let rafId = 0
let animStartedAt = 0
let preferReducedMotion = false
let lastDrawSize = { w: 0, h: 0 }
let onWheelBound = null

/** @type {Map<string, { img: HTMLImageElement|null, status: string, readyAt: number }>} */
const coverCache = new Map()
let coverLoadToken = 0
const COVER_LOAD_MAX = 600
const COVER_CONCURRENCY = 8

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3
}

/** 从坐标原点向外扩散的涟漪圆环（画在点之前） */
function drawRippleRings(ctx, mid, w, h, pad, now, accent) {
  const maxR = Math.hypot(
    Math.max(mid.cx - pad, w - pad - mid.cx, 1),
    Math.max(mid.cy - pad, h - pad - mid.cy, 1),
  ) * 1.08
  const ringCount = 7
  ctx.save()
  ctx.lineWidth = 1
  ctx.strokeStyle = accent || '#6c8cff'

  if (preferReducedMotion) {
    const step = maxR / (ringCount + 0.5)
    for (let i = 1; i <= ringCount; i += 1) {
      ctx.beginPath()
      ctx.arc(mid.cx, mid.cy, step * i, 0, Math.PI * 2)
      ctx.globalAlpha = 0.18 - i * 0.016
      ctx.stroke()
    }
    ctx.restore()
    return
  }

  const period = 9000
  for (let i = 0; i < ringCount; i += 1) {
    const phase = ((now / period) + i / ringCount) % 1
    const r = 6 + phase * (maxR - 6)
    // 外扩渐隐；靠近原点略亮
    const alpha = (1 - phase) * (0.1 + 0.14 * (1 - phase))
    if (alpha < 0.012) continue
    ctx.beginPath()
    ctx.arc(mid.cx, mid.cy, r, 0, Math.PI * 2)
    ctx.globalAlpha = alpha
    ctx.stroke()
  }
  ctx.restore()
}

function pointKey(p) {
  return `${p.filePath || ''}|${p.x}|${p.y}`
}

function coverUrlFor(p) {
  if (!p?.hasPicture || !p.filePath) return ''
  return localCoverUrl(p.filePath)
}

function getCoverEntry(filePath) {
  return coverCache.get(filePath) || null
}

function syncCoverReadyCount() {
  let n = 0
  for (const entry of coverCache.values()) {
    if (entry.status === 'ok') n += 1
  }
  coverReadyCount.value = n
}

function preloadCovers(list) {
  const token = ++coverLoadToken
  const candidates = []
  for (const p of list || []) {
    if (!p?.hasPicture || !p.filePath) continue
    if (coverCache.has(p.filePath)) {
      const cur = coverCache.get(p.filePath)
      if (cur.status === 'ok' || cur.status === 'loading') continue
    }
    candidates.push(p.filePath)
    if (candidates.length >= COVER_LOAD_MAX) break
  }
  syncCoverReadyCount()

  let idx = 0
  let inFlight = 0

  const pump = () => {
    if (token !== coverLoadToken) return
    while (idx < candidates.length && inFlight < COVER_CONCURRENCY) {
      const filePath = candidates[idx++]
      if (coverCache.get(filePath)?.status === 'ok' || coverCache.get(filePath)?.status === 'loading') continue
      const url = localCoverUrl(filePath)
      if (!url) continue
      const img = new Image()
      img.decoding = 'async'
      inFlight += 1
      coverCache.set(filePath, { img, status: 'loading', readyAt: 0 })
      const done = () => {
        inFlight = Math.max(0, inFlight - 1)
        if (token === coverLoadToken) pump()
      }
      img.onload = () => {
        const entry = coverCache.get(filePath)
        if (entry && entry.img === img) {
          entry.status = 'ok'
          entry.readyAt = performance.now()
          syncCoverReadyCount()
          draw()
          startAnimLoop()
        }
        done()
      }
      img.onerror = () => {
        const entry = coverCache.get(filePath)
        if (entry && entry.img === img) {
          entry.status = 'fail'
          entry.img = null
        }
        done()
      }
      img.src = url
    }
  }
  pump()
}

/** object-fit: cover 画进圆形 */
function drawCoverThumb(ctx, img, cx, cy, r, alpha) {
  if (!img || !r || alpha <= 0) return false
  const iw = img.naturalWidth || img.width || 0
  const ih = img.naturalHeight || img.height || 0
  if (!iw || !ih) return false

  const side = Math.min(iw, ih)
  const sx = (iw - side) / 2
  const sy = (ih - side) / 2
  const size = r * 2

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  ctx.drawImage(img, sx, sy, side, side, cx - r, cy - r, size, size)
  ctx.restore()

  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 1
  ctx.globalAlpha = alpha
  ctx.stroke()
  ctx.globalAlpha = 1
  return true
}

function needsAnimLoop() {
  if (preferReducedMotion) return false
  // 背景涟漪持续外扩
  if (points.value.length) return true
  if (animStartedAt && performance.now() - animStartedAt < 1400) return true
  // 封面刚加载完的淡入
  const now = performance.now()
  for (const entry of coverCache.values()) {
    if (entry.status === 'ok' && entry.readyAt && now - entry.readyAt < 480) return true
  }
  // 当前试听曲高亮脉冲
  if (moodRadioActive.value && moodRadioNow.value) return true
  return false
}

function startAnimLoop() {
  if (rafId || preferReducedMotion) return
  const tick = () => {
    rafId = 0
    drawFrame()
    if (needsAnimLoop()) {
      rafId = requestAnimationFrame(tick)
    }
  }
  rafId = requestAnimationFrame(tick)
}

function stopAnimLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
}

function restartEntrance() {
  animStartedAt = preferReducedMotion ? 0 : performance.now()
  startAnimLoop()
}

function viewHalfX() {
  return Math.max(HALF_MIN, view.value.halfX)
}

function viewHalfY() {
  return Math.max(HALF_MIN, view.value.halfY)
}

function clampView() {
  let halfX = Math.min(HALF_MAX, Math.max(HALF_MIN, view.value.halfX))
  let halfY = Math.min(HALF_MAX, Math.max(HALF_MIN, view.value.halfY))
  let cx = view.value.cx
  let cy = view.value.cy
  cx = Math.min(1 - halfX, Math.max(-1 + halfX, cx))
  cy = Math.min(1 - halfY, Math.max(-1 + halfY, cy))
  view.value = { cx, cy, halfX, halfY }
}

function dataToCanvas(x, y, w, h, pad) {
  const halfX = viewHalfX()
  const halfY = viewHalfY()
  const { cx: vcx, cy: vcy } = view.value
  const nx = (x - (vcx - halfX)) / (2 * halfX)
  const ny = (y - (vcy - halfY)) / (2 * halfY)
  return {
    cx: pad + nx * (w - pad * 2),
    cy: pad + (1 - ny) * (h - pad * 2),
  }
}

function canvasToData(cx, cy, w, h, pad) {
  const halfX = viewHalfX()
  const halfY = viewHalfY()
  const { cx: vcx, cy: vcy } = view.value
  const nx = (cx - pad) / Math.max(1, w - pad * 2)
  const ny = 1 - (cy - pad) / Math.max(1, h - pad * 2)
  return {
    x: (vcx - halfX) + nx * 2 * halfX,
    y: (vcy - halfY) + ny * 2 * halfY,
  }
}

function computePointsBBox(list) {
  if (!list?.length) return null
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of list) {
    const x = Number(p.x)
    const y = Number(p.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  if (!Number.isFinite(minX)) return null

  let spanX = Math.max(0.001, maxX - minX)
  let spanY = Math.max(0.001, maxY - minY)
  // 过窄分布仍留出可视空间
  const minSpan = 0.28
  if (spanX < minSpan) {
    const c = (minX + maxX) / 2
    minX = c - minSpan / 2
    maxX = c + minSpan / 2
    spanX = minSpan
  }
  if (spanY < minSpan) {
    const c = (minY + maxY) / 2
    minY = c - minSpan / 2
    maxY = c + minSpan / 2
    spanY = minSpan
  }
  const padX = spanX * 0.16
  const padY = spanY * 0.16
  return {
    minX: minX - padX,
    maxX: maxX + padX,
    minY: minY - padY,
    maxY: maxY + padY,
  }
}

/** 按曲目分布适配视口，减少一边大片留白 */
function fitViewToPoints({ force = false } = {}) {
  if (userAdjustedView && !force) return
  const box = computePointsBBox(points.value)
  if (!box) {
    view.value = { cx: 0, cy: 0, halfX: 1, halfY: 1 }
    return
  }
  const spanX = box.maxX - box.minX
  const spanY = box.maxY - box.minY
  view.value = {
    cx: (box.minX + box.maxX) / 2,
    cy: (box.minY + box.maxY) / 2,
    halfX: Math.min(HALF_MAX, Math.max(HALF_MIN, spanX / 2)),
    halfY: Math.min(HALF_MAX, Math.max(HALF_MIN, spanY / 2)),
  }
  clampView()
}

/** 以客户端坐标为焦点缩放（factor>1 放大） */
function zoomAtClient(clientX, clientY, factor) {
  const m = canvasMetrics()
  if (!m) return
  userAdjustedView = true
  const localX = clientX - m.rect.left
  const localY = clientY - m.rect.top
  const nx = (localX - m.pad) / Math.max(1, m.w - m.pad * 2)
  const ny = 1 - (localY - m.pad) / Math.max(1, m.h - m.pad * 2)
  const before = canvasToData(localX, localY, m.w, m.h, m.pad)
  const halfX = Math.min(HALF_MAX, Math.max(HALF_MIN, viewHalfX() / factor))
  const halfY = Math.min(HALF_MAX, Math.max(HALF_MIN, viewHalfY() / factor))
  view.value = {
    halfX,
    halfY,
    cx: before.x - (2 * nx - 1) * halfX,
    cy: before.y - (2 * ny - 1) * halfY,
  }
  clampView()
  hoverTip.value = null
  draw()
}

function zoomStep(factor) {
  const m = canvasMetrics()
  if (!m) {
    userAdjustedView = true
    view.value = {
      ...view.value,
      halfX: Math.min(HALF_MAX, Math.max(HALF_MIN, viewHalfX() / factor)),
      halfY: Math.min(HALF_MAX, Math.max(HALF_MIN, viewHalfY() / factor)),
    }
    clampView()
    draw()
    return
  }
  zoomAtClient(m.rect.left + m.w / 2, m.rect.top + m.h / 2, factor)
}

function resetView() {
  userAdjustedView = false
  fitViewToPoints({ force: true })
  hoverTip.value = null
  draw()
}

function isPointVisible(x, y, marginRatio = 0.08) {
  const halfX = viewHalfX()
  const halfY = viewHalfY()
  const { cx, cy } = view.value
  const mx = halfX * marginRatio
  const my = halfY * marginRatio
  return (
    x >= cx - halfX - mx
    && x <= cx + halfX + mx
    && y >= cy - halfY - my
    && y <= cy + halfY + my
  )
}

function draw() {
  if (needsAnimLoop()) startAnimLoop()
  else drawFrame()
}

function drawFrame() {
  const canvas = canvasEl.value
  if (!canvas) return
  const parent = canvas.parentElement
  const dpr = window.devicePixelRatio || 1
  const cssW = Math.max(1, parent?.clientWidth || 640)
  // 优先用父容器实际高度铺满，避免定高留白
  const parentH = parent?.clientHeight || 0
  const cssH = Math.max(280, parentH > 40 ? parentH : Math.round(cssW * 0.55))
  const sizeChanged = lastDrawSize.w !== cssW || lastDrawSize.h !== cssH
  if (sizeChanged || canvas.width !== Math.round(cssW * dpr)) {
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    lastDrawSize = { w: cssW, h: cssH }
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const w = cssW
  const h = cssH
  const pad = 28
  const styles = getComputedStyle(document.documentElement)
  const bg = styles.getPropertyValue('--bg-card').trim() || '#1a1a1e'
  const grid = styles.getPropertyValue('--border').trim() || 'rgba(255,255,255,0.08)'
  const accent = styles.getPropertyValue('--accent').trim() || '#6c8cff'
  const text = styles.getPropertyValue('--text').trim() || '#eee'
  const now = performance.now()
  const pulse = preferReducedMotion ? 0 : (Math.sin(now / 420) + 1) / 2

  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // 仅 XY 轴，不要外框
  ctx.strokeStyle = grid
  ctx.lineWidth = 1
  const mid = dataToCanvas(0, 0, w, h, pad)
  ctx.beginPath()
  if (mid.cy >= -2 && mid.cy <= h + 2) {
    ctx.moveTo(pad, mid.cy)
    ctx.lineTo(w - pad, mid.cy)
  }
  if (mid.cx >= -2 && mid.cx <= w + 2) {
    ctx.moveTo(mid.cx, pad)
    ctx.lineTo(mid.cx, h - pad)
  }
  ctx.stroke()

  drawRippleRings(ctx, mid, w, h, pad, now, accent)

  const list = points.value
  const n = list.length || 1
  const entranceMs = 900
  // 点多时封面略小；放大后略放大便于点选
  const densBase = list.length > 400 ? 8 : list.length > 180 ? 10 : 12
  const coverBase = densBase * Math.min(2.1, Math.sqrt(viewZoom.value))

  for (let i = 0; i < list.length; i += 1) {
    const p = list[i]
    if (!isPointVisible(p.x, p.y)) continue
    const { cx, cy } = dataToCanvas(p.x, p.y, w, h, pad)
    const isPlaying = Boolean(moodRadioNow.value?.filePath && p.filePath === moodRadioNow.value.filePath)
    const hovered = hoverKey.value && hoverKey.value === pointKey(p)
    const cover = p.hasPicture ? getCoverEntry(p.filePath) : null
    const hasCover = cover?.status === 'ok' && cover.img

    let appear = 1
    if (animStartedAt && !preferReducedMotion) {
      const stagger = (i / n) * 520
      const t = (now - animStartedAt - stagger) / entranceMs
      appear = t <= 0 ? 0 : easeOutCubic(Math.min(1, t))
    }
    let coverFade = 1
    let coverPop = 1
    if (hasCover && cover.readyAt && !preferReducedMotion) {
      const ct = (now - cover.readyAt) / 420
      coverFade = ct <= 0 ? 0 : easeOutCubic(Math.min(1, ct))
      coverPop = 0.72 + 0.28 * coverFade
    }
    if (appear <= 0.01) continue

    const baseR = hasCover
      ? (isPlaying ? coverBase + 4 : hovered ? coverBase + 3 : coverBase)
      : (isPlaying ? 5.2 : hovered ? 4.6 : 3.2)
    const pulseR = isPlaying ? pulse * (hasCover ? 2.4 : 1.4) : 0
    const r = (baseR + pulseR) * (0.35 + 0.65 * appear) * coverPop

    if (isPlaying && !preferReducedMotion) {
      ctx.beginPath()
      ctx.arc(cx, cy, r + 3 + pulse * 2.5, 0, Math.PI * 2)
      ctx.fillStyle = accent
      ctx.globalAlpha = 0.14 + pulse * 0.12
      ctx.fill()
    }

    if (!hasCover || coverFade < 0.98) {
      ctx.beginPath()
      ctx.arc(cx, cy, Math.max(2.4, r * (hasCover ? 0.45 : 1)), 0, Math.PI * 2)
      ctx.fillStyle = isPlaying || hovered ? accent : text
      ctx.globalAlpha = (isPlaying || hovered ? 1 : 0.55) * appear * (hasCover ? (1 - coverFade) : 1)
      ctx.fill()
      ctx.globalAlpha = 1
    }

    const alpha = (isPlaying || hovered ? 1 : 0.94) * appear * (hasCover ? Math.max(coverFade, 0.05) : 1)
    if (hasCover) {
      drawCoverThumb(ctx, cover.img, cx, cy, r, alpha)
      if (isPlaying || hovered) {
        ctx.beginPath()
        ctx.arc(cx, cy, r + 1.2, 0, Math.PI * 2)
        ctx.strokeStyle = accent
        ctx.lineWidth = isPlaying ? 2 : 1.5
        ctx.globalAlpha = alpha
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    }
  }
}

function canvasMetrics() {
  const canvas = canvasEl.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const pad = 28
  return { rect, pad, w: rect.width, h: rect.height }
}

function eventToData(e) {
  const m = canvasMetrics()
  if (!m) return null
  const cx = e.clientX - m.rect.left
  const cy = e.clientY - m.rect.top
  return canvasToData(cx, cy, m.w, m.h, m.pad)
}

function findNearestPoint(e) {
  const m = canvasMetrics()
  if (!m || !points.value.length) return null
  const cx = e.clientX - m.rect.left
  const cy = e.clientY - m.rect.top
  const hitR = points.value.length > 400 ? 14 : 18
  let best = null
  let bestDist = hitR
  for (const p of points.value) {
    if (!isPointVisible(p.x, p.y, 0.02)) continue
    const pos = dataToCanvas(p.x, p.y, m.w, m.h, m.pad)
    const d = Math.hypot(pos.cx - cx, pos.cy - cy)
    if (d < bestDist) {
      bestDist = d
      best = { point: p, pos }
    }
  }
  return best
}

function pointerPair() {
  if (activePointers.size < 2) return null
  const pts = [...activePointers.values()]
  return [pts[0], pts[1]]
}

function beginPinchGesture() {
  const pair = pointerPair()
  if (!pair) return
  const [a, b] = pair
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  const m = canvasMetrics()
  if (!m) return
  pointerDownAt = null
  hoverTip.value = null
  hoverKey.value = ''
  pointMenu.value = null
  gesture = {
    mode: 'pinch',
    dist0: Math.max(24, Math.hypot(a.x - b.x, a.y - b.y)),
    halfX0: viewHalfX(),
    halfY0: viewHalfY(),
    anchor: canvasToData(midX - m.rect.left, midY - m.rect.top, m.w, m.h, m.pad),
  }
  gestureMode.value = 'pinch'
}

function updatePinchGesture() {
  const pair = pointerPair()
  if (!pair || !gesture || gesture.mode !== 'pinch') return
  const [a, b] = pair
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  const m = canvasMetrics()
  if (!m || !gesture.anchor) return
  userAdjustedView = true
  const dist = Math.max(24, Math.hypot(a.x - b.x, a.y - b.y))
  const factor = dist / gesture.dist0
  const halfX = Math.min(HALF_MAX, Math.max(HALF_MIN, gesture.halfX0 / factor))
  const halfY = Math.min(HALF_MAX, Math.max(HALF_MIN, gesture.halfY0 / factor))
  const nx = (midX - m.rect.left - m.pad) / Math.max(1, m.w - m.pad * 2)
  const ny = 1 - (midY - m.rect.top - m.pad) / Math.max(1, m.h - m.pad * 2)
  view.value = {
    halfX,
    halfY,
    cx: gesture.anchor.x - (2 * nx - 1) * halfX,
    cy: gesture.anchor.y - (2 * ny - 1) * halfY,
  }
  clampView()
  draw()
}

function clearGesture() {
  gesture = null
  gestureMode.value = ''
}

function onWheel(e) {
  e.preventDefault()
  const dy = e.deltaY
  if (!dy) return
  // 触控板更细；鼠标滚轮更粗
  const intensity = e.deltaMode === 1 ? 0.08 : 0.0018
  const factor = Math.exp(-dy * intensity)
  zoomAtClient(e.clientX, e.clientY, factor)
}

function onDblClick(e) {
  e.preventDefault()
  if (viewZoom.value >= (1 / HALF_MIN) - 0.2) {
    resetView()
    return
  }
  zoomAtClient(e.clientX, e.clientY, 1.7)
}

function onPointerDown(e) {
  if (e.button === 2) return
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  canvasEl.value?.setPointerCapture?.(e.pointerId)

  if (activePointers.size >= 2) {
    beginPinchGesture()
    draw()
    return
  }

  // Shift / 中键：平移
  if (e.shiftKey || e.button === 1) {
    pointerDownAt = null
    hoverTip.value = null
    pointMenu.value = null
    gesture = {
      mode: 'pan',
      x0: e.clientX,
      y0: e.clientY,
      cx0: view.value.cx,
      cy0: view.value.cy,
    }
    gestureMode.value = 'pan'
    return
  }

  pointerDownAt = { x: e.clientX, y: e.clientY, id: e.pointerId }
  // 放大后单指滑动也可平移；轻点仍弹出菜单
  if (viewZoom.value > 1.15) {
    gesture = {
      mode: 'pan-or-tap',
      x0: e.clientX,
      y0: e.clientY,
      cx0: view.value.cx,
      cy0: view.value.cy,
      moved: false,
    }
    gestureMode.value = 'pan'
    return
  }

  gesture = { mode: 'tap' }
  gestureMode.value = 'tap'
}

function onPointerMove(e) {
  if (activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }

  if (activePointers.size >= 2) {
    if (!gesture || gesture.mode !== 'pinch') beginPinchGesture()
    updatePinchGesture()
    return
  }

  if (gesture?.mode === 'pan' || gesture?.mode === 'pan-or-tap') {
    const m = canvasMetrics()
    if (!m) return
    const dist = Math.hypot(e.clientX - gesture.x0, e.clientY - gesture.y0)
    if (gesture.mode === 'pan-or-tap' && dist < CLICK_MOVE_PX) return
    if (gesture.mode === 'pan-or-tap') gesture.moved = true
    userAdjustedView = true
    const halfX = viewHalfX()
    const halfY = viewHalfY()
    const dx = (e.clientX - gesture.x0) / Math.max(1, m.w - m.pad * 2) * (2 * halfX)
    const dy = -((e.clientY - gesture.y0) / Math.max(1, m.h - m.pad * 2) * (2 * halfY))
    view.value = {
      halfX: view.value.halfX,
      halfY: view.value.halfY,
      cx: gesture.cx0 - dx,
      cy: gesture.cy0 - dy,
    }
    clampView()
    hoverTip.value = null
    draw()
    return
  }

  if (gestureMode.value && gestureMode.value !== 'tap') return
  if (pointMenu.value) return

  const hit = findNearestPoint(e)
  if (!hit) {
    if (hoverKey.value) {
      hoverKey.value = ''
      hoverTip.value = null
      draw()
    }
    return
  }
  const key = pointKey(hit.point)
  const m = canvasMetrics()
  hoverTip.value = {
    title: hit.point.title || '未知',
    artist: hit.point.artist || '',
    cover: coverUrlFor(hit.point),
    style: {
      left: `${Math.min(m.w - 200, Math.max(8, hit.pos.cx + 12))}px`,
      top: `${Math.max(8, hit.pos.cy - 44)}px`,
    },
  }
  if (hoverKey.value !== key) {
    hoverKey.value = key
    draw()
  }
}

function openPointMenu(hit) {
  const m = canvasMetrics()
  if (!m || !hit) return
  hoverTip.value = null
  pointMenu.value = {
    point: hit.point,
    title: hit.point.title || '未知',
    artist: hit.point.artist || '',
    style: {
      left: `${Math.min(m.w - 168, Math.max(8, hit.pos.cx + 10))}px`,
      top: `${Math.min(m.h - 120, Math.max(8, hit.pos.cy - 10))}px`,
    },
  }
}

function closePointMenu() {
  pointMenu.value = null
}

async function menuPlay() {
  const p = pointMenu.value?.point
  closePointMenu()
  if (!p) return
  try {
    await startMoodRadio(p, points.value)
    progressText.value = '已开始心情连播'
    startAnimLoop()
    draw()
  } catch (e) {
    progressText.value = e?.message || '播放失败'
  }
}

function menuAddQueue() {
  const p = pointMenu.value?.point
  closePointMenu()
  if (!p) return
  addMoodPointToQueue(p)
  progressText.value = '已加入试听列表'
}

function onPointerUp(e) {
  activePointers.delete(e.pointerId)
  try { canvasEl.value?.releasePointerCapture?.(e.pointerId) } catch {}

  if (gesture?.mode === 'pinch') {
    if (activePointers.size >= 2) {
      beginPinchGesture()
      return
    }
    clearGesture()
    pointerDownAt = null
    draw()
    return
  }

  if (gesture?.mode === 'pan') {
    clearGesture()
    pointerDownAt = null
    return
  }

  if (gesture?.mode === 'pan-or-tap') {
    const wasTap = !gesture.moved
    clearGesture()
    if (wasTap) {
      const hit = findNearestPoint(e)
      if (hit) openPointMenu(hit)
      else closePointMenu()
    }
    pointerDownAt = null
    draw()
    return
  }

  const down = pointerDownAt
  pointerDownAt = null
  clearGesture()
  if (!down || down.id !== e.pointerId) return
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
  if (moved > CLICK_MOVE_PX) return
  const hit = findNearestPoint(e)
  if (hit) openPointMenu(hit)
  else closePointMenu()
  draw()
}

function onPointerLeave() {
  if (!gesture && !pointerDownAt) {
    hoverTip.value = null
    if (hoverKey.value) {
      hoverKey.value = ''
      draw()
    }
  }
}

async function loadMap({ animate = false } = {}) {
  loading.value = true
  try {
    const res = await api.library.moodMap({ limit: 8000 })
    const data = res.data || {}
    const next = data.points || []
    const shouldAnimate = animate || (!points.value.length && next.length > 0)
    const wasEmpty = !points.value.length
    points.value = next
    stats.value = data.stats || stats.value
    setMoodCatalog(next)
    preloadCovers(next)
    await nextTick()
    if (shouldAnimate || wasEmpty) {
      userAdjustedView = false
      fitViewToPoints({ force: true })
    } else {
      fitViewToPoints()
    }
    if (shouldAnimate) restartEntrance()
    draw()
  } catch {
    points.value = []
    setMoodCatalog([])
  } finally {
    loading.value = false
  }
}

/** 只读偏好 / 安装进度，不 spawn Python */
async function loadAnalyzerPref() {
  try {
    const settings = await api.settings.get()
    const pref = settings?.['mood.analyzer']
    if (pref === 'essentia' || pref === 'heuristic') analyzer.value = pref
  } catch {}
  try {
    const res = await api.library.moodAiStatus({ probe: false })
    const data = res.data || {}
    if (!analyzer.value && (data.analyzer === 'essentia' || data.analyzer === 'heuristic')) {
      analyzer.value = data.analyzer
    }
    const install = data.install || {}
    if (install.running) {
      const pct = Number(install.progress) || 0
      aiStatusText.value = pct > 0
        ? `${install.message || '准备中…'}（${pct}%）`
        : (install.message || '准备中…')
      return { resumePrepare: true }
    }
  } catch {}
  return {}
}

/** 启用 AI 时完整检测环境（不自动安装） */
async function refreshAiStatus({ probe = true } = {}) {
  if (!probe) return loadAnalyzerPref()
  try {
    aiStatusText.value = '正在检测 AI 环境…'
    const res = await api.library.moodAiStatus({ probe: true })
    const data = res.data || {}
    aiReady.value = Boolean(data.ready)
    const install = data.install || {}
    if (install.running) {
      const pct = Number(install.progress) || 0
      aiStatusText.value = pct > 0
        ? `${install.message || '准备中…'}（${pct}%）`
        : (install.message || '准备中…')
      return { resumePrepare: true }
    }
    aiStatusText.value = data.hint || (aiReady.value ? 'AI 已就绪' : '')
    if (data.platformOk === false && data.hint) {
      aiStatusText.value = data.hint
    }
  } catch (e) {
    aiReady.value = false
    aiStatusText.value = e.message || '检测失败'
  }
}

async function onAnalyzerChange() {
  try {
    await api.settings.update({ 'mood.analyzer': analyzer.value })
  } catch {}
  if (analyzer.value === 'essentia') {
    // 启用时才检测；缺依赖只提示，不自动长时间安装
    await refreshAiStatus({ probe: true })
  } else {
    aiStatusText.value = ''
    aiReady.value = false
  }
}

async function pollAiPrepareUntilDone() {
  preparingAi.value = true
  const deadline = Date.now() + 45 * 60 * 1000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    const st = await api.library.moodAiPrepareStatus()
    const data = st.data || {}
    const pct = Number(data.progress) || 0
    const msg = data.message || '准备中…'
    aiStatusText.value = pct > 0 ? `${msg}（${pct}%）` : msg
    if (data.phase === 'done') break
    if (data.phase === 'error') {
      throw new Error(data.error || data.message || '准备失败')
    }
    if (!data.running && data.finishedAt) break
  }
  await refreshAiStatus()
  if (!aiReady.value) {
    aiStatusText.value = aiStatusText.value || '尚未就绪，请重试'
  }
}

async function prepareAi() {
  preparingAi.value = true
  aiStatusText.value = '正在准备 AI 环境…'
  try {
    await api.library.moodAiPrepare()
    await pollAiPrepareUntilDone()
  } catch (e) {
    aiReady.value = false
    aiStatusText.value = e.message || '准备失败'
  } finally {
    preparingAi.value = false
  }
}

async function refreshStatus() {
  try {
    const res = await api.library.moodAnalyzeStatus()
    const mood = res.mood || {}
    analyzing.value = Boolean(mood.running)
    if (mood.library) stats.value = mood.library
    if (mood.running) {
      progressText.value = `分析中 ${mood.current || 0}/${mood.total || 0}`
        + (mood.analyzed ? ` · 完成 ${mood.analyzed}` : '')
    } else if (mood.phase === 'done') {
      progressText.value = ''
    } else if (mood.errorMsg) {
      progressText.value = mood.errorMsg
    }
  } catch {}
}

async function startAnalyze() {
  if (starting.value || analyzing.value) return
  if (analyzer.value === 'essentia' && !aiReady.value) {
    progressText.value = '请先点「准备 AI」'
    return
  }
  starting.value = true
  try {
    await api.library.moodAnalyzeStart(false, analyzer.value)
    analyzing.value = true
    progressText.value = analyzer.value === 'essentia'
      ? '已开始 AI 后台分析…'
      : '已开始后台分析…'
    await refreshStatus()
  } catch (e) {
    progressText.value = e.message || '无法启动分析'
  } finally {
    starting.value = false
  }
}

async function stopAnalyze() {
  try {
    await api.library.moodAnalyzeStop()
    analyzing.value = false
    progressText.value = '已停止分析'
  } catch (e) {
    progressText.value = e.message || '停止失败'
  }
}

watch(points, () => nextTick().then(draw))

watch(moodRadioNow, () => {
  startAnimLoop()
  draw()
})

watch(canvasEl, (el, prev) => {
  if (prev && onWheelBound) {
    try { prev.removeEventListener('wheel', onWheelBound) } catch {}
  }
  if (el) {
    onWheelBound = onWheel
    el.addEventListener('wheel', onWheelBound, { passive: false })
  }
})

onMounted(async () => {
  preferReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false
  // 先进页只读偏好；启发式不探测。已启用 AI 或正在准备时才检测/续跑
  const aiSnap = await loadAnalyzerPref()
  if (aiSnap?.resumePrepare) {
    pollAiPrepareUntilDone()
      .catch((e) => {
        aiReady.value = false
        aiStatusText.value = e.message || '准备失败'
      })
      .finally(() => { preparingAi.value = false })
  } else if (analyzer.value === 'essentia') {
    await refreshAiStatus({ probe: true })
  }
  await loadMap({ animate: true })
  await refreshStatus()
  offProgress = onWS('library:mood-progress', async (payload) => {
    analyzing.value = Boolean(payload?.running)
    if (payload?.running) {
      progressText.value = payload.text
        || `分析中 ${payload.current || 0}/${payload.total || 0}`
      const cur = Number(payload.current) || 0
      if (cur > 0 && cur % 5 === 0) await loadMap()
    }
  })
  offComplete = onWS('library:mood-complete', async () => {
    analyzing.value = false
    progressText.value = '分析完成'
    await loadMap({ animate: true })
    await refreshStatus()
  })
  statusTimer = setInterval(() => {
    if (analyzing.value) refreshStatus()
  }, 4000)
  if (typeof ResizeObserver !== 'undefined' && canvasEl.value?.parentElement) {
    resizeObs = new ResizeObserver(() => draw())
    resizeObs.observe(canvasEl.value.parentElement)
  }
  window.addEventListener('resize', draw)
  const onDocPointer = (ev) => {
    if (!pointMenu.value) return
    const t = ev.target
    if (t?.closest?.('.mood-point-menu')) return
    closePointMenu()
  }
  document.addEventListener('pointerdown', onDocPointer)
  onUnmounted(() => document.removeEventListener('pointerdown', onDocPointer))
})

onUnmounted(() => {
  offProgress?.()
  offComplete?.()
  if (statusTimer) clearInterval(statusTimer)
  resizeObs?.disconnect()
  window.removeEventListener('resize', draw)
  if (onWheelBound && canvasEl.value) {
    canvasEl.value.removeEventListener('wheel', onWheelBound)
  }
  onWheelBound = null
  activePointers.clear()
  clearGesture()
  stopAnimLoop()
  coverLoadToken += 1
})
</script>

<style scoped>
.mood-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: none;
  height: 100%;
  min-height: 0;
  padding: 12px 16px 12px;
  box-sizing: border-box;
}
.page-header-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 6px;
  flex-shrink: 0;
}
.page-title {
  font-size: 1.25rem;
  font-weight: 650;
  flex: 1;
}
.mood-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.mood-hint {
  margin: 0 0 8px;
  color: var(--text-muted);
  font-size: 0.88rem;
  line-height: 1.45;
  flex-shrink: 0;
}
.mood-hint-detail {
  display: block;
  margin-top: 4px;
  opacity: 0.92;
}
.mood-hint code {
  font-size: 0.82em;
  padding: 0 4px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--text) 8%, transparent);
}
.mood-ai-status {
  margin: 0 0 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--text) 6%, transparent);
  color: var(--text-muted);
  font-size: 0.86rem;
  flex-shrink: 0;
}
.mood-ai-status.ready {
  background: color-mix(in srgb, #2f9e44 14%, transparent);
  color: var(--text);
}
.mood-ai-status.bad {
  background: color-mix(in srgb, #e67700 16%, transparent);
  color: var(--text);
}
.mood-progress {
  margin-bottom: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--text);
  font-size: 0.88rem;
  flex-shrink: 0;
  white-space: pre-wrap;
  line-height: 1.5;
}
.mood-map-wrap {
  position: relative;
  flex: 1 1 0;
  min-height: 280px;
  width: 100%;
  padding: 0;
  overflow: hidden;
  border-radius: var(--radius-lg, 12px);
  background: var(--bg-card);
}
.mood-map-enter {
  animation: mood-map-in 0.45s ease-out both;
}
@keyframes mood-map-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.mood-canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: default;
  border-radius: inherit;
}
.mood-canvas.is-panning { cursor: grabbing; }
.mood-zoom-controls {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-elevated, #222) 88%, transparent);
  backdrop-filter: blur(8px);
}
.mood-zoom-btn {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
}
.mood-zoom-btn svg {
  display: block;
  flex-shrink: 0;
}
.mood-zoom-btn:hover:not(:disabled) {
  color: var(--text);
  background: var(--bg-hover, rgba(255,255,255,0.08));
}
.mood-zoom-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.mood-axis-label {
  position: absolute;
  font-size: 0.75rem;
  color: var(--text-muted);
  pointer-events: none;
  z-index: 1;
}
.mood-axis-label.top { top: 10px; left: 50%; transform: translateX(-50%); }
.mood-axis-label.bottom { bottom: 28px; left: 50%; transform: translateX(-50%); }
.mood-axis-label.left { left: 10px; top: 50%; transform: translateY(-50%); }
.mood-axis-label.right { right: 10px; top: 50%; transform: translateY(-50%); }
.mood-legend {
  position: absolute;
  left: 12px;
  bottom: 10px;
  z-index: 2;
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
  pointer-events: none;
  text-shadow: 0 1px 2px color-mix(in srgb, var(--bg-card) 80%, transparent);
}
.mood-point-menu {
  position: absolute;
  z-index: 5;
  min-width: 148px;
  padding: 8px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-elevated, #222) 94%, transparent);
  border: 1px solid var(--border);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mood-point-menu-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 4px 4px;
  min-width: 0;
}
.mood-point-menu-meta strong {
  font-size: 0.82rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mood-point-menu-meta span {
  font-size: 0.75rem;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mood-point-menu-btn {
  border: 0;
  border-radius: 8px;
  padding: 8px 10px;
  background: #e53935;
  color: #fff;
  font-size: 0.82rem;
  cursor: pointer;
  text-align: left;
}
.mood-point-menu-btn.ghost {
  background: var(--bg-hover, rgba(255,255,255,0.08));
  color: var(--text);
}
.mood-point-menu-btn:hover {
  filter: brightness(1.06);
}
.mood-point-menu-btn:not(.ghost):hover {
  background: #ef5350;
}
.mood-tip {
  position: absolute;
  z-index: 2;
  pointer-events: none;
  min-width: 140px;
  max-width: 220px;
  padding: 6px 10px 6px 6px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-elevated, #222) 92%, transparent);
  border: 1px solid var(--border);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
}
.mood-tip-cover {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--bg-hover, #333);
}
.mood-tip-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mood-tip strong {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mood-tip span {
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mood-tip-enter-active,
.mood-tip-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.mood-tip-enter-from,
.mood-tip-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
.empty, .loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  text-align: center;
  border-radius: var(--radius-lg, 12px);
  background: var(--bg-card);
  border: 1px solid var(--border-light);
}
.empty-hint {
  color: var(--text-muted);
  font-size: 0.88rem;
  margin: 8px auto 16px;
  line-height: 1.55;
  text-align: left;
  max-width: 42rem;
}
.empty-hint code {
  font-size: 0.82em;
  padding: 1px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--text) 8%, transparent);
}
@media (max-width: 720px) {
  .mood-page {
    padding: 10px 10px 8px;
    min-height: calc(100dvh - var(--player-height, 72px) - var(--mobile-nav-height, 56px) - 52px);
  }
  .mood-actions { width: 100%; }
  .mood-map-wrap { min-height: 360px; }
}
@media (prefers-reduced-motion: reduce) {
  .mood-map-enter { animation: none; }
  .mood-tip-enter-active,
  .mood-tip-leave-active { transition: none; }
}
</style>
