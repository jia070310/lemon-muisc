import { ref, nextTick } from 'vue'

/** 音质菜单使用 fixed 定位，避免被底部播放条遮挡 */
export function useQualityMenuPosition() {
  const menuStyle = ref({})
  const menuOpenUp = ref(false)

  function positionMenu(anchorEl, { align = 'right' } = {}) {
    if (!anchorEl) return
    nextTick(() => {
      const rect = anchorEl.getBoundingClientRect()
      const root = document.documentElement
      const playerH = parseFloat(root.style.getPropertyValue('--player-height'))
        || parseFloat(getComputedStyle(root).getPropertyValue('--player-height'))
        || 64
      const navH = parseFloat(root.style.getPropertyValue('--mobile-nav-height'))
        || parseFloat(getComputedStyle(root).getPropertyValue('--mobile-nav-height'))
        || 0
      const bottomReserved = playerH + navH + 12
      const menuEstHeight = 220
      const spaceBelow = window.innerHeight - rect.bottom - bottomReserved
      const openUp = spaceBelow < menuEstHeight

      menuOpenUp.value = openUp
      const base = {
        position: 'fixed',
        zIndex: 80,
        minWidth: '160px',
      }
      if (align === 'left') {
        base.left = `${Math.max(8, rect.left)}px`
        base.right = 'auto'
      } else {
        base.right = `${Math.max(8, window.innerWidth - rect.right)}px`
        base.left = 'auto'
      }
      if (openUp) {
        menuStyle.value = {
          ...base,
          bottom: `${window.innerHeight - rect.top + 6}px`,
          top: 'auto',
        }
      } else {
        menuStyle.value = {
          ...base,
          top: `${rect.bottom + 6}px`,
          bottom: 'auto',
        }
      }
    })
  }

  function clearMenuPosition() {
    menuStyle.value = {}
    menuOpenUp.value = false
  }

  return { menuStyle, menuOpenUp, positionMenu, clearMenuPosition }
}
