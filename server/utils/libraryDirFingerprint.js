/**
 * 轻量目录签名：只 walk 目录项名字（不 stat 每个音频），
 * 用于后台监测在「无变化」时跳过全量 syncLibraryIndex（参考 Navidrome 按文件夹比对）。
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { isAudioName } from './audioScan.js'

const SKIP_DIR = new Set([
  'node_modules', '.git', '@eaDir', '#recycle', '$recycle.bin',
  'cache', 'download-staging', 'cover-cache', 'discover-feed-cache',
])

function walkListing(root, out, depth = 0) {
  if (depth > 40) return
  let entries
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  // 稳定顺序，避免签名抖动
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const ent of entries) {
    const name = ent.name
    if (!name || name === '.' || name === '..') continue
    if (name.startsWith('.') && name !== '.music') continue
    const full = path.join(root, name)
    if (ent.isDirectory()) {
      if (SKIP_DIR.has(name.toLowerCase())) continue
      out.push(`D:${full}`)
      walkListing(full, out, depth + 1)
      continue
    }
    if (ent.isFile() && isAudioName(name)) {
      out.push(`F:${full}`)
    }
  }
}

/** 返回 hex 签名；目录不可读时返回空串 */
export function computeLibraryListingFingerprint(dirs = []) {
  const lines = []
  for (const dir of (dirs || []).filter(Boolean)) {
    const root = path.resolve(dir)
    lines.push(`R:${root}`)
    if (!fs.existsSync(root)) {
      lines.push('MISSING')
      continue
    }
    walkListing(root, lines)
  }
  if (!lines.length) return ''
  return crypto.createHash('sha1').update(lines.join('\n')).digest('hex')
}
