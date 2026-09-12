import { ref, computed } from 'vue'

const TOKEN_KEY = 'lemon-auth-token'
const USER_KEY = 'lemon-auth-user'

function readStorage(key) {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

const token = ref(readStorage(TOKEN_KEY))
const user = ref(safeParse(readStorage(USER_KEY) || null))
const setupRequired = ref(false)
const authReady = ref(false)
const sessionValidated = ref(false)

function safeParse(raw) {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const isAuthenticated = computed(() => Boolean(token.value))
export const isSessionValid = computed(() => sessionValidated.value)
export const currentUser = computed(() => user.value)
export const isAdmin = computed(() => user.value?.role === 'admin')
export const needsSetup = computed(() => setupRequired.value)
export const isAuthReady = computed(() => authReady.value)

export function getToken() {
  if (token.value) return token.value
  return readStorage(TOKEN_KEY)
}

export function setAuthSession(newToken, newUser) {
  token.value = newToken || ''
  user.value = newUser || null
  sessionValidated.value = Boolean(newToken)
  try {
    if (newToken) {
      localStorage.setItem(TOKEN_KEY, newToken)
      localStorage.setItem(USER_KEY, JSON.stringify(newUser || null))
    } else {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    }
  } catch {
    // 飞牛部分 WebView / 隐私模式可能禁止 localStorage；会话仍可由 Cookie 维持
  }
}

export function patchLocalUser(partial) {
  if (!partial || !user.value) return
  user.value = { ...user.value, ...partial }
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user.value))
  } catch {}
}

export function clearAuthSession() {
  setAuthSession('', null)
  sessionValidated.value = false
}

export async function initAuth() {
  sessionValidated.value = false
  try {
    const res = await fetch('/api/auth/status', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    setupRequired.value = Boolean(data.setupRequired)

    // 无用户时需重新初始化：清除浏览器里残留的旧登录态
    if (setupRequired.value) {
      clearAuthSession()
      return
    }

    // localStorage 或 Cookie 任一有会话即可（飞牛手机端常清掉 localStorage）
    const meRes = await fetch('/api/auth/me', {
      credentials: 'include',
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    })
    if (meRes.ok) {
      const meData = await meRes.json()
      if (meData.token) {
        setAuthSession(meData.token, meData.user)
      } else if (meData.user) {
        user.value = meData.user
        sessionValidated.value = Boolean(getToken())
        try { localStorage.setItem(USER_KEY, JSON.stringify(meData.user)) } catch {}
      }
    } else if (getToken()) {
      clearAuthSession()
    }
  } catch {
    // 后端未启动时保持当前 token，路由守卫会处理
  } finally {
    authReady.value = true
  }
}

export async function login(username, password, remember = true) {
  let res
  try {
    res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: String(username || '').trim(),
        password,
        remember,
      }),
    })
  } catch {
    throw new Error('无法连接服务器，请确认后端已启动')
  }

  let data = {}
  try {
    data = await res.json()
  } catch {
    throw new Error(res.ok ? '服务器响应异常' : `登录失败（服务器异常 ${res.status}）`)
  }

  if (!res.ok) throw new Error(data.error || `登录失败（${res.status}）`)
  if (!data.token) throw new Error('登录响应无效，请稍后重试')

  setAuthSession(data.token, data.user)
  setupRequired.value = false
  return data
}

export async function setupAdmin(username, password, displayName, email = '', mail = null, recoveryMode = 'mail') {
  let res
  try {
    res = await fetch('/api/auth/setup', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, displayName, email, mail, recoveryMode }),
    })
  } catch {
    throw new Error('无法连接服务器，请确认后端已启动')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || '初始化失败')
  if (!data.token) throw new Error('初始化响应无效，请稍后重试')
  setAuthSession(data.token, data.user)
  setupRequired.value = false
  return data
}

export async function logout() {
  try {
    const t = getToken()
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: t ? { Authorization: `Bearer ${t}` } : {},
    })
  } catch {}
  clearAuthSession()
}
