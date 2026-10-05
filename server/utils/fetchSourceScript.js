import needle from 'needle'

const MAX_SCRIPT_BYTES = 5 * 1024 * 1024
const FETCH_HEADERS = {
  'user-agent': 'Mozilla/5.0 (compatible; LemonMusic/1.2; +https://github.com/jia070310/lemon-muisc)',
  accept: '*/*',
}

function stripUrlNoise(input) {
  return String(input || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/\s+/g, '')
}

/** GitHub blob / gist / gitee 页面链接转成可下载的 raw */
export function normalizeSourceScriptUrl(input) {
  let url = stripUrlNoise(input)
  if (!url) return ''
  url = url.split('#')[0]
  if (url.startsWith('http://github.com/') || url.startsWith('http://raw.githubusercontent.com/') || url.startsWith('http://gist.github.com/')) {
    url = `https://${url.slice(7)}`
  }

  let m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/]+)\/(.+)$/i)
  if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4].split('?')[0]}`

  m = url.match(/^https?:\/\/gist\.github\.com\/([^/]+)\/([a-f0-9]+)(?:\/[^?#]*)?$/i)
  if (m) return `https://gist.githubusercontent.com/${m[1]}/${m[2]}/raw`

  m = url.match(/^https?:\/\/gist\.github\.com\/([a-f0-9]+)\/?$/i)
  if (m) return `https://gist.githubusercontent.com/raw/${m[1]}`

  m = url.match(/^https?:\/\/gitee\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i)
  if (m) return `https://gitee.com/${m[1]}/${m[2]}/raw/${m[3]}/${m[4]}`

  m = url.match(/^https?:\/\/gitcode\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i)
  if (m) return `https://gitcode.com/${m[1]}/${m[2]}/raw/${m[3]}/${m[4]}`

  return url
}

function isGithubHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return (
      host === 'github.com'
      || host === 'raw.githubusercontent.com'
      || host === 'gist.githubusercontent.com'
      || host === 'gist.github.com'
      || host === 'objects.githubusercontent.com'
    )
  } catch {
    return false
  }
}

function alreadyProxied(url) {
  return /ghproxy|ghfast|gitmirror|jsdelivr\.net|kkgithub|gitdl\.cn/i.test(url)
}

function toJsdelivr(rawUrl) {
  const m = String(rawUrl).match(/^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i)
  if (!m) return ''
  return `https://cdn.jsdelivr.net/gh/${m[1]}/${m[2]}@${m[3]}/${m[4]}`
}

export function sourceScriptFetchCandidates(url) {
  const normalized = normalizeSourceScriptUrl(url)
  if (!normalized) return []
  if (alreadyProxied(normalized) || !isGithubHost(normalized)) return [normalized]
  const mirrors = [
    normalized,
    `https://ghfast.top/${normalized}`,
    `https://ghproxy.net/${normalized}`,
    `https://mirror.ghproxy.com/${normalized}`,
  ]
  const cdn = toJsdelivr(normalized)
  if (cdn) mirrors.splice(1, 0, cdn)
  return [...new Set(mirrors)]
}

function looksLikeHtml(text) {
  const t = String(text || '').trimStart().slice(0, 240)
  return /^<!DOCTYPE html/i.test(t) || /^<html[\s>]/i.test(t)
}

async function fetchOnce(url) {
  const resp = await needle('get', url, null, {
    follow_max: 5,
    open_timeout: 12000,
    response_timeout: 18000,
    read_timeout: 18000,
    parse_response: false,
    compressed: true,
    rejectUnauthorized: true,
    headers: FETCH_HEADERS,
  })
  const code = Number(resp.statusCode || 0)
  if (code !== 200) {
    const err = new Error(`HTTP_${code}`)
    err.statusCode = code
    throw err
  }
  const buf = Buffer.isBuffer(resp.body) ? resp.body : Buffer.from(String(resp.body || ''), 'utf8')
  if (buf.length > MAX_SCRIPT_BYTES) throw new Error('脚本过大（超过 5MB）')
  const script = buf.toString('utf8').replace(/^\uFEFF/, '')
  if (!script || script.trim().length < 10) throw new Error('获取到的脚本内容为空')
  if (looksLikeHtml(script)) {
    throw new Error('链接返回的不是音源脚本（可能是网页）。请使用 .js 直链，或下载后用「本地导入」')
  }
  return script
}

function describeFetchError(err, triedMirrors) {
  const msg = String(err?.message || err || '')
  const code = err?.statusCode || err?.code || ''
  if (/链接返回的不是音源脚本|脚本过大|内容为空/.test(msg)) return msg
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(msg) || code === 'ENOTFOUND') {
    return triedMirrors
      ? '无法访问该音源链接（DNS/网络），GitHub 直连失败且镜像也不可用。可下载 .js 后本地导入'
      : '无法解析音源地址，请检查链接或网络'
  }
  if (/ETIMEDOUT|ESOCKETTIMEDOUT|timed?\s*out|timeout/i.test(msg)) {
    return triedMirrors
      ? '下载音源超时。国内访问 GitHub 常不稳定，请换 Gitee 直链或下载后本地导入'
      : '下载音源超时，请稍后重试或改用本地导入'
  }
  if (/ECONNREFUSED|ECONNRESET|EPIPE|socket hang/i.test(msg)) {
    return '连接音源托管站点失败，请稍后重试或改用本地导入'
  }
  if (code === 404 || /HTTP_404/.test(msg)) return '音源链接不存在或已失效（404）'
  if (code === 403 || /HTTP_403/.test(msg)) {
    return triedMirrors
      ? '托管站点拒绝访问（限流或无法直连 GitHub）。请换镜像链接，或下载 .js 后本地导入'
      : '托管站点拒绝访问，请稍后重试或改用本地导入'
  }
  if (triedMirrors) return '无法下载音源脚本（已尝试 GitHub 镜像）。请检查链接，或下载后本地导入'
  return msg.startsWith('HTTP_') ? `下载失败（${msg.replace('HTTP_', 'HTTP ')}）` : (msg || '下载音源脚本失败')
}

/** 拉取音源脚本：规范化链接，GitHub 失败时自动换镜像 */
export async function fetchSourceScriptFromUrl(input) {
  const candidates = sourceScriptFetchCandidates(input)
  if (!candidates.length) throw new Error('请提供有效的 http(s) 音源链接')
  if (!/^https?:\/\//i.test(candidates[0])) throw new Error('仅支持 http/https 音源链接')

  let lastErr = null
  for (const url of candidates) {
    try {
      return await fetchOnce(url)
    } catch (e) {
      lastErr = e
      console.warn(`[音源导入] ${url} 失败: ${e?.message || e}`)
    }
  }
  throw new Error(describeFetchError(lastErr, candidates.length > 1))
}
