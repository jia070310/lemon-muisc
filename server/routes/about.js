import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import needle from 'needle'
import { pipeline } from 'stream/promises'
import { Transform } from 'stream'
import { compareVersion } from '../utils/version.js'
import { getAppLogInfo } from '../utils/appPaths.js'
import { getDownloadSavePath, getSharedDownloadSavePath } from '../utils/filePaths.js'
import { requireAdmin } from '../middleware/auth.js'
import { broadcast } from '../ws.js'

export const aboutRouter = Router()

const REPO = 'jia070310/lemon-muisc'
const REPO_URL = `https://github.com/${REPO}`
/** GitHub Release 资源加速（国内直链常不可用） */
const GITHUB_ASSET_MIRROR_PREFIX = 'https://ghproxy.net/'
const FPK_UPDATE_SUBDIR = '柠檬音乐更新'
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

async function runFpkDownloadJob(job, url, dest, part, userId) {
  try {
    try { if (fs.existsSync(part)) fs.unlinkSync(part) } catch {}

    const stream = needle.get(url, {
      follow_max: 5,
      response_timeout: 60000,
      read_timeout: 300000,
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
      throw new Error('下载文件过小，可能失败，请改用加速或稍后重试')
    }
    // 落盘前再确认：若目标已存在则改名为 -1/-2…，绝不覆盖
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
  } catch (e) {
    try { if (fs.existsSync(part)) fs.unlinkSync(part) } catch {}
    job.status = 'error'
    job.error = e?.message || 'FPK 下载失败'
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
      mirrorUrl: `${GITHUB_ASSET_MIRROR_PREFIX}${url}`,
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
    fpkHint: '点「加速保存」将 FPK 拉到 NAS「下载目录/柠檬音乐更新」（打不开 GitHub 时优先用加速）。完成后到飞牛「应用中心」→「手动安装」选择该文件覆盖安装。',
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
    const url = wantMirror ? asset.mirrorUrl : asset.url

    const job = {
      jobKey,
      name: asset.name,
      fileName,
      arch: asset.arch,
      label: asset.label,
      mirror: wantMirror,
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

    // 后台拉取，接口立即返回，前端靠 WS / 轮询看进度
    setImmediate(() => {
      runFpkDownloadJob(job, url, dest, part, userId).catch(() => {})
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
