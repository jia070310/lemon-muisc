/**
 * GitHub 资源加速：把 raw/api/release 直链包一层国内常用代理。
 * 与关于页 FPK 加速同源思路，但这里做轻量顺序尝试（适合小文件/文本）。
 */

/** 常用 ghproxy 类节点（完整 URL 拼在 host 后）；顺序按近期可用性大致排列 */
export const GITHUB_PROXY_HOSTS = [
  'ghfast.top',
  'ghproxy.net',
  'gh.llkk.cc',
  'gh.ddlc.top',
  'cdn.gh-proxy.com',
  'gh.monlor.com',
  'gh.tryxd.cn',
  'git.669966.xyz',
  'ghproxy.icu',
  'mirror.ghproxy.com',
]

export function isGithubOriginUrl(url) {
  const u = String(url || '')
  return /^https?:\/\/(?:raw\.githubusercontent\.com|github\.com|api\.github\.com|objects\.githubusercontent\.com)\//i.test(u)
}

export function mirrorUrlForHost(host, githubUrl) {
  const origin = String(githubUrl || '').trim()
  if (!origin || !host) return ''
  return `https://${host}/${origin}`
}

/**
 * 加速候选：代理节点 → 可选 jsDelivr（仅 raw 路径可转）→ 直连兜底
 * @param {string} githubUrl raw / api / github 直链
 * @param {{ jsdelivr?: string[] }} [opts]
 */
export function buildGithubAccelerateUrls(githubUrl, opts = {}) {
  const origin = String(githubUrl || '').trim()
  if (!origin) return []
  const list = []
  for (const host of GITHUB_PROXY_HOSTS) {
    list.push(mirrorUrlForHost(host, origin))
  }
  for (const extra of opts.jsdelivr || []) {
    if (extra) list.push(extra)
  }
  list.push(origin)
  return [...new Set(list.filter(Boolean))]
}

/** raw.githubusercontent.com/owner/repo/branch/path → jsDelivr 多线路 */
export function rawToJsdelivrUrls(rawUrl) {
  const m = String(rawUrl || '').match(
    /^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i,
  )
  if (!m) return []
  const path = `${m[1]}/${m[2]}@${m[3]}/${m[4]}`
  return [
    `https://cdn.jsdelivr.net/gh/${path}`,
    `https://fastly.jsdelivr.net/gh/${path}`,
    `https://gcore.jsdelivr.net/gh/${path}`,
  ]
}
