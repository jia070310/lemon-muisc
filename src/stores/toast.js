import { ref } from 'vue'

/** 全局轻提示（设置页 / 监测面板等共用） */
export const toast = ref(null)

let timer = null

export function showToast(text, type = 'info') {
  toast.value = { text: String(text || ''), type: type || 'info' }
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    toast.value = null
    timer = null
  }, 3000)
}

export function clearToast() {
  if (timer) clearTimeout(timer)
  timer = null
  toast.value = null
}
