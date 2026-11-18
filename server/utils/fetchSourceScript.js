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

function encodeUrlSegment(seg) {
  if (!seg) return seg
  // jsDelivr 路径形如 owner/repo@ref，@ 必须保留
  return seg.split('@').map((part) => {
    if (!part) return part
    try {
      return encodeURIComponent(decodeURIComponent(part))
    } catch {
      return encodeURIComponent(part)
    }
  }).join('@')
}

/** 给路径/查询里的非 ASCII（含中文）补百分号编码，避免 new URL / HTTP 请求失败 */
export function encodeSourceScriptUrl(input) {
  const raw = stripUrlNoise(input)
  if (!raw) return ''
  const m = raw.match(/^(https?:\/\/)([^/?#]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/i)
  if (!m) return raw
  const origin = `${m[1]}${m[2]}`
  const path = (m[3] || '').split('/').map(encodeUrlSegment).join('/')
  let search = m[4] || ''
  if (search.length > 1) {
    try {
      const qs = new URLSearchParams(search.slice(1))
      const encoded = qs.toString()
      search = encoded ? `?${encoded}` : ''
    } catch {
      search = search.replace(/[^\x00-\x7F]/g, (ch) => encodeURIComponent(ch))
    }
  }
  return `${origin}${path}${search}`
}

/**
 * 解开 cors.isteed.cc / ghproxy 等「把完整 https:// 塞进 path」的代理包装，
 * 便于后续走 GitHub 镜像竞速，而不是死磕单一易限流的 CORS 网关。
 */
export function unwrapSourceProxyUrl(input) {
  const raw = stripUrlNoise(input)
  if (!raw) return ''
  const m = raw.match(/^(https?:\/\/)([^/?#]+)\/+(https?:\/\/.+)$/i)
  if (!m) return raw
  const host = String(m[2] || '').toLowerCase()
  const isProxyHost = (
    host === 'cors.isteed.cc'
    || host === 'corsproxy.io'
    || host === 'cors-anywhere.herokuapp.com'
    || /(?:^|\.)(?:ghproxy\.(?:com|net)|ghfast\.top|gitmirror\.com|kkgithub\.com)$/i.test(host)
    || /^cors[.-]/i.test(host)
  )
  if (!isProxyHost) return raw
  return stripUrlNoise(m[3])
}

/** GitHub blob / gist / gitee 页面链接转成可下载的 raw */
export function normalizeSourceScriptUrl(input) {
  let url = encodeSourceScriptUrl(unwrapSourceProxyUrl(input))
  if (!url) return ''
  url = url.split('#')[0]
  if (url.startsWith('http://github.com/') || url.startsWith('http://raw.githubusercontent.com/') || url.startsWith('http://gist.github.com/')) {
    url = `https://${url.slice(7)}`
  }

  let m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/]+)\/(.+)$/i)
  if (m) return encodeSourceScriptUrl(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4].split('?')[0]}`)

  m = url.match(/^https?:\/\/gist\.github\.com\/([^/]+)\/([a-f0-9]+)(?:\/[^?#]*)?$/i)
  if (m) return `https://gist.githubusercontent.com/${m[1]}/${m[2]}/raw`

  m = url.match(/^https?:\/\/gist\.github\.com\/([a-f0-9]+)\/?$/i)
  if (m) return `https://gist.githubusercontent.com/raw/${m[1]}`

  m = url.match(/^https?:\/\/gitee\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i)
  if (m) return encodeSourceScriptUrl(`https://gitee.com/${m[1]}/${m[2]}/raw/${m[3]}/${m[4]}`)

  m = url.match(/^https?:\/\/gitcode\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i)
  if (m) return encodeSourceScriptUrl(`https://gitcode.com/${m[1]}/${m[2]}/raw/${m[3]}/${m[4]}`)

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
  return /ghproxy|ghfast|gitmirror|jsdelivr\.net|kkgithub|gitdl\.cn|cors\.isteed\.cc/i.test(url)
}

function toJsdelivr(rawUrl) {
  const m = String(rawUrl).match(/^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i)
  if (!m) return ''
  const filePath = m[4].split('/').map(encodeUrlSegment).join('/')
  return `https://cdn.jsdelivr.net/gh/${m[1]}/${m[2]}@${m[3]}/${filePath}`
}

function expandJsdelivrHosts(url) {
  const m = String(url).match(/^https?:\/\/(?:cdn|fastly|gcore|testingcf)\.jsdelivr\.net\/(.+)$/i)
  if (!m) return [url]
  const path = m[1]
  return [
    `https://cdn.jsdelivr.net/${path}`,
    `https://fastly.jsdelivr.net/${path}`,
    `https://gcore.jsdelivr.net/${path}`,
  ]
}

function jsdelivrGhToRawList(url) {
  const text = String(url)
  let m = text.match(/^https?:\/\/(?:cdn|fastly|gcore|testingcf)\.jsdelivr\.net\/gh\/([^/]+)\/([^/@]+)@([^/]+)\/(.+)$/i)
  if (m) {
    return [encodeSourceScriptUrl(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`)]
  }
  // jsDelivr 允许省略 @ref（默认最新）；补 main/master 方便走 GitHub 镜像
  m = text.match(/^https?:\/\/(?:cdn|fastly|gcore|testingcf)\.jsdelivr\.net\/gh\/([^/]+)\/([^/]+)\/(.+)$/i)
  if (!m) return []
  return [
    encodeSourceScriptUrl(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/main/${m[3]}`),
    encodeSourceScriptUrl(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/master/${m[3]}`),
  ]
}

function githubMirrorCandidates(rawUrl) {
  const normalized = normalizeSourceScriptUrl(rawUrl)
  if (!normalized || !isGithubHost(normalized)) return normalized ? [normalized] : []
  const mirrors = [
    normalized,
    `https://ghfast.top/${normalized}`,
    `https://ghproxy.net/${normalized}`,
    `https://mirror.ghproxy.com/${normalized}`,
  ]
  const cdn = toJsdelivr(normalized)
  if (cdn) mirrors.splice(1, 0, ...expandJsdelivrHosts(cdn))
  return [...new Set(mirrors)]
}

export function sourceScriptFetchCandidates(url) {
  const original = stripUrlNoise(url)
  const unwrapped = unwrapSourceProxyUrl(original)
  const normalized = normalizeSourceScriptUrl(unwrapped)
  if (!normalized) return []

  const list = []
  if (isGithubHost(normalized)) {
    list.push(...githubMirrorCandidates(normalized))
  } else if (/jsdelivr\.net/i.test(normalized)) {
    list.push(...expandJsdelivrHosts(normalized))
    for (const raw of jsdelivrGhToRawList(normalized)) {
      list.push(...githubMirrorCandidates(raw))
    }
  } else if (alreadyProxied(normalized)) {
    list.push(normalized)
    // 若本身是代理包装但未能解开，仍保留原链
  } else {
    list.push(normalized)
  }

  // 用户给的原始代理链也作为候选（部分环境直连镜像反而更差）
  // 注意：嵌套 https:// 的 CORS 代理 path 不要再 encode，否则会变成 https%3A// 更易失败
  if (original && original !== normalized && /^https?:\/\//i.test(original)) {
    list.push(original)
  }
  return [...new Set(list.filter(Boolean))]
}

function looksLikeHtml(text) {
  const t = String(text || '').trimStart().slice(0, 240)
  return /^<!DOCTYPE html/i.test(t) || /^<html[\s>]/i.test(t)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetriableFetchError(err) {
  const code = Number(err?.statusCode || 0)
  if (code === 429 || code === 502 || code === 503 || code === 504) return true
  const msg = String(err?.message || err || '')
  return /ETIMEDOUT|ESOCKETTIMEDOUT|timed?\s*out|timeout|ECONNRESET|EPIPE|socket hang|EAI_AGAIN/i.test(msg)
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

async function fetchWithRetry(url, retries = 1) {
  let lastErr = null
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchOnce(url)
    } catch (e) {
      lastErr = e
      if (!isRetriableFetchError(e) || i === retries) throw e
      await sleep(350 * (i + 1) + Math.floor(Math.random() * 250))
    }
  }
  throw lastErr || new Error('下载音源脚本失败')
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
  if (code === 429 || /HTTP_429/.test(msg)) {
    return triedMirrors
      ? '托管站/代理限流。请稍后再试，或浏览器打开链接另存为 .js 后本地导入'
      : '托管站限流，请稍后再试，或改用本地导入'
  }
  if (triedMirrors) return '无法下载音源脚本（已尝试 GitHub 镜像）。请检查链接，或下载后本地导入'
  return msg.startsWith('HTTP_') ? `下载失败（${msg.replace('HTTP_', 'HTTP ')}）` : (msg || '下载音源脚本失败')
}

/** 拉取音源脚本：规范化链接；多候选时竞速，避免串行镜像各自卡满超时 */
export async function fetchSourceScriptFromUrl(input) {
  const candidates = sourceScriptFetchCandidates(input)
  if (!candidates.length) throw new Error('请提供有效的 http(s) 音源链接')
  if (!/^https?:\/\//i.test(candidates[0])) throw new Error('仅支持 http/https 音源链接')

  if (candidates.length === 1) {
    try {
      return await fetchWithRetry(candidates[0], 2)
    } catch (e) {
      console.warn(`[音源导入] ${candidates[0]} 失败: ${e?.message || e}`)
      throw new Error(describeFetchError(e, false))
    }
  }

  return new Promise((resolve, reject) => {
    let pending = candidates.length
    let settled = false
    let lastErr = null
    for (const url of candidates) {
      // 多镜像竞速时各候选少重试，避免放大限流
      fetchWithRetry(url, 1).then(
        (script) => {
          if (settled) return
          settled = true
          resolve(script)
        },
        (e) => {
          lastErr = e
          console.warn(`[音源导入] ${url} 失败: ${e?.message || e}`)
          pending -= 1
          if (!settled && pending <= 0) {
            reject(new Error(describeFetchError(lastErr, true)))
          }
        },
      )
    }
  })
}
