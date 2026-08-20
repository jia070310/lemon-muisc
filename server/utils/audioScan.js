import fs from 'fs'
import path from 'path'

export const AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.ape', '.ogg', '.m4a', '.aac', '.wma']

/**
 * 快速递归列出音频文件（迭代扫描，避免深层目录栈溢出）
 * 参照 music-tag 的 scandir 思路：先列出文件，元数据稍后按需读取
 */
export function listAudioFiles(rootDir, { maxDepth = Infinity, maxFiles = 50000 } = {}) {
  const files = []
  const stack = [{ dir: rootDir, depth: 0 }]

  while (stack.length && files.length < maxFiles) {
    const { dir, depth } = stack.pop()
    if (depth > maxDepth) continue

    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push({ dir: fullPath, depth: depth + 1 })
      } else if (entry.isFile() && AUDIO_EXTS.includes(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath)
        if (files.length >= maxFiles) return files
      }
    }
  }

  files.sort((a, b) => a.localeCompare(b, 'zh-CN'))
  return files
}
