export async function fetchPicBuffer(picUrl) {
  if (!picUrl || !/^https?:\/\//i.test(picUrl)) return null

  const candidates = [picUrl]
  // QQ 封面偶发 300 失败时再试 500
  if (/T002R300x300M000/.test(picUrl)) {
    candidates.push(picUrl.replace('T002R300x300M000', 'T002R500x500M000'))
  }

  const { default: needle } = await import('needle')
  for (let url of candidates) {
    if (url.includes('music.126.net')) {
      url += `${url.includes('?') ? '&' : '?'}param=500y500`
    }
    try {
      const resp = await needle('get', url, {
        headers: {
          Referer: 'https://y.qq.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        follow_max: 5,
        parse_response: false,
        timeout: 15000,
      })
      if (resp.statusCode === 200 && resp.body?.length) {
        return Buffer.isBuffer(resp.body) ? resp.body : Buffer.from(resp.body)
      }
    } catch {
      // try next candidate
    }
  }
  return null
}

export function detectImageMime(buffer) {
  if (!buffer?.length) return 'image/jpeg'
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png'
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'image/gif'
  if (buffer.slice(0, 4).toString() === 'RIFF') return 'image/webp'
  return 'image/jpeg'
}
