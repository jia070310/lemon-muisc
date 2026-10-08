import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import needle from 'needle'
import { pipeline } from 'stream/promises'
import { Transform } from 'stream'
import { compareVersion } from '../utils/version.js'
import { getAppLogInfo, readLogTail } from '../utils/appPaths.js'
import { getDownloadSavePath, getSharedDownloadSavePath } from '../utils/filePaths.js'
import { requireAdmin } from '../middleware/auth.js'
import { broadcast } from '../ws.js'
import os from 'os'
import { formatRuntimeLogLines } from '../utils/runtimeLog.js'

export const aboutRouter = Router()

const REPO = 'jia070310/lemon-muisc'
const REPO_URL = `https://github.com/${REPO}`
/**
 * GitHub Release 加速节点（来自公共加速站聚合的贡献/测绘节点）。
 * 每次加速下载前对节点做 Range 短测速，按实测吞吐排序后再拉取。
 */
const GITHUB_ASSET_MIRROR_HOSTS = [
  // 贡献节点
  'gh.dpik.top',
  'github.tbap.top',
  'ghfile.geekertao.top',
  'ghproxy.net',
  'cdn.gh-proxy.com',
  'github.dpik.top',
  'j.1lin.dpdns.org',
  'github.starrlzy.cn',
  'github-proxy.memory-echoes.cn',
  'git.yylx.win',
  'ghm.078465.xyz',
  'gh.927223.xyz',
  'ghf.无名氏.top',
  'gh.felicity.ac.cn',
  'gh.bugdey.us.kg',
  'cdn.akaere.online',
  'jiashu.1win.eu.org',
  'tvv.tw',
  'j.1win.ggff.net',
  'gitproxy.127731.xyz',
  'gh.inkchills.cn',
  'gh.catmak.name',
  'gh.b52m.cn',
  'down.mxw.xx.kg',
  'down.mxw.qzz.io',
  'github.mxw.qzz.io',
  'gh.acmsz.top',
  'gh.jjj.gv.uy',
  'githubdog.com',
  'gh.meali.top',
  'js.jiangss.shop',
  'gap.andyjin.website',
  'github.ikgy.top',
  'gh.07150721.xyz',
  'gh.ruan.dpdns.org',
  'ghproxy.felicity.land',
  'github.nswrz.cn',
  'github-cf.947563.xyz',
  'github.gohj99.site',
  'githubproxy.gohj99.site',
  'ghproxy.icu',
  // 测绘/常用
  'ghfast.top',
  'gh.llkk.cc',
  'mirror.ghproxy.com',
  'gh.ddlc.top',
  'gh.sixyin.com',
  'gh.monlor.com',
  'git.669966.xyz',
  'ghpr.cc',
  'gh.tryxd.cn',
  'github.geekery.cn',
  'gh.idayer.com',
  'ghp.keleyaa.com',
]
/** @deprecated 仅用于前端展示示例加速链 */
const GITHUB_ASSET_MIRROR_PREFIXES = GITHUB_ASSET_MIRROR_HOSTS.map((h) => `https://${h}/`)
const FPK_UPDATE_SUBDIR = '柠檬音乐更新'
const MIRROR_PROBE_BYTES = 256 * 1024
const MIRROR_PROBE_TIMEOUT_MS = 4500
const MIRROR_PROBE_CONCURRENCY = 12
const MIRROR_PROBE_CACHE_TTL_MS = 45 * 60 * 1000
/** @type {{ at: number, rankedHosts: string[] } | null} */
let mirrorProbeCache = null

function mirrorUrlForHost(host, githubUrl) {
  return `https://${host}/${githubUrl}`
}

function probeMirrorHost(host, githubUrl) {
  const url = mirrorUrlForHost(host, githubUrl)
  const end = MIRROR_PROBE_BYTES - 1
  const started = Date.now()
  return new Promise((resolve) => {
    let settled = false
    let received = 0
    const finish = (bps) => {
      if (settled) return
      settled = true
      try { stream.destroy() } catch {}
      resolve({ host, bps: bps || 0, received })
    }
    const timer = setTimeout(() => finish(0), MIRROR_PROBE_TIMEOUT_MS)
    const stream = needle.get(url, {
      follow_max: 3,
      open_timeout: MIRROR_PROBE_TIMEOUT_MS,
      response_timeout: MIRROR_PROBE_TIMEOUT_MS,
      read_timeout: MIRROR_PROBE_TIMEOUT_MS,
      headers: {
        'User-Agent': 'lemon-music-nas',
        Range: `bytes=0-${end}`,
      },
    })
    stream.on('header', (code) => {
      if (code && code >= 400) {
        clearTimeout(timer)
        finish(0)
      }
    })
    const onFail = () => {
      clearTimeout(timer)
      finish(0)
    }
    stream.on('err', onFail)
    stream.on('error', onFail)
    stream.on('data', (chunk) => {
      received += chunk.length
      if (received >= Math.min(64 * 1024, MIRROR_PROBE_BYTES)) {
        const ms = Math.max(1, Date.now() - started)
        const bps = (received * 1000) / ms
        clearTimeout(timer)
        finish(bps)
      }
    })
    stream.on('end', () => {
      if (received > 0) {
        const ms = Math.max(1, Date.now() - started)
        clearTimeout(timer)
        finish((received * 1000) / ms)
      } else {
        clearTimeout(timer)
        finish(0)
      }
    })
  })
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length)
  let next = 0
  async function run() {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i], i)
    }
  }
  const n = Math.min(concurrency, items.length)
  await Promise.all(Array.from({ length: n }, () => run()))
  return results
}

/** 对节点做短测速，返回按吞吐降序的 host 列表（缓存一段时间内复用） */
async function rankMirrorHosts(githubUrl, onProgress) {
  const origin = String(githubUrl || '').trim()
  if (!origin) return []
  if (mirrorProbeCache && Date.now() - mirrorProbeCache.at < MIRROR_PROBE_CACHE_TTL_MS) {
    return mirrorProbeCache.rankedHosts
  }
  onProgress?.('节点测速中…')
  const hosts = [...new Set(GITHUB_ASSET_MIRROR_HOSTS.filter(Boolean))]
  const probed = await mapPool(hosts, MIRROR_PROBE_CONCURRENCY, (host) => probeMirrorHost(host, origin))
  const rankedHosts = probed
    .filter((p) => p && p.bps > 0 && p.received >= 16 * 1024)
    .sort((a, b) => b.bps - a.bps)
    .map((p) => p.host)
  // 测速成功的按速度优先；其余节点垫后兜底，避免短测误判
  const fallback = hosts.filter((h) => !rankedHosts.includes(h))
  const finalHosts = [...rankedHosts, ...fallback]
  mirrorProbeCache = { at: Date.now(), rankedHosts: finalHosts }
  if (rankedHosts[0]) {
    const best = probed.find((p) => p.host === rankedHosts[0])
    const mbps = best ? ((best.bps * 8) / 1e6).toFixed(1) : '?'
    onProgress?.(`最快 ${rankedHosts[0]}（约 ${mbps} Mbps）`)
  }
  return finalHosts
}

async function buildFpkDownloadUrls(githubUrl, wantMirror, onProgress) {
  const origin = String(githubUrl || '').trim()
  if (!origin) return []
  if (!wantMirror) return [origin]
  const hosts = await rankMirrorHosts(origin, onProgress)
  return [...hosts.map((h) => mirrorUrlForHost(h, origin)), origin]
}
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 进行中的 FPK 下载（按架构互斥）；完成后保留一段时间便于轮询 */
const fpkDownloadJobs = new Map()
const FPK_JOB_TTL_MS = 5 * 60 * 1000

function publicFpkJob(job) {
  if (!job) return null
  return {
    jobKey: job.jobKey,
    fileName: job.fileName,
    arch: job.arch,
    label: job.label,
    name: job.name,
    mirror: job.mirror,
    mirrorHost: job.mirrorHost || '',
    status: job.status,
    progress: job.progress,
    downloaded: job.downloaded,
    total: job.total,
    sizeLabel: job.sizeLabel || '',
    downloadedLabel: formatAssetSize(job.downloaded),
    totalLabel: job.total ? formatAssetSize(job.total) : '',
    path: job.path || '',
    dir: job.dir || '',
    error: job.error || '',
    startedAt: job.startedAt,
    finishedAt: job.finishedAt || null,
  }
}

function emitFpkJob(userId, type, job) {
  const payload = publicFpkJob(job)
  if (!payload) return
  broadcast(type, payload, userId || null)
}

function scheduleFpkJobCleanup(jobKey) {
  setTimeout(() => {
    const job = fpkDownloadJobs.get(jobKey)
    if (job && job.status !== 'downloading') fpkDownloadJobs.delete(jobKey)
  }, FPK_JOB_TTL_MS)
}

/** 单次拉取到 .partial；失败抛错，由上层换源重试 */
async function downloadFpkToPartial(url, job, part, userId) {
  try { if (fs.existsSync(part)) fs.unlinkSync(part) } catch {}
  job.downloaded = 0
  job.progress = 0
  job.total = Number(job.expectedSize) || job.total || 0
  emitFpkJob(userId, 'about:fpk-progress', job)

  const stream = needle.get(url, {
    follow_max: 5,
    open_timeout: 20000,
    response_timeout: 90000,
    read_timeout: 600000,
    headers: { 'User-Agent': 'lemon-music-nas' },
  })

  await new Promise((resolve, reject) => {
    let settled = false
    let lastEmit = 0
    const fail = (err) => {
      if (settled) return
      settled = true
      reject(err instanceof Error ? err : new Error(String(err || '下载失败')))
    }
    stream.on('header', (code, headers) => {
      if (code && code >= 400) {
        fail(new Error(`下载失败 HTTP ${code}`))
        return
      }
      const len = Number(headers?.['content-length']) || 0
      if (len > 0) {
        job.total = len
        emitFpkJob(userId, 'about:fpk-progress', job)
      }
    })
    stream.on('err', fail)
    stream.on('error', fail)

    const counter = new Transform({
      transform(chunk, _enc, cb) {
        job.downloaded += chunk.length
        if (job.total > 0) {
          job.progress = Math.min(0.99, job.downloaded / job.total)
        } else if (job.expectedSize > 0) {
          job.total = job.expectedSize
          job.progress = Math.min(0.99, job.downloaded / job.expectedSize)
        } else {
          job.progress = 0
        }
        const now = Date.now()
        if (now - lastEmit >= 200 || job.progress >= 0.99) {
          lastEmit = now
          emitFpkJob(userId, 'about:fpk-progress', job)
        }
        cb(null, chunk)
      },
    })

    const writer = fs.createWriteStream(part)
    writer.on('error', fail)
    pipeline(stream, counter, writer).then(() => {
      if (!settled) {
        settled = true
        resolve()
      }
    }).catch(fail)
  })

  const st = fs.statSync(part)
  if (!st.size || st.size < 1024) {
    try { fs.unlinkSync(part) } catch {}
    throw new Error('下载文件过小，可能失败')
  }
  if (job.expectedSize > 0 && st.size < job.expectedSize * 0.5) {
    try { fs.unlinkSync(part) } catch {}
    throw new Error(`下载不完整（${formatAssetSize(st.size)} / ${formatAssetSize(job.expectedSize)}）`)
  }
  return st
}

async function runFpkDownloadJob(job, urls, dest, part, userId) {
  const candidates = (Array.isArray(urls) ? urls : [urls]).filter(Boolean)
  let lastErr = null
  try {
    for (let i = 0; i < candidates.length; i++) {
      const url = candidates[i]
      let host = ''
      try { host = new URL(url).host } catch { host = '' }
      job.mirrorHost = host
      job.error = ''
      try {
        const st = await downloadFpkToPartial(url, job, part, userId)
        let finalDest = dest
        let finalName = job.fileName
        if (fs.existsSync(finalDest)) {
          const allocated = allocateUniqueFpkPath(path.dirname(dest), job.name || job.fileName)
          finalDest = allocated.dest
          finalName = allocated.fileName
        }
        fs.renameSync(part, finalDest)

        job.status = 'done'
        job.progress = 1
        job.downloaded = st.size
        job.total = st.size
        job.sizeLabel = formatAssetSize(st.size)
        job.fileName = finalName
        job.path = finalDest
        job.finishedAt = Date.now()
        emitFpkJob(userId, 'about:fpk-done', job)
        return
      } catch (e) {
        lastErr = e
        try { if (fs.existsSync(part)) fs.unlinkSync(part) } catch {}
        // 换下一个镜像继续
      }
    }
    throw lastErr || new Error('所有下载源均失败')
  } catch (e) {
    try { if (fs.existsSync(part)) fs.unlinkSync(part) } catch {}
    job.status = 'error'
    job.error = e?.message
      ? `${e.message}（已尝试 ${candidates.length} 个源）`
      : 'FPK 下载失败'
    job.finishedAt = Date.now()
    emitFpkJob(userId, 'about:fpk-error', job)
  } finally {
    scheduleFpkJobCleanup(job.jobKey)
  }
}

function getCurrentVersion() {
  try {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    return pkg.version || '1.0.0'
  } catch {
    return '1.0.0'
  }
}

async function fetchGithubJson(url) {
  const resp = await needle('get', url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'lemon-music-nas',
    },
    timeout: 12000,
    parse_response: true,
  })
  if (resp.statusCode !== 200) return null
  return resp.body
}

/** 发布说明：去掉过重的安装重复段，控制体积 */
function normalizeReleaseNotes(body) {
  let text = String(body || '').replace(/\r/g, '').trim()
  if (!text) return ''
  text = text.replace(/<!--[\s\S]*?-->/g, '').trim()
  if (text.length > 6000) text = `${text.slice(0, 6000)}\n…`
  return text
}

function detectFpkArch(name = '') {
  const n = String(name).toLowerCase()
  if (/arm64|aarch64|(^|[^a-z])arm([^a-z]|$)/i.test(n)) return 'arm'
  if (/x86_64|amd64|x64|(^|[^a-z])x86([^a-z]|$)/i.test(n)) return 'x86'
  return 'other'
}

function formatAssetSize(bytes) {
  const n = Number(bytes) || 0
  if (n <= 0) return ''
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** 从 GitHub Release assets 提取 FPK 直链 */
function pickFpkAssets(assets = []) {
  const list = []
  for (const asset of Array.isArray(assets) ? assets : []) {
    const name = String(asset?.name || '')
    const url = String(asset?.browser_download_url || '').trim()
    if (!/\.fpk$/i.test(name) || !url) continue
    const arch = detectFpkArch(name)
    list.push({
      name,
      arch,
      label: arch === 'arm' ? 'ARM' : arch === 'x86' ? 'x86' : name,
      url,
      mirrorUrl: `${GITHUB_ASSET_MIRROR_PREFIXES[0]}${url}`,
      size: Number(asset.size) || 0,
      sizeLabel: formatAssetSize(asset.size),
    })
  }
  const rank = { x86: 0, arm: 1, other: 2 }
  return list.sort((a, b) => (rank[a.arch] ?? 9) - (rank[b.arch] ?? 9) || a.name.localeCompare(b.name))
}

function buildInstallHints(version, fpkAssets = []) {
  const ver = String(version || '').replace(/^v/i, '')
  if (!ver) return null
  return {
    fpkHint: '点「加速保存」将先对各加速节点短测速，再按最快源把 FPK 拉到 NAS「下载目录/柠檬音乐更新」（失败自动换源，最后回落 GitHub 直连）。完成后到飞牛「应用中心」→「手动安装」选择该文件覆盖安装。',
    fpkAssets,
  }
}

/** FPK 保存目录：下载目录下的「柠檬音乐更新」 */
export function getFpkUpdateDir(userId = null) {
  let base = ''
  try {
    base = getDownloadSavePath(userId) || getSharedDownloadSavePath() || ''
  } catch {
    base = getSharedDownloadSavePath() || ''
  }
  if (!base) {
    throw new Error('尚未配置下载目录，请先在「设置 → 路径」中设置')
  }
  const dir = path.join(base, FPK_UPDATE_SUBDIR)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function safeFpkFileName(name) {
  const base = path.basename(String(name || '').trim())
  if (!base || !/\.fpk$/i.test(base) || /[<>:"/\\|?*\x00-\x1f]/.test(base)) {
    throw new Error('无效的安装包文件名')
  }
  return base
}

/** 同名不覆盖：xxx.fpk → xxx-1.fpk → xxx-2.fpk … */
function allocateUniqueFpkPath(dir, baseName) {
  const safe = safeFpkFileName(baseName)
  const ext = path.extname(safe) || '.fpk'
  const stem = safe.slice(0, -ext.length) || 'lemon-music'
  let n = 0
  while (n < 1000) {
    const fileName = n === 0 ? `${stem}${ext}` : `${stem}-${n}${ext}`
    const dest = path.join(dir, fileName)
    const part = `${dest}.partial`
    if (!fs.existsSync(dest) && !fs.existsSync(part)) {
      return { fileName, dest, part }
    }
    n += 1
  }
  throw new Error('同名安装包过多，请清理「柠檬音乐更新」目录后再试')
}

async function resolveLatestFpkAssets() {
  const release = await fetchGithubJson(`https://api.github.com/repos/${REPO}/releases/latest`)
  if (!release?.assets) throw new Error('无法获取 GitHub Release')
  const list = pickFpkAssets(release.assets)
  if (!list.length) throw new Error('最新 Release 中未找到 FPK 附件')
  return { release, assets: list }
}

aboutRouter.get('/', async (_req, res) => {
  const currentVersion = getCurrentVersion()
  let latestVersion = null
  let releaseUrl = REPO_URL
  let publishedAt = null
  let releaseName = null
  let releaseNotes = ''
  let fpkAssets = []
  let checkError = null
  let fpkUpdateDir = ''

  try {
    const release = await fetchGithubJson(`https://api.github.com/repos/${REPO}/releases/latest`)
    if (release?.tag_name) {
      latestVersion = release.tag_name.replace(/^v/i, '')
      releaseUrl = release.html_url || REPO_URL
      publishedAt = release.published_at || null
      releaseName = release.name || release.tag_name || null
      releaseNotes = normalizeReleaseNotes(release.body)
      fpkAssets = pickFpkAssets(release.assets)
    } else {
      const tags = await fetchGithubJson(`https://api.github.com/repos/${REPO}/tags?per_page=1`)
      if (Array.isArray(tags) && tags[0]?.name) {
        latestVersion = tags[0].name.replace(/^v/i, '')
        releaseUrl = `${REPO_URL}/releases/tag/${encodeURIComponent(tags[0].name)}`
      }
    }
  } catch (e) {
    checkError = e.message || '无法连接 GitHub'
  }

  try {
    fpkUpdateDir = getFpkUpdateDir()
  } catch {
    fpkUpdateDir = ''
  }

  const updateAvailable = Boolean(latestVersion && compareVersion(latestVersion, currentVersion) > 0)
  const logInfo = getAppLogInfo()

  res.json({
    name: 'Lemon Music',
    displayName: '柠檬音乐下载',
    description: '音乐搜索、试听、下载与标签管理，适用于飞牛 NAS。',
    features: [
      '搜索 / 试听 / 下载与标签管理',
      '多音源同时激活，批量下载自动降档',
      '飞牛 NAS 原生应用（FPK）',
    ],
    repoUrl: REPO_URL,
    currentVersion,
    latestVersion,
    updateAvailable,
    releaseUrl,
    releaseName,
    releaseNotes,
    fpkAssets,
    fpkUpdateDir,
    installHints: latestVersion ? buildInstallHints(latestVersion, fpkAssets) : null,
    publishedAt,
    checkError,
    checkedAt: new Date().toISOString(),
    logDir: logInfo.logDir,
    appLogPath: logInfo.appLog,
    logDirExists: logInfo.exists,
    logFiles: logInfo.files,
  })
})

aboutRouter.get('/diagnostics', (_req, res) => {
  const logInfo = getAppLogInfo()
  const tails = {}
  for (const file of logInfo.files || []) {
    if (!file?.path || !file?.name) continue
    const maxBytes = file.name === 'runtime.log' ? 120 * 1024 : 48 * 1024
    const text = readLogTail(file.path, maxBytes)
    if (text) tails[file.name] = text
  }
  if (!tails['runtime.log'] && logInfo.logDir) {
    const runtimePath = path.join(logInfo.logDir, 'runtime.log')
    const text = readLogTail(runtimePath, 120 * 1024)
    if (text) tails['runtime.log'] = text
  }
  res.json({
    generatedAt: new Date().toISOString(),
    currentVersion: getCurrentVersion(),
    node: process.version,
    platform: `${process.platform} ${os.arch()}`,
    uptimeSec: Math.round(process.uptime()),
    logDir: logInfo.logDir,
    logDirExists: logInfo.exists,
    recentText: formatRuntimeLogLines(),
    tails,
  })
})

/**
 * 服务端拉取 FPK 到 NAS 下载目录/柠檬音乐更新（异步任务，经 WS / 轮询看进度）
 * body: { arch?: 'x86'|'arm', name?: string, mirror?: boolean }
 */
aboutRouter.post('/download-fpk', requireAdmin, async (req, res) => {
  try {
    const wantMirror = req.body?.mirror !== false
    const wantArch = String(req.body?.arch || '').trim().toLowerCase()
    const wantName = String(req.body?.name || '').trim()
    const userId = req.user?.id || null

    const { assets } = await resolveLatestFpkAssets()
    let asset = null
    if (wantName) {
      asset = assets.find((a) => a.name === wantName) || null
    } else if (wantArch === 'x86' || wantArch === 'arm') {
      asset = assets.find((a) => a.arch === wantArch) || null
    } else {
      asset = assets[0] || null
    }
    if (!asset) return res.status(404).json({ error: '未找到对应架构的 FPK' })

    const jobKey = asset.arch || asset.name
    const existing = fpkDownloadJobs.get(jobKey)
    if (existing?.status === 'downloading') {
      return res.status(409).json({ error: `正在下载 ${asset.label} 安装包，请稍候`, data: publicFpkJob(existing) })
    }

    const dir = getFpkUpdateDir(userId)
    const { fileName, dest, part } = allocateUniqueFpkPath(dir, asset.name)

    const job = {
      jobKey,
      name: asset.name,
      fileName,
      arch: asset.arch,
      label: asset.label,
      mirror: wantMirror,
      mirrorHost: wantMirror ? '节点测速中…' : '',
      status: 'downloading',
      progress: 0,
      downloaded: 0,
      total: Number(asset.size) || 0,
      expectedSize: Number(asset.size) || 0,
      sizeLabel: '',
      path: '',
      dir,
      error: '',
      startedAt: Date.now(),
      finishedAt: null,
      userId,
    }
    fpkDownloadJobs.set(jobKey, job)
    emitFpkJob(userId, 'about:fpk-progress', job)

    // 后台：先测速排序，再拉取；接口立即返回，前端靠 WS / 轮询看进度
    setImmediate(() => {
      ;(async () => {
        const urls = await buildFpkDownloadUrls(asset.url, wantMirror, (msg) => {
          job.mirrorHost = msg
          emitFpkJob(userId, 'about:fpk-progress', job)
        })
        await runFpkDownloadJob(job, urls, dest, part, userId)
      })().catch(() => {})
    })

    res.json({ ok: true, data: publicFpkJob(job) })
  } catch (e) {
    res.status(500).json({ error: e.message || 'FPK 下载失败' })
  }
})

/** 查询 FPK 下载任务进度 */
aboutRouter.get('/download-fpk/status', requireAdmin, (req, res) => {
  const wantName = String(req.query?.name || '').trim()
  const wantArch = String(req.query?.arch || '').trim().toLowerCase()
  let job = null
  if (wantName) {
    job = [...fpkDownloadJobs.values()].find((j) => j.name === wantName || j.fileName === wantName) || null
  } else if (wantArch) {
    job = fpkDownloadJobs.get(wantArch) || null
  } else {
    job = [...fpkDownloadJobs.values()].find((j) => j.status === 'downloading')
      || [...fpkDownloadJobs.values()].sort((a, b) => (b.finishedAt || b.startedAt) - (a.finishedAt || a.startedAt))[0]
      || null
  }
  if (!job) return res.json({ ok: true, data: null })
  res.json({ ok: true, data: publicFpkJob(job) })
})
