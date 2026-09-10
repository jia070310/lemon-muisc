import { ref, computed } from 'vue'
import { api } from '../api.js'
import { refreshPlayingLocalMeta } from './player.js'
import { updateLibraryTracksFromFiles } from './library.js'

/** 默认并行路数；实际以设置「标签匹配并发」为准 */
export const TAG_MATCH_CONCURRENCY_DEFAULT = 3
export const TAG_MATCH_CONCURRENCY_MIN = 1
export const TAG_MATCH_CONCURRENCY_MAX = 6

export function normalizeTagMatchConcurrency(value) {
  const n = parseInt(value, 10)
  if (!Number.isFinite(n)) return TAG_MATCH_CONCURRENCY_DEFAULT
  return Math.min(TAG_MATCH_CONCURRENCY_MAX, Math.max(TAG_MATCH_CONCURRENCY_MIN, n))
}

/** @deprecated 兼容旧引用，请用 normalizeTagMatchConcurrency / 设置项 */
export const TAG_MATCH_CONCURRENCY = TAG_MATCH_CONCURRENCY_DEFAULT

export const tagMatchRunning = ref(false)
export const tagMatchPaused = ref(false)
export const tagMatchProgress = ref({ done: 0, total: 0, current: '' })
/** @type {import('vue').Ref<Record<string, object>>} */
export const tagMatchPatches = ref({})
export const tagMatchPatchVersion = ref(0)
/** @type {import('vue').Ref<{ text: string, type: string } | null>} */
export const tagMatchResult = ref(null)

let tagMatchStopRequested = false

/** 离开标签页时保留列表状态，便于匹配进行中返回查看 */
export const tagEditorSession = ref({ mode: 'dir', activeDir: '', activeArtist: '', files: [] })

export function saveTagEditorSession({ mode = 'dir', activeDir = '', activeArtist = '', files = [] } = {}) {
  tagEditorSession.value = {
    mode: mode === 'artist' ? 'artist' : 'dir',
    activeDir: activeDir || '',
    activeArtist: activeArtist || '',
    files: Array.isArray(files) ? files : [],
  }
}

export function clearTagEditorSession() {
  tagEditorSession.value = { mode: 'dir', activeDir: '', activeArtist: '', files: [] }
}

export const tagMatchPercent = computed(() => {
  const { done, total } = tagMatchProgress.value
  if (!total) return 0
  return Math.min(100, Math.round((done / total) * 100))
})

export function pauseTagMatch() {
  if (!tagMatchRunning.value) return
  tagMatchPaused.value = true
}

export function resumeTagMatch() {
  tagMatchPaused.value = false
}

export function stopTagMatch() {
  if (!tagMatchRunning.value) return
  tagMatchStopRequested = true
  tagMatchPaused.value = false
}

export function applyMatchMetaToFile(file, meta) {
  if (!file || !meta) return
  if (meta.title) file.title = meta.title
  if (meta.artist) file.artist = meta.artist
  if (meta.album) file.album = meta.album
  if (meta.year) file.year = meta.year
  if (meta.genre) file.genre = meta.genre
  if (meta.comment) file.comment = meta.comment
  if (meta.lyric) file.lyric = meta.lyric
  if (meta.pic) file.pictureBase64 = meta.pic
  if (meta.picUrl) file.picUrl = meta.picUrl
  file.hasPicture = Boolean(file.pictureBase64 || file.picUrl)
  file.hasLyrics = Boolean(file.lyric)
  file._modified = meta._savedToDisk ? false : true
}

export function syncFilesFromMatchPatches(files) {
  if (!Array.isArray(files) || !files.length) return
  const patches = tagMatchPatches.value
  for (const file of files) {
    const patch = patches[file.filePath]
    if (patch) applyMatchMetaToFile(file, patch)
  }
}

function rememberPatch(filePath, meta) {
  // 先原地写入再替换引用，避免并行完成时互相覆盖丢失 patch
  tagMatchPatches.value[filePath] = { ...meta }
  tagMatchPatches.value = { ...tagMatchPatches.value }
  tagMatchPatchVersion.value += 1
}

export function clearTagMatchResult() {
  tagMatchResult.value = null
}

function buildWriteMeta(meta) {
  return {
    title: meta.title,
    artist: meta.artist,
    album: meta.album,
    year: meta.year,
    genre: meta.genre,
    comment: meta.comment,
    lyric: meta.lyric,
    pic: meta.pic || meta.pictureBase64 || undefined,
    picUrl: meta.picUrl || undefined,
  }
}

async function saveMatchMetaToDisk(filePath, meta) {
  const res = await api.tag.writeBatch([{ filePath, meta: buildWriteMeta(meta) }])
  const row = (res.data || []).find(r => r.filePath === filePath) || (res.data || [])[0]
  return Boolean(row?.ok)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** @returns {Promise<boolean>} true = 应停止 */
async function waitWhilePausedOrStop() {
  while (tagMatchPaused.value && !tagMatchStopRequested) {
    await sleep(120)
  }
  return tagMatchStopRequested
}

async function mapWithConcurrency(items, limit, mapper) {
  if (!items.length) return
  const concurrency = Math.max(1, Math.min(limit, items.length))
  let next = 0
  async function worker() {
    while (true) {
      if (await waitWhilePausedOrStop()) return
      const index = next++
      if (index >= items.length) return
      if (tagMatchStopRequested) return
      await mapper(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
}

/**
 * 后台批量自动匹配（有限并发；切换页面不中断；支持暂停 / 停止）
 * @returns {Promise<{ ok: boolean, reason?: string, stopped?: boolean }>}
 */
export async function startTagMatchBatch(targets, source) {
  if (!targets?.length) return { ok: false, reason: 'empty' }
  if (tagMatchRunning.value) return { ok: false, reason: 'busy' }

  let concurrency = TAG_MATCH_CONCURRENCY_DEFAULT
  try {
    const s = await api.settings.get()
    concurrency = normalizeTagMatchConcurrency(s['tag.matchConcurrency'])
  } catch {}

  const workers = Math.min(concurrency, targets.length)
  tagMatchStopRequested = false
  tagMatchPaused.value = false
  tagMatchRunning.value = true
  tagMatchResult.value = null
  tagMatchProgress.value = {
    done: 0,
    total: targets.length,
    current: `并行 ${workers} 路…`,
  }

  let ok = 0
  let fail = 0
  let saved = 0
  let saveFail = 0
  let withCover = 0
  let withLyric = 0
  let done = 0
  const savedLibraryFiles = []

  try {
    await mapWithConcurrency(targets, concurrency, async (sel) => {
      tagMatchProgress.value = {
        ...tagMatchProgress.value,
        current: sel.fileName || '',
      }

      try {
        const res = await api.tag.matchBatch(
          [{ filePath: sel.filePath, fileName: sel.fileName }],
          source,
        )
        const item = (res.data || [])[0]
        if (item?.ok && item.meta) {
          const meta = { ...item.meta }
          if (meta.pic) meta.pictureBase64 = meta.pic
          const filePath = item.filePath || sel.filePath
          let savedToDisk = false
          try {
            savedToDisk = await saveMatchMetaToDisk(filePath, meta)
          } catch {
            savedToDisk = false
          }
          rememberPatch(filePath, { ...meta, _savedToDisk: savedToDisk })
          if (savedToDisk) {
            saved++
            savedLibraryFiles.push({
              filePath,
              fileName: sel.fileName,
              title: meta.title,
              artist: meta.artist,
              album: meta.album,
              year: meta.year,
              genre: meta.genre,
              comment: meta.comment,
              lyric: meta.lyric,
              pictureBase64: meta.pic || meta.pictureBase64,
              picUrl: meta.picUrl,
              hasPicture: Boolean(meta.pic || meta.picUrl || meta.pictureBase64),
              hasLyrics: Boolean(meta.lyric),
            })
            await refreshPlayingLocalMeta(filePath, {
              ...meta,
              pictureBase64: meta.pic || meta.pictureBase64,
              hasPicture: Boolean(meta.pic || meta.picUrl || meta.pictureBase64),
              hasLyrics: Boolean(meta.lyric),
            })
          } else saveFail++
          if (meta.pic || meta.picUrl) withCover++
          if (meta.lyric) withLyric++
          ok++
        } else {
          fail++
        }
      } catch {
        fail++
      }

      done += 1
      tagMatchProgress.value = {
        done,
        total: targets.length,
        current: sel.fileName || '',
      }
    })

    if (savedLibraryFiles.length) updateLibraryTracksFromFiles(savedLibraryFiles)

    const stopped = tagMatchStopRequested
    let text = ''
    let type = 'info'
    if (stopped) {
      const parts = [`已停止（${done}/${targets.length}）`]
      if (ok) parts.push(`匹配 ${ok}`)
      if (saved) parts.push(`已保存 ${saved}`)
      if (fail) parts.push(`失败 ${fail}`)
      text = parts.join('，')
      type = 'info'
    } else if (ok && !fail && !saveFail) {
      text = `自动匹配并保存 ${saved} 个文件（封面 ${withCover}，歌词 ${withLyric}，并行 ${workers} 路）`
      type = 'success'
    } else if (ok) {
      const parts = [`匹配 ${ok}`]
      if (saved) parts.push(`已保存 ${saved}`)
      if (fail) parts.push(`匹配失败 ${fail}`)
      if (saveFail) parts.push(`保存失败 ${saveFail}`)
      parts.push(`封面 ${withCover}，歌词 ${withLyric}`)
      text = `自动匹配完成：${parts.join('，')}`
      type = saveFail ? 'info' : 'success'
    } else {
      text = '自动匹配未找到可用结果，可改用「网络获取信息」手动选择'
      type = 'error'
    }
    tagMatchResult.value = { text, type }
    return { ok: true, stopped }
  } catch (e) {
    tagMatchResult.value = { text: e.message || '自动匹配失败', type: 'error' }
    return { ok: false, reason: 'error' }
  } finally {
    tagMatchRunning.value = false
    tagMatchPaused.value = false
    tagMatchStopRequested = false
    tagMatchProgress.value = { done: 0, total: 0, current: '' }
  }
}
