import { TrimApp } from '@trimjs/web-app'

const APP_NAME = 'lemon-music'
const AUTH_MSG = 'lemon-music:auth-result'

let trimApp = null

async function getApp() {
  if (!trimApp) trimApp = new TrimApp()
  return trimApp
}

/** 是否在飞牛 fnOS 宿主环境中（可调用系统文件管理器） */
export async function isFnosHost() {
  try {
    const app = await getApp()
    return Boolean(app.isWeb && !app.isStandaloneWeb)
  } catch {
    return false
  }
}

/** 是否支持通过 openAppAuth 选择目录（独立浏览器访问时） */
export async function isFnosStandaloneAuth() {
  try {
    const app = await getApp()
    return Boolean(app.isStandaloneWeb)
  } catch {
    return false
  }
}

export async function canPickFolder() {
  try {
    const app = await getApp()
    // 飞牛桌面内嵌 Web 应用
    if (app.isWeb && !app.isStandaloneWeb) return true
    // 通过 /app/xxx 网关访问的独立页
    if (app.isStandaloneWeb && /^\/app\//.test(window.location.pathname)) return true
    return false
  } catch {
    return false
  }
}

function getAuthCallbackUri() {
  const m = window.location.pathname.match(/^(\/app\/[^/]+)/)
  const prefix = m ? m[1] : ''
  return `${window.location.origin}${prefix}/auth-callback`
}

function waitAuthResult() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage)
      reject(new Error('选择文件夹超时，请重试'))
    }, 5 * 60 * 1000)

    function onMessage(event) {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== AUTH_MSG) return
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      const result = event.data.result
      if (result?.status === 'success' && result?.path?.length) {
        resolve(result.path[0])
        return
      }
      reject(new Error(result?.error?.message || '未选择文件夹'))
    }

    window.addEventListener('message', onMessage)
  })
}

/**
 * 调用飞牛系统文件管理器选择文件夹
 * @returns {Promise<string|null>} 选中的目录路径
 */
export async function pickFolder(options = {}) {
  const app = await getApp()
  const pickerParams = {
    directory: true,
    title: options.title || '选择文件夹',
    okText: options.okText || '确定',
    sidebarGroup: ['myFiles', 'external'],
    creatable: false,
  }

  if (app.isStandaloneWeb) {
    const redirectUri = getAuthCallbackUri()
    const state = `pick-${Date.now()}`
    const pending = waitAuthResult()
    await app.openAppAuth('pickUserFile', {
      appName: APP_NAME,
      directory: true,
      redirectUri,
      state,
      sidebarGroup: pickerParams.sidebarGroup,
      title: pickerParams.title,
    }, {
      target: '_blank',
      features: 'width=900,height=700',
    })
    return pending
  }

  const result = await app.pickUserFile(pickerParams)
  const paths = result?.data
  if (Array.isArray(paths) && paths.length) return paths[0]
  return null
}
