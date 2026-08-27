import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import needle from 'needle'
import { compareVersion } from '../utils/version.js'

export const aboutRouter = Router()

const REPO = 'jia070310/lemon-muisc'
const REPO_URL = `https://github.com/${REPO}`
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

aboutRouter.get('/', async (_req, res) => {
  const currentVersion = getCurrentVersion()
  let latestVersion = null
  let releaseUrl = REPO_URL
  let publishedAt = null
  let checkError = null

  try {
    const release = await fetchGithubJson(`https://api.github.com/repos/${REPO}/releases/latest`)
    if (release?.tag_name) {
      latestVersion = release.tag_name.replace(/^v/i, '')
      releaseUrl = release.html_url || REPO_URL
      publishedAt = release.published_at || null
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
    description: '音乐搜索、试听、下载与标签管理工具，适用于飞牛 NAS。兼容落雪音乐音源，支持同时激活多个音源。',
    features: ['音乐搜索、试听、下载与标签管理', '支持同时激活多个落雪兼容音源', '适用于飞牛 NAS 部署'],
    repoUrl: REPO_URL,
    currentVersion,
    latestVersion,
    updateAvailable,
    releaseUrl,
    publishedAt,
    checkError,
    checkedAt: new Date().toISOString(),
  })
})
