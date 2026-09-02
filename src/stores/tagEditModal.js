import { ref } from 'vue'
import { getTrackFilePath } from '../utils/trackPath.js'

export const showTagEditModal = ref(false)
export const tagEditFilePath = ref('')

export function openTagEditTrack(filePath) {
  const path = String(filePath || '').trim()
  if (!path) return false
  tagEditFilePath.value = path
  showTagEditModal.value = true
  return true
}

export function closeTagEditModal() {
  showTagEditModal.value = false
}

export function openTagEditForItem(item, source = '') {
  const path = getTrackFilePath({ ...item, source: source || item?.source })
  return openTagEditTrack(path)
}
