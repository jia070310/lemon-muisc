import { ref, computed } from 'vue'
import { api } from '../api.js'
import { refreshPlayingLocalMeta } from './player.js'
import { updateLibraryTracksFromFiles } from './library.js'

export const tagMatchRunning = ref(false)
export const tagMatchProgress = ref({ done: 0, total: 0, current: '' })
/** @type {import('vue').Ref<Record<string, object>>} */
export const tagMatchPatches = ref({})
export const tagMatchPatchVersion = ref(0)
/** @type {import('vue').Ref<{ text: string, type: string } | null>} */
export const tagMatchResult = ref(null)

/** 离开标签页时保留列表状态，便于匹配进行中返回查看 */
export const tagEditorSession = ref({ activeDir: '', files: [] })

export function saveTagEditorSession(activeDir, files) {
  tagEditorSession.value = {
    activeDir: activeDir || '',
    files: Array.isArray(files) ? files : [],
  }
}

export function clearTagEditorSession() {
  tagEditorSession.value = { activeDir: '', files: [] }
}

export const tagMatchPercent = computed(() => {
  const { done, total } = tagMatchProgress.value
  if (!total) return 0
  return Math.min(100, Math.round((done / total) * 100))
})

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
  tagMatchPatches.value = {
    ...tagMatchPatches.value,
    [filePath]: { ...meta },
  }
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

/**
 * 后台批量自动匹配（切换页面不中断）
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function startTagMatchBatch(targets, source) {
  if (!targets?.length) return { ok: false, reason: 'empty' }
  if (tagMatchRunning.value) return { ok: false, reason: 'busy' }

  tagMatchRunning.value = true
  tagMatchResult.value = null
  tagMatchProgress.value = { done: 0, total: targets.length, current: '' }

  let ok = 0
  let fail = 0
  let saved = 0
  let saveFail = 0
  let withCover = 0
  let withLyric = 0
  const savedLibraryFiles = []

  try {
    for (let i = 0; i < targets.length; i++) {
      const sel = targets[i]
      tagMatchProgress.value = {
        done: i,
        total: targets.length,
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

      tagMatchProgress.value = {
        done: i + 1,
        total: targets.length,
        current: sel.fileName || '',
      }
    }

    if (savedLibraryFiles.length) updateLibraryTracksFromFiles(savedLibraryFiles)

    let text = ''
    let type = 'info'
    if (ok && !fail && !saveFail) {
      text = `自动匹配并保存 ${saved} 个文件（封面 ${withCover}，歌词 ${withLyric}）`
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
    return { ok: true }
  } catch (e) {
    tagMatchResult.value = { text: e.message || '自动匹配失败', type: 'error' }
    return { ok: false, reason: 'error' }
  } finally {
    tagMatchRunning.value = false
    tagMatchProgress.value = { done: 0, total: 0, current: '' }
  }
}
