import fs from 'fs'
import path from 'path'
import { readMetaLite } from '../meta.js'
import { qualityLabel, qualityRank } from './downloadQuality.js'
import { resolveDownloadGroupDir } from './downloadPath.js'
import { getDownloadSavePath } from './filePaths.js'

export const EXIST_AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.ape', '.ogg', '.m4a', '.aac', '.wma', '.opus']

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
  return sanitizeFileBase(template
    .replace(/\{name\}/g, task.name || 'Unknown')
    .replace(/\{singer\}/g, task.singer || 'Unknown')
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
  const entry = String(entryBase || '').trim().toLowerCase()
  const canonical = String(canonicalBase || '').trim().toLowerCase()
  if (!entry || !canonical) return false
  if (entry === canonical) return true
  const stripped = entry
    .replace(/\s*[\(（]\s*\d+\s*[\)）]\s*$/u, '')
    .replace(/\s+[-\u2013]\s*副本\s*\d*$/u, '')
    .replace(/\s+copy(?:\s*\d+)?$/iu, '')
    .trim()
  return stripped === canonical
}

/** 在分组目录下按「主文件名」查找已有音频（忽略扩展名差异，含 name(1) 等副本） */
export function findExistingSameNameFiles(task, settings = {}) {
  const baseName = resolveTaskBaseName(task, settings)
  if (!baseName) return []
  const groupDir = resolveDownloadGroupDir(getDownloadSavePath(), settings, task)
  if (!groupDir || !fs.existsSync(groupDir)) return []

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

  for (const ext of EXIST_AUDIO_EXTS) {
    pushIfFile(path.join(groupDir, baseName + ext))
  }

  let entries = []
  try {
    entries = fs.readdirSync(groupDir)
  } catch {
    return found
  }

  for (const entry of entries) {
    if (entry.endsWith('.part') || entry.toLowerCase().endsWith('.lrc')) continue
    const ext = path.extname(entry).toLowerCase()
    if (!EXIST_AUDIO_EXTS.includes(ext)) continue
    const nameOnly = entry.slice(0, -ext.length)
    if (!isSameAudioBaseName(nameOnly, baseName)) continue
    pushIfFile(path.join(groupDir, entry))
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
