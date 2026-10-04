import { ref } from 'vue'
import { normalizeHex } from './colorScheme.js'

export const LYRIC_PRESET_KEY = 'ui.lyricColorPreset'
export const LYRIC_TEXT_KEY = 'ui.lyricTextColor'
export const LYRIC_HIGHLIGHT_KEY = 'ui.lyricHighlightColor'

const PRESET_STORAGE = 'lemon-lyric-preset'
const TEXT_STORAGE = 'lemon-lyric-text'
const HIGHLIGHT_STORAGE = 'lemon-lyric-highlight'

export const DEFAULT_LYRIC_TEXT = '#ffffff'
export const DEFAULT_LYRIC_HIGHLIGHT = '#ffffff'

export const LYRIC_COLOR_PRESETS = [
  { id: 'classic', label: '经典白', text: '#ffffff', highlight: '#ffffff' },
  { id: 'lemon', label: '柠檬橙', text: '#ffe4cc', highlight: '#ff9a3c' },
  { id: 'gold', label: '月光金', text: '#fff1cc', highlight: '#ffd36a' },
  { id: 'cyan', label: '湖水青', text: '#d4f4f0', highlight: '#2dd4bf' },
  { id: 'sky', label: '天际蓝', text: '#d9e8ff', highlight: '#60a5fa' },
  { id: 'pink', label: '樱花粉', text: '#ffd6ea', highlight: '#fb7185' },
  { id: 'custom', label: '自定义', text: null, highlight: null },
]

const PRESET_IDS = new Set(LYRIC_COLOR_PRESETS.map((p) => p.id))

export function normalizeLyricPreset(value) {
  const id = String(value || '').trim()
  return PRESET_IDS.has(id) ? id : 'classic'
}

function presetColors(id) {
  const found = LYRIC_COLOR_PRESETS.find((p) => p.id === id)
  if (!found || id === 'custom') {
    return { text: DEFAULT_LYRIC_TEXT, highlight: DEFAULT_LYRIC_HIGHLIGHT }
  }
  return { text: found.text, highlight: found.highlight }
}

function getStoredPreset() {
  try { return normalizeLyricPreset(localStorage.getItem(PRESET_STORAGE)) } catch { return 'classic' }
}

function getStoredText() {
  try { return normalizeHex(localStorage.getItem(TEXT_STORAGE), DEFAULT_LYRIC_TEXT) } catch { return DEFAULT_LYRIC_TEXT }
}

function getStoredHighlight() {
  try { return normalizeHex(localStorage.getItem(HIGHLIGHT_STORAGE), DEFAULT_LYRIC_HIGHLIGHT) } catch { return DEFAULT_LYRIC_HIGHLIGHT }
}

export const lyricColorPreset = ref(getStoredPreset())
export const lyricTextColor = ref(getStoredText())
export const lyricHighlightColor = ref(getStoredHighlight())

export function applyLyricColors({
  preset = lyricColorPreset.value,
  text = lyricTextColor.value,
  highlight = lyricHighlightColor.value,
} = {}) {
  const nextPreset = normalizeLyricPreset(preset)
  let textHex
  let highlightHex
  if (nextPreset === 'custom') {
    textHex = normalizeHex(text, lyricTextColor.value || DEFAULT_LYRIC_TEXT)
    highlightHex = normalizeHex(highlight, lyricHighlightColor.value || DEFAULT_LYRIC_HIGHLIGHT)
  } else {
    const colors = presetColors(nextPreset)
    textHex = colors.text
    highlightHex = colors.highlight
  }

  lyricColorPreset.value = nextPreset
  lyricTextColor.value = textHex
  lyricHighlightColor.value = highlightHex

  const root = document.documentElement
  root.style.setProperty('--lyric-text', textHex)
  root.style.setProperty('--lyric-highlight', highlightHex)

  try {
    localStorage.setItem(PRESET_STORAGE, nextPreset)
    localStorage.setItem(TEXT_STORAGE, textHex)
    localStorage.setItem(HIGHLIGHT_STORAGE, highlightHex)
  } catch {}

  return { preset: nextPreset, text: textHex, highlight: highlightHex }
}

applyLyricColors()
