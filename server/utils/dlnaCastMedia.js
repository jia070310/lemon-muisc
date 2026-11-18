/**
 * DLNA 投屏短链媒体槽：电视端不擅长带超长 query/ticket 的 URL，
 * 用不可猜测的短 id 映射真实音源/封面。
 */
import { createHash, randomBytes } from 'crypto'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import needle from 'needle'
import { getAppCacheSubdir } from './appPaths.js'
import { assertFfmpegFeatureReady } from './apePlay.js'
import { ensureDlnaPlayMp3 } from './dlnaTranscode.js'

const TTL_MS = 4 * 60 * 60 * 1000
/** @type {Map<string, object>} */
const slots = new Map()

function cacheDir() {
  return getAppCacheSubdir('dlna-cast')
}

function pruneSlots() {
  const now = Date.now()
  for (const [id, slot] of slots) {
    if (now > (slot.expiresAt || 0)) slots.delete(id)
  }
}

export function createDlnaCastSlot(payload = {}) {
  pruneSlots()
  const id = randomBytes(12).toString('hex')
  const slot = {
    id,
    userId: String(payload.userId || ''),
    title: String(payload.title || ''),
    artist: String(payload.artist || ''),
    album: String(payload.album || ''),
    mime: String(payload.mime || 'audio/mpeg'),
    localPath: payload.localPath ? String(payload.localPath) : '',
    remoteUrl: payload.remoteUrl ? String(payload.remoteUrl) : '',
    audioRel: payload.audioRel ? String(payload.audioRel) : '',
    coverUrl: payload.coverUrl ? String(payload.coverUrl) : '',
    // 供实时转码流写 Content-Length / DIDL，避免小米电视一直 00:00
    durationSec: Math.max(0, Number(payload.durationSec) || 0),
    preparedMp3: '',
    expiresAt: Date.now() + TTL_MS,
  }
  slots.set(id, slot)
  return slot
}

export function getDlnaCastSlot(id) {
  pruneSlots()
  const slot = slots.get(String(id || ''))
  if (!slot) return null
  if (Date.now() > slot.expiresAt) {
    slots.delete(String(id || ''))
    return null
  }
  return slot
}

function remoteUrlFromAudioRel(rel) {
  try {
    return new URL(String(rel || ''), 'http://local.invalid').searchParams.get('url') || ''
  } catch {
    return ''
  }
}

export function resolveCastRemoteUrl(slot) {
  if (slot?.remoteUrl) return slot.remoteUrl
  return remoteUrlFromAudioRel(slot?.audioRel)
}

function looksLikeMp3(url, mime = '') {
  const probe = `${url || ''} ${mime || ''}`.toLowerCase()
  return /\.mp3(\?|#|$)/i.test(probe) || /audio\/mpeg|audio\/mp3/.test(probe)
}

function runFfmpeg(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
    let err = ''
    child.stderr?.on('data', (d) => {
      err += d.toString()
      if (err.length > 4000) err = err.slice(-4000)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg 转码失败${err ? `：${err.split('\n').filter(Boolean).slice(-2).join(' ')}` : ''}`))
    })
  })
}

/** 远程音频转本地 MP3 缓存（小米电视对 m4a/aac 常无声） */
export async function ensureCastRemoteMp3(remoteUrl) {
  const url = String(remoteUrl || '').trim()
  if (!url) throw new Error('缺少远程音频地址')
  if (looksLikeMp3(url)) return { filePath: '', passthrough: true, url }

  const key = createHash('sha1').update(url).digest('hex')
  const out = path.join(cacheDir(), `${key}.mp3`)
  if (fs.existsSync(out)) {
    try {
      if (fs.statSync(out).size > 2048) return { filePath: out, passthrough: false, url }
    } catch {}
  }

  const ffmpeg = await assertFfmpegFeatureReady('DLNA 投屏转 MP3')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const tmp = `${out}.partial`
  try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp) } catch {}

  const common = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
    '-i', url,
    '-vn', '-ac', '2', '-ar', '44100', '-b:a', '192k',
  ]
  try {
    await runFfmpeg(ffmpeg, [...common, '-c:a', 'libmp3lame', '-f', 'mp3', tmp])
  } catch {
    await runFfmpeg(ffmpeg, [...common, '-c:a', 'mp3', '-f', 'mp3', tmp])
  }
  fs.renameSync(tmp, out)
  return { filePath: out, passthrough: false, url }
}

/**
 * 快速准备投屏槽：本地可同步转码；远程非 MP3 不阻塞整集转码，
 * 标记 needsLiveTranscode，由拉流时 ffmpeg 实时出 MP3。
 */
export async function prepareDlnaCastAudio(slot) {
  if (!slot) throw new Error('投屏媒体不存在或已过期')
  slot.needsLiveTranscode = false
  if (slot.localPath) {
    const ext = path.extname(slot.localPath).toLowerCase()
    if (ext === '.mp3') {
      slot.preparedMp3 = slot.localPath
      slot.mime = 'audio/mpeg'
      return slot
    }
    const mp3 = await ensureDlnaPlayMp3(slot.localPath)
    slot.preparedMp3 = mp3
    slot.mime = 'audio/mpeg'
    return slot
  }
  const remote = resolveCastRemoteUrl(slot)
  if (!remote) throw new Error('缺少可投送的音频地址')
  slot.remoteUrl = remote
  slot.mime = 'audio/mpeg'
  if (looksLikeMp3(remote, slot.mime)) {
    slot.preparedMp3 = ''
    return slot
  }
  // 已有缓存则直接用
  const key = createHash('sha1').update(remote).digest('hex')
  const cached = path.join(cacheDir(), `${key}.mp3`)
  if (fs.existsSync(cached)) {
    try {
      if (fs.statSync(cached).size > 2048) {
        slot.preparedMp3 = cached
        return slot
      }
    } catch {}
  }
  slot.needsLiveTranscode = true
  slot.preparedMp3 = ''
  // 后台灌缓存，方便后续 Range/重连；不阻塞投送
  ensureCastRemoteMp3(remote)
    .then((prepared) => {
      if (prepared?.filePath && slots.has(slot.id)) {
        slot.preparedMp3 = prepared.filePath
        slot.needsLiveTranscode = false
      }
    })
    .catch(() => {})
  return slot
}

/** 按 CBR 估算 MP3 体积，让电视能显示总时长（实时转码无真实文件大小） */
export function estimateMp3Bytes(durationSec, bitrateKbps = 192) {
  const sec = Math.max(0, Number(durationSec) || 0)
  if (sec < 1) return 0
  return Math.floor(sec * (bitrateKbps * 1000) / 8)
}

/** 实时把远程音频转成 MP3 流（播客 m4a 等） */
export async function openCastLiveMp3(remoteUrl) {
  const url = String(remoteUrl || '').trim()
  if (!url) throw new Error('缺少远程音频地址')
  const ffmpeg = await assertFfmpegFeatureReady('DLNA 投屏转 MP3')
  const child = spawn(ffmpeg, [
    '-hide_banner', '-loglevel', 'error',
    '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
    '-i', url,
    '-vn', '-ac', '2', '-ar', '44100', '-b:a', '192k',
    '-c:a', 'libmp3lame', '-f', 'mp3', 'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  return child
}

export async function fetchCastCoverBuffer(coverUrl) {
  const url = String(coverUrl || '').trim()
  if (!url) return null
  if (/^data:image\//i.test(url)) {
    const m = url.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i)
    if (!m) return null
    return { buf: Buffer.from(m[2], 'base64'), type: m[1] }
  }
  // 本站封面短链 / 外链
  let fetchUrl = url
  if (url.startsWith('/')) return null
  try {
    const res = await needle('get', fetchUrl, {
      parse_response: false,
      timeout: 12000,
      follow_max: 4,
      headers: { 'User-Agent': 'LemonMusic/1.2 DLNA' },
    })
    if ((res.statusCode || 0) >= 400) return null
    const buf = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body || '')
    if (!buf.length || buf.length > 8 * 1024 * 1024) return null
    const type = String(res.headers?.['content-type'] || 'image/jpeg').split(';')[0]
    if (!/^image\//i.test(type)) return null
    return { buf, type }
  } catch {
    return null
  }
}
