import needle from 'needle'
import { decryptKrcToYlyric } from './krc.js'

const KG_HEADERS = {
  Referer: 'https://www.kugou.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

async function getJson(url) {
  const resp = await needle('get', url, null, {
    headers: KG_HEADERS,
    parse_response: false,
    follow_max: 5,
    timeout: 12000,
  })
  const text = Buffer.isBuffer(resp.body) ? resp.body.toString('utf8') : String(resp.body || '')
  try {
    return JSON.parse(text.replace(/^\uFEFF/, '').trim() || '{}')
  } catch {
    return null
  }
}

/**
 * 按歌名歌手搜索酷狗逐字 KRC（LDDC 同款思路）
 * @returns {Promise<string>} ylyric（YRC 兼容文本）
 */
export async function fetchKugouWordLyricByKeyword(name = '', singer = '', durationMs = 0) {
  const title = String(name || '').trim()
  if (!title) return ''
  const artist = String(singer || '').trim()
  const keywords = [
    artist ? `${artist} - ${title}` : '',
    artist ? `${title} ${artist}` : '',
    title,
  ].filter(Boolean)

  const dur = Number(durationMs) > 0 ? Math.round(Number(durationMs)) : ''

  for (const keyword of keywords) {
    try {
      const searchUrl = `https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=${encodeURIComponent(keyword)}&duration=${dur || ''}&hash=`
      const data = await getJson(searchUrl)
      const candidates = Array.isArray(data?.candidates) ? data.candidates : []
      for (const c of candidates.slice(0, 5)) {
        if (!c?.id || !c?.accesskey) continue
        const ylyric = await downloadCandidateKrc(c)
        if (ylyric && /\(\d+\s*,\s*\d+/.test(ylyric)) return ylyric
      }
    } catch (e) {
      console.warn('酷狗逐字搜索失败:', e?.message || e)
    }
  }
  return ''
}

export async function downloadCandidateKrc(candidate) {
  if (!candidate?.id || !candidate?.accesskey) return ''
  for (const client of ['mobi', 'pc']) {
    try {
      const url = `https://lyrics.kugou.com/download?ver=1&client=${client}&id=${candidate.id}&accesskey=${candidate.accesskey}&fmt=krc&charset=utf8`
      const data = await getJson(url)
      if (!data?.content) continue
      // contenttype=2 为纯文本 base64，非 krc
      if (Number(data.contenttype) === 2) continue
      const ylyric = decryptKrcToYlyric(data.content)
      if (ylyric.trim()) return ylyric
    } catch {}
  }
  return ''
}
