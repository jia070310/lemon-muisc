import fs from 'fs'
import path from 'path'
import { getAppLogDir } from './appPaths.js'

const MAX_ENTRIES = 300
const FILE_MAX_BYTES = 1.2 * 1024 * 1024
const TEXT_LIMIT = 1800
const SENSITIVE_QS = /([?&](?:token|ticket|auth|authorization|password|access_token|cookie)=)[^&#]*/gi
const SENSITIVE_BEARER = /(Bearer\s+)[A-Za-z0-9._\-+=/]+/gi

const entries = []
let installed = false
let origError = null
let origWarn = null

function sanitize(value) {
  let text = ''
  if (value == null) return ''
  if (typeof value === 'string') text = value
  else if (value instanceof Error) text = value.stack || `${value.name}: ${value.message}`
  else {
    try { text = JSON.stringify(value) } catch { text = String(value) }
  }
  return text
    .replace(SENSITIVE_QS, '$1***')
    .replace(SENSITIVE_BEARER, '$1***')
    .slice(0, TEXT_LIMIT)
}

function runtimeLogFile() {
  try {
    const dir = getAppLogDir()
    if (!dir) return ''
    fs.mkdirSync(dir, { recursive: true })
    return path.join(dir, 'runtime.log')
  } catch {
    return ''
  }
}

function rotateIfNeeded(file) {
  try {
    if (!fs.existsSync(file)) return
    const size = fs.statSync(file).size
    if (size < FILE_MAX_BYTES) return
    const keep = fs.readFileSync(file, { encoding: 'utf8' }).slice(-400000)
    fs.writeFileSync(file, keep, 'utf8')
  } catch {}
}

function persistLine(item) {
  const file = runtimeLogFile()
  if (!file) return
  try {
    rotateIfNeeded(file)
    fs.appendFileSync(file, `${JSON.stringify(item)}\n`, 'utf8')
  } catch {}
}

export function logRuntime(level, source, message, extra) {
  const item = {
    t: new Date().toISOString(),
    level: String(level || 'info'),
    source: String(source || 'server').slice(0, 80),
    message: sanitize(message) || '(empty)',
  }
  if (extra && typeof extra === 'object') {
    const meta = {}
    for (const [key, val] of Object.entries(extra)) {
      if (val == null || val === '') continue
      if (typeof val === 'number' || typeof val === 'boolean') meta[key] = val
      else meta[key] = sanitize(val)
    }
    if (Object.keys(meta).length) item.extra = meta
  }
  entries.push(item)
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
  persistLine(item)
  return item
}

export function getRuntimeLogEntries() {
  return entries.slice()
}

export function formatRuntimeLogLines() {
  return entries.map((item) => {
    const extra = item.extra ? ` ${JSON.stringify(item.extra)}` : ''
    return `[${item.t}] ${String(item.level).toUpperCase()} ${item.source} ${item.message}${extra}`
  }).join('\n')
}

function formatArgs(args) {
  return args.map((arg) => {
    if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`
    if (typeof arg === 'string') return arg
    try { return JSON.stringify(arg) } catch { return String(arg) }
  }).join(' ')
}

export function installServerRuntimeLog() {
  if (installed) return
  installed = true
  origError = console.error.bind(console)
  origWarn = console.warn.bind(console)
  console.error = (...args) => {
    try { logRuntime('error', 'console', formatArgs(args)) } catch {}
    origError(...args)
  }
  console.warn = (...args) => {
    try { logRuntime('warn', 'console', formatArgs(args)) } catch {}
    origWarn(...args)
  }
  process.on('uncaughtException', (err) => {
    logRuntime('error', 'process', err?.stack || err?.message || String(err))
  })
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason))
    logRuntime('error', 'process', err.stack || err.message)
  })
  logRuntime('info', 'server', 'runtime log started', {
    node: process.version,
    pid: process.pid,
  })
}
