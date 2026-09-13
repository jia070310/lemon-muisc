/** 登录会话 Cookie：飞牛手机 WebView 常清 localStorage，Cookie 更稳 */

export const AUTH_COOKIE = 'lemon_auth'

export function parseCookies(req) {
  const header = req.headers?.cookie || ''
  const out = {}
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=')
    if (i <= 0) continue
    const key = part.slice(0, i).trim()
    const val = part.slice(i + 1).trim()
    if (!key) continue
    try {
      out[key] = decodeURIComponent(val)
    } catch {
      out[key] = val
    }
  }
  return out
}

export function getAuthCookieToken(req) {
  const cookies = parseCookies(req)
  return String(cookies[AUTH_COOKIE] || '').trim()
}

/** Max-Age 秒；不设 Secure，兼容飞牛局域网 HTTP */
export function setAuthCookie(res, token, maxAgeSec) {
  if (!res || !token) return
  const maxAge = Math.max(0, Math.floor(Number(maxAgeSec) || 0))
  const parts = [
    `${AUTH_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ]
  res.append('Set-Cookie', parts.join('; '))
}

export function clearAuthCookie(res) {
  if (!res) return
  res.append(
    'Set-Cookie',
    `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  )
}
