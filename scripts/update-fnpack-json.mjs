#!/usr/bin/env node
/**
 * Upsert a release into repo-root fnpack.json (FnDepot V2) after FPK build/upload.
 *
 * Usage:
 *   node scripts/update-fnpack-json.mjs --version 1.2.17.19 \
 *     --x86 path/to/lemon-music-1.2.17.19-x86.fpk \
 *     --arm path/to/lemon-music-1.2.17.19-arm.fpk \
 *     [--changelog "..."] [--updated-at ISO8601] [--keep 10]
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const fnpackPath = path.join(root, 'fnpack.json')
const repo = 'jia070310/lemon-muisc'
const appName = 'lemon-music'

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  return process.argv[i + 1]
}

function fileSha256(filePath) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

function parseManifestOsMin() {
  const manifest = fs.readFileSync(path.join(root, 'fpk', 'manifest'), 'utf8')
  const m = manifest.match(/^\s*os_min_version\s*=\s*(.+)\s*$/m)
  return m ? m[1].trim() : '1.1.8'
}

function defaultChangelog(version) {
  const notesPath = path.join(root, 'fpk', `release-notes-v${version}.md`)
  if (!fs.existsSync(notesPath)) return `更新至 ${version}。`
  const text = fs.readFileSync(notesPath, 'utf8')
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^#+\s*/, '').replace(/^\*\*(.+)\*\*$/, '$1').replace(/^[-*]\s+/, '').trim())
    .filter((l) => l && !/^柠檬音乐/.test(l) && !/^更新内容$/.test(l) && !/^安装\s*\/\s*更新$/.test(l) && !/\.fpk/.test(l))
  const picked = lines.slice(0, 6).join('；')
  return (picked || `更新至 ${version}。`).slice(0, 500)
}

function toPlus8(isoOrDate) {
  const d = isoOrDate ? new Date(isoOrDate) : new Date()
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date: ${isoOrDate}`)
  const shifted = new Date(d.getTime() + 8 * 60 * 60 * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}+08:00`
}

function compareVersions(a, b) {
  const pa = String(a).split(/[.+-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x))
  const pb = String(b).split(/[.+-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x))
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x - y
    } else {
      const sx = String(x)
      const sy = String(y)
      if (sx !== sy) return sx < sy ? -1 : 1
    }
  }
  return 0
}

const version = arg('version')
const x86Path = arg('x86')
const armPath = arg('arm')
const keep = Math.max(1, Number(arg('keep', '12')) || 12)
const changelog = arg('changelog', defaultChangelog(version))
const updatedAt = toPlus8(arg('updated-at'))

if (!version || !x86Path || !armPath) {
  console.error('Required: --version --x86 <fpk> --arm <fpk>')
  process.exit(1)
}
for (const p of [x86Path, armPath]) {
  if (!fs.existsSync(p)) {
    console.error(`missing file: ${p}`)
    process.exit(1)
  }
}

const base = {
  schema_version: '2',
  source_info: {
    name: '柠檬音乐',
    author: 'jia070310',
    homepage: `https://github.com/${repo}`,
    description: '柠檬音乐官方外部应用源：飞牛 NAS 原生 FPK，支持自动检查更新。',
  },
  apps: {
    [appName]: {
      display_name: '柠檬音乐',
      desc: '<b>多平台搜歌、本地音乐库、标签整理与高品质下载</b>。兼容落雪、澜音、MusicFree、BakaMusic 音源插件，浏览器内完成找歌 → 试听 → 下载 → 整理。<br><br><b>亮点</b><br>· 搜索：酷我 / 酷狗 / QQ / 网易云 / 咪咕等（依导入脚本）；FLAC · Hi-Res · 母带，支持批量下载<br>· 音乐库：每日推荐（本地+平台混搭）、推荐歌单、漫游播放<br>· 文件管理：标签编辑、清理（重复/小文件）、伪 FLAC 检测、按歌手整理<br>· 播放：全屏逐字歌词、频谱与风格配色<br><br><b>依赖</b>：应用中心 <b>Node.js v22</b>。目录可在安装向导或「访问权限」中指定；卸载可选保留配置。<br><br><b>免责声明</b>：仅供个人合法使用，请遵守当地法律与平台条款。',
      platform: ['x86', 'arm'],
      categories: ['影音娱乐'],
      icon_url: './icon.png',
      preview_urls: [
        './docs/screenshots/intro-search-v1.2.17.png',
        './docs/screenshots/intro-daily-mix-v1.2.17.png',
        './docs/screenshots/intro-player-lyrics-v1.2.17.png',
        './docs/screenshots/intro-file-manager-v1.2.17.png',
        './docs/screenshots/intro-appearance-v1.2.17.png',
      ],
      readme_url: './README.md',
      bug_report_url: `https://github.com/${repo}/issues`,
      maintainer: 'jia070310',
      maintainer_url: `https://github.com/${repo}`,
      distributor: 'jia070310',
      distributor_url: `https://github.com/${repo}`,
      run_as: 'package',
      install_type: '',
      is_docker: false,
      service_port: '7983',
      releases: {},
    },
  },
}

const doc = fs.existsSync(fnpackPath)
  ? JSON.parse(fs.readFileSync(fnpackPath, 'utf8'))
  : structuredClone(base)

if (doc.schema_version !== '2') doc.schema_version = '2'
doc.source_info = { ...base.source_info, ...(doc.source_info || {}) }
doc.apps = doc.apps || {}
doc.apps[appName] = {
  ...base.apps[appName],
  ...(doc.apps[appName] || {}),
  releases: { ...(doc.apps[appName]?.releases || {}) },
}

const osMin = parseManifestOsMin()
const releaseUrl = (arch) =>
  `https://github.com/${repo}/releases/download/v${version}/lemon-music-${version}-${arch}.fpk`

doc.apps[appName].releases[version] = {
  changelog,
  updated_at: updatedAt,
  os_min_version: osMin,
  packages: {
    x86: {
      download_url: releaseUrl('x86'),
      sha256: fileSha256(x86Path),
      size: fs.statSync(x86Path).size,
    },
    arm: {
      download_url: releaseUrl('arm'),
      sha256: fileSha256(armPath),
      size: fs.statSync(armPath).size,
    },
  },
}

const versions = Object.keys(doc.apps[appName].releases).sort(compareVersions)
if (versions.length > keep) {
  for (const drop of versions.slice(0, versions.length - keep)) {
    delete doc.apps[appName].releases[drop]
  }
}

fs.writeFileSync(fnpackPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
console.log(`updated ${fnpackPath} → ${version} (kept ${Object.keys(doc.apps[appName].releases).length} releases)`)
