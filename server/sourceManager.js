import vm from 'vm'
import needle from 'needle'
import { parseScriptMeta } from './utils/parseScriptMeta.js'
import { createLxUtils, createSandboxRequire } from './utils/lxSourceRuntime.js'

/** @type {Map<string, { id: string, handler: Function|null, sources: object, pendingRequests: Map }>} */
const activeSources = new Map()

const SUPPORTED_SOURCES = ['kw', 'kg', 'tx', 'wy', 'mg']
const SUPPORTED_ACTIONS = ['musicUrl', 'lyric', 'pic']
const SUPPORTED_QUALITYS = ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master']

/** 加载音源脚本并加入激活列表（不卸载其他已激活音源） */
export async function loadSource(id, script) {
  // 同 id 先卸再装，避免重复沙箱
  unloadSource(id)

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('音源初始化超时(20s)')), 20000)
    const pendingRequests = new Map()
    let sources = {}
    let requestHandler = null
    let settled = false
    let entry = null

    const meta = parseScriptMeta(script)
    const finish = (err, result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (err) {
        if (entry) {
          activeSources.delete(id)
          entry = null
        }
        reject(err)
      } else {
        resolve(result)
      }
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
          entry = { id, handler: requestHandler, sources, pendingRequests }
          activeSources.set(id, entry)
          finish(null, sources)
        } else if (event === 'updateAlert') {
          // 兼容脚本更新提示，服务端忽略弹窗即可
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

    const sandbox = {
      lx: lxApi,
      console: {
        log: () => {},
        warn: () => {},
        error: () => {},
        info: () => {},
        debug: () => {},
        group: () => {},
        groupEnd: () => {},
      },
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
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
      module: { exports: {} },
      exports: {},
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

    try {
      vm.runInContext(script, sandbox, {
        timeout: 15000,
        displayErrors: true,
      })
    } catch (e) {
      finish(new Error(`音源脚本执行失败: ${e.message}`))
    }
  })
}

function lxRequest(url, options = {}, callback) {
  const method = (options.method || 'get').toLowerCase()
  const opts = {
    follow_max: 5,
    parse_response: false,
    headers: {
      connection: 'close',
      ...(options.headers || {}),
    },
  }
  if (options.timeout) {
    opts.response_timeout = Math.min(Number(options.timeout) || 60000, 60000)
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

  return () => {
    try {
      if (!req?.request?.aborted) req?.request?.abort()
    } catch {}
  }
}

/** 卸载指定音源；不传 id 则卸载全部 */
export function unloadSource(id) {
  if (id) {
    const entry = activeSources.get(id)
    if (entry) {
      entry.pendingRequests.clear()
      activeSources.delete(id)
    }
    return
  }
  for (const entry of activeSources.values()) {
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

export function hasActiveSource() {
  return [...activeSources.values()].some(s => s?.handler)
}

/** 合并所有已激活脚本声明的平台能力（音质取并集） */
export function getMergedSources() {
  const merged = {}
  for (const entry of activeSources.values()) {
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

function candidatesFor(source, action) {
  const list = [...activeSources.values()]
  // 最近激活优先
  list.reverse()
  return list.filter((entry) => {
    if (!entry?.handler) return false
    const info = entry.sources?.[source]
    if (!info) return false
    if (action && Array.isArray(info.actions) && info.actions.length && !info.actions.includes(action)) {
      return false
    }
    return true
  })
}

function invokeHandler(entry, payload) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('请求超时(30s)')), 30000)
    try {
      const result = entry.handler(payload)
      if (result && typeof result.then === 'function') {
        result.then((data) => { clearTimeout(timeout); resolve(data) })
          .catch((err) => { clearTimeout(timeout); reject(err) })
      } else {
        clearTimeout(timeout)
        resolve(result)
      }
    } catch (e) {
      clearTimeout(timeout)
      reject(e)
    }
  })
}

export async function requestSource(source, action, info) {
  if (!hasActiveSource()) throw new Error('没有激活的音源')

  let candidates = candidatesFor(source, action)
  // 若脚本未声明 actions，仍允许尝试声明了该平台的脚本
  if (!candidates.length) {
    candidates = candidatesFor(source, null)
  }
  // 仍无匹配：回退到所有已激活脚本（兼容未声明 sources 的旧脚本）
  if (!candidates.length) {
    candidates = [...activeSources.values()].filter(s => s?.handler).reverse()
  }
  if (!candidates.length) throw new Error('没有激活的音源')

  let lastErr = null
  for (const entry of candidates) {
    try {
      return await invokeHandler(entry, { source, action, info })
    } catch (e) {
      lastErr = e
      console.warn(`[音源] ${entry.id} ${action}/${source} 失败: ${e?.message || e}`)
    }
  }
  throw lastErr || new Error('音源请求失败')
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
