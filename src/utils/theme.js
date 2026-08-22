import { ref } from 'vue'

export const THEME_KEY = 'ui.theme'
export const THEME_STORAGE = 'lemon-ui-theme'
export const theme = ref(getStoredTheme())

export function normalizeTheme(value) {
  return value === 'light' ? 'light' : 'dark'
}

function getStoredTheme() {
  try { return normalizeTheme(localStorage.getItem(THEME_STORAGE)) } catch { return 'dark' }
}

export function applyTheme(value) {
  const next = normalizeTheme(value)
  theme.value = next
  document.documentElement.dataset.theme = next
  document.documentElement.style.colorScheme = next
  try { localStorage.setItem(THEME_STORAGE, next) } catch {}
  return next
}

applyTheme(theme.value)
