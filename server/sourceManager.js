import vm from 'vm'
import needle from 'needle'

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

    const lxApi = {
      version: '2.0.0',
      env: 'desktop',
      EVENT_NAMES: { request: 'request', inited: 'inited', updateAlert: 'updateAlert' },
      currentScriptInfo: { name: '', version: '' },
      send(event, data) {
        if (event === 'inited') {
          clearTimeout(timeout)
          if (data?.sources) {
            sources = validateSources(data.sources)
          }
          activeSource = { id, handler: requestHandler, sources, pendingRequests }
          resolve(sources)
        }
      },
      on(event, handler) {
        if (event === 'request') {
          requestHandler = handler
          if (activeSource) activeSource.handler = handler
        }
      },
      request(url, options, callback) {
        const method = options?.method?.toLowerCase() || 'get'
        const opts = { follow_max: 5, parse_response: false }
        if (options?.headers) opts.headers = options.headers
        if (options?.timeout) opts.timeout = options.timeout
        const body = options?.body || null
        needle(method, url, body, opts)
          .then(resp => {
            let parsedBody = resp.body
            try { parsedBody = JSON.parse(resp.body.toString()) } catch {}
            callback(null, { ...resp, body: parsedBody }, parsedBody)
          })
          .catch(err => callback(err))
      },
      utils: {
        buffer: { from: Buffer.from, concat: Buffer.concat },
        crypto: {},
      },
    }

    const context = vm.createContext({
      console: { log: () => {}, warn: () => {}, error: () => {}, group: () => {}, groupEnd: () => {} },
      setTimeout, clearTimeout, setInterval, clearInterval,
      URL, URLSearchParams,
      Buffer,
      JSON,
      Promise,
      Object,
      Array,
      String,
      Number,
      isNaN,
      parseInt,
      parseFloat,
      encodeURIComponent,
      decodeURIComponent,
      globalThis: { lx: lxApi },
      lx: lxApi,
    })

    try {
      vm.runInContext(script, context, { timeout: 15000 })
    } catch (e) {
      clearTimeout(timeout)
      reject(new Error(`音源脚本执行失败: ${e.message}`))
    }
  })
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
