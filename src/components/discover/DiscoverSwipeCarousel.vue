<template>
  <div
    ref="viewportRef"
    class="swipe-carousel"
    :class="{ 'is-dragging': dragging, 'is-single': pageCount <= 1 }"
  >
    <div
      class="swipe-track"
      :style="trackStyle"
      @transitionend.passive="onTransitionEnd"
    >
      <div
        v-for="page in Math.max(1, pageCount)"
        :key="page - 1"
        class="swipe-slide"
        :style="slideStyle"
      >
        <!-- 只挂载当前页及相邻页，避免发现首页一次渲染几十张封面导致播放时卡死/崩溃 -->
        <div
          v-if="shouldRenderPage(page - 1)"
          class="swipe-slide-body"
          :ref="(el) => setSlideBodyRef(page - 1, el)"
        >
          <slot :page="page - 1" />
        </div>
        <div
          v-else
          class="swipe-slide-placeholder"
          :style="{ minHeight: `${Math.max(contentHeight, 120)}px` }"
          aria-hidden="true"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  pageCount: { type: Number, default: 1 },
  /** 滑动超过宽度的该比例则翻页 */
  thresholdRatio: { type: Number, default: 0.2 },
})
const emit = defineEmits(['update:modelValue'])

const viewportRef = ref(null)
const width = ref(0)
const dragOffset = ref(0)
const dragging = ref(false)
const animating = ref(false)
const contentHeight = ref(180)

let startX = 0
let startY = 0
let startOffset = 0
let startAt = 0
let axis = null // 'x' | 'y' | null
let pointerId = null
let listening = false
let pendingPage = null
let suppressClick = false
let resizeObserver = null
/** @type {Map<number, Element>} */
const slideBodies = new Map()

const trackStyle = computed(() => {
  const x = -props.modelValue * width.value + dragOffset.value
  return {
    transform: `translate3d(${x}px, 0, 0)`,
    transition: dragging.value || !animating.value
      ? 'none'
      : 'transform 0.34s cubic-bezier(0.22, 1, 0.36, 1)',
  }
})

const slideStyle = computed(() => ({
  width: width.value ? `${width.value}px` : '100%',
  flex: width.value ? `0 0 ${width.value}px` : '0 0 100%',
}))

function shouldRenderPage(page) {
  const cur = props.modelValue
  if (Math.abs(page - cur) <= 1) return true
  if (pendingPage != null && Math.abs(page - pendingPage) <= 1) return true
  return false
}

function setSlideBodyRef(page, el) {
  if (el) slideBodies.set(page, el)
  else slideBodies.delete(page)
}

function syncContentHeight() {
  const el = slideBodies.get(props.modelValue) || [...slideBodies.values()][0]
  if (!el) return
  const h = el.getBoundingClientRect().height
  if (h > 40) contentHeight.value = Math.round(h)
}

function measure() {
  const el = viewportRef.value
  if (!el) return
  const next = el.clientWidth
  if (next > 0) width.value = next
  syncContentHeight()
}

function clampPage(page) {
  const max = Math.max(0, (props.pageCount || 1) - 1)
  return Math.min(max, Math.max(0, page))
}

function resist(dx) {
  const W = width.value || 1
  const atStart = props.modelValue <= 0 && dx > 0
  const atEnd = props.modelValue >= Math.max(0, props.pageCount - 1) && dx < 0
  if (atStart || atEnd) return dx * 0.35
  return dx
}

function bindMoveUp() {
  if (listening) return
  listening = true
  window.addEventListener('pointermove', onPointerMove, { passive: false })
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

function unbindMoveUp() {
  if (!listening) return
  listening = false
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
}

function onPointerDown(e) {
  if (props.pageCount <= 1) return
  if (e.pointerType === 'mouse' && e.button !== 0) return
  if (animating.value && pendingPage != null) return

  // 交互控件上按下时，先不当成拖拽起点的捕获目标；
  // 仍监听移动，只有明确横滑才进入拖拽，避免吞掉点击。
  pointerId = e.pointerId
  startX = e.clientX
  startY = e.clientY
  startOffset = dragOffset.value
  startAt = performance.now()
  axis = null
  dragging.value = false
  suppressClick = false
  bindMoveUp()
}

function onPointerMove(e) {
  if (pointerId != null && e.pointerId !== pointerId) return
  const dx = e.clientX - startX
  const dy = e.clientY - startY

  if (!axis) {
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
    axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'x' : 'y'
    if (axis === 'y') {
      // 纵向滚动：彻底退出，不拦截后续事件
      cleanupPointer()
      return
    }
    // 确认横滑后再捕获，避免普通点击失效
    dragging.value = true
    animating.value = false
    try {
      viewportRef.value?.setPointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  if (axis !== 'x') return
  e.preventDefault()
  dragOffset.value = resist(startOffset + dx)
}

function onPointerUp(e) {
  if (pointerId != null && e.pointerId !== pointerId) return
  const wasDragging = dragging.value && axis === 'x'
  const dx = dragOffset.value - startOffset
  const dt = Math.max(16, performance.now() - startAt)
  const velocity = dx / dt

  cleanupPointer()

  if (!wasDragging) {
    dragOffset.value = startOffset
    return
  }

  // 只有真正拖过一段距离才吞掉随后的 click
  suppressClick = Math.abs(dx) > 12
  settle(velocity)
}

function cleanupPointer() {
  unbindMoveUp()
  try {
    if (pointerId != null) viewportRef.value?.releasePointerCapture?.(pointerId)
  } catch {
    /* already released */
  }
  pointerId = null
  axis = null
  dragging.value = false
}

function finishPending() {
  const target = pendingPage
  pendingPage = null
  animating.value = false
  dragOffset.value = 0
  if (target != null && target !== props.modelValue) {
    emit('update:modelValue', target)
  }
  nextTick(syncContentHeight)
}

function settle(velocity = 0) {
  const W = width.value || 1
  const ratio = props.thresholdRatio
  let target = props.modelValue

  if (dragOffset.value <= -W * ratio || velocity < -0.45) target += 1
  else if (dragOffset.value >= W * ratio || velocity > 0.45) target -= 1
  target = clampPage(target)

  const targetDrag = (props.modelValue - target) * W
  pendingPage = target

  if (Math.abs(dragOffset.value - targetDrag) < 1) {
    finishPending()
    return
  }

  animating.value = true
  nextTick(() => {
    dragOffset.value = targetDrag
  })
}

function onTransitionEnd(e) {
  if (e.target !== e.currentTarget) return
  if (e.propertyName && e.propertyName !== 'transform') return
  if (pendingPage == null) {
    animating.value = false
    return
  }
  finishPending()
}

function onClickCapture(e) {
  if (!suppressClick) return
  suppressClick = false
  e.preventDefault()
  e.stopPropagation()
}

watch(() => props.modelValue, (next, prev) => {
  if (dragging.value || pendingPage != null) return
  if (!width.value || next === prev) return
  dragOffset.value = (next - prev) * width.value
  animating.value = false
  nextTick(() => {
    animating.value = true
    dragOffset.value = 0
    nextTick(syncContentHeight)
  })
})

watch(() => props.pageCount, () => {
  dragOffset.value = 0
  pendingPage = null
  animating.value = false
  measure()
})

onMounted(() => {
  measure()
  const el = viewportRef.value
  if (el) {
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('click', onClickCapture, true)
    resizeObserver = new ResizeObserver(() => measure())
    resizeObserver.observe(el)
  }
})

onUnmounted(() => {
  cleanupPointer()
  const el = viewportRef.value
  el?.removeEventListener('pointerdown', onPointerDown)
  el?.removeEventListener('click', onClickCapture, true)
  resizeObserver?.disconnect()
  slideBodies.clear()
})
</script>

<style scoped>
.swipe-carousel {
  overflow: hidden;
  width: 100%;
  touch-action: pan-y;
}
.swipe-carousel.is-dragging {
  touch-action: none;
  cursor: grabbing;
}
.swipe-track {
  display: flex;
  will-change: transform;
}
.swipe-slide {
  min-width: 0;
  box-sizing: border-box;
}
.swipe-slide-body,
.swipe-slide-placeholder {
  width: 100%;
}
.swipe-slide-placeholder {
  pointer-events: none;
}
</style>
