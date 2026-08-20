import { ref } from 'vue'
import { api } from '../api.js'

export const hasUpdate = ref(false)

export async function checkForUpdate() {
  try {
    const info = await api.about.get()
    hasUpdate.value = Boolean(info.updateAvailable)
    return info
  } catch {
    hasUpdate.value = false
    return null
  }
}
