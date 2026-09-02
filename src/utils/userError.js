/**
 * 前端展示用：把接口/音源返回的英文、错误码转成简短中文。
 * 与 server/utils/userError.js 规则保持一致。
 */

const RULES = [
  {
    test: /socket hang up|ECONNRESET|EPIPE|ECONNABORTED|ERR_SOCKET|ERR_CONNECTION_RESET/i,
    message: '音源服务连接中断，请稍后重试或换较低音质',
  },
  {
    test: /ETIMEDOUT|ESOCKETTIMEDOUT|timed?\s*out|timeout|请求超时/i,
    message: '请求超时，请检查网络后重试',
  },
  {
    test: /ENOTFOUND|getaddrinfo|EAI_AGAIN/i,
    message: '无法解析音源地址，请检查网络或 DNS',
  },
  {
    test: /ECONNREFUSED/i,
    message: '无法连接音源服务，请稍后重试',
  },
  {
    test: /CERT_|UNABLE_TO_VERIFY|SSL|TLS/i,
    message: '安全连接失败，请稍后重试',
  },
  {
    test: /本地文件不可用|不在允许目录|缺少本地文件路径/i,
    message: '本地文件路径无效，请在设置中检查音乐库/下载目录',
  },
  {
    test: /音频解码失败/i,
    message: '音频解码失败，文件可能已损坏',
  },
  {
    test: /浏览器无法播放该音频格式/i,
    message: '浏览器无法播放该音频格式',
  },
  {
    test: /本地音频加载超时/i,
    message: '本地音频加载超时，请检查文件是否存在或路径是否在音乐库目录内',
  },
  {
    test: /音频加载超时|音频加载失败|无法播放该音频/i,
    message: '音频加载失败，请检查文件或网络后重试',
  },
  {
    test: /没有激活的音源|没有激活/i,
    message: '请先在设置中导入并激活音源',
  },
  {
    test: /音源初始化超时/i,
    message: '音源初始化超时，请重新激活或更换音源',
  },
  {
    test: /音源脚本执行失败/i,
    message: '音源脚本运行出错，请检查音源或重新导入',
  },
  {
    test: /请求超时\(30s\)|请求超时\(20s\)/i,
    message: '音源响应超时，请稍后重试',
  },
  {
    test: /获取.*音质.*失败|未获取到URL|获取URL失败|获取播放链接失败/i,
    message: '无法获取该音质链接，请尝试其他音质或歌曲',
  },
  {
    test: /HTTP\s*403|statusCode[:\s]*403|\b403\b/i,
    message: '音源拒绝访问（可能需登录或受版权限制）',
  },
  {
    test: /HTTP\s*404|statusCode[:\s]*404|\b404\b/i,
    message: '资源不存在或链接已失效',
  },
  {
    test: /HTTP\s*429|statusCode[:\s]*429|\b429\b/i,
    message: '请求过于频繁，请稍后再试',
  },
  {
    test: /HTTP\s*5\d{2}|statusCode[:\s]*5\d{2}/i,
    message: '音源服务器异常，请稍后重试',
  },
  {
    test: /下载响应异常/i,
    message: '下载地址无效或已过期，请重试',
  },
  {
    test: /ENOSPC|no space/i,
    message: '磁盘空间不足，请清理后重试',
  },
  {
    test: /EACCES|permission denied/i,
    message: '没有写入权限，请检查下载目录设置',
  },
  {
    test: /AbortError|aborted/i,
    message: '操作已取消',
  },
  {
    test: /Failed to fetch|NetworkError|network error|fetch failed/i,
    message: '网络异常，无法连接服务器',
  },
  {
    test: /NotAllowedError|user gesture|autoplay/i,
    message: '浏览器拦截了自动播放，请再点一次播放',
  },
  {
    test: /NotSupportedError|no supported sources/i,
    message: '浏览器无法播放该音频，请尝试其他歌曲',
  },
  {
    test: /104003/i,
    message: '该歌曲暂无权限（版权或 VIP 限制）',
  },
  {
    test: /104001|104002/i,
    message: '该歌曲暂时无法播放',
  },
  {
    test: /^后端失败$/i,
    message: '音源后端暂时不可用，请稍后重试或换较低音质',
  },
  {
    test: /无法连接服务器/i,
    message: '无法连接服务器，请确认服务已启动',
  },
]

function stripNoise(text) {
  return String(text || '')
    .replace(/^Error:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikeChineseMessage(text) {
  if (!text) return false
  if (/[A-Za-z]{4,}/.test(text) && /socket|timeout|ECONN|ETIMED|Failed|Error|HTTP|SSL|TLS|fetch/i.test(text)) {
    return false
  }
  return /[\u4e00-\u9fff]/.test(text) && text.length <= 100
}

export function formatUserError(error, fallback = '操作失败，请稍后重试') {
  if (error == null || error === '') return fallback

  let raw = stripNoise(
    typeof error === 'string'
      ? error
      : (error?.message || error?.msg || String(error)),
  )
  if (!raw) return fallback

  raw = raw.replace(/^(?:后端失败|请求失败|下载失败|错误)[:：]\s*/i, '').trim() || raw

  for (const rule of RULES) {
    if (rule.test.test(raw)) return rule.message
  }

  if (looksLikeChineseMessage(raw)) return raw.slice(0, 120)

  if (/[A-Za-z]{6,}/.test(raw) || raw.length > 100) {
    return fallback
  }

  return raw.slice(0, 80) || fallback
}
