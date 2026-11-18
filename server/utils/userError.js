/**
 * 将音源/网络/Node 原始错误转成用户可读的简短中文。
 * 保留已是通顺中文的文案；技术码与英文一律翻译。
 */

const RULES = [
  {
    test: /密钥已过期|密钥过期|key\s*expired|token\s*expired/i,
    message: '密钥已过期',
  },
  {
    test: /API无密钥|未填写.*(?:API|api)?\s*密钥|未配置.*(?:API|api)?\s*密钥|缺少.*(?:API|api)?\s*密钥|请在插件设置.*API\s*Key|用户变量中填写|no\s*api\s*key|missing\s*api\s*key/i,
    message: 'API无密钥',
  },
  {
    test: /API\s*密钥无效|密钥无效|invalid\s*api\s*key|wrong\s*api\s*key/i,
    message: 'API 密钥无效',
  },
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
    test: /没有激活的音源|没有激活|尚未激活/i,
    message: '请先在设置中导入并激活音源',
  },
  {
    test: /音源初始化超时/i,
    message: '音源初始化超时，请重新激活或更换音源',
  },
  {
    test: /音源脚本执行失败/i,
    message: '音源脚本运行出错（多为偶发异常）。可重新激活后再试；反复失败再考虑重新导入',
  },
  {
    test: /getToneId is not defined/i,
    message: '听书插件脚本不完整（缺少发音人接口），请重新激活或更新该插件',
  },
  {
    test: /ReferenceError:/i,
    message: '音源插件脚本运行出错，请更新或更换该插件',
  },
  {
    test: /书籍信息获取失败/i,
    message: '听书源无法获取该书信息（可能搜到的是整本书而非章节，或书已下架）',
  },
  {
    test: /CALL_SERVICE_FAIL|101013/i,
    message: '听书源上游服务调用失败，请稍后重试或换其它听书源',
  },
  {
    test: /无法识别的章节ID/i,
    message: '无法识别听书章节，请换一本来源或打开专辑后再播',
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
    test: /block\s*ip|ip\s*block|blocked?\s*ip|ip\s*banned|封禁.*ip|ip.*被[封拦]/i,
    message: '当前网络 IP 被音源限制，请稍后或更换网络/音源后再试',
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
    test: /托管站(?:\/代理)?限流|HTTP\s*429|statusCode[:\s]*429|\b429\b/i,
    message: '托管站限流，请稍后再试；也可浏览器打开链接另存为 .js 后本地导入',
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
    message: '播放链接失效或暂时无法解码，请再点一次播放',
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
    test: /本地文件暂时无法播放|本地文件加载失败|本地音频解码失败|本地音频加载被中止/,
    keepRaw: true,
  },
  {
    test: /本地文件不可用|不在允许目录|缺少本地文件路径|无权访问该文件/i,
    message: '本地文件路径无效或不在允许目录内，请在设置中检查音乐库/下载目录与访问权限',
  },
  {
    test: /检测为试听时长|仅提供约.*试听片段|仅支持试听约|时长不完整/i,
    keepRaw: true,
  },
  {
    test: /未找到 ffmpeg|尚未检测到 ffmpeg|尚未启用.*ffmpeg|已检测到系统 ffmpeg/i,
    keepRaw: true,
    maxLen: 480,
  },
]

function stripNoise(text) {
  return String(text || '')
    .replace(/^Error:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 插件常把上游 JSON 整段扔进 Error.message，从中抽出可读中文 */
function extractJsonApiMessage(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  const tryParse = (s) => {
    try {
      const obj = JSON.parse(s)
      if (!obj || typeof obj !== 'object') return ''
      for (const key of ['title', 'details', 'popup_title', 'message', 'msg', 'error', 'errmsg']) {
        const v = obj[key]
        if (typeof v === 'string' && /[\u4e00-\u9fff]/.test(v)) return v.trim()
      }
    } catch {}
    return ''
  }
  if (text.startsWith('{')) {
    const hit = tryParse(text)
    if (hit) return hit
  }
  const m = text.match(/\{[\s\S]*"(?:title|details|message|msg)"[\s\S]*\}/)
  if (m) {
    const hit = tryParse(m[0])
    if (hit) return hit
  }
  return ''
}

function looksLikeChineseMessage(text) {
  if (!text) return false
  if (/[A-Za-z]{4,}/.test(text) && /socket|timeout|ECONN|ETIMED|Failed|Error|HTTP|SSL|TLS|fetch/i.test(text)) {
    return false
  }
  return /[\u4e00-\u9fff]/.test(text) && text.length <= 100
}

/**
 * @param {unknown} error
 * @param {string} [fallback]
 */
export function formatUserError(error, fallback = '操作失败，请稍后重试') {
  if (error == null || error === '') return fallback

  let raw = stripNoise(
    typeof error === 'string'
      ? error
      : (error?.message || error?.msg || String(error)),
  )
  if (!raw) return fallback

  // 先剥掉音源脚本常见前缀，再匹配具体原因
  raw = raw.replace(/^(?:后端失败|请求失败|下载失败|错误)[:：]\s*/i, '').trim() || raw

  const fromJson = extractJsonApiMessage(raw)
  if (fromJson) raw = fromJson

  for (const rule of RULES) {
    if (rule.test.test(raw)) {
      if (rule.keepRaw) return raw.slice(0, rule.maxLen || 200)
      return rule.message
    }
  }

  if (looksLikeChineseMessage(raw) || (/[\u4e00-\u9fff]/.test(raw) && raw.length <= 200 && !/[A-Za-z]{6,}/.test(raw))) {
    return raw.slice(0, 200)
  }

  if (/[A-Za-z]{6,}/.test(raw) || raw.length > 100) {
    return fallback
  }

  return raw.slice(0, 80) || fallback
}
