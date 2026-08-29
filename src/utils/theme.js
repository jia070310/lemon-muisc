import { ref } from 'vue'
import { applyColorScheme, colorScheme, getStoredColorScheme, getStoredCustomColor, COLOR_SCHEME_KEY, CUSTOM_COLOR_KEY } from './colorScheme.js'

export const THEME_KEY = 'ui.theme'
export const THEME_STORAGE = 'lemon-ui-theme'
export const theme = ref(getStoredTheme())

export { COLOR_SCHEME_KEY, CUSTOM_COLOR_KEY, colorScheme, customColor, COLOR_SCHEME_OPTIONS } from './colorScheme.js'
export { applyColorScheme, normalizeColorScheme, normalizeHex, setCustomColor } from './colorScheme.js'

export function normalizeTheme(value) {
  return value === 'light' ? 'light' : 'dark'
}

function getStoredTheme() {
  try { return normalizeTheme(localStorage.getItem(THEME_STORAGE)) } catch { return 'dark' }
}

export function applyTheme(value, { color = colorScheme.value, customHex } = {}) {
  const next = normalizeTheme(value)
  theme.value = next
  document.documentElement.dataset.theme = next
  document.documentElement.style.colorScheme = next
  applyColorScheme(color, next, { customHex })
  try { localStorage.setItem(THEME_STORAGE, next) } catch {}
  return next
}

applyTheme(theme.value, { color: getStoredColorScheme(), customHex: getStoredCustomColor() })
