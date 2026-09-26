/**
 * 全局美化气泡：接管原生 title，避免浏览器默认灰黄提示条。
 * 仅在支持悬停的设备启用；触控端仍保留原生 title（长按等）。
 */

const ATTR = 'data-lemon-tip'
const SKIP = '[data-no-tooltip], .lemon-tooltip'
const SHOW_DELAY = 380
const HIDE_DELAY = 60
const GAP = 10

let tipEl = null
let arrowEl = null
let activeEl = null
let showTimer = 0
let hideTimer = 0
let installed = false

function canHover() {
  return typeof window !== 'undefined'
    && window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

function ensureTip() {
  if (tipEl) return tipEl
  tipEl = document.createElement('div')
  tipEl.className = 'lemon-tooltip'
  tipEl.setAttribute('role', 'tooltip')
  tipEl.id = 'lemon-app-tooltip'
  tipEl.hidden = true

  arrowEl = document.createElement('span')
  arrowEl.className = 'lemon-tooltip-arrow'
  tipEl.appendChild(arrowEl)

  const text = document.createElement('span')
  text.className = 'lemon-tooltip-text'
  tipEl.appendChild(text)

  document.body.appendChild(tipEl)
  return tipEl
}

function tipTextNode() {
  return ensureTip().querySelector('.lemon-tooltip-text')
}

function readTipText(el) {
  if (!el || el.nodeType !== 1) return ''
  if (el.matches?.(SKIP) || el.closest?.(SKIP)) return ''
  const raw = el.getAttribute('title') || el.getAttribute(ATTR) || ''
  return String(raw).trim()
}

function stashTitle(el) {
  if (!el) return
  const t = el.getAttribute('title')
  if (t == null || t === '') return
  el.setAttribute(ATTR, t)
  el.removeAttribute('title')
}

function restoreTitle(el) {
  if (!el || !el.hasAttribute(ATTR)) return
  if (!el.hasAttribute('title')) el.setAttribute('title', el.getAttribute(ATTR))
}

function clearTimers() {
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = 0
  }
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = 0
  }
}

function hideTip() {
  clearTimers()
  if (activeEl) {
    activeEl.removeAttribute('aria-describedby')
    restoreTitle(activeEl)
    activeEl = null
  }
  if (!tipEl) return
  tipEl.classList.remove('is-visible')
  tipEl.hidden = true
}

function placeTip(anchor) {
  const tip = ensureTip()
  const rect = anchor.getBoundingClientRect()
  const tw = tip.offsetWidth
  const th = tip.offsetHeight
  const vw = window.innerWidth
  const vh = window.innerHeight

  let top = rect.top - th - GAP
  let place = 'top'
  if (top < 8) {
    top = rect.bottom + GAP
    place = 'bottom'
  }
  if (top + th > vh - 8 && place === 'bottom') {
    top = Math.max(8, rect.top - th - GAP)
    place = 'top'
  }

  // 宽锚点（如列表里左对齐省略的歌名）：按文字起点附近定位，避免整行居中导致气泡飘到右侧
  const wideAnchor = rect.width > Math.max(tw, 72) * 1.35
  const focusX = wideAnchor
    ? rect.left + Math.min(36, Math.max(12, rect.width * 0.12))
    : rect.left + rect.width / 2

  let left = focusX - tw / 2
  left = Math.min(Math.max(8, left), vw - tw - 8)

  const arrowX = Math.min(
    Math.max(12, focusX - left),
    tw - 12,
  )

  tip.dataset.place = place
  tip.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`
  if (arrowEl) arrowEl.style.left = `${Math.round(arrowX)}px`
}

function showTip(el) {
  const text = readTipText(el)
  if (!text) return

  stashTitle(el)
  activeEl = el
  el.setAttribute('aria-describedby', 'lemon-app-tooltip')

  const tip = ensureTip()
  tipTextNode().textContent = text
  tip.hidden = false
  tip.classList.remove('is-visible')
  // 先定位再淡入，避免闪到 (0,0)
  tip.style.transform = 'translate3d(-9999px, -9999px, 0)'
  requestAnimationFrame(() => {
    if (activeEl !== el) return
    placeTip(el)
    tip.classList.add('is-visible')
  })
}

function scheduleShow(el) {
  clearTimers()
  showTimer = window.setTimeout(() => {
    showTimer = 0
    showTip(el)
  }, SHOW_DELAY)
}

function scheduleHide() {
  clearTimers()
  hideTimer = window.setTimeout(() => {
    hideTimer = 0
    hideTip()
  }, HIDE_DELAY)
}

function findAnchor(target) {
  if (!target || target.nodeType !== 1) {
    target = target?.parentElement
  }
  if (!target) return null
  return target.closest(`[title], [${ATTR}]`)
}

function onPointerOver(e) {
  if (!canHover()) return
  const el = findAnchor(e.target)
  if (!el) return
  if (el === activeEl) {
    clearTimers()
    return
  }
  if (activeEl && activeEl !== el) hideTip()
  const text = readTipText(el)
  if (!text) return
  // 过长路径类提示：仍显示，但样式限制宽度
  scheduleShow(el)
}

function onPointerOut(e) {
  if (!canHover()) return
  const from = findAnchor(e.target)
  if (!from) return
  const to = findAnchor(e.relatedTarget)
  if (to === from) return
  if (from === activeEl || showTimer) scheduleHide()
}

function onFocusIn(e) {
  if (!canHover()) return
  const el = findAnchor(e.target)
  if (!el) return
  if (activeEl === el) return
  hideTip()
  const text = readTipText(el)
  if (!text) return
  showTip(el)
}

function onFocusOut(e) {
  if (!canHover()) return
  const from = findAnchor(e.target)
  if (!from) return
  if (from === activeEl) scheduleHide()
}

function onScrollOrResize() {
  if (!activeEl || !tipEl || tipEl.hidden) return
  placeTip(activeEl)
}

function onKeyDown(e) {
  if (e.key === 'Escape') hideTip()
}

export function installAppTooltip() {
  if (installed || typeof document === 'undefined') return
  installed = true
  document.addEventListener('pointerover', onPointerOver, true)
  document.addEventListener('pointerout', onPointerOut, true)
  document.addEventListener('focusin', onFocusIn, true)
  document.addEventListener('focusout', onFocusOut, true)
  document.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('scroll', onScrollOrResize, true)
  window.addEventListener('resize', onScrollOrResize)
}

export function uninstallAppTooltip() {
  if (!installed) return
  installed = false
  hideTip()
  document.removeEventListener('pointerover', onPointerOver, true)
  document.removeEventListener('pointerout', onPointerOut, true)
  document.removeEventListener('focusin', onFocusIn, true)
  document.removeEventListener('focusout', onFocusOut, true)
  document.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('scroll', onScrollOrResize, true)
  window.removeEventListener('resize', onScrollOrResize)
  tipEl?.remove()
  tipEl = null
  arrowEl = null
}
