import { ref } from 'vue'
import { api } from '../api.js'

export const noActiveSourcePrompt = ref(null)

export function clearNoActiveSourcePrompt() {
  noActiveSourcePrompt.value = null
}

export async function assertActiveSourceForDownload() {
  let hasActive = false
  try {
    const data = await api.source.active()
    const ids = Array.isArray(data?.ids) ? data.ids.filter(Boolean) : []
    hasActive = ids.length > 0 || Boolean(data?.id)
  } catch {}
  if (hasActive) return true

  let imported = 0
  try {
    const list = await api.source.list()
    imported = Array.isArray(list) ? list.length : 0
  } catch {}

  noActiveSourcePrompt.value = {
    imported: imported > 0,
    message: imported > 0
      ? '已导入音源但尚未激活，请先到「设置 → 音源管理」激活音源后再下载。'
      : '当前没有可用音源。请先到「设置 → 音源管理」导入并激活音源后再下载。',
  }
  return false
}
