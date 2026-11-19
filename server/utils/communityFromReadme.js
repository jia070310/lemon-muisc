import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import needle from 'needle'
import {
  buildGithubAccelerateUrls,
  rawToJsdelivrUrls,
} from './githubAccelerate.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

const REPO = 'jia070310/lemon-muisc'
const BRANCH = 'main'
const README_RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/README.md`
const README_API = `https://api.github.com/repos/${REPO}/contents/README.md?ref=${BRANCH}`

const DEFAULTS = {
  groupId: '1104393408',
  groupName: '飞牛柠檬🍋muisc',
  qrRel: 'public/qq-group-qr.png',
}

const DAY_MS = 24 * 60 * 60 * 1000

/** @type {null | object} */
let memory = null
let refreshPromise = null

function configDir() {
  const config = String(process.env.CONFIG_PATH || '').trim()
  return config || path.join(PROJECT_ROOT, 'config')
}

function configCachePath() {
  return path.join(configDir(), 'community-readme-cache.json')
}

function qrCachePath(mime = 'image/png') {
  const ext = mime.includes('jpeg') || mime.includes('jpg') ? '.jpg'
    : mime.includes('webp') ? '.webp'
      : mime.includes('gif') ? '.gif'
        : '.png'
  return path.join(configDir(), `community-qr${ext}`)
}

/** 清除本地二维码落盘（JSON 被删或强制刷新时避免继续侍旧图） */
function clearQrCacheFiles() {
  for (const ext of ['.png', '.jpg', '.jpeg', '.webp', '.gif']) {
    const p = path.join(configDir(), `community-qr${ext}`)
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p)
    } catch {}
  }
}

function decodeMdPath(raw) {
  const s = String(raw || '').trim().replace(/^<|>$/g, '')
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

function sniffMime(filePathOrUrl) {
  const ext = path.extname(String(filePathOrUrl).split('?')[0]).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return 'image/png'
}

function encodePathKeepSlash(p) {
  return String(p || '')
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}

/** blob / raw / 相对路径 → raw.githubusercontent.com 直链 */
export function toGithubRawUrl(imgRef) {
  const raw = decodeMdPath(imgRef)
  if (!raw) return ''
  if (/^https?:\/\/raw\.githubusercontent\.com\//i.test(raw)) {
    try {
      const u = new URL(raw)
      u.pathname = `/${encodePathKeepSlash(decodeURIComponent(u.pathname.replace(/^\//, '')))}`
      return u.toString()
    } catch {
      return raw
    }
  }
  const blob = raw.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i,
  )
  if (blob) {
    return `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}/${encodePathKeepSlash(blob[4])}`
  }
  if (/^https?:\/\/cdn\.jsdelivr\.net\/gh\//i.test(raw)) return raw
  if (/^https?:\/\//i.test(raw)) return raw
  const rel = raw.replace(/^\.?[/\\]+/, '').replace(/\\/g, '/')
  return `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${encodePathKeepSlash(rel)}`
}

function publicQrApi(groupId, fetchedAt = 0) {
  const q = new URLSearchParams()
  q.set('v', String(groupId || ''))
  if (fetchedAt) q.set('t', String(fetchedAt))
  return `/api/about/community-qr?${q.toString()}`
}

function parseReadmeText(text, { source = 'remote' } = {}) {
  let groupId = DEFAULTS.groupId
  let groupName = DEFAULTS.groupName
  let qrOrigin = ''
  let qrPath = ''

  const nameMatch = text.match(/QQ\s*互动群\s*[「『"]([^」』"]+)[」』"]/i)
  if (nameMatch?.[1]) groupName = nameMatch[1].trim()

  const idMatch = text.match(/(?:2\s*群号|群号)\s*\*{0,2}\s*(\d{6,12})\s*\*{0,2}/)
  if (idMatch?.[1]) groupId = idMatch[1]

  const qqBlock = text.match(/QQ\s*互动群[\s\S]{0,500}?!\[[^\]]*]\(([^)\s]+)\)/i)
  const imgMatch = qqBlock || text.match(/!\[[^\]]*群[^\]]*]\(([^)\s]+)\)/)
  if (imgMatch?.[1]) {
    const ref = decodeMdPath(imgMatch[1])
    if (source === 'local') {
      const abs = path.resolve(PROJECT_ROOT, ref.replace(/^\.?[/\\]+/, ''))
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        qrPath = abs
      } else {
        qrOrigin = toGithubRawUrl(ref)
      }
    } else {
      qrOrigin = toGithubRawUrl(ref)
    }
  }

  const fetchedAt = Date.now()
  return {
    groupId: String(groupId || DEFAULTS.groupId),
    groupName: String(groupName || DEFAULTS.groupName),
    /** GitHub raw 原链（仅服务端用加速拉取，不直接给浏览器） */
    qrOrigin: qrOrigin || '',
    /** 对外始终走本站接口，避免前端直连 GitHub */
    qrUrl: publicQrApi(groupId, fetchedAt),
    qrPath: qrPath || '',
    qrMime: sniffMime(qrPath || qrOrigin),
    hasQr: Boolean(qrOrigin || qrPath),
    source,
    fetchedAt,
  }
}

function readDiskCache() {
  try {
    const p = configCachePath()
    if (!fs.existsSync(p)) return null
    const data = JSON.parse(fs.readFileSync(p, 'utf8'))
    if (!data?.groupId) return null
    // 兼容旧缓存：把 https raw 挪到 qrOrigin，对外改成本站 API
    if (/^https?:\/\//i.test(String(data.qrUrl || ''))) {
      data.qrOrigin = data.qrOrigin || data.qrUrl
    }
    data.qrUrl = publicQrApi(data.groupId, data.fetchedAt || 0)
    if (!data.qrPath && data.qrOrigin) {
      const cached = qrCachePath(data.qrMime)
      if (fs.existsSync(cached)) data.qrPath = cached
    }
    data.hasQr = Boolean(data.hasQr || data.qrOrigin || data.qrPath)
    return data
  } catch {
    return null
  }
}

function writeDiskCache(data) {
  try {
    const p = configCachePath()
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8')
  } catch (e) {
    console.warn('[community] 写入缓存失败:', e?.message || e)
  }
}

function localFallback() {
  const readmePath = path.join(PROJECT_ROOT, 'README.md')
  if (fs.existsSync(readmePath)) {
    try {
      const text = fs.readFileSync(readmePath, 'utf8')
      return parseReadmeText(text, { source: 'local' })
    } catch {}
  }
  const qrAbs = [
    path.join(PROJECT_ROOT, DEFAULTS.qrRel),
    path.join(PROJECT_ROOT, 'public', 'qq-group-qr.png'),
    path.join(PROJECT_ROOT, 'dist', 'public', 'qq-group-qr.png'),
  ].find((p) => {
    try { return fs.existsSync(p) && fs.statSync(p).isFile() } catch { return false }
  }) || ''
  const fetchedAt = Date.now()
  return {
    groupId: DEFAULTS.groupId,
    groupName: DEFAULTS.groupName,
    qrOrigin: '',
    qrUrl: qrAbs ? publicQrApi(DEFAULTS.groupId, fetchedAt) : '/qq-group-qr.png',
    qrPath: qrAbs,
    qrMime: 'image/png',
    hasQr: Boolean(qrAbs),
    source: 'default',
    fetchedAt,
  }
}

function isFresh(entry) {
  const t = Number(entry?.fetchedAt) || 0
  return t > 0 && Date.now() - t < DAY_MS
}

function bodyToText(resp) {
  let text = Buffer.isBuffer(resp.body)
    ? resp.body.toString('utf8')
    : String(resp.body || '')
  const ct = String(resp.headers?.['content-type'] || '')
  if (ct.includes('json') || text.trimStart().startsWith('{')) {
    try {
      const j = JSON.parse(text)
      if (j?.content && (j.encoding === 'base64' || !String(j.content).includes('QQ'))) {
        text = Buffer.from(String(j.content).replace(/\s/g, ''), 'base64').toString('utf8')
      }
    } catch {
      /* 非 JSON */
    }
  }
  return text
}

/** 构建 README 拉取列表：加速代理优先，再 jsDelivr / API / 直连 */
function buildReadmeFetchUrls() {
  const rawAcc = buildGithubAccelerateUrls(README_RAW, {
    jsdelivr: rawToJsdelivrUrls(README_RAW),
  })
  // raw 加速优先（国内稳）；API/直连垫后（易超时或被墙）
  return [...new Set([
    ...rawAcc.filter((u) => u !== README_RAW),
    README_API,
    README_RAW,
  ])]
}

/** 明显损坏的相对路径（如 docs/screenshots 重复拼接）时丢弃该源 */
function isSaneQrOrigin(origin) {
  const u = String(origin || '')
  if (!u) return true
  if (/docs\/screenshots\/docs\/screenshots\//i.test(u)) return false
  return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u)
}

function describeFetchSource(url) {
  if (/jsdelivr\.net/i.test(url)) return 'jsDelivr'
  if (/api\.github\.com/i.test(url)) return 'GitHub API'
  if (/ghproxy|ghfast|gh\.|mirror\.|cdn\.gh-proxy|git\.669966/i.test(url)) return '加速节点'
  return '直连'
}

async function needleGet(url, extraHeaders = {}, timeoutMs = 7000) {
  return needle('get', url, {
    headers: {
      'User-Agent': 'lemon-music-nas',
      'Cache-Control': 'no-cache',
      ...extraHeaders,
    },
    open_timeout: timeoutMs,
    response_timeout: timeoutMs,
    read_timeout: timeoutMs,
    timeout: timeoutMs,
    follow_max: 4,
    parse_response: false,
  })
}

/**
 * 分批并行竞速拉取（加速节点），返回首个通过 ok 的结果
 * @param {string[]} urls
 * @param {(url: string, resp: any) => boolean} ok
 * @param {{ concurrency?: number, timeoutMs?: number }} [opts]
 */
export async function fetchViaGithubAccelerate(urls, ok, opts = {}) {
  const concurrency = Math.max(1, Number(opts.concurrency) || 4)
  const timeoutMs = Math.max(2000, Number(opts.timeoutMs) || 7000)
  const list = [...new Set((urls || []).filter(Boolean))]
  let lastErr = null

  for (let i = 0; i < list.length; i += concurrency) {
    const batch = list.slice(i, i + concurrency)
    const result = await new Promise((resolve) => {
      let pending = batch.length
      let settled = false
      const doneOne = () => {
        pending -= 1
        if (!settled && pending <= 0) resolve(null)
      }
      for (const url of batch) {
        const isApi = /api\.github\.com/i.test(url)
        needleGet(url, isApi
          ? {
              Accept: 'application/vnd.github.raw+json, application/vnd.github+json, text/plain',
              'X-GitHub-Api-Version': '2022-11-28',
            }
          : { Accept: '*/*' }, timeoutMs)
          .then((resp) => {
            if (settled) return
            if (resp.statusCode >= 200 && resp.statusCode < 300 && resp.body && ok(url, resp)) {
              settled = true
              resolve({ url, resp })
              return
            }
            lastErr = new Error(`HTTP ${resp.statusCode} ${url}`)
            doneOne()
          })
          .catch((e) => {
            lastErr = e
            doneOne()
          })
      }
    })
    if (result) return result
  }
  throw lastErr || new Error('GitHub 加速拉取失败')
}

async function fetchRemoteReadme() {
  const urls = buildReadmeFetchUrls()
  // 先丢掉二维码路径明显脏的镜像响应，再接受
  const { url, resp } = await fetchViaGithubAccelerate(
    urls,
    (_u, r) => {
      const text = bodyToText(r)
      if (!(text.includes('QQ') || text.includes('群号'))) return false
      const parsed = parseReadmeText(text, { source: 'github' })
      return isSaneQrOrigin(parsed.qrOrigin)
    },
    { concurrency: 4, timeoutMs: 7000 },
  )
  const parsed = parseReadmeText(bodyToText(resp), { source: 'github' })
  console.log(`[community] README 来源 ${describeFetchSource(url)}`)
  return parsed
}

/** 经加速节点把二维码落到本地 config，供关于页同域加载 */
async function cacheQrImage(info, { replace = true } = {}) {
  const origin = String(info?.qrOrigin || '').trim()
  if (!origin || !/^https?:\/\//i.test(origin)) return info

  // 已有同 origin 的落盘且非强制替换时复用
  if (!replace && info.qrPath && fs.existsSync(info.qrPath) && info.qrCachedOrigin === origin) {
    return info
  }

  const candidates = buildGithubAccelerateUrls(origin, {
    jsdelivr: rawToJsdelivrUrls(origin),
  })
  try {
    const { url, resp } = await fetchViaGithubAccelerate(
      candidates,
      (_u, r) => {
        const buf = Buffer.isBuffer(r.body) ? r.body : Buffer.from(r.body || '')
        return buf.length > 512
      },
      { concurrency: 4, timeoutMs: 8000 },
    )
    const buf = Buffer.isBuffer(resp.body) ? resp.body : Buffer.from(resp.body)
    const ct = String(resp.headers?.['content-type'] || '')
    const mime = ct.startsWith('image/') ? ct.split(';')[0].trim() : sniffMime(origin)
    clearQrCacheFiles()
    const dest = qrCachePath(mime)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, buf)
    info.qrPath = dest
    info.qrMime = mime
    info.qrCachedOrigin = origin
    info.hasQr = true
    info.qrUrl = publicQrApi(info.groupId, info.fetchedAt)
    console.log(`[community] 二维码已经加速缓存 (${url.split('/')[2]})`)
  } catch (e) {
    console.warn('[community] 二维码加速拉取失败，将回落代理接口:', e?.message || e)
  }
  return info
}

/** 每天最多拉一次远程 README；失败时保留旧缓存或本地回落 */
export async function refreshCommunityFromGithub({ force = false } = {}) {
  if (!force && memory && isFresh(memory)) return memory
  const disk = readDiskCache()
  if (!force && disk && isFresh(disk)) {
    memory = disk
    return disk
  }
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      let next = await fetchRemoteReadme()
      // README 刷新时始终重拉二维码，避免删 JSON 后仍侍旧 png
      next = await cacheQrImage(next, { replace: true })
      memory = next
      writeDiskCache(next)
      console.log(`[community] 已从 GitHub README 更新 QQ 群 ${next.groupId}`)
      return next
    } catch (e) {
      console.warn('[community] 拉取 GitHub README 失败:', e?.message || e)
      if (disk?.groupId) {
        memory = disk
        return disk
      }
      const fb = localFallback()
      memory = fb
      return fb
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

/**
 * 同步拿到当前社区信息（内存 / 磁盘 / 默认），并在过期时后台刷新。
 * 关于页首次打开若无缓存会短暂等待远程结果。
 * 磁盘 JSON 被删时视为用户主动清缓存：清空内存并强制重拉。
 */
export async function ensureCommunityInfo() {
  const disk = readDiskCache()
  if (!disk) {
    memory = null
    return refreshCommunityFromGithub({ force: true })
  }
  if (memory && isFresh(memory) && Number(memory.fetchedAt) === Number(disk.fetchedAt)) {
    return memory
  }
  if (disk && isFresh(disk)) {
    memory = disk
    return disk
  }
  memory = disk
  if (!memory?.groupId) {
    return refreshCommunityFromGithub({ force: true })
  }
  refreshCommunityFromGithub({ force: true }).catch(() => {})
  return memory
}

/** @deprecated 兼容旧调用：同步读缓存，并触发按天刷新 */
export function parseCommunityFromReadme() {
  const disk = readDiskCache()
  if (!disk) {
    // JSON 被删：不要继续用内存旧值，后台强制重拉
    memory = memory && isFresh(memory) ? null : memory
    refreshCommunityFromGithub({ force: true }).catch(() => {})
    return memory || localFallback()
  }
  if (!memory) memory = disk
  else if (Number(memory.fetchedAt) !== Number(disk.fetchedAt)) memory = disk
  if (!isFresh(memory)) {
    refreshCommunityFromGithub({ force: true }).catch(() => {})
  }
  return memory
}

export function getCommunityPublicInfo() {
  const c = parseCommunityFromReadme()
  const qrUrl = publicQrApi(c.groupId, c.fetchedAt)
    || (c.qrPath ? publicQrApi(c.groupId) : '/qq-group-qr.png')
  return {
    groupId: c.groupId,
    groupName: c.groupName,
    hasQr: Boolean(c.hasQr || c.qrOrigin || c.qrPath),
    qrUrl: c.hasQr || c.qrPath || c.qrOrigin ? qrUrl : '/qq-group-qr.png',
    source: c.source || 'default',
    fetchedAt: c.fetchedAt || 0,
  }
}

/** 供 /community-qr：本地落盘且与当前 qrOrigin 一致时复用，否则经加速重拉 */
export async function loadCommunityQrBuffer() {
  const c = await ensureCommunityInfo()
  const origin = String(c?.qrOrigin || '').trim()
  const pathOk = Boolean(c?.qrPath && fs.existsSync(c.qrPath))
  const originOk = !origin || c?.qrCachedOrigin === origin || (!c?.qrCachedOrigin && pathOk)
  if (pathOk && originOk) {
    return {
      mime: c.qrMime || sniffMime(c.qrPath),
      buffer: fs.readFileSync(c.qrPath),
      from: 'cache',
      fetchedAt: c.fetchedAt || 0,
    }
  }
  if (!origin) {
    if (pathOk) {
      return {
        mime: c.qrMime || sniffMime(c.qrPath),
        buffer: fs.readFileSync(c.qrPath),
        from: 'cache',
        fetchedAt: c.fetchedAt || 0,
      }
    }
    return null
  }
  const refreshed = await cacheQrImage({ ...c, qrOrigin: origin }, { replace: true })
  memory = refreshed
  writeDiskCache(refreshed)
  if (refreshed.qrPath && fs.existsSync(refreshed.qrPath)) {
    return {
      mime: refreshed.qrMime || sniffMime(refreshed.qrPath),
      buffer: fs.readFileSync(refreshed.qrPath),
      from: 'remote',
      fetchedAt: refreshed.fetchedAt || 0,
    }
  }
  return null
}
