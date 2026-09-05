/**
 * 澜音 (CeruMusic) 原生音源运行时
 * 文档: https://ceru.docs.shiqianjiang.cn/guide/CeruMusicPluginDev.html
 */
import crypto from 'crypto'
import zlib from 'zlib'
import needle from 'needle'

function toBuffer(data, encoding) {
  if (Buffer.isBuffer(data)) return data
  if (data instanceof Uint8Array) return Buffer.from(data)
  if (typeof data === 'string') {
    if (encoding === 'base64') return Buffer.from(data, 'base64')
    if (encoding === 'hex') return Buffer.from(data, 'hex')
    return Buffer.from(data, encoding || 'utf8')
  }
  return Buffer.from(String(data ?? ''), 'utf8')
}

function bufTo(buf, encoding) {
  if (encoding === 'base64') return buf.toString('base64')
  if (encoding === 'hex') return buf.toString('hex')
  if (encoding === 'buffer') return buf
  return buf.toString('utf8')
}

function createCeruCrypto() {
  return {
    aesEncrypt(data, mode, key, iv, encoding = 'base64') {
      const cipher = crypto.createCipheriv(`aes-${key.length * 8}-${String(mode || 'cbc').toLowerCase()}`, toBuffer(key), toBuffer(iv || ''))
      const enc = Buffer.concat([cipher.update(toBuffer(data)), cipher.final()])
      return bufTo(enc, encoding)
    },
    aesDecrypt(data, mode, key, iv, encoding = 'utf8') {
      const decipher = crypto.createDecipheriv(`aes-${key.length * 8}-${String(mode || 'cbc').toLowerCase()}`, toBuffer(key), toBuffer(iv || ''))
      const dec = Buffer.concat([decipher.update(toBuffer(data, 'base64')), decipher.final()])
      return bufTo(dec, encoding)
    },
    md5(str) {
      return crypto.createHash('md5').update(String(str ?? ''), 'utf8').digest('hex')
    },
    randomBytes(size) {
      return crypto.randomBytes(size)
    },
    RSA(data, key, options = {}) {
      const padding = options.padding === 'RSA_NO_PADDING'
        ? crypto.constants.RSA_NO_PADDING
        : crypto.constants.RSA_PKCS1_PADDING
      return crypto.publicEncrypt({ key, padding }, toBuffer(data)).toString(options.encoding || 'base64')
    },
    rsaEncrypt(data, key, options = {}) {
      return this.RSA(data, key, options)
    },
    /** 澜音文档中的 PKCS1 加密（公钥 PEM / 原始公钥字符串） */
    PKCS1Encrypt(str, key) {
      let pem = String(key || '')
      if (!pem.includes('BEGIN')) {
        pem = `-----BEGIN PUBLIC KEY-----\n${pem}\n-----END PUBLIC KEY-----`
      }
      try {
        return crypto.publicEncrypt(
          { key: pem, padding: crypto.constants.RSA_PKCS1_PADDING },
          Buffer.from(String(str ?? ''), 'utf8'),
        ).toString('base64')
      } catch (e) {
        throw new Error(`PKCS1Encrypt 失败: ${e?.message || e}`)
      }
    },
  }
}

function createCeruBuffer() {
  return {
    from(...args) {
      return Buffer.from(...args)
    },
    bufToString(buf, encoding = 'utf8') {
      return Buffer.isBuffer(buf) ? buf.toString(encoding) : Buffer.from(buf).toString(encoding)
    },
    gzip(data) {
      return zlib.gzipSync(toBuffer(data))
    },
    gunzip(data) {
      return zlib.gunzipSync(toBuffer(data))
    },
  }
}

function createCeruRequest() {
  return (url, options = {}, callback) => {
    const method = String(options.method || 'get').toLowerCase()
    const opts = {
      headers: options.headers || {},
      follow_max: 5,
      timeout: options.timeout || 15000,
      json: options.json !== false,
    }
    if (options.body != null) opts.body = options.body
    else if (options.form != null) {
      opts.form = options.form
      opts.json = false
    }

    const run = () => new Promise((resolve, reject) => {
      needle.request(method, url, opts.body ?? opts.form ?? null, opts, (err, resp) => {
        if (err) return reject(err)
        resolve({
          body: resp.body,
          statusCode: resp.statusCode,
          headers: resp.headers || {},
        })
      })
    })

    if (typeof callback === 'function') {
      run().then((r) => callback(null, r, r.body)).catch((e) => callback(e))
      return
    }
    return run()
  }
}

/** 通知中心：服务端无 UI，仅记录日志，避免脚本报错 */
function createNoticeCenter() {
  return {
    send(title, content) {
      console.log(`[CeruNotice] ${title || ''}: ${content || ''}`)
    },
  }
}

export function createCerumusicApi() {
  return {
    request: createCeruRequest(),
    utils: {
      crypto: createCeruCrypto(),
      buffer: createCeruBuffer(),
    },
    NoticeCenter: createNoticeCenter(),
  }
}

export function isCeruNativePlugin(exported) {
  if (!exported || typeof exported !== 'object') return false
  if (typeof exported.musicUrl !== 'function') return false
  if (!exported.sources || typeof exported.sources !== 'object') return false
  return Object.keys(exported.sources).length > 0
}

/** 将澜音 sources 补全为落雪兼容结构（默认 actions） */
export function normalizeCeruSources(exported) {
  const raw = exported?.sources || {}
  const hasLyric = typeof exported.getLyric === 'function'
  const hasPic = typeof exported.getPic === 'function'
  const out = {}
  for (const [id, conf] of Object.entries(raw)) {
    if (!conf || typeof conf !== 'object') continue
    const qualitys = Array.isArray(conf.qualitys) ? conf.qualitys : ['128k']
    let actions = Array.isArray(conf.actions) ? [...conf.actions] : []
    if (!actions.length) {
      actions = ['musicUrl']
      if (hasLyric) actions.push('lyric')
      if (hasPic) actions.push('pic')
    }
    out[id] = {
      name: conf.name || id,
      type: conf.type || 'music',
      actions,
      qualitys,
    }
  }
  return out
}

/** 补齐澜音脚本期望的 musicInfo.id */
export function enrichCeruMusicInfo(musicInfo = {}) {
  const info = { ...musicInfo }
  if (info.id == null || info.id === '') {
    info.id = info.songmid || info.hash || info.songId || info.copyrightId || info.strMediaMid || ''
  }
  if (info.songmid == null && info.id) info.songmid = info.id
  return info
}

/**
 * 将澜音导出方法包装为落雪 handler({ source, action, info })
 */
export function createCeruHandler(exported) {
  return async ({ source, action, info = {} }) => {
    const musicInfo = enrichCeruMusicInfo(info.musicInfo || info)
    const quality = info.type || info.quality || '128k'

    if (action === 'musicUrl') {
      if (typeof exported.musicUrl !== 'function') throw new Error('该音源不支持获取播放链接')
      return exported.musicUrl(source, musicInfo, quality)
    }
    if (action === 'lyric') {
      if (typeof exported.getLyric !== 'function') throw new Error('该音源不支持获取歌词')
      const lyric = await exported.getLyric(source, musicInfo)
      if (lyric == null) return null
      if (typeof lyric === 'string') return { lyric }
      return lyric
    }
    if (action === 'pic') {
      if (typeof exported.getPic !== 'function') throw new Error('该音源不支持获取封面')
      return exported.getPic(source, musicInfo)
    }
    throw new Error(`不支持的操作: ${action}`)
  }
}
