/** 拉取音源 CDN 音频时常用的浏览器头（无 Referer 时 QQ/网易等常直接 403） */

export const MUSIC_CDN_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const SOURCE_REFERERS = {
  tx: { Referer: 'https://y.qq.com/', Origin: 'https://y.qq.com' },
  kw: { Referer: 'https://www.kuwo.cn/' },
  kg: { Referer: 'https://www.kugou.com/' },
  wy: { Referer: 'https://music.163.com/' },
  mg: { Referer: 'https://music.migu.cn/' },
}

/**
 * @param {string} [source] 平台：tx/wy/kg/kw/mg
 * @param {Record<string, string>} [extra]
 */
export function buildMusicCdnHeaders(source = '', extra = {}) {
  const platform = String(source || '').toLowerCase().trim()
  return {
    'User-Agent': MUSIC_CDN_USER_AGENT,
    Accept: '*/*',
    ...(SOURCE_REFERERS[platform] || {}),
    ...extra,
  }
}
