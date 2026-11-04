/**
 * 封面磁盘缓存：远程代理图 + 本地内嵌图，避免重复拉 CDN / 反复解文件。
 * 本地封面用「路径稳定键」（不含 mtime），命中时只读 CONFIG 缓存，不碰音乐盘（对齐 Navidrome ImageCache）。
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getAppCacheSubdir } from './appPaths.js'

const MAX_ENTRIES = 800
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MEM_MAX = 64
const memCover = new Map()

function cacheRoot() {
  const base = process.env.CONFIG_PATH || path.join(process.cwd(), 'config')
  return getAppCacheSubdir('cover', {
    legacyPaths: [path.join(base, 'cover-cache')],
  })
}

function hashKey(parts) {
  return crypto.createHash('sha1').update(parts.filter(Boolean).join('\0')).digest('hex')
}

function filePaths(key) {
  const root = cacheRoot()
  const shard = key.slice(0, 2)
  const dir = path.join(root, shard)
  return {
    dir,
    bin: path.join(dir, `${key}.bin`),
    meta: path.join(dir, `${key}.json`),
  }
}

function memGet(key) {
  if (!key || !memCover.has(key)) return null
  const hit = memCover.get(key)
  memCover.delete(key)
  memCover.set(key, hit)
  return hit
}

function memSet(key, value) {
  if (!key || !value?.buffer?.length) return
  if (memCover.has(key)) memCover.delete(key)
  memCover.set(key, value)
  while (memCover.size > MEM_MAX) {
    const oldest = memCover.keys().next().value
    memCover.delete(oldest)
  }
}

function touchAndTrim(key) {
  // 轻量：仅在写入时 trim，按 mtime 删最旧
  try {
    const root = cacheRoot()
    const shards = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())
    let files = []
    for (const s of shards) {
      const dir = path.join(root, s.name)
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith('.bin')) continue
        const bin = path.join(dir, name)
        let mtime = 0
        try { mtime = fs.statSync(bin).mtimeMs } catch { continue }
        files.push({ bin, meta: bin.replace(/\.bin$/, '.json'), mtime })
      }
    }
    if (files.length <= MAX_ENTRIES) return
    files.sort((a, b) => a.mtime - b.mtime)
    const drop = files.length - MAX_ENTRIES
    for (let i = 0; i < drop; i++) {
      try { fs.unlinkSync(files[i].bin) } catch {}
      try { fs.unlinkSync(files[i].meta) } catch {}
    }
  } catch {}
}

export function buildRemoteCoverCacheKey(url, size = 0) {
  return hashKey(['remote', String(url || ''), String(size || 0)])
}

/** 稳定键：同一文件路径复用缓存，打开网页时无需再 stat 音乐文件 */
export function buildLocalCoverCacheKey(filePath, _mtimeMs = 0, size = 0) {
  return hashKey(['local-v2', path.resolve(String(filePath || '')), String(size || 0)])
}

export function getCachedCover(key) {
  if (!key) return null
  const mem = memGet(key)
  if (mem?.buffer?.length) return mem
  const { bin, meta } = filePaths(key)
  try {
    if (!fs.existsSync(bin) || !fs.existsSync(meta)) return null
    const info = JSON.parse(fs.readFileSync(meta, 'utf8'))
    if (info.expiresAt && Date.now() > info.expiresAt) {
      try { fs.unlinkSync(bin) } catch {}
      try { fs.unlinkSync(meta) } catch {}
      return null
    }
    const buffer = fs.readFileSync(bin)
    if (!buffer?.length) return null
    // 刷新 mtime，便于 LRU trim（仅 CONFIG 盘）
    try { fs.utimesSync(bin, new Date(), new Date()) } catch {}
    const hit = { buffer, mime: info.mime || 'image/jpeg' }
    memSet(key, hit)
    return hit
  } catch {
    return null
  }
}

export function setCachedCover(key, buffer, mime = 'image/jpeg', ttlMs = DEFAULT_TTL_MS, extra = {}) {
  if (!key || !buffer?.length) return
  const { dir, bin, meta } = filePaths(key)
  try {
    fs.mkdirSync(dir, { recursive: true })
    const tmp = `${bin}.${process.pid}.tmp`
    fs.writeFileSync(tmp, buffer)
    fs.renameSync(tmp, bin)
    fs.writeFileSync(meta, JSON.stringify({
      mime: mime || 'image/jpeg',
      size: buffer.length,
      expiresAt: Date.now() + ttlMs,
      at: Date.now(),
      ...(extra && typeof extra === 'object' ? extra : {}),
    }))
    memSet(key, { buffer, mime: mime || 'image/jpeg' })
    touchAndTrim(key)
  } catch {}
}
