const IMAGE_ACCEPT = 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * 按魔数判断是否为常见位图，避免把 CDN 的 HTML 错误页当成图片缓存。
 * @param {Buffer} buffer
 */
export function isImageBuffer(buffer) {
  if (!buffer?.length || buffer.length < 1024) return false
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return true
  if (buffer.slice(0, 4).toString('ascii') === 'GIF8') return true
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') return true
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return true
  return false
}

/**
 * 拉取远程封面。整体耗时受 deadlineMs 约束，避免外层超时后仍长期占用并发槽。
 * @param {string} picUrl
 * @param {{ size?: number, deadlineMs?: number }} [opts]
 */
export async function fetchPicBuffer(picUrl, { size = 0, deadlineMs = 12000 } = {}) {
  if (!picUrl || !/^https?:\/\//i.test(picUrl)) return null

  const prefer = Number(size) > 0 ? Math.min(500, Math.max(120, Number(size))) : 0
  const candidates = expandPicCandidates(picUrl, prefer)
  const { default: needle } = await import('needle')
  const deadline = Date.now() + Math.max(1000, Number(deadlineMs) || 12000)

  for (let url of candidates) {
    if (url.includes('music.126.net') && !/[?&]param=\d+y\d+/i.test(url)) {
      const dim = prefer || 500
      url += `${url.includes('?') ? '&' : '?'}param=${dim}y${dim}`
    }
    // 先带平台 Referer；失败后再用无 Referer 尝试一次（酷狗/酷我防盗链兜底）
    for (const withReferer of [true, false]) {
      const remaining = deadline - Date.now()
      if (remaining < 500) return null
      const timeout = Math.min(6000, remaining)
      try {
        const headers = { 'User-Agent': USER_AGENT, Accept: IMAGE_ACCEPT }
        if (withReferer) headers.Referer = pickReferer(url)
        const resp = await needle('get', url, {
          headers,
          follow_max: 5,
          parse_response: false,
          timeout,
          open_timeout: Math.min(4000, timeout),
        })
        const status = resp?.statusCode
        const body = Buffer.isBuffer(resp?.body) ? resp.body : Buffer.from(resp?.body || [])
        // 魔数通过即可信：部分 CDN 会返回 octet-stream，mime 由调用方再探测
        if ((status === 200 || status === 206) && isImageBuffer(body)) return body
      } catch {
        // 网络异常：继续下一次尝试
      }
    }
  }
  return null
}

function pickReferer(url) {
  if (/kuwo\.cn/i.test(url)) return 'https://www.kuwo.cn/'
  if (/kugou\.com|kgimg\.com/i.test(url)) return 'https://www.kugou.com/'
  if (/music\.126\.net|netease/i.test(url)) return 'https://music.163.com/'
  if (/migu\.cn/i.test(url)) return 'https://www.migu.cn/'
  return 'https://y.qq.com/'
}

function expandPicCandidates(picUrl, preferSize = 0) {
  const list = [picUrl]
  const size = preferSize || 400

  if (/T002R300x300M000/.test(picUrl)) {
    // 列表用较小图；大图需求再升到 500
    if (preferSize && preferSize <= 300) {
      /* keep 300 */
    } else {
      list.push(picUrl.replace('T002R300x300M000', 'T002R500x500M000'))
    }
  }

  // 酷我：120 常空；列表优先 240/300，否则 500
  if (/kuwo\.cn\/star\/(albumcover|starheads)\//i.test(picUrl)) {
    const target = preferSize && preferSize <= 300 ? '/240/' : '/500/'
    const up = picUrl.replace(/\/120\//, target).replace(/\/240\//, preferSize && preferSize <= 300 ? '/240/' : '/500/')
    if (up !== picUrl) list.push(up)
    for (const host of ['img4.kuwo.cn', 'img2.kuwo.cn', 'img1.kuwo.cn', 'img3.kuwo.cn']) {
      const swapped = up.replace(/https?:\/\/img\d\.kuwo\.cn/i, `https://${host}`)
      if (!list.includes(swapped)) list.push(swapped)
    }
  }

  if (/\{size\}/.test(picUrl)) {
    list.push(picUrl.replace(/\{size\}/g, String(size)))
    if (!preferSize || preferSize > 300) list.push(picUrl.replace(/\{size\}/g, '480'))
  }

  return [...new Set(list)]
}

export function detectImageMime(buffer) {
  if (!buffer?.length) return 'image/jpeg'
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png'
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'image/gif'
  if (buffer.slice(0, 4).toString() === 'RIFF') return 'image/webp'
  return 'image/jpeg'
}
