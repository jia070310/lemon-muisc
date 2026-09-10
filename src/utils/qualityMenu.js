import { ref, nextTick } from 'vue'

/**
 * 音质菜单使用 fixed + 视口坐标。
 * 调用方须把菜单 Teleport 到 body：祖先若有 transform/filter（如发现页轮播），
 * fixed 会相对变换层定位，出现明显左右偏移。
 */
export function useQualityMenuPosition() {
  const menuStyle = ref({})
  const menuOpenUp = ref(false)

  function positionMenu(anchorEl, { align = 'right', zIndex = 80, preferUp = false } = {}) {
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
      const menuEstWidth = 168
      const spaceBelow = window.innerHeight - rect.bottom - bottomReserved
      const openUp = preferUp || spaceBelow < menuEstHeight

      menuOpenUp.value = openUp
      const base = {
        position: 'fixed',
        zIndex,
        minWidth: `${menuEstWidth}px`,
      }
      if (align === 'left') {
        base.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menuEstWidth - 8))}px`
        base.right = 'auto'
      } else {
        // 右对齐锚点：用 left 计算，避免仅设 right 时在异常 containing block 下更难排查
        const left = Math.max(8, Math.min(rect.right - menuEstWidth, window.innerWidth - menuEstWidth - 8))
        base.left = `${left}px`
        base.right = 'auto'
      }
      if (openUp) {
        menuStyle.value = {
          ...base,
          bottom: `${Math.max(8, window.innerHeight - rect.top + 6)}px`,
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
