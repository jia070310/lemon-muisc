const MAX_ENTRIES = 400
const STORAGE_KEY = 'lemon-runtime-log-v1'
const ARG_LIMIT = 8
const TEXT_LIMIT = 1800

const SENSITIVE_QS = /([?&](?:token|ticket|auth|authorization|password|access_token|cookie)=)[^&#]*/gi
const SENSITIVE_BEARER = /(Bearer\s+)[A-Za-z0-9._\-+=/]+/gi

let entries = []
let installed = false
let persistTimer = 0

function nowIso() {
  try {
    return new Date().toISOString()
  } catch {
    return ''
  }
}

export function sanitizeLogText(value) {
  let text = ''
  if (value == null) return ''
  if (typeof value === 'string') text = value
  else if (value instanceof Error) {
    text = value.stack || `${value.name}: ${value.message}`
  } else {
    try {
      text = JSON.stringify(value)
    } catch {
      text = String(value)
    }
  }
  return text
    .replace(SENSITIVE_QS, '$1***')
    .replace(SENSITIVE_BEARER, '$1***')
    .slice(0, TEXT_LIMIT)
}

function safeExtra(extra) {
  if (!extra || typeof extra !== 'object') return undefined
  const out = {}
  for (const [key, val] of Object.entries(extra)) {
    if (val == null || val === '') continue
    if (typeof val === 'number' || typeof val === 'boolean') {
      out[key] = val
      continue
    }
    out[key] = sanitizeLogText(val)
  }
  return Object.keys(out).length ? out : undefined
}

function persistSoon() {
  if (persistTimer) return
  persistTimer = window.setTimeout(() => {
    persistTimer = 0
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)))
    } catch {}
  }, 200)
}

function loadPersisted() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) entries = parsed.slice(-MAX_ENTRIES)
  } catch {}
}

export function logRuntime(level, source, message, extra) {
  const item = {
    t: nowIso(),
    level: String(level || 'info'),
    source: String(source || 'app').slice(0, 80),
    message: sanitizeLogText(message) || '(empty)',
  }
  const meta = safeExtra(extra)
  if (meta) item.extra = meta
  entries.push(item)
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES)
  persistSoon()
  return item
}

function formatArg(arg) {
  if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`
  if (typeof arg === 'string') return arg
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

function logFromConsole(level, args) {
  const parts = []
  for (let i = 0; i < Math.min(args.length, ARG_LIMIT); i++) {
    parts.push(formatArg(args[i]))
  }
  logRuntime(level, 'console', parts.join(' '))
}

export function snapshotAudioError(el, extra = {}) {
  if (!el) return { ...extra, audio: 'missing' }
  const code = el.error?.code
  const names = {
    1: 'MEDIA_ERR_ABORTED',
    2: 'MEDIA_ERR_NETWORK',
    3: 'MEDIA_ERR_DECODE',
    4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
  }
  return {
    ...extra,
    mediaCode: code || 0,
    mediaName: names[code] || '',
    mediaMessage: el.error?.message || '',
    networkState: el.networkState,
    readyState: el.readyState,
    paused: el.paused,
    currentTime: Number(el.currentTime || 0).toFixed(3),
    duration: Number.isFinite(el.duration) ? Number(el.duration).toFixed(3) : String(el.duration),
    src: sanitizeLogText(el.currentSrc || el.src || ''),
  }
}

export function getRuntimeLogEntries() {
  return entries.slice()
}

export function formatRuntimeLogText(sections = []) {
  const lines = [
    '=== 柠檬音乐 运行日志 ===',
    `exportedAt: ${nowIso()}`,
    `url: ${sanitizeLogText(typeof location !== 'undefined' ? location.href : '')}`,
    `ua: ${sanitizeLogText(typeof navigator !== 'undefined' ? navigator.userAgent : '')}`,
    `online: ${typeof navigator !== 'undefined' ? navigator.onLine : ''}`,
    '',
    `--- 前端记录 (${entries.length}) ---`,
  ]
  for (const item of entries) {
    const extra = item.extra ? ` ${JSON.stringify(item.extra)}` : ''
    lines.push(`[${item.t}] ${item.level.toUpperCase()} ${item.source} ${item.message}${extra}`)
  }
  for (const section of sections) {
    if (!section) continue
    lines.push('')
    lines.push(String(section.title || '---'))
    lines.push(String(section.body || '').trimEnd() || '(空)')
  }
  lines.push('')
  return lines.join('\n')
}

export function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 1500)
}

export function installRuntimeLog() {
  if (installed || typeof window === 'undefined') return
  installed = true
  loadPersisted()
  logRuntime('info', 'app', 'runtime log started')

  const origError = console.error.bind(console)
  const origWarn = console.warn.bind(console)
  console.error = (...args) => {
    try { logFromConsole('error', args) } catch {}
    origError(...args)
  }
  console.warn = (...args) => {
    try { logFromConsole('warn', args) } catch {}
    origWarn(...args)
  }

  window.addEventListener('error', (event) => {
    const err = event.error
    logRuntime('error', 'window', err?.stack || event.message || 'window.error', {
      file: event.filename,
      line: event.lineno,
      col: event.colno,
    })
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    logRuntime('error', 'promise', reason?.stack || reason?.message || String(reason || 'unhandledrejection'))
  })
}
