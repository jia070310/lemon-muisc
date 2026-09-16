import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import needle from 'needle'
import { compareVersion } from '../utils/version.js'

export const aboutRouter = Router()

const REPO = 'jia070310/lemon-muisc'
const REPO_URL = `https://github.com/${REPO}`
/** 国内拉取 GHCR 常用加速前缀（与历史 Release 说明一致） */
const GHCR_MIRROR_HOST = 'ghcr.1ms.run'
/** GitHub Release 资源加速（国内直链常不可用） */
const GITHUB_ASSET_MIRROR_PREFIX = 'https://ghproxy.net/'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
    fpkHint: '请下载对应架构的 FPK，下载完成后到飞牛「应用中心」→「手动安装」选择文件安装（覆盖即可）。请勿依赖应用商店卡片上的「更新」。',
    fpkAssets,
    dockerOfficial: `ghcr.io/${REPO}:${ver}`,
    dockerMirror: `${GHCR_MIRROR_HOST}/${REPO}:${ver}`,
    dockerPullMirror: `docker pull ${GHCR_MIRROR_HOST}/${REPO}:${ver}`,
    mirrorNote: '国内环境建议用加速镜像拉取，再按需 tag 为本地 lemon-music:latest',
  }
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

  const updateAvailable = Boolean(latestVersion && compareVersion(latestVersion, currentVersion) > 0)

  res.json({
    name: 'Lemon Music',
    displayName: '柠檬音乐下载',
    description: '音乐搜索、试听、下载与标签管理，适用于飞牛 NAS。',
    features: [
      '搜索 / 试听 / 下载与标签管理',
      '多音源同时激活，批量下载自动降档',
      '飞牛 NAS 原生应用（FPK）与 Docker',
    ],
    repoUrl: REPO_URL,
    currentVersion,
    latestVersion,
    updateAvailable,
    releaseUrl,
    releaseName,
    releaseNotes,
    fpkAssets,
    installHints: latestVersion ? buildInstallHints(latestVersion, fpkAssets) : null,
    publishedAt,
    checkError,
    checkedAt: new Date().toISOString(),
  })
})
