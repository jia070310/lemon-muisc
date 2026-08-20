export async function fetchPicBuffer(picUrl) {
  if (!picUrl || !/^https?:\/\//i.test(picUrl)) return null

  let url = picUrl
  if (url.includes('music.126.net')) {
    url += `${url.includes('?') ? '&' : '?'}param=500y500`
  }

  const { default: needle } = await import('needle')
  const resp = await needle('get', url, {
    follow_max: 5,
    parse_response: false,
    timeout: 15000,
  })

  if (resp.statusCode !== 200 || !resp.body?.length) return null
  return Buffer.isBuffer(resp.body) ? resp.body : Buffer.from(resp.body)
}

export function detectImageMime(buffer) {
  if (!buffer?.length) return 'image/jpeg'
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png'
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'image/gif'
  if (buffer.slice(0, 4).toString() === 'RIFF') return 'image/webp'
  return 'image/jpeg'
}
