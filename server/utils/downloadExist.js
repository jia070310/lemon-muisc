import fs from 'fs'
import path from 'path'
import { readMetaLite } from '../meta.js'
import { qualityLabel, qualityRank } from './downloadQuality.js'
import { resolveDownloadGroupDir } from './downloadPath.js'
import { getDownloadSavePath, getUserAccessibleRoots } from './filePaths.js'
import { findIndexedExistingForDownload, normalizeAudioFileBaseKey } from './libraryCache.js'
import { parseFilename } from './filenameParse.js'

export const EXIST_AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.ape', '.ogg', '.m4a', '.aac', '.wma', '.opus', '.dsf', '.dff']

/**
 * 同名文件策略：ask=询问 / skip=自动跳过 / overwrite=直接覆盖
 * 兼容旧设置 download.skipExistFile
 */
export function resolveExistFileMode(settings = {}) {
  const mode = String(settings['download.existFileMode'] || '').trim()
  if (mode === 'ask' || mode === 'skip' || mode === 'overwrite') return mode
  if (settings['download.skipExistFile'] === 'false') return 'overwrite'
  // 旧默认「跳过」升级为「询问」，避免静默跳过且看不到本地音质
  return 'ask'
}

export function resolveTaskBaseName(task, settings = {}) {
  const template = settings['download.fileName'] || '{name} - {singer}'
  let albumArtist = ''
  try {
    const meta = typeof task?.meta === 'string' ? JSON.parse(task.meta || '{}') : (task?.meta || {})
    albumArtist = String(meta.albumArtist || '').trim()
  } catch { /* ignore */ }
  const singer = String(task?.singer || albumArtist || '').trim()
  return sanitizeFileBase(template
    .replace(/\{name\}/g, task.name || 'Unknown')
    .replace(/\{singer\}/g, singer || 'Unknown')
    .replace(/\{album\}/g, task.album || ''))
}

function sanitizeFileBase(name) {
  return String(name || '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'untitled'
}

/**
 * 是否视为同一首歌的主文件名（忽略网盘/系统同名副本后缀）
 * 例：歌名、歌名(1)、歌名 (1)、歌名（1）
 */
export function isSameAudioBaseName(entryBase, canonicalBase) {
  const entry = normalizeAudioFileBaseKey(entryBase)
  const canonical = normalizeAudioFileBaseKey(canonicalBase)
  if (!entry || !canonical) return false
  if (entry === canonical) return true
  // 歌名-歌手 vs 歌手-歌名
  const flip = (s) => {
    const parts = s.split(/\s*[-–—_]\s*/)
    if (parts.length < 2) return ''
    return `${parts.slice(1).join(' - ')} - ${parts[0]}`
  }
  if (flip(entry) === canonical || flip(canonical) === entry) return true
  return false
}

function entryMatchesDownloadTask(nameOnly, task, baseName) {
  if (isSameAudioBaseName(nameOnly, baseName)) return true
  const title = String(task?.name || '').trim().toLowerCase()
  const artist = String(task?.singer || '').trim().toLowerCase().split(/[/／,，&＆+、]/)[0] || ''
  if (!title || !artist) return false
  const parsed = parseFilename(`${nameOnly}.flac`)
  const pt = String(parsed?.title || '').trim().toLowerCase()
  const pa = String(parsed?.artist || '').trim().toLowerCase()
  if (pt === title && (pa === artist || pa.includes(artist) || artist.includes(pa))) return true
  // 文件名里同时出现歌名与歌手即可
  const low = String(nameOnly || '').toLowerCase()
  return low.includes(title) && low.includes(artist)
}

/**
 * 查找本地已有「同一首歌」的音频。
 * 1) 读 library_index（全库+下载，不整盘扫）：多文件名候选 + 歌名/歌手身份
 * 2) 兜底扫本次目标分组目录一层（尚未入库的文件）
 */
export function findExistingSameNameFiles(task, settings = {}) {
  const baseName = resolveTaskBaseName(task, settings)
  if (!baseName && !String(task?.name || '').trim()) return []

  const found = []
  const seen = new Set()
  const pushIfFile = (fullPath) => {
    if (!fullPath || seen.has(fullPath)) return
    try {
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        seen.add(fullPath)
        found.push(fullPath)
      }
    } catch {}
  }

  // 1) 索引：覆盖多级专辑目录中的 `06. 歌手 - 歌名` 等命名
  try {
    const userId = task?.user_id || null
    const roots = getUserAccessibleRoots(userId)
    for (const fp of findIndexedExistingForDownload(task, { baseName, userId, roots })) {
      pushIfFile(fp)
    }
  } catch { /* 索引不可用时仍走目录兜底 */ }

  // 2) 分组目录一层兜底
  const savePath = settings.__savePath || getDownloadSavePath(task?.user_id || null)
  const groupDir = resolveDownloadGroupDir(savePath, settings, task)
  if (groupDir && fs.existsSync(groupDir)) {
    for (const ext of EXIST_AUDIO_EXTS) {
      pushIfFile(path.join(groupDir, baseName + ext))
    }
    let entries = []
    try {
      entries = fs.readdirSync(groupDir)
    } catch {
      entries = []
    }
    for (const entry of entries) {
      if (entry.endsWith('.part') || entry.toLowerCase().endsWith('.lrc')) continue
      const ext = path.extname(entry).toLowerCase()
      if (!EXIST_AUDIO_EXTS.includes(ext)) continue
      const nameOnly = entry.slice(0, -ext.length)
      if (!entryMatchesDownloadTask(nameOnly, task, baseName)) continue
      pushIfFile(path.join(groupDir, entry))
    }
  }

  return found
}

/**
 * 根据容器/码率/采样率推断本地音质档位与展示文案
 */
export function inferQualityFromAudioMeta(meta = {}, filePath = '') {
  const ext = String(meta.format || path.extname(filePath) || '')
    .toLowerCase()
    .replace(/^\./, '')
  const brRaw = Number(meta.bitrate) || 0
  const kbps = brRaw >= 1000 ? Math.round(brRaw / 1000) : Math.round(brRaw)
  const sr = Number(meta.sampleRate) || 0
  const bits = Number(meta.bitsPerSample) || 0

  if (ext === 'flac' || ext.includes('flac')) {
    if (sr >= 96000 || (bits >= 24 && sr >= 48000)) {
      const detail = [sr ? `${(sr / 1000).toFixed(sr % 1000 ? 1 : 0)}kHz` : '', bits ? `${bits}bit` : ''].filter(Boolean).join('/')
      return { quality: 'hires', label: detail ? `Hi-Res (${detail})` : 'Hi-Res' }
    }
    if (bits >= 24 || sr >= 88200) {
      return { quality: 'flac24bit', label: 'FLAC 24bit' }
    }
    return { quality: 'flac', label: 'FLAC' }
  }

  if (ext === 'wav' || ext === 'aiff' || ext === 'ape') {
    const detail = [sr ? `${Math.round(sr / 1000)}kHz` : '', bits ? `${bits}bit` : ''].filter(Boolean).join('/')
    return { quality: 'hires', label: detail ? `${ext.toUpperCase()} (${detail})` : ext.toUpperCase() }
  }

  if (ext === 'm4a' || ext === 'aac' || ext === 'mp4') {
    if (kbps >= 700) return { quality: 'atmos', label: `杜比/AAC ~${kbps}kbps` }
    if (kbps >= 280) return { quality: '320k', label: `AAC ~${kbps}kbps` }
    if (kbps > 0) return { quality: '128k', label: `AAC ~${kbps}kbps` }
    return { quality: '', label: 'AAC/M4A' }
  }

  if (ext === 'ogg' || ext === 'opus') {
    if (kbps >= 280) return { quality: '320k', label: `${ext.toUpperCase()} ~${kbps}kbps` }
    if (kbps > 0) return { quality: '128k', label: `${ext.toUpperCase()} ~${kbps}kbps` }
    return { quality: '', label: ext.toUpperCase() }
  }

  // mp3 / 其它有损
  if (kbps >= 280) return { quality: '320k', label: `320K (${kbps}kbps)` }
  if (kbps >= 190) return { quality: '192k', label: `${kbps}kbps` }
  if (kbps >= 140) return { quality: '128k', label: `${kbps}kbps` }
  if (kbps > 0) return { quality: '128k', label: `${kbps}kbps` }
  return { quality: '', label: ext ? ext.toUpperCase() : '未知音质' }
}

export async function probeLocalFileQuality(filePath) {
  const empty = {
    filePath,
    fileName: path.basename(filePath || ''),
    quality: '',
    label: '未知音质',
    bitrate: 0,
    sampleRate: 0,
    format: '',
    size: 0,
  }
  if (!filePath) return empty
  try {
    const st = fs.statSync(filePath)
    empty.size = st.size || 0
  } catch {
    return empty
  }

  try {
    const meta = await readMetaLite(filePath)
    const inferred = inferQualityFromAudioMeta(meta, filePath)
    return {
      filePath,
      fileName: path.basename(filePath),
      quality: inferred.quality,
      label: inferred.label || qualityLabel(inferred.quality) || '未知音质',
      bitrate: meta.bitrate || 0,
      sampleRate: meta.sampleRate || 0,
      format: meta.format || path.extname(filePath).slice(1),
      size: empty.size,
    }
  } catch {
    const ext = path.extname(filePath).slice(1).toUpperCase()
    return { ...empty, label: ext || '未知音质', format: ext.toLowerCase() }
  }
}

/** 多文件同名时选「音质更好 / 体积更大」的作为代表展示 */
export async function pickBestExistingFile(filePaths = []) {
  if (!filePaths.length) return null
  const probed = []
  for (const fp of filePaths) {
    probed.push(await probeLocalFileQuality(fp))
  }
  probed.sort((a, b) => {
    const ra = qualityRank(a.quality)
    const rb = qualityRank(b.quality)
    if (ra !== rb) return ra - rb
    return (b.size || 0) - (a.size || 0)
  })
  return { best: probed[0], all: probed }
}

export function buildExistFileOffer({
  task,
  requestedQuality,
  best,
  all = [],
} = {}) {
  const want = String(requestedQuality || task?.quality || '320k')
  const localQ = best?.quality || ''
  const localBetterOrEqual = localQ
    ? qualityRank(localQ) <= qualityRank(want)
    : false
  return {
    filePath: best?.filePath || '',
    fileName: best?.fileName || '',
    localQuality: localQ,
    localLabel: best?.label || '未知音质',
    requestedQuality: want,
    requestedLabel: qualityLabel(want) || want,
    localBetterOrEqual,
    fileCount: all.length || (best ? 1 : 0),
    files: (all.length ? all : best ? [best] : []).map((f) => ({
      filePath: f.filePath,
      fileName: f.fileName,
      label: f.label,
      quality: f.quality,
      size: f.size,
    })),
    at: new Date().toISOString(),
  }
}
