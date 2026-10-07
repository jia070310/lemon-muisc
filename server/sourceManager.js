import vm from 'vm'
import needle from 'needle'
import { getDB } from './db.js'
import { abortTrackedSourceRequests, runWithSourceAborts, trackSourceAbort } from './utils/sourceRequestScope.js'
import { parseScriptMeta } from './utils/parseScriptMeta.js'
import { createLxUtils, createSandboxRequire } from './utils/lxSourceRuntime.js'
import {
  createCerumusicApi,
  isCeruNativePlugin,
  normalizeCeruSources,
  createCeruHandler,
} from './utils/ceruSourceRuntime.js'
import { formatUserError } from './utils/userError.js'
import { assertMusicUrl } from './utils/sourceResult.js'
import { getSourceHealth } from './utils/sourceHealth.js'
import { isSourcePlatformEnabled } from './utils/enabledPlatforms.js'

/** @type {Map<string, { id: string, handler: Function|null, sources: object, pendingRequests: Map }>} */
const activeSources = new Map()

/** 脚本 send('updateAlert') 时记录，供设置页「检查更新」展示 */
/** @type {Map<string, { log?: string, updateUrl?: string, at: number }>} */
const sourceUpdateAlerts = new Map()

export function getSourceUpdateAlert(id) {
  return sourceUpdateAlerts.get(id) || null
}

export function clearSourceUpdateAlert(id) {
  if (id) sourceUpdateAlerts.delete(id)
}

export function listSourceUpdateAlerts() {
  return [...sourceUpdateAlerts.entries()].map(([id, info]) => ({ id, ...info }))
}

const SUPPORTED_SOURCES = ['kw', 'kg', 'tx', 'wy', 'mg']
const SUPPORTED_ACTIONS = ['musicUrl', 'lyric', 'pic']
const SUPPORTED_QUALITYS = ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master']

function clearSandboxTimers(entry) {
  if (!entry) return
  for (const t of entry.timers || []) {
    try { clearTimeout(t) } catch {}
  }
  for (const t of entry.intervals || []) {
    try { clearInterval(t) } catch {}
  }
  if (entry.timers) entry.timers.clear()
  if (entry.intervals) entry.intervals.clear()
}

/** 加载音源脚本并加入激活列表（不卸载其他已激活音源） */
export async function loadSource(id, script) {
  // 同 id 先卸再装，避免重复沙箱
  unloadSource(id)
  // 让出事件循环，避免激活时同步卡住其它 API
  await new Promise((r) => setImmediate(r))

  return new Promise((resolve, reject) => {
    const pendingRequests = new Map()
    const timers = new Set()
    const intervals = new Set()
    let sources = {}
    let requestHandler = null
    let settled = false
    let entry = null

    const timeout = setTimeout(() => {
      clearSandboxTimers({ timers, intervals })
      if (entry) {
        activeSources.delete(id)
        entry = null
      }
      finish(new Error('音源初始化超时(20s)'))
    }, 20000)

    const meta = parseScriptMeta(script)
    const finish = (err, result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (err) {
        clearSandboxTimers(entry || { timers, intervals })
        if (entry) {
          activeSources.delete(id)
          entry = null
        }
        reject(err)
      } else {
        resolve(result)
      }
    }

    const trackedSetTimeout = (fn, ms, ...args) => {
      const handle = setTimeout((...a) => {
        timers.delete(handle)
        try { fn(...a) } catch {}
      }, ms, ...args)
      timers.add(handle)
      return handle
    }
    const trackedClearTimeout = (handle) => {
      timers.delete(handle)
      return clearTimeout(handle)
    }
    const trackedSetInterval = (fn, ms, ...args) => {
      const handle = setInterval(fn, ms, ...args)
      intervals.add(handle)
      return handle
    }
    const trackedClearInterval = (handle) => {
      intervals.delete(handle)
      return clearInterval(handle)
    }

    const lxApi = {
      version: '2.0.0',
      env: 'desktop',
      EVENT_NAMES: { request: 'request', inited: 'inited', updateAlert: 'updateAlert' },
      currentScriptInfo: {
        name: meta.name || '',
        description: meta.description || '',
        version: meta.version || '',
        author: meta.author || '',
        homepage: meta.homepage || '',
        rawScript: script,
      },
      send(event, data) {
        if (event === 'inited') {
          if (data?.sources) {
            sources = validateSources(data.sources)
          }
          entry = {
            id,
            handler: requestHandler,
            sources,
            pendingRequests,
            timers,
            intervals,
          }
          activeSources.set(id, entry)
          finish(null, sources)
        } else if (event === 'updateAlert') {
          // 落雪脚本更新提示：记录供「检查更新」使用（不再弹窗）
          const payload = data && typeof data === 'object' ? data : {}
          sourceUpdateAlerts.set(id, {
            log: String(payload.log || payload.message || payload.msg || '').trim(),
            updateUrl: String(payload.updateUrl || payload.url || payload.homepage || '').trim(),
            at: Date.now(),
          })
        }
      },
      on(event, handler) {
        if (event === 'request') {
          requestHandler = handler
          if (entry) entry.handler = handler
          else if (activeSources.has(id)) activeSources.get(id).handler = handler
        }
      },
      request(url, options = {}, callback) {
        return lxRequest(url, options, callback)
      },
      utils: createLxUtils(),
    }

    const moduleExports = {}
    const sandbox = {
      lx: lxApi,
      cerumusic: createCerumusicApi(),
      console: {
        log: () => {},
        warn: () => {},
        error: () => {},
        info: () => {},
        debug: () => {},
        group: () => {},
        groupEnd: () => {},
      },
      setTimeout: trackedSetTimeout,
      clearTimeout: trackedClearTimeout,
      setInterval: trackedSetInterval,
      clearInterval: trackedClearInterval,
      queueMicrotask,
      URL,
      URLSearchParams,
      Buffer,
      JSON,
      Promise,
      Object,
      Array,
      String,
      Number,
      Boolean,
      Symbol,
      Math,
      Date,
      RegExp,
      Error,
      TypeError,
      RangeError,
      SyntaxError,
      Map,
      Set,
      WeakMap,
      WeakSet,
      Proxy,
      Reflect,
      ArrayBuffer,
      Uint8Array,
      Int8Array,
      Uint16Array,
      Int16Array,
      Uint32Array,
      Int32Array,
      Float32Array,
      Float64Array,
      DataView,
      TextEncoder,
      TextDecoder,
      atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
      btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      encodeURI,
      decodeURI,
      escape,
      unescape,
      require: createSandboxRequire(),
      module: { exports: moduleExports },
      exports: moduleExports,
      process: {
        env: {},
        version: process.version,
        versions: process.versions,
        platform: process.platform,
        nextTick: process.nextTick.bind(process),
      },
    }

    vm.createContext(sandbox)
    sandbox.global = sandbox
    sandbox.globalThis = sandbox
    sandbox.window = sandbox
    sandbox.self = sandbox

    // 放到下一个 tick，避免 Promise 构造器内同步跑脚本堵死整站
    setImmediate(() => {
      if (settled) return
      try {
        vm.runInContext(script, sandbox, {
          timeout: 15000,
          displayErrors: true,
        })
        // 澜音原生音源：不调用 lx.send('inited')，而是 module.exports = { pluginInfo, sources, musicUrl, ... }
        if (!settled) {
          const exported = sandbox.module?.exports
          if (isCeruNativePlugin(exported)) {
            sources = validateSources(normalizeCeruSources(exported))
            if (!Object.keys(sources).length) {
              finish(new Error('澜音音源未声明支持的平台（kw/kg/tx/wy/mg）'))
              return
            }
            requestHandler = createCeruHandler(exported)
            entry = {
              id, handler: requestHandler, sources, pendingRequests, runtime: 'ceru', timers, intervals,
            }
            activeSources.set(id, entry)
            finish(null, sources)
          } else {
            // 落雪脚本：先登记占位，便于超时/重复加载时能清掉沙箱定时器
            entry = {
              id, handler: requestHandler, sources, pendingRequests, timers, intervals, loading: true,
            }
            activeSources.set(id, entry)
          }
        }
      } catch (e) {
        finish(new Error(`音源脚本执行失败: ${e.message}`))
      }
    })
  })
}

function lxRequestTimeoutMs(options = {}) {
  const raw = Number(options.timeout)
  if (Number.isFinite(raw) && raw > 0) return Math.min(raw, 60000)
  return 20000
}

function lxRequest(url, options = {}, callback) {
  const method = (options.method || 'get').toLowerCase()
  const timeoutMs = lxRequestTimeoutMs(options)
  const opts = {
    follow_max: 5,
    parse_response: false,
    open_timeout: Math.min(timeoutMs, 15000),
    response_timeout: timeoutMs,
    read_timeout: timeoutMs,
    headers: {
      connection: 'close',
      ...(options.headers || {}),
    },
  }

  let body = null
  if (options.body != null) body = options.body
  else if (options.form != null) {
    body = options.form
    opts.json = false
  } else if (options.formData != null) {
    body = options.formData
    opts.json = false
  }

  const req = needle.request(method, url, body, opts, (err, resp) => {
    if (typeof callback !== 'function') return
    if (err) {
      callback(err, null, null)
      return
    }
    let parsedBody = resp.body
    try {
      parsedBody = JSON.parse(Buffer.isBuffer(resp.body) ? resp.body.toString() : String(resp.body))
    } catch {}
    callback(null, {
      statusCode: resp.statusCode,
      statusMessage: resp.statusMessage,
      headers: resp.headers,
      bytes: resp.bytes,
      body: parsedBody,
      raw: resp.raw,
    }, parsedBody)
  })

  const abort = () => {
    try {
      if (!req?.request?.aborted) req?.request?.abort()
    } catch {}
  }
  trackSourceAbort(abort)
  return abort
}

/** 卸载指定音源；不传 id 则卸载全部 */
export function unloadSource(id) {
  if (id) {
    const entry = activeSources.get(id)
    if (entry) {
      clearSandboxTimers(entry)
      entry.pendingRequests.clear()
      activeSources.delete(id)
    }
    return
  }
  for (const entry of activeSources.values()) {
    clearSandboxTimers(entry)
    entry.pendingRequests.clear()
  }
  activeSources.clear()
}

/** 兼容旧调用：返回最近激活的一个，或仅有一个时的那一个 */
export function getActiveSource() {
  if (!activeSources.size) return null
  const list = [...activeSources.values()]
  return list[list.length - 1] || null
}

export function getActiveSources() {
  return [...activeSources.values()]
}

export function getActiveSourceIds() {
  return [...activeSources.keys()]
}

export function hasActiveSource(allowedSourceIds = null) {
  if (Array.isArray(allowedSourceIds)) {
    if (!allowedSourceIds.length) return false
    const allow = new Set(allowedSourceIds.map(String))
    return [...activeSources.values()].some((s) => s?.handler && allow.has(s.id))
  }
  return [...activeSources.values()].some(s => s?.handler)
}

/** 合并已激活脚本声明的平台能力；可按用户允许的音源 ID 过滤 */
export function getMergedSources(allowedSourceIds = null) {
  const allow = Array.isArray(allowedSourceIds)
    ? new Set(allowedSourceIds.map(String))
    : null
  const merged = {}
  for (const entry of activeSources.values()) {
    if (allow && !allow.has(entry.id)) continue
    for (const [key, info] of Object.entries(entry.sources || {})) {
      if (!merged[key]) {
        merged[key] = {
          name: info.name || key,
          type: info.type || 'music',
          actions: [...(info.actions || [])],
          qualitys: [...(info.qualitys || [])],
        }
        continue
      }
      const cur = merged[key]
      for (const a of info.actions || []) {
        if (!cur.actions.includes(a)) cur.actions.push(a)
      }
      for (const q of info.qualitys || []) {
        if (!cur.qualitys.includes(q)) cur.qualitys.push(q)
      }
    }
  }
  return merged
}

function candidatesFor(source, action, allowedSourceIds = null, userId = null) {
  const list = [...activeSources.values()]
  // 最近激活优先
  list.reverse()
  const allow = Array.isArray(allowedSourceIds)
    ? new Set(allowedSourceIds.map(String))
    : null
  return list.filter((entry) => {
    if (!entry?.handler) return false
    if (allow && !allow.has(entry.id)) return false
    if (userId && !isSourcePlatformEnabled(userId, entry.id, source)) return false
    const info = entry.sources?.[source]
    if (!info) return false
    if (action && Array.isArray(info.actions) && info.actions.length && !info.actions.includes(action)) {
      return false
    }
    return true
  })
}

const MAX_SOURCE_CONCURRENCY = 6
let sourceActiveRequests = 0
const sourceWaitQueue = []

function acquireSourceSlot() {
  if (sourceActiveRequests < MAX_SOURCE_CONCURRENCY) {
    sourceActiveRequests++
    return Promise.resolve()
  }
  return new Promise((resolve) => { sourceWaitQueue.push(resolve) })
    .then(() => { sourceActiveRequests++ })
}

function releaseSourceSlot() {
  sourceActiveRequests = Math.max(0, sourceActiveRequests - 1)
  const next = sourceWaitQueue.shift()
  if (next) next()
}

function handlerCallbackError(err) {
  if (err == null || err === 0 || err === false) return null
  if (err instanceof Error) return err
  if (typeof err === 'number') return new Error(`音源请求失败(${err})`)
  if (typeof err === 'string' && err.trim()) return new Error(err)
  return new Error(String(err))
}

function isImmediateHandlerValue(result) {
  if (result == null) return false
  if (typeof result.then === 'function') return false
  return typeof result === 'string' || typeof result === 'object'
}

function invokeHandler(entry, payload) {
  const aborts = []
  return acquireSourceSlot()
    .then(() => runWithSourceAborts(aborts, () => new Promise((resolve, reject) => {
      let settled = false
      const finish = (err, data) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (err) {
          abortTrackedSourceRequests()
          reject(err instanceof Error ? err : new Error(String(err)))
        } else {
          resolve(data)
        }
      }
      const timer = setTimeout(() => finish(new Error('请求超时(30s)')), 30000)
      const callback = (err, data) => {
        const normalized = handlerCallbackError(err)
        if (normalized) finish(normalized)
        else finish(null, data)
      }
      try {
        const result = entry.handler(payload, callback)
        if (result && typeof result.then === 'function') {
          result.then((data) => {
            if (data === undefined || data === null) return
            finish(null, data)
          }).catch((e) => finish(e))
        } else if (isImmediateHandlerValue(result)) {
          finish(null, result)
        }
      } catch (e) {
        finish(e)
      }
    })))
    .finally(() => {
      releaseSourceSlot()
    })
}

const sourceNameCache = new Map()

export function getSourceEntryName(id) {
  if (!id) return '未知音源'
  if (sourceNameCache.has(id)) return sourceNameCache.get(id)
  try {
    const row = getDB().prepare('SELECT name FROM user_apis WHERE id = ?').get(id)
    const name = String(row?.name || id).trim() || id
    sourceNameCache.set(id, name)
    return name
  } catch {
    return id
  }
}

export function clearSourceNameCache(id) {
  if (id) sourceNameCache.delete(id)
  else sourceNameCache.clear()
}

function resolveCandidates(source, action, allowedSourceIds = null, userId = null) {
  let candidates = candidatesFor(source, action, allowedSourceIds, userId)
  if (!candidates.length) candidates = candidatesFor(source, null, allowedSourceIds, userId)
  if (!candidates.length) {
    const allow = Array.isArray(allowedSourceIds)
      ? new Set(allowedSourceIds.map(String))
      : null
    candidates = [...activeSources.values()]
      .filter((s) => {
        if (!s?.handler) return false
        if (allow && !allow.has(s.id)) return false
        if (userId && !isSourcePlatformEnabled(userId, s.id, source)) return false
        return true
      })
      .reverse()
  }
  // 该平台历史上「完整」的音源优先，「多为试听」的靠后
  return candidates
    .map((entry, idx) => ({
      entry,
      idx,
      score: platformHealthScore(entry.id, source),
    }))
    .sort((a, b) => (b.score - a.score) || (a.idx - b.idx))
    .map((x) => x.entry)
}

function platformHealthScore(sourceId, platform) {
  try {
    const h = getSourceHealth(sourceId)
    if (!h) return 0
    const p = (h.platforms || []).find((x) => String(x.id) === String(platform))
    if (p?.level === 'ok') return 100
    if (p?.level === 'preview') return -100
    if (p?.level === 'watch') return -10
    if (h.level === 'preview' && !(h.platforms || []).length) return -30
    return 0
  } catch {
    return 0
  }
}

function actionLabel(action) {
  if (action === 'musicUrl') return '取链'
  if (action === 'lyric') return '获取歌词'
  if (action === 'pic') return '获取封面'
  return '请求'
}

/**
 * @returns {Promise<{ data: any, sourceId: string, sourceName: string, switched: boolean, fromSourceId: string|null, fromSourceName: string|null }>}
 */
export async function requestSourceWithMeta(source, action, info, options = {}) {
  const allowedSourceIds = Array.isArray(options.allowedSourceIds)
    ? options.allowedSourceIds.map(String).filter(Boolean)
    : null
  const userId = options.userId || null

  if (!hasActiveSource(allowedSourceIds)) throw new Error('没有激活的音源')

  const fallbackMode = options.fallbackMode === 'ask' ? 'ask' : 'auto'
  const preferredSourceId = options.preferredSourceId || null
  const skipSourceIds = new Set((options.skipSourceIds || []).filter(Boolean))

  let candidates = resolveCandidates(source, action, allowedSourceIds, userId)
  if (preferredSourceId) {
    const preferred = candidates.find((entry) => entry.id === preferredSourceId)
    if (preferred) candidates = [preferred]
    else {
      const entry = activeSources.get(preferredSourceId)
      const allowed = !allowedSourceIds || allowedSourceIds.includes(preferredSourceId)
      const platOk = !userId || isSourcePlatformEnabled(userId, preferredSourceId, source)
      candidates = entry?.handler && allowed && platOk ? [entry] : []
    }
  }
  candidates = candidates.filter((entry) => !skipSourceIds.has(entry.id))
  if (!candidates.length) throw new Error('没有可用的音源')

  const primaryId = candidates[0].id
  const tryList = fallbackMode === 'ask' ? [candidates[0]] : candidates

  let lastErr = null
  for (const entry of tryList) {
    try {
      const data = await invokeHandler(entry, { source, action, info })
      if (action === 'musicUrl') assertMusicUrl(data)
      const switched = fallbackMode === 'auto' && entry.id !== primaryId
      return {
        data,
        sourceId: entry.id,
        sourceName: getSourceEntryName(entry.id),
        switched,
        fromSourceId: switched ? primaryId : null,
        fromSourceName: switched ? getSourceEntryName(primaryId) : null,
      }
    } catch (e) {
      lastErr = e
      console.warn(`[音源] ${entry.id} ${action}/${source} 失败: ${e?.message || e}`)
    }
  }

  if (fallbackMode === 'ask' && candidates.length > 1) {
    const reason = formatUserError(lastErr, '音源请求失败')
    const failedName = getSourceEntryName(primaryId)
    const err = new Error(`音源「${failedName}」${actionLabel(action)}失败`)
    err.code = 'SOURCE_FALLBACK_REQUIRED'
    err.failedSourceId = primaryId
    err.failedSourceName = failedName
    err.reason = reason
    err.alternatives = candidates.slice(1).map((entry) => ({
      id: entry.id,
      name: getSourceEntryName(entry.id),
    }))
    throw err
  }

  throw lastErr || new Error('音源请求失败')
}

export async function requestSource(source, action, info, options = {}) {
  const result = await requestSourceWithMeta(source, action, info, options)
  return result.data
}

function validateSources(raw) {
  const result = {}
  for (const [key, info] of Object.entries(raw)) {
    if (!SUPPORTED_SOURCES.includes(key)) continue
    result[key] = {
      name: info.name || key,
      type: info.type || 'music',
      actions: (info.actions || []).filter(a => SUPPORTED_ACTIONS.includes(a)),
      qualitys: (info.qualitys || []).filter(q => SUPPORTED_QUALITYS.includes(q)),
    }
  }
  return result
}
