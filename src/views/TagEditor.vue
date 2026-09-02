<template>
  <div class="tag-page">
    <div class="page-header">
      <div>
        <div class="page-title">标签编辑</div>
        <div class="page-subtitle">批量编辑本地音乐元数据、封面与歌词；「匹配缺失 / 匹配选中」会自动保存到文件</div>
      </div>
      <div class="header-actions">
        <button class="btn-primary btn-sm" @click="saveAll" :disabled="!hasChanges || saving">
          {{ saving ? '保存中...' : '保存全部修改' }}
        </button>
      </div>
    </div>

    <div class="tag-layout">
      <!-- 左侧：目录树（按文件夹逐层浏览） -->
      <aside class="dir-panel card">
        <div class="panel-title">文件目录</div>
        <p class="dir-hint">展开文件夹浏览；点击文件夹仅加载该层音频。路径在「设置 → 文件路径」中管理。</p>
        <div class="dir-tree">
          <template v-for="row in visibleTreeRows" :key="row.path">
            <div
              class="tree-row"
              :class="{ active: activeDir === row.path, loading: row.loading }"
              :style="{ paddingLeft: `${8 + row.depth * 14}px` }"
            >
              <button
                class="tree-toggle"
                :class="{ invisible: row.loaded && !row.hasChildren }"
                :disabled="row.loading"
                @click.stop="toggleTreeNode(row.path)"
                :title="row.expanded ? '收起' : '展开'"
              >
                <span v-if="row.loading" class="tree-spin" />
                <svg
                  v-else
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <polyline v-if="row.expanded" points="6 9 12 15 18 9" />
                  <polyline v-else points="9 18 15 12 9 6" />
                </svg>
              </button>
              <span class="tree-folder" @click="selectFolder(row.path)">
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 7v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
                </svg>
              </span>
              <span class="tree-label" :title="row.path" @click="selectFolder(row.path)">{{ row.name }}</span>
              <span v-if="scanning && activeDir === row.path" class="dir-status">加载中</span>
            </div>
          </template>
          <div v-if="!dirs.length" class="dir-empty">请先在设置中添加文件路径</div>
        </div>
      </aside>

      <!-- 中间：文件列表 -->
      <section class="file-panel card">
        <div class="file-toolbar">
          <ClearableInput
            v-model="filterText"
            variant="plain"
            input-class="filter-input"
            class="filter-input-wrap"
            placeholder="按文件名过滤..."
          />
          <div class="file-toolbar-info">
            <span v-if="loadingMeta" class="meta-progress">
              读取标签 {{ metaProgress.done }}/{{ metaProgress.total }}
              <button class="btn-ghost btn-sm meta-stop" @click="cancelMetaLoad">停止</button>
            </span>
            <span v-if="matching" class="meta-progress match-progress" :title="matchProgress.current">
              匹配并保存 {{ matchProgress.done }}/{{ matchProgress.total }}<template v-if="matchProgress.current"> · {{ matchProgress.current }}</template>
            </span>
          </div>
          <div class="file-toolbar-actions">
            <span class="file-count">
              {{ displayedFiles.length }} / {{ files.length }}
              <template v-if="missingFilesCount"> · 缺失 {{ missingFilesCount }}</template>
            </span>
            <AppSelect
              v-model="missingFilter"
              :options="missingFilterOptions"
              size="sm"
              title="缺失筛选"
            />
            <label class="check-all">
              <input type="checkbox" v-model="selectAll" @change="toggleAll" /> 全选
            </label>
            <button class="btn-ghost btn-sm" :disabled="!activeDir || scanning || loadingMeta" @click="scanSubdirsRecursive">
              含子目录扫描
            </button>
            <button class="btn-ghost btn-sm" :disabled="!displayedFiles.length" @click="playAllVisible">
              试听全部
            </button>
            <button class="btn-ghost btn-sm" :disabled="!missingFilesCount || matching" @click="selectMissingFiles">
              选中缺失
            </button>
            <button class="btn-ghost btn-sm" :disabled="!missingFilesCount || matching" @click="autoMatchMissing">
              {{ matching ? '匹配中...' : `匹配缺失 (${missingMatchCount})` }}
            </button>
            <button class="btn-ghost btn-sm" :disabled="!selectedFiles.length || matching" @click="autoMatchSelected">
              {{ matching ? '匹配中...' : `匹配选中 (${selectedFiles.length})` }}
            </button>
            <AppSelect
              v-model="fetchSource"
              :options="sourceOptions"
              size="sm"
              title="自动匹配音源"
            />
          </div>
        </div>
        <div v-if="matching && matchProgress.total" class="match-progress-bar">
          <div class="match-progress-fill" :style="{ width: matchPercent + '%' }" />
        </div>

        <div class="table-wrap" v-if="displayedFiles.length">
          <table>
            <thead>
              <tr>
                <th class="col-check"></th>
                <th>文件名</th>
                <th>标题</th>
                <th>歌手</th>
                <th>专辑</th>
                <th>封面</th>
                <th>歌词</th>
                <th class="col-play"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="f in displayedFiles" :key="f.filePath"
                :class="{
                  modified: f._modified,
                  active: editingFile?.filePath === f.filePath,
                  selected: f._selected,
                  playing: isPlayingFile(f),
                  'row-missing': isFileMissing(f, 'any'),
                }"
                @click="openEdit(f)"
              >
                <td @click.stop><input type="checkbox" v-model="f._selected" /></td>
                <td class="cell-file" :title="f.filePath">{{ f.fileName }}</td>
                <td class="cell-text">{{ f.title || '-' }}</td>
                <td class="cell-text">{{ f.artist || '-' }}</td>
                <td class="cell-text" :class="{ 'cell-missing': isTagFieldMissing(f, 'album') }">{{ f.album || '-' }}</td>
                <td :class="{ 'cell-missing': isTagFieldMissing(f, 'cover') }">{{ f.hasPicture ? '✓' : '-' }}</td>
                <td :class="{ 'cell-missing': isTagFieldMissing(f, 'lyric') }">{{ f.hasLyrics ? '✓' : '-' }}</td>
                <td class="col-play" @click.stop>
                  <button
                    class="play-btn"
                    :title="isPlayingFile(f) && !isPaused ? '暂停' : '试听'"
                    @click="togglePlayFile(f)"
                  >
                    <svg v-if="isPlayingFile(f) && !isPaused" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    <svg v-else-if="loadingPlay === fileTrackId(f)" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10" stroke-dasharray="50" stroke-dashoffset="20"/></svg>
                    <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                  </button>
                  <button
                    class="queue-add-btn"
                    :class="{ added: isFileInQueue(f) }"
                    :title="isFileInQueue(f) ? '已在试听列表' : '加入试听列表'"
                    @click="addFileToQueue(f)"
                  >
                    <svg v-if="isFileInQueue(f)" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                    <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else-if="scanning" class="empty">正在加载文件夹...</div>
        <div v-else-if="files.length && missingFilter !== 'all'" class="empty">当前筛选条件下没有缺失文件</div>
        <div v-else class="empty">在左侧展开并选择文件夹，加载该层音频文件</div>
      </section>

      <!-- 右侧：编辑面板（常驻，未选中时仅显示标题与占位） -->
      <aside class="edit-panel card">
        <div class="panel-title">
          {{ editPanelTitle }}
          <button
            v-if="!isBatchMode && editingFile && (editForm || loadingDetail)"
            class="btn-ghost btn-sm play-inline"
            @click="togglePlayFile(editingFile)"
            :title="isPlayingFile(editingFile) && !isPaused ? '暂停' : '试听当前文件'"
          >
            {{ isPlayingFile(editingFile) && !isPaused ? '暂停' : '试听' }}
          </button>
        </div>

        <div v-if="loadingDetail" class="detail-loading">正在读取文件内置信息...</div>

        <div v-else-if="editForm" class="edit-form">
          <div class="field-toolbar meta-fetch-toolbar">
            <div class="split-btn">
              <button class="btn-primary btn-sm" @click="openFetchModal('meta')" :disabled="fetchLoading">
                {{ fetchLoading ? '获取中...' : '网络获取信息' }}
              </button>
              <AppSelect
                v-model="fetchSource"
                :options="sourceOptions"
                size="sm"
                variant="attached-end"
                title="选择音源"
              />
            </div>
          </div>
          <label>标题<input v-model="editForm.title" @input="markModified" /></label>
          <label>歌手<input v-model="editForm.artist" @input="markModified" /></label>
          <label>专辑<input v-model="editForm.album" @input="markModified" /></label>
          <label>年份<input v-model="editForm.year" @input="markModified" /></label>
          <label>风格<input v-model="editForm.genre" @input="markModified" /></label>
          <label>描述<input v-model="editForm.comment" @input="markModified" /></label>

          <label class="field-block">封面
            <div class="field-toolbar">
              <div class="split-btn">
                <button class="btn-primary btn-sm" @click="openFetchModal('cover')" :disabled="fetchLoading">
                  {{ fetchLoading ? '获取中...' : '网络获取信息' }}
                </button>
                <AppSelect
                  v-model="fetchSource"
                  :options="sourceOptions"
                  size="sm"
                  variant="attached-end"
                  title="选择音源"
                />
              </div>
            </div>
            <div class="cover-box">
              <img v-if="editForm.pictureBase64" :src="editForm.pictureBase64" alt="cover" />
              <img v-else-if="editForm.picUrl" :src="editForm.picUrl" alt="cover" referrerpolicy="no-referrer" />
              <div v-else class="cover-placeholder">无封面</div>
            </div>
            <input type="file" accept="image/*" @change="onCoverUpload" />
            <input v-model="editForm.picUrl" placeholder="或输入封面 URL" @input="markModified" />
          </label>

          <label class="field-block">歌词
            <div class="field-toolbar">
              <div class="split-btn">
                <button class="btn-primary btn-sm" @click="openFetchModal('lyric')" :disabled="fetchLoading">
                  {{ fetchLoading ? '获取中...' : '网络获取信息' }}
                </button>
                <AppSelect
                  v-model="fetchSource"
                  :options="sourceOptions"
                  size="sm"
                  variant="attached-end"
                  title="选择音源"
                />
              </div>
            </div>
            <textarea v-model="editForm.lyric" rows="8" @input="markModified" placeholder="LRC 歌词内容"></textarea>
          </label>
        </div>

        <div v-else class="edit-empty">
          <p>点击中间列表中的歌曲，在此编辑标题、歌手、专辑、封面与歌词。</p>
        </div>

        <div v-if="editForm && !loadingDetail" class="edit-actions">
          <button class="btn-primary" @click="saveCurrent" :disabled="saving">
            {{ saving ? '保存中...' : '保存到文件' }}
          </button>
          <button class="btn-ghost" @click="applyToFiles" :disabled="!editForm" title="仅更新列表显示，不会写入磁盘，需点「保存到文件」">
            应用到{{ isBatchMode ? '选中' : '当前' }}
          </button>
        </div>
      </aside>
    </div>

    <div v-if="toast" class="toast" :class="toast.type">{{ toast.text }}</div>

    <!-- 网络获取信息弹窗 -->
    <div class="modal-overlay" v-if="showFetchModal" @click.self="closeFetchModal">
      <div class="fetch-modal">
        <div class="fetch-header">
          <h3>{{ fetchIntentLabel }} · {{ fetchSourceLabel }}</h3>
          <button class="btn-icon" @click="closeFetchModal">×</button>
        </div>

        <div class="fetch-search">
          <label class="search-field">
            <span>歌手</span>
            <ClearableInput v-model="fetchArtist" variant="plain" placeholder="歌手名" @enter="doFetchSearch" />
          </label>
          <label class="search-field">
            <span>歌名</span>
            <ClearableInput v-model="fetchTitle" variant="plain" placeholder="歌曲名" @enter="doFetchSearch" />
          </label>
          <button class="btn-primary btn-sm search-btn" @click="doFetchSearch" :disabled="fetchLoading">
            {{ fetchLoading ? '搜索中...' : '搜索' }}
          </button>
        </div>

        <div class="fetch-body">
          <div class="fetch-list">
            <div v-if="!fetchResults.length && !fetchLoading" class="fetch-empty">暂无结果，请调整歌手或歌名后重试</div>
            <div
              v-for="(item, i) in fetchResults" :key="i"
              :class="['fetch-item', { active: fetchPreview?.id === item.id && fetchPreview?.source === item.source }]"
              @click="previewFetchItem(item)"
            >
              <img v-if="fetchIntent === 'cover' && item.picUrl" :src="item.picUrl" class="fetch-thumb" alt="" />
              <div v-else-if="item.picUrl" class="fetch-thumb"><img :src="item.picUrl" alt="" /></div>
              <div v-else class="fetch-thumb placeholder">♪</div>
              <div class="fetch-item-info">
                <div class="fetch-item-name">{{ item.name }}</div>
                <div class="fetch-item-meta">{{ item.singer }} · {{ item.album || item.albumName || '-' }}</div>
                <div class="fetch-item-score">匹配度 {{ item._score }}</div>
              </div>
            </div>
          </div>

          <div class="fetch-preview" v-if="fetchPreviewMeta">
            <div class="preview-info">
              <p><strong>标题</strong> {{ fetchPreviewMeta.title || fetchPreview?.name || '-' }}</p>
              <p><strong>歌手</strong> {{ fetchPreviewMeta.artist || fetchPreview?.singer || '-' }}</p>
              <p><strong>专辑</strong> {{ fetchPreviewMeta.album || '-' }}</p>
              <p v-if="fetchIntent !== 'cover' && fetchIntent !== 'lyric' || fetchPreviewMeta.year">
                <strong>年份</strong> {{ fetchPreviewMeta.year || '-' }}
              </p>
              <p v-if="fetchIntent !== 'cover' && fetchIntent !== 'lyric' || fetchPreviewMeta.genre">
                <strong>风格</strong> {{ fetchPreviewMeta.genre || '-' }}
              </p>
              <p v-if="fetchIntent === 'meta' && fetchPreviewMeta.comment">
                <strong>描述</strong> {{ fetchPreviewMeta.comment }}
              </p>
            </div>

            <template v-if="fetchIntent === 'cover'">
              <div class="preview-cover large">
                <img v-if="fetchPreviewMeta.pic || fetchPreview?.picUrl" :src="fetchPreviewMeta.pic || fetchPreview?.picUrl" alt="cover" />
                <div v-else class="cover-placeholder">无封面</div>
              </div>
            </template>

            <template v-else>
              <div class="preview-lyric">
                <div class="preview-lyric-title">歌词预览</div>
                <pre>{{ fetchPreviewMeta.lyric ? fetchPreviewMeta.lyric.slice(0, 800) : '暂无歌词' }}{{ fetchPreviewMeta.lyric?.length > 800 ? '...' : '' }}</pre>
              </div>
            </template>
          </div>
          <div class="fetch-preview empty" v-else>
            <p>请从左侧选择一条结果查看{{ fetchPreviewEmptyHint }}</p>
          </div>
        </div>

        <div class="fetch-footer">
          <button class="btn-ghost" @click="closeFetchModal">取消</button>
          <button
            class="btn-primary"
            @click="confirmFetchApply"
            :disabled="!fetchPreviewMeta || !canConfirmFetch"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, onBeforeUnmount, watch } from 'vue'
import { api } from '../api.js'
import {
  updateLibraryTracksFromFiles,
} from '../stores/library.js'
import {
  loadingPlay, isPaused, isPlayingItem, playItem, addToQueue, isInQueue,
  refreshPlayingLocalMeta,
} from '../stores/player.js'
import {
  tagMatchRunning,
  tagMatchProgress,
  tagMatchPercent,
  tagMatchPatchVersion,
  tagMatchResult,
  startTagMatchBatch,
  syncFilesFromMatchPatches,
  saveTagEditorSession,
  tagEditorSession,
  clearTagMatchResult,
} from '../stores/tagMatch.js'
import AppSelect from '../components/AppSelect.vue'
import ClearableInput from '../components/ClearableInput.vue'
import { collectDefaultExpandedPaths } from '../utils/dirTreeExpand.js'

const sourceOptions = [
  { value: 'tx', label: 'QQ音乐' },
  { value: 'wy', label: '网易云' },
]
const missingFilterOptions = [
  { value: 'all', label: '全部文件' },
  { value: 'album', label: '缺专辑' },
  { value: 'cover', label: '缺封面' },
  { value: 'lyric', label: '缺歌词' },
]

const matching = tagMatchRunning
const matchProgress = tagMatchProgress
const matchPercent = tagMatchPercent
const dirs = ref([])
const activeDir = ref('')
const expandedPaths = ref(new Set())
const treeCache = ref({})
const files = ref([])
const filterText = ref('')
const missingFilter = ref('all')
const selectAll = ref(false)
const saving = ref(false)
const fetchSource = ref('tx')
const fetchLoading = ref(false)
const fetchResults = ref([])
const fetchPreview = ref(null)
const fetchPreviewMeta = ref(null)
const showFetchModal = ref(false)
const fetchArtist = ref('')
const fetchTitle = ref('')
const fetchIntent = ref('cover')
const editingFile = ref(null)
const editForm = ref(null)
const toast = ref(null)
const scanning = ref(false)
const loadingMeta = ref(false)
const loadingDetail = ref(false)
const metaProgress = ref({ done: 0, total: 0 })
const metaLoadToken = ref(0)

function folderDisplayName(dirPath, depth) {
  if (!dirPath) return ''
  if (depth === 0) {
    const parts = String(dirPath).replace(/\\/g, '/').split('/').filter(Boolean)
    return parts[parts.length - 1] || dirPath
  }
  const parts = String(dirPath).replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] || dirPath
}

function getTreeEntry(dirPath) {
  return treeCache.value[dirPath] || { dirs: [], loaded: false, loading: false }
}

const visibleTreeRows = computed(() => {
  const rows = []
  const visit = (dirPath, depth) => {
    const cached = getTreeEntry(dirPath)
    const expanded = expandedPaths.value.has(dirPath)
    rows.push({
      path: dirPath,
      name: folderDisplayName(dirPath, depth),
      depth,
      expanded,
      loading: cached.loading,
      loaded: cached.loaded,
      hasChildren: !cached.loaded || cached.dirs.length > 0,
    })
    if (expanded && cached.loaded) {
      for (const child of cached.dirs) visit(child.path, depth + 1)
    }
  }
  for (const root of dirs.value) visit(root, 0)
  return rows
})

function mapListedFiles(list) {
  return (list || []).map(f => ({
    ...f,
    _selected: false,
    _modified: false,
    _metaLoaded: Boolean(
      f.album || f.genre || f.year || f.comment
      || (f.title && f.title !== f.parsedTitle)
      || (f.artist && f.artist !== f.parsedArtist),
    ),
  }))
}

function cancelMetaLoad() {
  metaLoadToken.value += 1
  loadingMeta.value = false
  showToast('已停止读取标签', 'info')
}

function hasTagText(value) {
  return Boolean(String(value ?? '').trim())
}

const MISSING_FIELDS = ['album', 'cover', 'lyric']

function isTagFieldMissing(f, field) {
  if (!f) return false
  switch (field) {
    case 'album': return !hasTagText(f.album)
    case 'cover': return !f.hasPicture
    case 'lyric': return !f.hasLyrics
    default: return false
  }
}

function isFileMissing(f, mode = missingFilter.value) {
  if (!f || mode === 'all') return false
  if (mode === 'album' || mode === 'cover' || mode === 'lyric') {
    return isTagFieldMissing(f, mode)
  }
  return MISSING_FIELDS.some(field => isTagFieldMissing(f, field))
}

function getMissingMode() {
  return missingFilter.value === 'all' ? 'any' : missingFilter.value
}

const displayedFiles = computed(() => {
  let list = files.value
  if (missingFilter.value !== 'all') {
    list = list.filter(f => isFileMissing(f, missingFilter.value))
  }
  const q = filterText.value.trim().toLowerCase()
  if (q) list = list.filter(f => f.fileName.toLowerCase().includes(q))
  return list
})

const missingFilesCount = computed(() => files.value.filter(f => isFileMissing(f, 'any')).length)

const missingMatchCount = computed(() => {
  const mode = getMissingMode()
  return files.value.filter(f => isFileMissing(f, mode)).length
})

const selectedFiles = computed(() => files.value.filter(f => f._selected))
const isBatchMode = computed(() => selectedFiles.value.length > 1)
const hasChanges = computed(() => files.value.some(f => f._modified))
const fetchSourceLabel = computed(() => fetchSource.value === 'tx' ? 'QQ音乐' : '网易云')
const fetchIntentLabel = computed(() => {
  if (fetchIntent.value === 'cover') return '网络获取封面'
  if (fetchIntent.value === 'lyric') return '网络获取歌词'
  return '网络获取标签'
})
const fetchPreviewEmptyHint = computed(() => {
  if (fetchIntent.value === 'cover') return '封面'
  if (fetchIntent.value === 'lyric') return '歌词'
  return '标签信息'
})
const canConfirmFetch = computed(() => {
  if (!fetchPreviewMeta.value) return false
  const meta = fetchPreviewMeta.value
  if (fetchIntent.value === 'cover') {
    return Boolean(meta.pic || meta.picUrl || fetchPreview.value?.picUrl)
  }
  if (fetchIntent.value === 'lyric') {
    return Boolean(meta.lyric)
  }
  return Boolean(meta.title || meta.artist || meta.album || meta.year || meta.genre || meta.comment)
})
const editPanelTitle = computed(() => {
  if (loadingDetail.value) return '读取文件信息'
  if (editForm.value && isBatchMode.value) return `批量编辑 (${selectedFiles.value.length})`
  if (editForm.value) return '单文件编辑'
  return '标签编辑'
})

function refreshEditFormFromFile() {
  const f = editingFile.value
  if (!f) return
  editForm.value = {
    title: f.title || '',
    artist: f.artist || '',
    album: f.album || '',
    year: f.year || '',
    genre: f.genre || '',
    comment: f.comment || '',
    lyric: f.lyric || '',
    picUrl: f.picUrl || '',
    pictureBase64: f.pictureBase64 || '',
  }
}

function handleMatchPatchesSync() {
  syncFilesFromMatchPatches(files.value)
  refreshEditFormFromFile()
}

watch(tagMatchPatchVersion, handleMatchPatchesSync)
watch(tagMatchRunning, (running, wasRunning) => {
  if (wasRunning && !running) {
    handleMatchPatchesSync()
    saveTagEditorSession(activeDir.value, files.value)
  }
})

watch(tagMatchResult, (result) => {
  if (!result) return
  showToast(result.text, result.type)
  clearTagMatchResult()
})

watch(missingFilter, () => {
  selectAll.value = false
})

onMounted(async () => {
  await loadDirs()
  await initTreeExpansion()
  const session = tagEditorSession.value
  if (session.activeDir && session.files?.length) {
    activeDir.value = session.activeDir
    files.value = session.files.map(f => ({ ...f }))
    handleMatchPatchesSync()
  }
})

onBeforeUnmount(() => {
  if (files.value.length) {
    saveTagEditorSession(activeDir.value, files.value)
  }
})

async function loadDirs() {
  try {
    const res = await api.paths.list()
    dirs.value = res.data || []
  } catch {}
}

/** 默认展开一级根目录及其二级子目录（三级及更深保持折叠） */
async function initTreeExpansion() {
  if (!dirs.value.length) return
  treeCache.value = {}
  expandedPaths.value = await collectDefaultExpandedPaths(
    dirs.value,
    getTreeEntry,
    ensureTreeChildren,
  )
}

async function ensureTreeChildren(dirPath) {
  const cached = getTreeEntry(dirPath)
  if (cached.loaded || cached.loading) return
  treeCache.value = {
    ...treeCache.value,
    [dirPath]: { ...cached, loading: true },
  }
  try {
    const res = await api.tag.listDir(dirPath)
    const data = res.data || {}
    treeCache.value = {
      ...treeCache.value,
      [dirPath]: {
        dirs: data.dirs || [],
        loaded: true,
        loading: false,
      },
    }
  } catch (e) {
    treeCache.value = {
      ...treeCache.value,
      [dirPath]: { dirs: [], loaded: true, loading: false },
    }
    showToast(e.message, 'error')
  }
}

async function toggleTreeNode(dirPath) {
  if (expandedPaths.value.has(dirPath)) {
    const next = new Set(expandedPaths.value)
    next.delete(dirPath)
    expandedPaths.value = next
    return
  }
  await ensureTreeChildren(dirPath)
  const next = new Set(expandedPaths.value)
  next.add(dirPath)
  expandedPaths.value = next
}

async function selectFolder(dir) {
  if (scanning.value) return
  metaLoadToken.value += 1
  loadingMeta.value = false
  const token = metaLoadToken.value
  activeDir.value = dir
  scanning.value = true
  files.value = []
  editingFile.value = null
  editForm.value = null
  selectAll.value = false

  try {
    const res = await api.tag.listDir(dir)
    if (token !== metaLoadToken.value) return

    const data = res.data || {}
    const cached = getTreeEntry(dir)
    if (!cached.loaded) {
      treeCache.value = {
        ...treeCache.value,
        [dir]: {
          dirs: data.dirs || [],
          loaded: true,
          loading: false,
        },
      }
    }

    files.value = mapListedFiles(data.files)
    if (!files.value.length) {
      const subCount = (data.dirs || []).length
      showToast(subCount
        ? '该文件夹没有音频，请展开子文件夹或选择其他目录'
        : '该文件夹为空', 'info')
      saveTagEditorSession(activeDir.value, files.value)
      return
    }
    const needTextMeta = files.value.filter(f => !f._metaLoaded)
    const toastText = needTextMeta.length
      ? `已发现 ${files.value.length} 个文件，正在读取标签...`
      : `已加载 ${files.value.length} 个文件，正在同步封面/歌词状态...`
    showToast(toastText, 'info')
    saveTagEditorSession(activeDir.value, files.value)
    loadMetaInBatches(token)
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    if (token === metaLoadToken.value) scanning.value = false
  }
}

async function scanSubdirsRecursive() {
  if (!activeDir.value || scanning.value) return
  metaLoadToken.value += 1
  loadingMeta.value = false
  const token = metaLoadToken.value
  scanning.value = true
  files.value = []
  editingFile.value = null
  editForm.value = null
  selectAll.value = false

  try {
    const res = await api.tag.scan(activeDir.value, { recursive: true })
    if (token !== metaLoadToken.value) return

    files.value = mapListedFiles(res.data)
    if (!files.value.length) {
      showToast(res.tip || '未发现音频文件', 'error')
      return
    }
    showToast(`已递归扫描 ${files.value.length} 个文件，正在读取标签...`, 'info')
    saveTagEditorSession(activeDir.value, files.value)
    loadMetaInBatches(token)
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    if (token === metaLoadToken.value) scanning.value = false
  }
}

function applyMetaRow(file, item) {
  if (!file || !item?.ok) return false
  const hasPicture = Boolean(item.hasPicture || item.pictureBase64)
  const hasLyrics = Boolean(item.hasLyrics || item.lyric)
  if (!file._metaLoaded) {
    Object.assign(file, {
      title: item.title || file.parsedTitle || file.title,
      artist: item.artist || file.parsedArtist || file.artist,
      album: item.album || '',
      year: item.year || '',
      genre: item.genre || '',
      comment: item.comment || '',
    })
    file._metaLoaded = true
  } else {
    if (item.year) file.year = item.year
    if (item.genre) file.genre = item.genre
    if (item.comment) file.comment = item.comment
  }
  file.hasPicture = hasPicture
  file.hasLyrics = hasLyrics
  return true
}

async function loadMetaInBatches(token) {
  if (!files.value.length) return

  loadingMeta.value = true
  metaProgress.value = { done: 0, total: files.value.length }
  const batchSize = 8

  for (let i = 0; i < files.value.length; i += batchSize) {
    if (token !== metaLoadToken.value) {
      loadingMeta.value = false
      return
    }

    const batch = files.value.slice(i, i + batchSize).map(f => f.filePath)
    try {
      const res = await api.tag.readBatch(batch, true)
      for (const item of res.data || []) {
        const file = files.value.find(f => f.filePath === item.filePath)
        if (!file) continue
        if (!item.ok) {
          console.warn('[tag] read-batch failed:', item.filePath, item.error)
          continue
        }
        applyMetaRow(file, item)
      }
    } catch (e) {
      showToast(`部分标签读取失败：${e.message}`, 'error')
    }

    metaProgress.value.done = Math.min(i + batchSize, files.value.length)
  }

  const failed = files.value.filter(f => !f._metaLoaded)
  if (failed.length && token === metaLoadToken.value) {
    for (let i = 0; i < failed.length; i += 4) {
      if (token !== metaLoadToken.value) {
        loadingMeta.value = false
        return
      }
      const batch = failed.slice(i, i + 4).map(f => f.filePath)
      try {
        const res = await api.tag.readBatch(batch, true)
        for (const item of res.data || []) {
          const file = files.value.find(f => f.filePath === item.filePath)
          applyMetaRow(file, item)
        }
      } catch {}
    }
  }

  if (token === metaLoadToken.value) {
    loadingMeta.value = false
    syncFilesFromMatchPatches(files.value)
    saveTagEditorSession(activeDir.value, files.value)
    showToast(`标签读取完成 ${metaProgress.value.done}/${metaProgress.value.total}`, 'success')
  }
}

function toggleAll() {
  displayedFiles.value.forEach(f => { f._selected = selectAll.value })
}

function selectMissingFiles() {
  const mode = getMissingMode()
  const targets = displayedFiles.value.filter(f => isFileMissing(f, mode))
  if (!targets.length) {
    showToast('当前范围内没有缺失文件', 'info')
    return
  }
  files.value.forEach(f => { f._selected = false })
  targets.forEach(f => { f._selected = true })
  selectAll.value = targets.length === displayedFiles.value.length
  showToast(`已选中 ${targets.length} 个缺失文件`, 'success')
}

function runTagMatch(targets) {
  if (!targets.length) return
  startTagMatchBatch(
    targets.map(f => ({ filePath: f.filePath, fileName: f.fileName })),
    fetchSource.value,
  ).then((res) => {
    if (res.reason === 'busy') showToast('已有自动匹配任务进行中', 'info')
    else if (res.reason === 'empty') showToast('请先选择要匹配的文件', 'info')
    else handleMatchPatchesSync()
  })
}

function autoMatchMissing() {
  const mode = getMissingMode()
  const targets = files.value.filter(f => isFileMissing(f, mode))
  if (!targets.length) {
    showToast('没有需要匹配的缺失文件', 'info')
    return
  }
  targets.forEach(f => { f._selected = true })
  runTagMatch(targets)
}

async function openEdit(f) {
  editingFile.value = f
  fetchResults.value = []
  fetchPreview.value = null
  fetchPreviewMeta.value = null

  // 自动匹配 / 手动改过但未保存：优先用内存中的结果，避免磁盘旧标签覆盖
  if (f._modified) {
    editForm.value = reactive({
      title: f.title || f.parsedTitle || '',
      artist: f.artist || f.parsedArtist || '',
      album: f.album || '',
      year: f.year ? String(f.year) : '',
      genre: f.genre || '',
      comment: f.comment || '',
      lyric: f.lyric || '',
      pictureBase64: f.pictureBase64 || '',
      picUrl: f.picUrl || '',
    })
    loadingDetail.value = false
    return
  }

  loadingDetail.value = true
  editForm.value = reactive({
    title: f.title || f.parsedTitle || '',
    artist: f.artist || f.parsedArtist || '',
    album: f.album || '',
    year: f.year ? String(f.year) : '',
    genre: f.genre || '',
    comment: f.comment || '',
    lyric: f.lyric || '',
    pictureBase64: f.pictureBase64 || '',
    picUrl: f.picUrl || '',
  })

  try {
    const res = await api.tag.read(f.filePath)
    const meta = res.data || {}
    // 仅回填尚未有值的字段，避免冲掉列表里已有信息
    if (!f._modified) {
      Object.assign(f, {
        title: meta.title || f.title,
        artist: meta.artist || f.artist,
        album: meta.album || f.album,
        year: meta.year || f.year,
        genre: meta.genre || f.genre,
        comment: meta.comment || f.comment,
        lyric: typeof meta.lyric === 'string' ? meta.lyric : (f.lyric || ''),
        pictureBase64: meta.pictureBase64 || f.pictureBase64 || '',
        hasPicture: meta.hasPicture ?? Boolean(meta.pictureBase64 || f.pictureBase64),
        hasLyrics: meta.hasLyrics ?? Boolean(meta.lyric || f.lyric),
      })
      f._detailLoaded = true
      editForm.value = reactive({
        title: f.title || f.parsedTitle || '',
        artist: f.artist || f.parsedArtist || '',
        album: f.album || '',
        year: f.year ? String(f.year) : '',
        genre: f.genre || '',
        comment: f.comment || '',
        lyric: f.lyric || '',
        pictureBase64: f.pictureBase64 || '',
        picUrl: f.picUrl || '',
      })
    }
  } catch (e) {
    showToast(`读取文件详情失败：${e.message}`, 'error')
  } finally {
    loadingDetail.value = false
  }
}

function markModified() {
  if (editingFile.value) editingFile.value._modified = true
}

function buildMetaFromForm() {
  const m = {
    title: editForm.value.title,
    artist: editForm.value.artist,
    album: editForm.value.album,
    year: editForm.value.year,
    genre: editForm.value.genre,
    comment: editForm.value.comment,
    lyric: editForm.value.lyric,
  }
  if (editForm.value.pictureBase64) m.pic = editForm.value.pictureBase64
  else if (editForm.value.picUrl) m.picUrl = editForm.value.picUrl
  return m
}

function applyMetaToFile(f, meta) {
  if (meta.title) f.title = meta.title
  if (meta.artist) f.artist = meta.artist
  if (meta.album) f.album = meta.album
  if (meta.year) f.year = meta.year
  if (meta.genre) f.genre = meta.genre
  if (meta.comment) f.comment = meta.comment
  if (meta.lyric) f.lyric = meta.lyric
  if (meta.pic) f.pictureBase64 = meta.pic
  if (meta.picUrl) f.picUrl = meta.picUrl
  f.hasPicture = Boolean(f.pictureBase64 || f.picUrl)
  f.hasLyrics = Boolean(f.lyric)
  f._modified = true
}

function applyToFiles() {
  const meta = buildMetaFromForm()
  const targets = isBatchMode.value ? selectedFiles.value : (editingFile.value ? [editingFile.value] : [])
  if (!targets.length) return
  targets.forEach(f => applyMetaToFile(f, meta))
  showToast(`已更新 ${targets.length} 个文件的列表显示，尚未写入磁盘。请点击「保存到文件」按钮写入磁盘`, 'info')
}

async function saveCurrent() {
  const targets = isBatchMode.value
    ? selectedFiles.value.filter(f => f._modified)
    : (editingFile.value?._modified ? [editingFile.value] : [])

  if (!targets.length && editingFile.value) {
    applyToFiles()
    targets.push(editingFile.value)
  }

  if (!targets.length) {
    showToast('没有需要保存的文件', 'info')
    return
  }

  saving.value = true
  try {
    const payload = targets.map(f => ({
      filePath: f.filePath,
      meta: {
        title: f.title,
        artist: f.artist,
        album: f.album,
        year: f.year,
        genre: f.genre,
        comment: f.comment,
        lyric: f.lyric,
        pic: f.pictureBase64 || undefined,
        picUrl: f.picUrl || undefined,
      },
    }))
    const res = await api.tag.writeBatch(payload)
    const ok = (res.data || []).filter(r => r.ok).length
    targets.forEach(f => { f._modified = false })
    await refreshPlayerAfterSave(targets)
    showToast(`已保存 ${ok}/${targets.length} 个文件`, 'success')
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    saving.value = false
  }
}

async function saveAll() {
  const modified = files.value.filter(f => f._modified)
  if (!modified.length) return
  saving.value = true
  try {
    const payload = modified.map(f => ({
      filePath: f.filePath,
      meta: {
        title: f.title,
        artist: f.artist,
        album: f.album,
        year: f.year,
        genre: f.genre,
        comment: f.comment,
        lyric: f.lyric,
        pic: f.pictureBase64 || undefined,
      },
    }))
    const res = await api.tag.writeBatch(payload)
    const ok = (res.data || []).filter(r => r.ok).length
    modified.forEach(f => { f._modified = false })
    await refreshPlayerAfterSave(modified)
    showToast(`已保存 ${ok}/${modified.length} 个文件`, 'success')
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    saving.value = false
  }
}

async function openFetchModal(intent) {
  if (!editForm.value) return
  fetchIntent.value = intent
  showFetchModal.value = true
  fetchResults.value = []
  fetchPreview.value = null
  fetchPreviewMeta.value = null

  const f = editingFile.value
  fetchArtist.value = editForm.value?.artist || f?.parsedArtist || ''
  fetchTitle.value = editForm.value?.title || f?.parsedTitle || ''

  if (!fetchArtist.value && !fetchTitle.value && f?.fileName) {
    const parsed = parseLocalFilename(f.fileName)
    fetchArtist.value = parsed.artist
    fetchTitle.value = parsed.title
  }

  if (fetchArtist.value || fetchTitle.value) await doFetchSearch()
}

function parseLocalFilename(fileName) {
  const base = fileName.replace(/\.[^.]+$/, '').trim()
  const m = base.match(/^(.+?)\s*[-–—_]\s*(.+)$/)
  // 与后端一致：歌手 - 歌名
  if (m) return { artist: m[1].trim(), title: m[2].trim() }
  return { title: base, artist: '' }
}

function closeFetchModal() {
  showFetchModal.value = false
  fetchPreview.value = null
  fetchPreviewMeta.value = null
}

async function doFetchSearch() {
  const artist = fetchArtist.value.trim()
  const title = fetchTitle.value.trim()
  if (!artist && !title) {
    showToast('请至少填写歌手或歌名', 'info')
    return
  }
  fetchLoading.value = true
  fetchPreview.value = null
  fetchPreviewMeta.value = null
  try {
    const res = await api.tag.match({ artist, title }, fetchSource.value)
    fetchResults.value = res.data || []
    if (!fetchResults.value.length) showToast('未找到匹配结果', 'info')
    else if (fetchResults.value.length === 1) await previewFetchItem(fetchResults.value[0])
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    fetchLoading.value = false
  }
}

function fetchFieldsForIntent(intent) {
  if (intent === 'cover') return ['cover', 'title', 'artist', 'album', 'year', 'genre', 'comment']
  if (intent === 'lyric') return ['lyric', 'title', 'artist', 'album', 'year', 'genre', 'comment']
  return ['title', 'artist', 'album', 'year', 'genre', 'comment']
}

async function previewFetchItem(item) {
  fetchPreview.value = item
  fetchPreviewMeta.value = null
  try {
    const res = await api.tag.matchApply(item, fetchSource.value, fetchFieldsForIntent(fetchIntent.value))
    fetchPreviewMeta.value = res.data
  } catch (e) {
    showToast(e.message, 'error')
  }
}

function applyFetchedMetaToForm(meta) {
  if (!meta || !editForm.value) return
  if (meta.title) editForm.value.title = meta.title
  if (meta.artist) editForm.value.artist = meta.artist
  if (meta.album) editForm.value.album = meta.album
  if (meta.year) editForm.value.year = String(meta.year)
  if (meta.genre) editForm.value.genre = meta.genre
  if (meta.comment) editForm.value.comment = meta.comment
  if (fetchIntent.value === 'cover') {
    if (meta.pic) editForm.value.pictureBase64 = meta.pic
    else if (meta.picUrl) editForm.value.picUrl = meta.picUrl
    else if (fetchPreview.value?.picUrl) editForm.value.picUrl = fetchPreview.value.picUrl
  } else if (fetchIntent.value === 'lyric' && meta.lyric) {
    editForm.value.lyric = meta.lyric
  }
}

function confirmFetchApply() {
  const meta = fetchPreviewMeta.value
  if (!meta || !editForm.value || !canConfirmFetch.value) return

  applyFetchedMetaToForm(meta)
  markModified()
  closeFetchModal()
  const toastMap = {
    cover: '已应用封面与标签信息',
    lyric: '已应用歌词与标签信息',
    meta: '已应用网络标签信息',
  }
  showToast(toastMap[fetchIntent.value] || '已应用网络信息', 'success')
}

function autoMatchSelected() {
  if (!selectedFiles.value.length) return
  runTagMatch(selectedFiles.value)
}

function fileMetaForPlayerRefresh(f) {
  return {
    title: f.title,
    artist: f.artist,
    album: f.album,
    lyric: f.lyric,
    pictureBase64: f.pictureBase64,
    picUrl: f.picUrl,
    hasPicture: f.hasPicture,
    hasLyrics: f.hasLyrics,
  }
}

async function refreshPlayerAfterSave(targets) {
  updateLibraryTracksFromFiles(targets)
  for (const f of targets) {
    await refreshPlayingLocalMeta(f.filePath, fileMetaForPlayerRefresh(f))
  }
}

function fileToTrack(f) {
  const picFromData = f.pictureBase64
    ? (String(f.pictureBase64).startsWith('data:')
      ? f.pictureBase64
      : `data:${f.pictureMime || 'image/jpeg'};base64,${f.pictureBase64}`)
    : ''
  const pic = picFromData || (f.hasPicture && f.filePath
    ? `/api/tag/cover?path=${encodeURIComponent(f.filePath)}`
    : (f.picUrl || ''))
  const name = f.title || f.parsedTitle || f.fileName?.replace(/\.[^.]+$/, '') || '未知歌曲'
  const singer = f.artist || f.parsedArtist || '未知歌手'
  return {
    id: `local_${f.filePath}`,
    name,
    singer,
    source: 'local',
    album: f.album || '',
    picUrl: pic,
    img: pic,
    localPath: f.filePath,
    lyric: f.lyric || '',
    hasPicture: Boolean(f.hasPicture || pic),
    hasLyrics: Boolean(f.lyric),
  }
}

function fileTrackId(f) {
  return fileToTrack(f).id
}

function isPlayingFile(f) {
  return isPlayingItem(fileToTrack(f))
}

function isFileInQueue(f) {
  const track = fileToTrack(f)
  return isInQueue(track, 'local')
}

async function togglePlayFile(f) {
  if (!f?.filePath) return
  try {
    // 若正在编辑该文件且已读出封面/歌词，优先用编辑表单数据
    let track = fileToTrack(f)
    if (editingFile.value?.filePath === f.filePath && editForm.value) {
      track = {
        ...track,
        name: editForm.value.title || track.name,
        singer: editForm.value.artist || track.singer,
        album: editForm.value.album || track.album,
        picUrl: editForm.value.pictureBase64 || editForm.value.picUrl || track.picUrl,
        lyric: editForm.value.lyric || track.lyric,
      }
    }
    await playItem(track, 'local')
  } catch (e) {
    showToast(e.message || '试听失败', 'error')
  }
}

function addFileToQueue(f) {
  if (!f?.filePath) return
  const track = fileToTrack(f)
  if (isInQueue(track, 'local')) {
    showToast('已在试听列表', 'info')
    return
  }
  addToQueue(track, 'local')
  showToast(`已加入列表: ${track.name}`, 'success')
}

async function playAllVisible() {
  const list = displayedFiles.value
  if (!list.length) {
    showToast('没有可试听的文件', 'info')
    return
  }
  for (const f of list) addToQueue(fileToTrack(f), 'local')
  try {
    await playItem(fileToTrack(list[0]), 'local')
    showToast(`开始试听，共 ${list.length} 首`, 'success')
  } catch (e) {
    showToast(e.message || '试听失败', 'error')
  }
}

function onCoverUpload(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    editForm.value.pictureBase64 = reader.result
    markModified()
  }
  reader.readAsDataURL(file)
  e.target.value = ''
}

function showToast(text, type = 'info') {
  toast.value = { text, type }
  setTimeout(() => { toast.value = null }, 3000)
}
</script>

<style scoped>
.tag-page {
  width: 100%;
  max-width: none;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 16px;
  flex-shrink: 0;
}
.page-header .page-subtitle { margin-bottom: 0; }

.tag-layout {
  display: grid;
  grid-template-columns: minmax(200px, 240px) minmax(0, 1fr) minmax(300px, 380px);
  gap: 16px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.dir-panel, .edit-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow: hidden;
}
.edit-panel {
  min-width: 300px;
}
.edit-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 28px 16px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.65;
  border: 1px dashed var(--border-light);
  border-radius: var(--radius);
  background: var(--bg-elevated);
  min-height: 160px;
}
.edit-empty p {
  margin: 0;
  max-width: 220px;
}

.file-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.play-inline { flex-shrink: 0; }
.dir-hint { font-size: 11px; color: var(--text-muted); margin-bottom: 8px; line-height: 1.4; flex-shrink: 0; }

.dir-add { display: flex; gap: 6px; }
.dir-add input { flex: 1; min-width: 0; font-size: 12px; }

.dir-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.dir-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.tree-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: var(--radius);
  cursor: default;
  min-width: 0;
}
.tree-row:hover { background: var(--bg-hover); }
.tree-row.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.tree-row.loading { opacity: 0.85; }
.tree-toggle {
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
}
.tree-toggle.invisible { visibility: hidden; pointer-events: none; }
.tree-toggle:disabled { cursor: default; }
.tree-spin {
  width: 10px;
  height: 10px;
  border: 2px solid var(--border-light);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.tree-folder {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  cursor: pointer;
}
.tree-row.active .tree-folder {
  color: var(--accent);
}
.tree-label {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.meta-stop {
  margin-left: 6px;
  padding: 0 6px;
  font-size: 11px;
  line-height: 1.4;
}
.dir-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
  border-radius: var(--radius);
  cursor: pointer;
  background: transparent;
  font-size: 12px;
  border: 1px solid transparent;
  position: relative;
  transition: all 0.15s;
}
.dir-item:hover { background: var(--bg-hover); }
.dir-item.active {
  background: var(--accent-muted);
  border-color: transparent;
  color: var(--accent);
}
.dir-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 16px;
  background: var(--accent);
  border-radius: 0 2px 2px 0;
}
.dir-path { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dir-status { font-size: 11px; color: var(--accent); flex-shrink: 0; }
.dir-item.scanning { opacity: 0.85; }
.dir-empty { font-size: 12px; color: var(--text-muted); padding: 8px; }
.btn-icon { background: none; border: none; color: var(--text-muted); font-size: 16px; padding: 0 4px; }

.file-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: nowrap;
  flex-shrink: 0;
  min-width: 0;
}
.filter-input-wrap {
  flex: 0 0 auto;
  width: auto;
  overflow: visible;
}
.filter-input {
  width: 148px;
  min-width: 148px;
  font-size: 13px;
  border-radius: var(--radius-pill);
  padding: 6px 14px;
  text-overflow: clip;
}
.file-toolbar-actions .file-count {
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
  white-space: nowrap;
}
.file-toolbar-info {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  overflow: hidden;
  padding-right: 4px;
}
.file-toolbar-info .meta-progress {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.file-toolbar-actions .btn-ghost,
.file-toolbar-actions .check-all,
.file-toolbar-actions :deep(.app-select) {
  flex-shrink: 0;
  white-space: nowrap;
}
.meta-progress {
  font-size: 12px;
  color: var(--accent);
}
.match-progress {
  max-width: none;
}
.match-progress-bar {
  height: 3px;
  margin: 0 0 8px;
  background: var(--border-light);
  border-radius: 999px;
  overflow: hidden;
}
.match-progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: inherit;
  transition: width 0.2s ease;
}
.check-all {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.table-wrap {
  overflow: auto;
  flex: 1;
  min-height: 0;
  overscroll-behavior: contain;
}

table { width: 100%; border-collapse: collapse; font-size: 13px; }
thead th {
  text-align: left;
  padding: 10px 8px;
  color: var(--text-muted);
  font-weight: 500;
  font-size: 12px;
  border-bottom: 1px solid var(--border-light);
  white-space: nowrap;
  background: var(--bg-elevated);
}
tbody td { padding: 8px 8px; border-bottom: 1px solid var(--border-light); }
tbody tr { cursor: pointer; transition: background 0.15s; }
tbody tr:hover { background: var(--bg-hover); }
tbody tr.modified { background: var(--accent-muted); }
tbody tr.active { background: var(--accent-muted); }
tbody tr.selected td:first-child { background: color-mix(in srgb, var(--accent) 8%, transparent); }

tbody tr.playing { background: var(--accent-muted); }
tbody tr.row-missing td.cell-missing,
tbody tr td.cell-missing {
  color: #f59e0b;
}

.col-check { width: 32px; }
.col-play {
  width: 72px;
  white-space: nowrap;
  text-align: right;
}
.col-play .play-btn,
.col-play .queue-add-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-secondary);
  vertical-align: middle;
  margin-right: 4px;
}
.col-play .play-btn:hover,
.col-play .queue-add-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-muted);
}
.col-play .queue-add-btn.added {
  color: var(--success);
  border-color: var(--success);
  background: rgba(52, 199, 89, 0.1);
}
tr.playing .play-btn {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-muted);
}
.spin { animation: tag-spin 0.8s linear infinite; }
@keyframes tag-spin { to { transform: rotate(360deg); } }

.cell-file { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-size: 12px; }
.cell-text { max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.edit-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}
.edit-form input, .edit-form textarea, .edit-form select {
  font-size: 13px;
}

.cover-box {
  width: 100px;
  height: 100px;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg-input);
  margin-bottom: 4px;
}
.cover-box img { width: 100%; height: 100%; object-fit: cover; }
.cover-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: var(--text-muted);
}

.field-block { gap: 6px !important; }
.field-toolbar { display: flex; align-items: center; margin-bottom: 4px; }
.meta-fetch-toolbar { margin-bottom: 8px; }
.split-btn { display: flex; align-items: stretch; gap: 0; }
.split-btn .btn-primary { border-radius: var(--radius) 0 0 var(--radius); }
.split-btn .app-select { flex-shrink: 0; }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
}
.fetch-modal {
  width: min(920px, 100%);
  max-height: 85vh;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.fetch-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-elevated);
}
.fetch-header h3 { font-size: 15px; font-weight: 600; margin: 0; }
.fetch-search {
  display: flex;
  gap: 10px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
  align-items: flex-end;
  flex-wrap: wrap;
  background: var(--bg-card);
}
.search-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 140px;
}
.search-field span { font-size: 12px; color: var(--text-muted); }
.search-field :deep(input) {
  font-size: 13px;
  border-radius: var(--radius);
}
.search-btn { flex-shrink: 0; margin-bottom: 1px; border-radius: var(--radius); }
.fetch-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 360px;
  max-height: calc(85vh - 120px);
  overflow: hidden;
}
.fetch-list {
  overflow-y: auto;
  border-right: 1px solid var(--border-light);
  padding: 8px;
  background: var(--bg-card);
}
.fetch-empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}
.fetch-item {
  display: flex;
  gap: 10px;
  padding: 8px;
  border-radius: var(--radius);
  cursor: pointer;
  margin-bottom: 4px;
}
.fetch-item:hover { background: var(--bg-hover); }
.fetch-item.active { background: var(--accent-muted); border: 1px solid var(--accent); }
.fetch-thumb {
  width: 48px;
  height: 48px;
  border-radius: var(--radius);
  object-fit: cover;
  flex-shrink: 0;
  background: var(--bg-input);
  overflow: hidden;
}
.fetch-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.fetch-thumb.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--text-muted);
}
.fetch-item-info { min-width: 0; flex: 1; }
.fetch-item-name { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fetch-item-meta { font-size: 11px; color: var(--text-muted); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fetch-item-score { font-size: 11px; color: var(--accent); margin-top: 2px; }

.fetch-preview {
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.fetch-preview.empty {
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 13px;
}
.preview-cover {
  width: 140px;
  height: 140px;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg-input);
  align-self: center;
}
.preview-cover img { width: 100%; height: 100%; object-fit: cover; }
.preview-info p { font-size: 13px; margin: 4px 0; }
.preview-lyric-title { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
.preview-cover.large {
  width: 200px;
  height: 200px;
}
.preview-lyric pre {
  font-size: 11px;
  line-height: 1.5;
  max-height: 280px;
  overflow-y: auto;
  background: var(--bg-input);
  padding: 8px;
  border-radius: var(--radius);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}
.fetch-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border-light);
  background: var(--bg-elevated);
}

.edit-actions { display: flex; gap: 8px; margin-top: 8px; flex-shrink: 0; }

.detail-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 13px;
  padding: 24px 0;
}

.empty {
  text-align: center;
  padding: 40px 0;
  color: var(--text-muted);
  font-size: 13px;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  padding: 10px 20px;
  border-radius: var(--radius);
  font-size: 14px;
  z-index: 1000;
}
.toast.success { background: var(--success); color: #fff; }
.toast.error { background: var(--error); color: #fff; }
.toast.info { background: var(--bg-card); border: 1px solid var(--border); }

@media (max-width: 1100px) {
  .tag-page { height: auto; max-height: none; overflow: visible; }
  .tag-layout {
    grid-template-columns: 1fr;
    overflow: visible;
    min-height: auto;
    gap: 12px;
  }
  .dir-panel, .edit-panel, .file-panel {
    overflow: visible;
    min-height: auto;
  }
  .dir-tree { max-height: 200px; }
  .table-wrap { max-height: 50vh; }
  .edit-panel { order: 3; }
  .fetch-body { grid-template-columns: 1fr; }
  .fetch-list { border-right: none; border-bottom: 1px solid var(--border); max-height: 220px; }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .header-actions {
    display: flex;
    width: 100%;
  }
  .header-actions .btn-primary {
    width: 100%;
  }
  .file-toolbar {
    gap: 6px;
  }
  .filter-input {
    width: 132px;
    min-width: 132px;
  }
  .table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  table {
    min-width: 560px;
  }
  .edit-form {
    display: flex;
    flex-direction: column;
  }
  .edit-form label {
    flex-direction: column;
    align-items: stretch;
  }
  .edit-actions {
    flex-wrap: wrap;
  }
  .edit-actions button {
    flex: 1;
  }
  .toast {
    left: 12px;
    right: 12px;
    bottom: calc(var(--player-height) + var(--mobile-nav-height) + 16px);
  }
}
</style>
