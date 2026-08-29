import { ref } from 'vue'

export const COLOR_SCHEME_KEY = 'ui.colorScheme'
export const CUSTOM_COLOR_KEY = 'ui.customColor'
export const COLOR_STORAGE = 'lemon-ui-color'
export const CUSTOM_COLOR_STORAGE = 'lemon-ui-custom-color'
const DEFAULT_CUSTOM_COLOR = '#f07018'

export const COLOR_SCHEME_OPTIONS = [
  { id: 'lemon', label: '柠檬橙', preview: '#f07018' },
  { id: 'blue', label: '经典蓝', preview: '#3c6ef7' },
  { id: 'green', label: '翡翠绿', preview: '#22c55e' },
  { id: 'teal', label: '青碧色', preview: '#14b8a6' },
  { id: 'purple', label: '紫罗兰', preview: '#a855f7' },
  { id: 'pink', label: '樱花粉', preview: '#ec4899' },
  { id: 'red', label: '朱砂红', preview: '#ef4444' },
  { id: 'amber', label: '琥珀金', preview: '#f59e0b' },
  { id: 'custom', label: '自定义', preview: 'custom' },
]

const SCHEME_TOKENS = {
  lemon: {
    dark: ['#f07018', '#ff9533', '#e05a00', [255, 102, 0]],
    light: ['#f07018', '#ff9533', '#e05a00', [240, 112, 24]],
  },
  blue: {
    dark: ['#3c6ef7', '#5a84f8', '#2f62ef', [60, 110, 247]],
    light: ['#2f62ef', '#4d7af9', '#1d4ed8', [47, 98, 239]],
  },
  green: {
    dark: ['#22c55e', '#4ade80', '#16a34a', [34, 197, 94]],
    light: ['#16a34a', '#22c55e', '#15803d', [22, 163, 74]],
  },
  teal: {
    dark: ['#14b8a6', '#2dd4bf', '#0d9488', [20, 184, 166]],
    light: ['#0d9488', '#14b8a6', '#0f766e', [13, 148, 136]],
  },
  purple: {
    dark: ['#a855f7', '#c084fc', '#9333ea', [168, 85, 247]],
    light: ['#9333ea', '#a855f7', '#7e22ce', [147, 51, 234]],
  },
  pink: {
    dark: ['#ec4899', '#f472b6', '#db2777', [236, 72, 153]],
    light: ['#db2777', '#ec4899', '#be185d', [219, 39, 119]],
  },
  red: {
    dark: ['#ef4444', '#f87171', '#dc2626', [239, 68, 68]],
    light: ['#dc2626', '#ef4444', '#b91c1c', [220, 38, 38]],
  },
  amber: {
    dark: ['#f59e0b', '#fbbf24', '#d97706', [245, 158, 11]],
    light: ['#d97706', '#f59e0b', '#b45309', [217, 119, 6]],
  },
}

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map(v => clampByte(v).toString(16).padStart(2, '0')).join('')}`
}

export function normalizeHex(value, fallback = DEFAULT_CUSTOM_COLOR) {
  const raw = String(value || '').trim()
  const match = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return fallback
  let hex = match[1].toLowerCase()
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('')
  return `#${hex}`
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex)
  const n = parseInt(normalized.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mixRgb(rgb, target, amount) {
  return rgb.map((c, i) => clampByte(c + (target[i] - c) * amount))
}

function lighten(rgb, amount) {
  return mixRgb(rgb, [255, 255, 255], amount)
}

function darken(rgb, amount) {
  return mixRgb(rgb, [0, 0, 0], amount)
}

function buildBrandVars(main, light, dark, rgb, isLight) {
  const [r, g, b] = rgb
  const mutedAlpha = isLight ? 0.16 : 0.18
  const glowA = isLight ? 0.48 : 0.5
  const glowB = isLight ? 0.26 : 0.28
  const glowSmA = isLight ? 0.4 : 0.42
  const glowSmB = isLight ? 0.18 : 0.2
  const sliderHoverA = isLight ? 0.58 : 0.62
  const sliderHoverB = isLight ? 0.32 : 0.36
  const sliderActiveA = isLight ? 0.78 : 0.82
  const sliderActiveB = isLight ? 0.48 : 0.52
  const sliderActiveC = isLight ? 0.9 : 0.95
  return {
    lemon: main,
    'lemon-light': light,
    'lemon-dark': dark,
    'lemon-gradient': `linear-gradient(180deg, ${light} 0%, ${dark} 100%)`,
    'lemon-gradient-hover': `linear-gradient(180deg, ${light} 0%, ${main} 100%)`,
    'lemon-glow': `0 0 18px rgba(${r}, ${g}, ${b}, ${glowA}), 0 0 36px rgba(${r}, ${g}, ${b}, ${glowB})`,
    'lemon-glow-sm': `0 0 10px rgba(${r}, ${g}, ${b}, ${glowSmA}), 0 0 20px rgba(${r}, ${g}, ${b}, ${glowSmB})`,
    'slider-thumb-hover-glow': `0 0 14px rgba(${r}, ${g}, ${b}, ${sliderHoverA}), 0 0 28px rgba(${r}, ${g}, ${b}, ${sliderHoverB})`,
    'slider-thumb-active-glow': `0 0 22px rgba(${r}, ${g}, ${b}, ${sliderActiveA}), 0 0 44px rgba(${r}, ${g}, ${b}, ${sliderActiveB}), 0 0 8px rgba(${r}, ${g}, ${b}, ${sliderActiveC})`,
    accent: main,
    'accent-hover': light,
    'accent-muted': `rgba(${r}, ${g}, ${b}, ${mutedAlpha})`,
    'brand-border': `rgba(${r}, ${g}, ${b}, 0.35)`,
    'brand-border-soft': `rgba(${r}, ${g}, ${b}, 0.28)`,
  }
}

function buildCustomTokens(hex, isLight) {
  const rgb = hexToRgb(hex)
  const main = isLight ? rgbToHex(...darken(rgb, 0.08)) : normalizeHex(hex)
  const light = rgbToHex(...lighten(rgb, 0.22))
  const dark = rgbToHex(...darken(rgb, isLight ? 0.14 : 0.2))
  return buildBrandVars(main, light, dark, rgb, isLight)
}

function applyBrandVars(vars, schemeId) {
  const root = document.documentElement
  root.dataset.color = schemeId
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(`--${key}`, value)
  }
}

export function normalizeColorScheme(value) {
  const id = String(value || 'lemon').trim()
  if (id === 'custom') return 'custom'
  return SCHEME_TOKENS[id] ? id : 'lemon'
}

export function getStoredColorScheme() {
  try {
    const stored = localStorage.getItem(COLOR_STORAGE)
    return normalizeColorScheme(stored)
  } catch {
    return 'lemon'
  }
}

export function getStoredCustomColor() {
  try {
    return normalizeHex(localStorage.getItem(CUSTOM_COLOR_STORAGE))
  } catch {
    return DEFAULT_CUSTOM_COLOR
  }
}

export const colorScheme = ref(getStoredColorScheme())
export const customColor = ref(getStoredCustomColor())

export function setCustomColor(hex) {
  const next = normalizeHex(hex)
  customColor.value = next
  try { localStorage.setItem(CUSTOM_COLOR_STORAGE, next) } catch {}
  return next
}

export function applyColorScheme(schemeId, themeMode = 'dark', { customHex } = {}) {
  const id = normalizeColorScheme(schemeId)
  const mode = themeMode === 'light' ? 'light' : 'dark'
  const vars = id === 'custom'
    ? buildCustomTokens(customHex ?? customColor.value, mode === 'light')
    : buildBrandVars(...SCHEME_TOKENS[id][mode], mode === 'light')

  applyBrandVars(vars, id)
  colorScheme.value = id
  if (id === 'custom') setCustomColor(customHex ?? customColor.value)
  try { localStorage.setItem(COLOR_STORAGE, id) } catch {}
  return id
}

applyColorScheme(colorScheme.value, document.documentElement.dataset.theme === 'light' ? 'light' : 'dark', {
  customHex: customColor.value,
})
