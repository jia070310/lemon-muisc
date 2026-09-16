import zlib from 'zlib'

/** 酷狗 KRC 异或密钥（与 LDDC / 常见开源实现一致） */
const KRC_KEY = Buffer.from([
  0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47,
  0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69,
])

/**
 * 解密酷狗 KRC（base64 或 Buffer）→ 明文
 * 参考：https://github.com/chenmozhijin/LDDC
 */
export function decryptKrc(content) {
  if (!content) return ''
  const buf = Buffer.isBuffer(content)
    ? content
    : Buffer.from(String(content).replace(/\s+/g, ''), 'base64')
  if (buf.length < 5) return ''
  // 头 4 字节多为 krc1 / krc18
  const enc = buf.subarray(4)
  const dec = Buffer.alloc(enc.length)
  for (let i = 0; i < enc.length; i++) {
    dec[i] = enc[i] ^ KRC_KEY[i % KRC_KEY.length]
  }
  try {
    return zlib.inflateSync(dec).toString('utf8')
  } catch {
    try {
      return zlib.unzipSync(dec).toString('utf8')
    } catch {
      return ''
    }
  }
}

/** KRC 字标签 <a,b,c> 与网易 YRC (a,b,c) 结构一致，转成 YRC 便于前端复用解析 */
export function krcToYlyric(krcText) {
  const text = String(krcText || '')
  if (!text.trim()) return ''
  return text
    .replace(/\r/g, '')
    .replace(/<(\d+)\s*,\s*(\d+)\s*,\s*-?\d+>/g, '($1,$2,0)')
}

export function decryptKrcToYlyric(content) {
  return krcToYlyric(decryptKrc(content))
}
