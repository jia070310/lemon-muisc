import { ref } from 'vue'

export const SOURCE_FALLBACK_MODE_KEY = 'source.fallbackMode'
export const sourceFallbackMode = ref('auto')
export const sourceSwitchNotice = ref('')
export const sourceFallbackPrompt = ref(null)

let noticeTimer = null

export function applySourceFallbackMode(value) {
  sourceFallbackMode.value = value === 'ask' ? 'ask' : 'auto'
}

export function notifySourceSwitch(info = {}) {
  if (!info?.switched) return
  const fromName = info.fromName || '当前音源'
  const toName = info.name || info.toName || '其他音源'
  sourceSwitchNotice.value = `已自动从「${fromName}」切换到「${toName}」`
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    sourceSwitchNotice.value = ''
    noticeTimer = null
  }, 4200)
}

export function askSourceFallback(offer, context = {}) {
  return new Promise((resolve) => {
    sourceFallbackPrompt.value = { offer, context, resolve }
  })
}

export function answerSourceFallback(sourceApiId) {
  const current = sourceFallbackPrompt.value
  sourceFallbackPrompt.value = null
  current?.resolve?.(sourceApiId || null)
}

export function cancelSourceFallback() {
  answerSourceFallback(null)
}

export function isSourceFallbackError(error) {
  return error?.code === 'SOURCE_FALLBACK_REQUIRED' || Boolean(error?.sourceFallbackOffer)
}

export function getSourceFallbackOffer(error) {
  return error?.sourceFallbackOffer || error?.extra?.sourceFallbackOffer || null
}
