/**
 * 功能使用计数 + 播放/下载结果 + 访问端形态，供日活心跳附带上报。
 * 更具体的路径须排在通用前缀（如 /library）之前。
 */

const CLIENT_SURFACE_KEYS = ['mobile', 'pc', 'client', 'other']
const TZ = 'Asia/Shanghai'

/** @type {Array<[string, string]>} path 前缀 → feature key */
const PREFIX_MAP = [
  ['/library/duplicates', 'clean'],
  ['/library/scan-small-files', 'clean'],
  ['/library/delete-files', 'clean'],
  ['/library/scan-fake-flac', 'clean'],
  ['/library/rename-file', 'clean'],
  ['/library/organize', 'organize'],
  ['/library/quality-upgrade', 'quality'],
  ['/tag', 'tag'],
  ['/paths', 'paths'],

  ['/play', 'play'],
  ['/search', 'search'],
  ['/download', 'download'],
  ['/playlist', 'playlist'],
  ['/library', 'library'],
  ['/discover', 'discover'],
  ['/podcasts', 'podcast'],
  ['/dlna', 'dlna'],
  ['/album', 'album'],
  ['/settings', 'settings'],
  ['/backup', 'backup'],
]

/** @type {Record<string, number>} */
const counts = Object.create(null)

/** @type {{ playOk: number, playFail: number, downloadOk: number, downloadFail: number }} */
const quality = {
  playOk: 0,
  playFail: 0,
  downloadOk: 0,
  downloadFail: 0,
}

/** @type {{ day: string, users: Record<string, Set<string>>, hits: Record<string, number> }} */
let clientSurfaceState = {
  day: '',
  users: emptyClientSurfaceSets(),
  hits: emptyClientSurfaceHits(),
}

function emptyClientSurfaceSets() {
  return {
    mobile: new Set(),
    pc: new Set(),
    client: new Set(),
    other: new Set(),
  }
}

function emptyClientSurfaceHits() {
  return { mobile: 0, pc: 0, client: 0, other: 0 }
}

function shanghaiDay(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

function ensureClientSurfaceDay(day = shanghaiDay()) {
  if (clientSurfaceState.day === day) return
  clientSurfaceState = {
    day,
    users: emptyClientSurfaceSets(),
    hits: emptyClientSurfaceHits(),
  }
}

/**
 * 粗分访问端：手机浏览器 / PC 浏览器 / 非浏览器客户端 / 其他
 * @param {string} uaRaw
 * @returns {'mobile'|'pc'|'client'|'other'}
 */
export function classifyClientSurface(uaRaw) {
  const ua = String(uaRaw || '').trim()
  if (!ua) return 'other'

  const lower = ua.toLowerCase()

  // 明确的非浏览器 / 原生 / 脚本客户端
  if (
    /electron|okhttp|dart\b|python-requests|python\/|curl\/|wget\/|postman|insomnia|httpie|go-http-client|java\/|apache-httpclient|restsharp|node-fetch|undici|axios\/\d/i.test(ua)
    || (/^[\w.+-]+\/[\d.]+/.test(ua) && !/mozilla/i.test(ua))
  ) {
    return 'client'
  }

  if (/mobile|android|iphone|ipad|ipod|webos|blackberry|iemobile|opera mini|opera mobi/i.test(ua)) {
    // Android 平板/手机浏览器；排除纯 Linux 桌面误伤已由 mobile 关键字兜底
    return 'mobile'
  }

  if (/mozilla\/|chrome\/|safari\/|firefox\/|edg\/|opr\//i.test(ua) || /windows nt|macintosh|x11|cros/i.test(ua)) {
    return 'pc'
  }

  if (/linux|windows|darwin|macos/i.test(lower) && !/mozilla/i.test(ua)) {
    return 'client'
  }

  return 'other'
}

/**
 * @param {string|number} userId
 * @param {string} [ua]
 */
export function recordClientSurface(userId, ua) {
  const uid = String(userId || '').trim()
  if (!uid) return
  const kind = classifyClientSurface(ua)
  ensureClientSurfaceDay()
  clientSurfaceState.users[kind].add(uid)
  clientSurfaceState.hits[kind] = (clientSurfaceState.hits[kind] || 0) + 1
}

/**
 * 当日绝对值快照（不清空），供心跳上报。
 * @returns {{ day: string, users: Record<string, number>, hits: Record<string, number> }}
 */
export function peekClientSurface() {
  ensureClientSurfaceDay()
  /** @type {Record<string, number>} */
  const users = {}
  /** @type {Record<string, number>} */
  const hits = {}
  for (const k of CLIENT_SURFACE_KEYS) {
    users[k] = clientSurfaceState.users[k].size
    hits[k] = clientSurfaceState.hits[k] || 0
  }
  return { day: clientSurfaceState.day, users, hits }
}

/**
 * @param {string} key
 * @param {number} [n=1]
 */
export function recordFeature(key, n = 1) {
  const k = String(key || '').trim()
  if (!k) return
  const add = Number(n)
  if (!Number.isFinite(add) || add <= 0) return
  counts[k] = (counts[k] || 0) + Math.floor(add)
}

/**
 * @param {'playOk'|'playFail'|'downloadOk'|'downloadFail'} kind
 * @param {number} [n=1]
 */
export function recordQuality(kind, n = 1) {
  if (!Object.prototype.hasOwnProperty.call(quality, kind)) return
  const add = Math.floor(Number(n) || 0)
  if (add <= 0) return
  quality[kind] += add
}

export function recordDownloadOk(n = 1) {
  recordQuality('downloadOk', n)
}

export function recordDownloadFail(n = 1) {
  recordQuality('downloadFail', n)
}

/**
 * @returns {Record<string, number>}
 */
export function drainFeatureCounts() {
  const out = {}
  for (const [k, v] of Object.entries(counts)) {
    const n = Math.floor(Number(v) || 0)
    if (n > 0) out[k] = n
    delete counts[k]
  }
  return out
}

/**
 * @returns {{ playOk: number, playFail: number, downloadOk: number, downloadFail: number }|null}
 */
export function drainQualityCounts() {
  const out = {
    playOk: quality.playOk,
    playFail: quality.playFail,
    downloadOk: quality.downloadOk,
    downloadFail: quality.downloadFail,
  }
  quality.playOk = 0
  quality.playFail = 0
  quality.downloadOk = 0
  quality.downloadFail = 0
  if (!out.playOk && !out.playFail && !out.downloadOk && !out.downloadFail) return null
  return out
}

/**
 * @param {Record<string, number>|null|undefined} delta
 */
export function restoreFeatureCounts(delta) {
  if (!delta || typeof delta !== 'object') return
  for (const [k, v] of Object.entries(delta)) {
    recordFeature(k, v)
  }
}

/**
 * @param {{ playOk?: number, playFail?: number, downloadOk?: number, downloadFail?: number }|null|undefined} delta
 */
export function restoreQualityCounts(delta) {
  if (!delta || typeof delta !== 'object') return
  for (const k of ['playOk', 'playFail', 'downloadOk', 'downloadFail']) {
    recordQuality(/** @type {any} */ (k), delta[k])
  }
}

/**
 * @param {string} pathname
 * @returns {string|null}
 */
export function featureKeyFromPath(pathname) {
  const p = String(pathname || '')
  const pathOnly = p.split('?')[0]
  for (const [prefix, key] of PREFIX_MAP) {
    if (pathOnly === prefix || pathOnly.startsWith(prefix + '/')) return key
  }
  return null
}

function isPlayUrlPath(pathname) {
  const p = String(pathname || '').split('?')[0]
  return p === '/play/url' || p.endsWith('/play/url')
}

/**
 * Express 中间件：鉴权后按路由前缀计数；/play/url 按响应码记成功率；UA 记访问端。
 */
export function featureUsageMiddleware(req, res, next) {
  try {
    const key = featureKeyFromPath(req.path || '')
    if (key) recordFeature(key)

    const userId = req.user?.id
    if (userId != null && String(userId).trim()) {
      recordClientSurface(userId, req.headers?.['user-agent'])
    }

    if (isPlayUrlPath(req.path || '')) {
      res.on('finish', () => {
        try {
          const code = Number(res.statusCode) || 0
          if (code >= 200 && code < 400) recordQuality('playOk')
          else if (code >= 400) recordQuality('playFail')
        } catch {}
      })
    }
  } catch {
    // 计数失败不影响业务
  }
  next()
}
