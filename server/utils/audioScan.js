import fs from 'fs'
import path from 'path'
import { isUnderAppCachePath } from './appPaths.js'

export const AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.ape', '.ogg', '.m4a', '.aac', '.wma', '.dsf', '.dff']

/** 目录名命中则跳过（应用半成品 / NAS 垃圾目录；真实路径另用 isUnderAppCachePath） */
const SKIP_DIR_NAMES = new Set([
  'cover-cache',
  'discover-feed-cache',
  'download-staging',
  '柠檬音乐更新',
  'fpk-updates',
  'lemon-smooth-play-cache',
  'lemon-ape-play-cache',
  'lemon-dlna-mp3-cache',
  '.git',
  'node_modules',
  '@eaDir',
  '#recycle',
  '$RECYCLE.BIN',
  'System Volume Information',
])

export function isAudioName(name) {
  return AUDIO_EXTS.includes(path.extname(name).toLowerCase())
}

function isTransientOrCacheName(name) {
  const n = String(name || '')
  if (!n) return true
  // 下载/转码半成品；隐藏文件一般不是曲库音频
  if (n.endsWith('.part') || n.endsWith('.partial')) return true
  if (n.startsWith('.')) return true
  return false
}

function shouldSkipDirectory(name, fullPath) {
  if (SKIP_DIR_NAMES.has(name)) return true
  try {
    if (isUnderAppCachePath(fullPath)) return true
  } catch {}
  return false
}

function entryLooksLikeFile(entry, fullPath) {
  if (entry.isFile()) return true
  // 符号链接 / 部分 NAS 挂载点上 isFile() 可能为 false，改用 stat 判定
  if (entry.isSymbolicLink() || entry.isDirectory() === false) {
    try {
      return fs.statSync(fullPath).isFile()
    } catch {
      return false
    }
  }
  return false
}

/**
 * 快速递归列出音频文件（迭代扫描，避免深层目录栈溢出）
 */
export function listAudioFiles(rootDir, { maxDepth = Infinity, maxFiles = 50000 } = {}) {
  const files = []
  const errors = []
  if (!rootDir) {
    listAudioFiles.lastErrors = errors
    return files
  }
  try {
    if (isUnderAppCachePath(rootDir)) {
      listAudioFiles.lastErrors = errors
      return files
    }
  } catch {}

  const stack = [{ dir: rootDir, depth: 0 }]

  while (stack.length && files.length < maxFiles) {
    const { dir, depth } = stack.pop()
    if (depth > maxDepth) continue

    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (e) {
      errors.push({ dir, error: e.message })
      continue
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        if (!shouldSkipDirectory(entry.name, fullPath)) {
          stack.push({ dir: fullPath, depth: depth + 1 })
        }
        continue
      }
      if (entry.isSymbolicLink()) {
        try {
          const st = fs.statSync(fullPath)
          if (st.isDirectory()) {
            if (!shouldSkipDirectory(entry.name, fullPath)) {
              stack.push({ dir: fullPath, depth: depth + 1 })
            }
            continue
          }
          if (st.isFile() && isAudioName(entry.name) && !isTransientOrCacheName(entry.name)) {
            files.push(fullPath)
            if (files.length >= maxFiles) return files
          }
        } catch (e) {
          errors.push({ dir: fullPath, error: e.message })
        }
        continue
      }
      if (
        entryLooksLikeFile(entry, fullPath) &&
        isAudioName(entry.name) &&
        !isTransientOrCacheName(entry.name)
      ) {
        files.push(fullPath)
        if (files.length >= maxFiles) return files
      }
    }
  }

  files.sort((a, b) => a.localeCompare(b, 'zh-CN'))
  listAudioFiles.lastErrors = errors
  return files
}

listAudioFiles.lastErrors = []

/**
 * 列出目录下一层内容（不递归），用于标签编辑目录树
 */
export function listDirEntries(dirPath) {
  const dirs = []
  const audioFiles = []
  let error = ''

  if (!dirPath) {
    return { dirs, audioFiles, error: '路径为空' }
  }

  let entries
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch (e) {
    return { dirs, audioFiles, error: e.message }
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      if (!shouldSkipDirectory(entry.name, fullPath)) {
        dirs.push({ name: entry.name, path: fullPath })
      }
      continue
    }
    if (entry.isSymbolicLink()) {
      try {
        const st = fs.statSync(fullPath)
        if (st.isDirectory()) {
          if (!shouldSkipDirectory(entry.name, fullPath)) {
            dirs.push({ name: entry.name, path: fullPath })
          }
          continue
        }
        if (st.isFile() && isAudioName(entry.name) && !isTransientOrCacheName(entry.name)) {
          audioFiles.push(fullPath)
        }
      } catch (e) {
        error = error || e.message
      }
      continue
    }
    if (
      entryLooksLikeFile(entry, fullPath) &&
      isAudioName(entry.name) &&
      !isTransientOrCacheName(entry.name)
    ) {
      audioFiles.push(fullPath)
    }
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  audioFiles.sort((a, b) => a.localeCompare(b, 'zh-CN'))
  return { dirs, audioFiles, error }
}

/** 探测目录是否真的可读、是否有内容（用于区分「挂载失败」和「没有音频」） */
export function probeDir(dirPath) {
  const result = {
    path: dirPath,
    exists: false,
    readable: false,
    isDirectory: false,
    entryCount: 0,
    audioCount: 0,
    sampleNames: [],
    error: '',
  }

  if (!dirPath) {
    result.error = '路径为空'
    return result
  }

  try {
    const st = fs.statSync(dirPath)
    result.exists = true
    result.isDirectory = st.isDirectory()
    if (!st.isDirectory()) {
      result.error = '不是目录'
      return result
    }
  } catch (e) {
    result.error = e.message
    return result
  }

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    result.readable = true
    result.entryCount = entries.length
    result.sampleNames = entries.slice(0, 8).map((e) => e.name + (e.isDirectory() ? '/' : ''))
    const listed = listDirEntries(dirPath)
    result.audioCount = listed.audioFiles.length
  } catch (e) {
    result.error = e.message
  }

  return result
}
