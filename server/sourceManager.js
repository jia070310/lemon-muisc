import vm from 'vm'
import needle from 'needle'
import { parseScriptMeta } from './utils/parseScriptMeta.js'
import { createLxUtils, createSandboxRequire } from './utils/lxSourceRuntime.js'

let activeSource = null

const SUPPORTED_SOURCES = ['kw', 'kg', 'tx', 'wy', 'mg']
const SUPPORTED_ACTIONS = ['musicUrl', 'lyric', 'pic']
const SUPPORTED_QUALITYS = ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master']

export async function loadSource(id, script) {
  unloadSource()

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('音源初始化超时(20s)')), 20000)
    const pendingRequests = new Map()
    let sources = {}
    let requestHandler = null
    let settled = false

    const meta = parseScriptMeta(script)
    const finish = (err, result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (err) reject(err)
      else resolve(result)
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
          activeSource = { id, handler: requestHandler, sources, pendingRequests }
          finish(null, sources)
        } else if (event === 'updateAlert') {
          // 兼容脚本更新提示，服务端忽略弹窗即可
        }
      },
      on(event, handler) {
        if (event === 'request') {
          requestHandler = handler
          if (activeSource) activeSource.handler = handler
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

    // 关键上下文后，sandbox 自身即脚本内的 globalThis / global / window
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

export function unloadSource() {
  if (activeSource) {
    activeSource.pendingRequests.clear()
    activeSource = null
  }
}

export function getActiveSource() {
  return activeSource
}

export async function requestSource(source, action, info) {
  if (!activeSource?.handler) throw new Error('没有激活的音源')

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('请求超时(30s)')), 30000)
    try {
      const result = activeSource.handler({ source, action, info })
      if (result && typeof result.then === 'function') {
        result.then(data => { clearTimeout(timeout); resolve(data) })
          .catch(err => { clearTimeout(timeout); reject(err) })
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
