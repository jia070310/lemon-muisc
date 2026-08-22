import crypto from 'crypto'
import zlib from 'zlib'
import querystring from 'querystring'
import * as url from 'url'

/**
 * 对齐 LX Music 桌面版 custom-source 的 utils 实现
 * @see https://lxmusic.toside.cn/desktop/custom-source
 */
export function createLxUtils() {
  return {
    crypto: {
      aesEncrypt(buffer, mode, key, iv) {
        const data = toBuffer(buffer)
        const keyBuf = toBuffer(key)
        const modeStr = String(mode || '')
        let ivBuf = iv
        if (iv == null || iv === '') {
          ivBuf = /ecb/i.test(modeStr) ? null : Buffer.alloc(0)
        } else {
          ivBuf = toBuffer(iv)
        }
        const cipher = crypto.createCipheriv(modeStr, keyBuf, ivBuf)
        return Buffer.concat([cipher.update(data), cipher.final()])
      },
      rsaEncrypt(buffer, key) {
        let data = toBuffer(buffer)
        if (data.length < 128) {
          data = Buffer.concat([Buffer.alloc(128 - data.length), data])
        }
        return crypto.publicEncrypt(
          { key, padding: crypto.constants.RSA_NO_PADDING },
          data,
        )
      },
      randomBytes(size) {
        return crypto.randomBytes(size)
      },
      md5(str) {
        return crypto.createHash('md5').update(String(str)).digest('hex')
      },
    },
    buffer: {
      from(...args) {
        return Buffer.from(...args)
      },
      concat(...args) {
        return Buffer.concat(...args)
      },
      bufToString(buf, format) {
        return Buffer.from(buf, 'binary').toString(format)
      },
    },
    zlib: {
      inflate(buf) {
        return new Promise((resolve, reject) => {
          zlib.inflate(buf, (err, data) => {
            if (err) reject(new Error(err.message))
            else resolve(data)
          })
        })
      },
      deflate(data) {
        return new Promise((resolve, reject) => {
          zlib.deflate(data, (err, buf) => {
            if (err) reject(new Error(err.message))
            else resolve(buf)
          })
        })
      },
    },
  }
}

/** 音源脚本常用的受限 require，避免完全裸奔 Node */
export function createSandboxRequire() {
  const modules = {
    crypto,
    zlib,
    buffer: { Buffer },
    querystring,
    url,
  }

  return function require(name) {
    const key = String(name || '').replace(/^node:/, '')
    if (Object.prototype.hasOwnProperty.call(modules, key)) return modules[key]
    throw new Error(`Cannot find module '${name}'`)
  }
}

function toBuffer(input) {
  if (Buffer.isBuffer(input)) return input
  if (input instanceof ArrayBuffer) return Buffer.from(input)
  if (ArrayBuffer.isView(input)) return Buffer.from(input.buffer, input.byteOffset, input.byteLength)
  if (typeof input === 'string') return Buffer.from(input)
  return Buffer.from(String(input ?? ''))
}
