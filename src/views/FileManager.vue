<template>
  <div class="file-manager-page">
    <div class="fm-head">
      <h2>文件管理</h2>
      <p class="fm-desc">管理本地音乐文件：查找重复曲目，或按歌手整理迁移音乐库</p>
    </div>

    <div class="fm-tabs">
      <button
        type="button"
        class="fm-tab"
        :class="{ active: activeTab === 'dedup' }"
        @click="activeTab = 'dedup'"
      >
        去重
      </button>
      <button
        type="button"
        class="fm-tab"
        :class="{ active: activeTab === 'organize' }"
        @click="activeTab = 'organize'"
      >
        整理
      </button>
    </div>

    <!-- ============ 去重 ============ -->
    <section v-if="activeTab === 'dedup'" class="fm-panel">
      <div class="fm-panel-toolbar">
        <button
          type="button"
          class="btn-primary btn-sm"
          :disabled="dupScanning"
          @click="scanDuplicates"
        >
          {{ dupScanning ? '扫描中…' : '扫描重复曲目' }}
        </button>
        <template v-if="dupResult.groups.length">
          <span class="fm-summary">
            共 {{ dupResult.groupCount }} 组、{{ dupResult.fileCount }} 个文件
          </span>
          <div class="fm-batch-actions">
            <button
              type="button"
              class="btn-ghost btn-sm"
              :disabled="!selectedPaths.size || batchDeleting"
              @click="deleteSelected"
            >
              删除选中（{{ selectedPaths.size }}）
            </button>
            <button
              type="button"
              class="btn-ghost btn-sm"
              :disabled="batchDeleting"
              @click="keepBestDeleteRest"
            >
              每组保留最佳，删除其余
            </button>
            <button
              type="button"
              class="btn-ghost btn-sm"
              :disabled="!selectedPaths.size"
              @click="clearSelection"
            >
              取消选择
            </button>
          </div>
        </template>
      </div>

      <div v-if="!dupResult.groups.length" class="fm-empty">
        <p>{{ dupScanned ? '未发现重复曲目' : '点击「扫描重复曲目」查找同歌名+歌手的重复文件' }}</p>
      </div>

      <div v-else class="dup-list">
        <div v-for="(g, gi) in dupResult.groups" :key="gi" class="dup-group">
          <div class="dup-group-title">
            <strong>{{ g.title || '未知标题' }}</strong>
            <span>{{ g.artist || '未知歌手' }}</span>
            <span class="dup-count">{{ g.count }} 份</span>
          </div>
          <ul class="dup-files">
            <li v-for="(f, fi) in g.files" :key="fi" class="dup-file-row">
              <label class="dup-check">
                <input
                  type="checkbox"
                  :checked="selectedPaths.has(f.filePath)"
                  @change="toggleSelect(f.filePath)"
                />
              </label>
              <code :title="f.filePath" class="dup-path">{{ f.fileName || f.filePath }}</code>
              <span v-if="f.bitrate" class="dup-meta">{{ Math.round(f.bitrate / 1000) }}kbps</span>
              <span class="dup-file-actions">
                <button
                  type="button"
                  class="btn-ghost btn-sm"
                  :disabled="dupDeletingPath === f.filePath"
                  :title="'保留该文件，勾选同组其余文件'"
                  @click="declareKeepBest(f)"
                >
                  保留此项
                </button>
                <button
                  type="button"
                  class="btn-ghost btn-sm"
                  :disabled="dupDeletingPath === f.filePath || g.files.length <= 1"
                  :title="g.files.length <= 1 ? '至少保留一份' : '从磁盘永久删除'"
                  @click="deleteDupFile(g, f)"
                >
                  {{ dupDeletingPath === f.filePath ? '删除中…' : '删除文件' }}
                </button>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- ============ 整理 ============ -->
    <section v-if="activeTab === 'organize'" class="fm-panel">
      <!-- 左右分栏：左侧目录树，右侧文件勾选 -->
      <div class="org-layout">
        <!-- 左：目录树 -->
        <div class="org-dir-panel card">
          <div class="org-panel-head">
            <span class="org-panel-title">文件夹</span>
            <button
              class="btn-ghost btn-sm"
              :disabled="orgLoadingDirs"
              @click="loadOrgDirs"
            >
              {{ orgLoadingDirs ? '加载中…' : '刷新' }}
            </button>
          </div>
          <p v-if="!orgRootDirs.length" class="org-picker-empty">
            暂无已配置的音乐库目录。请先在「设置 → 文件路径」中添加音乐目录。
          </p>
          <div v-else-if="orgLoadingDirs" class="org-picker-loading">正在加载目录…</div>
          <div v-else class="org-tree">
            <template v-for="row in orgVisibleTree" :key="row.path">
              <div
                class="org-tree-row"
                :class="{ active: orgActiveDir === row.path }"
                :style="{ paddingLeft: `${row.depth * 16 + 10}px` }"
              >
                <button
                  type="button"
                  class="org-tree-toggle"
                  :class="{ open: row.expanded }"
                  :disabled="row.loading"
                  @click.stop="toggleOrgNode(row.path)"
                >
                  <svg v-if="row.loading" class="spin" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.2-8.56"/></svg>
                  <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
                <svg class="org-tree-folder" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"/></svg>
                <span
                  class="org-tree-label"
                  :title="row.path"
                  @click="selectOrgFolder(row.path)"
                >{{ row.name }}</span>
              </div>
            </template>
          </div>
        </div>

        <!-- 右：当前文件夹文件勾选区 -->
        <div class="org-file-panel card">
          <div class="org-panel-head">
            <span class="org-panel-title">文件列表</span>
            <span class="org-count">
              {{ orgFiles.length }} 个文件 · 已选 {{ orgPickedFiles.size }}
            </span>
          </div>
          <div v-if="orgActiveDir" class="org-current-dir" :title="orgActiveDir">{{ orgActiveDir }}</div>

          <template v-if="orgFiles.length">
            <div class="org-files-toolbar">
              <label class="org-check-all">
                <input
                  type="checkbox"
                  :checked="orgFiles.length > 0 && orgFiles.every((f) => orgPickedFiles.has(f.filePath))"
                  @change="toggleAllOrgFiles"
                />
                全选本文件夹
              </label>
              <button
                type="button"
                class="btn-ghost btn-sm"
                :disabled="!orgPickedFiles.size"
                @click="orgPickedFiles = new Set()"
              >
                清空选择
              </button>
            </div>
            <ul class="org-file-list">
              <li v-for="f in orgFiles" :key="f.filePath">
                <label class="org-file-label" :title="f.filePath">
                  <input
                    type="checkbox"
                    :checked="orgPickedFiles.has(f.filePath)"
                    @change="toggleOrgFile(f.filePath)"
                  />
                  <span class="org-file-name">{{ f.fileName || f.filePath }}</span>
                </label>
              </li>
            </ul>
          </template>
          <div v-else class="org-picker-empty">
            {{ orgActiveDir ? '该文件夹内没有音频文件' : '点击左侧文件夹查看其中的音频文件' }}
          </div>

          <!-- 已选文件汇总（跨文件夹累计） -->
          <div v-if="orgPickedFiles.size" class="org-picked-summary">
            <div class="org-picked-head">
              <strong>已选 {{ orgPickedFiles.size }} 个文件</strong>
            </div>
            <ul class="org-picked-list">
              <li v-for="p in [...orgPickedFiles].slice(0, 100)" :key="p">
                <code :title="p">{{ p }}</code>
              </li>
            </ul>
            <p v-if="orgPickedFiles.size > 100" class="org-picked-more">等 {{ orgPickedFiles.size }} 个文件</p>
          </div>
        </div>
      </div>

      <div class="org-form">
        <h3>迁移目标</h3>
        <p class="org-desc">
          按「目标目录 / 歌手名 / 歌曲文件」结构整理所选文件。多歌手歌曲取第一位歌手。
          迁移后目标目录会自动加入音乐库扫描。
        </p>
        <div class="org-field">
          <label for="org-target">目标目录</label>
          <input
            id="org-target"
            v-model="organizeTarget"
            type="text"
            class="input"
            placeholder="例如 /vol1/1000/MusicOrganized 或 D:/Music/Organized"
            :disabled="organizing"
          />
        </div>
        <div class="org-actions">
          <button
            type="button"
            class="btn-primary"
            :disabled="!canStartOrganize || organizing"
            @click="startOrganize"
          >
            {{ organizing ? '整理中…' : '开始整理' }}
          </button>
          <button
            type="button"
            class="btn-ghost"
            :disabled="!organizeResult"
            @click="organizeResult = null"
          >
            清除结果
          </button>
        </div>
      </div>

      <div v-if="organizeResult" class="org-result">
        <h3>整理完成</h3>
        <p class="org-summary">
          <span>迁移 <strong>{{ organizeResult.moved }}</strong> 首</span>
          <span v-if="organizeResult.skipped">跳过 <strong>{{ organizeResult.skipped }}</strong> 首</span>
          <span v-if="organizeResult.failed">
            <strong class="text-danger">{{ organizeResult.failed }}</strong> 首失败
          </span>
          <span>共 <strong>{{ organizeResult.artists }}</strong> 位歌手</span>
        </p>
        <p class="org-target-done">目标目录：<code>{{ organizeResult.targetDir }}</code></p>

        <div v-if="organizeResult.failedList?.length" class="org-failed">
          <h4>失败列表</h4>
          <ul>
            <li v-for="(item, i) in organizeResult.failedList" :key="i">
              <code>{{ item.filePath }}</code> — {{ item.error }}
            </li>
          </ul>
        </div>
        <div v-if="organizeResult.movedList?.length" class="org-moved">
          <h4>迁移明细</h4>
          <div class="org-moved-count">已显示前 50 条，共 {{ organizeResult.movedList.length }} 条</div>
          <ul>
            <li v-for="(item, i) in organizeResult.movedList.slice(0, 50)" :key="i">
              <code class="org-from">{{ item.from }}</code>
              <span class="org-arrow">→</span>
              <code class="org-to">{{ item.to }}</code>
            </li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
defineOptions({ name: 'FileManager' })
import { ref, computed, watch } from 'vue'
import { api } from '../api.js'
import { appConfirm } from '../stores/appDialog.js'
import { reloadLibraryTracksFromServer } from '../stores/library.js'

const activeTab = ref('dedup')

/* 切换到整理 Tab 时加载目录树 */
watch(activeTab, (tab) => {
  if (tab === 'organize' && !orgRootDirs.value.length) {
    loadOrgDirs()
  }
})

/* ---------- 去重 ---------- */
const dupScanning = ref(false)
const dupScanned = ref(false)
const dupResult = ref({ groupCount: 0, fileCount: 0, groups: [] })
const dupDeletingPath = ref('')
const selectedPaths = ref(new Set())
const batchDeleting = ref(false)

function toggleSelect(filePath) {
  const next = new Set(selectedPaths.value)
  if (next.has(filePath)) next.delete(filePath)
  else next.add(filePath)
  selectedPaths.value = next
}

function clearSelection() {
  selectedPaths.value = new Set()
}

function pruneDupResult() {
  const groups = (dupResult.value.groups || [])
    .map((g) => ({
      ...g,
      files: (g.files || []).filter(Boolean),
      count: (g.files || []).length,
    }))
    .filter((g) => g.files.length > 1)
  const fileCount = groups.reduce((n, g) => n + g.files.length, 0)
  dupResult.value = { groupCount: groups.length, fileCount, groups }
  // 清除已不存在的选中项
  const exist = new Set(dupResult.value.groups.flatMap((g) => g.files.map((f) => f.filePath)))
  const next = new Set([...selectedPaths.value].filter((p) => exist.has(p)))
  selectedPaths.value = next
}

async function scanDuplicates() {
  if (dupScanning.value) return
  dupScanning.value = true
  try {
    const res = await api.library.duplicates()
    dupResult.value = res?.data || { groupCount: 0, fileCount: 0, groups: [] }
    dupScanned.value = true
  } catch (e) {
    alert(e.message || '查重失败')
  } finally {
    dupScanning.value = false
  }
}

async function deleteDupFile(group, file) {
  const filePath = file?.filePath
  if (!filePath || dupDeletingPath.value) return
  if ((group?.files || []).length <= 1) return
  const name = file.fileName || filePath
  const ok = await appConfirm({
    title: '永久删除文件',
    message: `确定从磁盘永久删除？\n\n${name}`,
    hint: '此操作不可恢复。',
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  dupDeletingPath.value = filePath
  try {
    const res = await api.library.deleteFiles([filePath])
    const failed = res?.data?.failed || []
    if (failed.length) {
      alert(failed[0]?.error || '删除失败')
      return
    }
    group.files = group.files.filter((f) => f.filePath !== filePath)
    pruneDupResult()
  } catch (e) {
    alert(e.message || '删除失败')
  } finally {
    dupDeletingPath.value = ''
  }
}

/** 用「保留最佳」策略挑选每组中应保留的那个文件：优先更高的音质和更完整的文件名 */
function pickBestFile(group) {
  const files = [...(group.files || [])]
  const rank = (f) => {
    let score = 0
    score += Math.round(Number(f.bitrate) || 0) // 音质
    const name = String(f.fileName || '')
    if (/flac|ape|wav/i.test(name)) score += 100000
    else if (/m4a|aac/i.test(name)) score += 50000
    else if (/mp3/i.test(name)) score += 10000
    // 文件名信息更完整（包含 - 或较长）说明更可能是规范命名的正式文件
    if (name.includes('-')) score += 5000
    score += Math.min(name.length, 200)
    return score
  }
  return files.sort((a, b) => rank(b) - rank(a))[0]
}

/** 点击某文件「保留最佳」：保留该文件，勾选同组内其余文件（用于批量删除） */
function declareKeepBest(file) {
  const group = dupResult.value.groups.find((g) => (g.files || []).some((f) => f.filePath === file.filePath))
  if (!group) return
  const next = new Set(selectedPaths.value)
  for (const f of group.files) {
    if (f.filePath === file.filePath) next.delete(f.filePath)
    else next.add(f.filePath)
  }
  selectedPaths.value = next
}

/** 一键：每组保留最佳文件，其余全部删除 */
async function keepBestDeleteRest() {
  const groups = dupResult.value.groups
  const toDelete = []
  for (const g of groups) {
    const best = pickBestFile(g)
    for (const f of g.files) {
      if (f.filePath !== best.filePath) toDelete.push(f.filePath)
    }
  }
  if (!toDelete.length) return
  const ok = await appConfirm({
    title: '批量删除重复文件',
    message: `将删除 ${toDelete.length} 个文件（每组保留音质/命名最佳的 1 份），此操作不可恢复。`,
    hint: '建议先核对选中列表。',
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  await runBatchDelete(toDelete)
}

async function deleteSelected() {
  const list = [...selectedPaths.value]
  if (!list.length) return
  const ok = await appConfirm({
    title: '批量删除选中文件',
    message: `确定从磁盘永久删除选中的 ${list.length} 个文件？此操作不可恢复。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  await runBatchDelete(list)
}

async function runBatchDelete(list) {
  if (batchDeleting.value) return
  batchDeleting.value = true
  try {
    const res = await api.library.deleteFiles(list)
    const data = res?.data || {}
    const failed = data.failed || []
    const deleted = new Set(data.deleted || [])
    for (const g of dupResult.value.groups) {
      g.files = (g.files || []).filter((f) => !deleted.has(f.filePath))
    }
    pruneDupResult()
    if (failed.length) {
      alert(`${deleted.size > 0 ? `已删除 ${deleted.size} 个，` : ''}${failed.length} 个删除失败：${failed[0]?.error || ''}`)
    }
  } catch (e) {
    alert(e.message || '批量删除失败')
  } finally {
    batchDeleting.value = false
  }
}

/* ---------- 整理 ---------- */
const organizeTarget = ref('')
const organizing = ref(false)
const organizeResult = ref(null)

// 仅文件模式：勾选文件整理

/* 目录树状态（复用标签编辑器交互） */
const orgRootDirs = ref([])
const orgExpanded = ref(new Set())
const orgTreeCache = ref({})
const orgActiveDir = ref('')
const orgLoadingDirs = ref(false)
/* 文件列表 + 跨文件夹累计勾选 */
const orgFiles = ref([])
const orgPickedFiles = ref(new Set())

const canStartOrganize = computed(() => {
  if (!organizeTarget.value.trim() || organizing.value) return false
  return orgPickedFiles.value.size > 0
})

function orgGetTreeEntry(dirPath) {
  return orgTreeCache.value[dirPath] || { dirs: [], loaded: false, loading: false }
}

function orgFolderName(dirPath, depth) {
  if (!dirPath) return ''
  const parts = String(dirPath).replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] || dirPath
}

const orgVisibleTree = computed(() => {
  const rows = []
  const visit = (dirPath, depth) => {
    const cached = orgGetTreeEntry(dirPath)
    const expanded = orgExpanded.value.has(dirPath)
    rows.push({
      path: dirPath,
      name: orgFolderName(dirPath, depth),
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
  for (const root of orgRootDirs.value) visit(root, 0)
  return rows
})

async function loadOrgDirs() {
  if (orgLoadingDirs.value) return
  orgLoadingDirs.value = true
  try {
    const res = await api.paths.list()
    orgRootDirs.value = res.data || []
    orgExpanded.value = new Set()
    orgTreeCache.value = {}
    if (orgRootDirs.value.length) {
      orgActiveDir.value = orgRootDirs.value[0]
      // 自动展开一级子目录，并加载第一个根下的音频
      for (const root of orgRootDirs.value.slice(0, 2)) {
        await ensureOrgChildren(root)
        if (orgGetTreeEntry(root).loaded) orgExpanded.value.add(root)
      }
      orgExpanded.value = new Set(orgExpanded.value)
      await loadOrgFiles(orgActiveDir.value)
    }
  } catch (e) {
    alert(e.message || '加载目录失败')
  } finally {
    orgLoadingDirs.value = false
  }
}

async function ensureOrgChildren(dirPath) {
  const cached = orgGetTreeEntry(dirPath)
  if (cached.loaded || cached.loading) return
  orgTreeCache.value = {
    ...orgTreeCache.value,
    [dirPath]: { ...cached, loading: true },
  }
  try {
    const res = await api.tag.listDir(dirPath)
    const data = res.data || {}
    orgTreeCache.value = {
      ...orgTreeCache.value,
      [dirPath]: { dirs: data.dirs || [], loaded: true, loading: false },
    }
  } catch (e) {
    orgTreeCache.value = {
      ...orgTreeCache.value,
      [dirPath]: { dirs: [], loaded: true, loading: false },
    }
  }
}

async function toggleOrgNode(dirPath) {
  if (orgExpanded.value.has(dirPath)) {
    const next = new Set(orgExpanded.value)
    next.delete(dirPath)
    orgExpanded.value = next
    return
  }
  await ensureOrgChildren(dirPath)
  const next = new Set(orgExpanded.value)
  next.add(dirPath)
  orgExpanded.value = next
}

/** 点击文件夹：加载该文件夹内的音频文件（不递归，仅当前层） */
async function selectOrgFolder(dirPath) {
  orgActiveDir.value = dirPath
  await ensureOrgChildren(dirPath)
  await loadOrgFiles(dirPath)
}

async function loadOrgFiles(dirPath) {
  try {
    const res = await api.tag.listDir(dirPath)
    orgFiles.value = (res.data?.files || []).filter((f) => f.filePath)
  } catch (e) {
    orgFiles.value = []
    alert(e.message || '加载文件失败')
  }
}

function toggleOrgFile(filePath) {
  const next = new Set(orgPickedFiles.value)
  if (next.has(filePath)) next.delete(filePath)
  else next.add(filePath)
  orgPickedFiles.value = next
}

function toggleAllOrgFiles() {
  const all = orgFiles.value.map((f) => f.filePath)
  const allPicked = all.length > 0 && all.every((p) => orgPickedFiles.value.has(p))
  const next = new Set(orgPickedFiles.value)
  for (const p of all) {
    if (allPicked) next.delete(p)
    else next.add(p)
  }
  orgPickedFiles.value = next
}

async function startOrganize() {
  const target = organizeTarget.value.trim()
  if (!target) {
    alert('请填写目标目录')
    return
  }
  if (!orgPickedFiles.value.size) {
    alert('请勾选要整理的音频文件')
    return
  }
  const filePaths = [...orgPickedFiles.value]
  const scopeLabel = `已选 ${filePaths.length} 个文件`

  const ok = await appConfirm({
    title: '按歌手整理',
    message: `将 ${scopeLabel} 中的歌曲迁移到：\n${target}\n\n按「目标目录/歌手名/歌曲」结构整理。迁移后原文件将被移动到新位置。`,
    hint: '建议先备份重要文件。此操作会物理移动文件。',
    confirmText: '开始整理',
  })
  if (!ok) return
  organizing.value = true
  organizeResult.value = null
  try {
    const res = await api.library.organize(target, { scope: 'files', filePaths })
    organizeResult.value = res?.data || {}
    alert(`整理完成：迁移 ${organizeResult.value.moved || 0} 首，跳过 ${organizeResult.value.skipped || 0} 首${organizeResult.value.failed ? `，失败 ${organizeResult.value.failed} 首` : ''}`)
    if (organizeResult.value.moved) {
      selectedPaths.value = new Set()
      orgPickedFiles.value = new Set()
      dupScanned.value = false
      dupResult.value = { groupCount: 0, fileCount: 0, groups: [] }
      // 强制全量重载音乐库：确保新旧记录一致、歌手列表/去重列表同步
      try {
        await reloadLibraryTracksFromServer(api)
      } catch {}
    }
  } catch (e) {
    if (e.message) alert(e.message)
    else alert('整理失败')
  } finally {
    organizing.value = false
  }
}
</script>

<style scoped>
.file-manager-page {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 4px 0 32px;
}
.fm-head {
  margin-bottom: 16px;
}
.fm-head h2 {
  margin: 0 0 6px;
  font-size: 20px;
}
.fm-desc {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}
.fm-tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 18px;
}
.fm-tab {
  border: none;
  background: transparent;
  padding: 9px 18px;
  font-size: 14px;
  color: var(--text-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.fm-tab:hover {
  color: var(--text);
}
.fm-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 600;
}
.fm-panel {
  min-width: 0;
}
.fm-panel-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}
.fm-summary {
  font-size: 13px;
  color: var(--text-muted);
}
.fm-batch-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}
.fm-empty {
  padding: 32px 0;
  color: var(--text-muted);
  font-size: 14px;
  text-align: center;
  background: var(--bg-hover);
  border-radius: 10px;
}
.dup-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.dup-group {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-card);
}
.dup-group-title {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--bg-hover);
  font-size: 14px;
}
.dup-group-title strong {
  font-size: 14px;
}
.dup-group-title span {
  color: var(--text-muted);
  font-size: 13px;
}
.dup-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-muted);
  background: var(--bg);
  padding: 2px 8px;
  border-radius: 10px;
}
.dup-files {
  list-style: none;
  margin: 0;
  padding: 0;
}
.dup-file-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-top: 1px solid var(--border);
  font-size: 13px;
}
.dup-file-row:hover {
  background: var(--bg-hover);
}
.dup-check {
  display: inline-flex;
  align-items: center;
}
.dup-check input {
  width: 15px;
  height: 15px;
  accent-color: var(--accent);
  cursor: pointer;
}
.dup-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text);
}
.dup-meta {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}
.dup-file-actions {
  display: flex;
  gap: 6px;
  white-space: nowrap;
}

/* 整理 */
/* 左右分栏：左目录树 + 右文件列表 */
.org-layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: 16px;
  margin-bottom: 18px;
  min-width: 0;
  align-items: stretch;
}
.org-dir-panel,
.org-file-panel {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 0;
  max-height: 520px;
}
.org-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-shrink: 0;
}
.org-panel-title {
  font-size: 14px;
  font-weight: 600;
}
.org-picker-empty,
.org-picker-loading {
  padding: 24px 8px;
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.org-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 0;
}
.org-tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 5px 10px 5px 10px;
  border-radius: 6px;
  cursor: pointer;
}
.org-tree-row:hover {
  background: var(--bg-hover);
}
.org-tree-row.active {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.org-tree-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.15s ease;
}
.org-tree-toggle.open {
  transform: rotate(90deg);
}
.org-tree-folder {
  color: var(--accent);
  flex-shrink: 0;
}
.org-tree-label {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.spin {
  animation: org-spin 0.8s linear infinite;
}
@keyframes org-spin {
  to { transform: rotate(360deg); }
}

/* 文件勾选区 */
.org-file-panel {
  min-width: 0;
}
.org-current-dir {
  padding: 6px 10px;
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}
.org-files-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.org-check-all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.org-check-all input {
  accent-color: var(--accent);
}
.org-count {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 12px;
  white-space: nowrap;
}
.org-file-list {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.org-file-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  min-width: 0;
}
.org-file-label:hover {
  background: var(--bg-hover);
}
.org-file-label input {
  accent-color: var(--accent);
  flex-shrink: 0;
}
.org-file-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 已选文件汇总（跨文件夹累计） */
.org-picked-summary {
  margin-top: 12px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 6%, var(--bg-card));
  overflow: hidden;
}
.org-picked-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--accent) 12%, var(--bg-card));
  font-size: 13px;
}
.org-picked-list {
  list-style: none;
  margin: 0;
  padding: 6px 12px;
  max-height: 150px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}
.org-picked-list code {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
}
.org-picked-more {
  margin: 0;
  padding: 0 12px 8px;
  font-size: 11px;
  color: var(--text-muted);
}

.org-form {
  max-width: 640px;
}
.org-form h3 {
  margin: 0 0 8px;
  font-size: 16px;
}
.org-desc {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.6;
}
.org-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}
.org-field label {
  font-size: 13px;
  color: var(--text);
  font-weight: 500;
}
.org-field .input {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text);
}
.org-field .input:focus {
  outline: none;
  border-color: var(--accent);
}
.org-actions {
  display: flex;
  gap: 10px;
}
.org-result {
  margin-top: 24px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  background: var(--bg-card);
}
.org-result h3 {
  margin: 0 0 10px;
  font-size: 16px;
}
.org-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin: 0 0 8px;
  font-size: 14px;
}
.org-summary strong {
  color: var(--text);
}
.org-summary strong.text-danger {
  color: var(--danger);
}
.org-target-done {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--text-muted);
}
.org-target-done code {
  word-break: break-all;
}
.org-failed,
.org-moved {
  margin-top: 14px;
}
.org-failed h4,
.org-moved h4 {
  margin: 0 0 8px;
  font-size: 14px;
}
.org-moved-count {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 8px;
}
.org-failed ul,
.org-moved ul {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 260px;
  overflow: auto;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.org-failed li {
  color: var(--danger);
  word-break: break-all;
}
.org-moved li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  word-break: break-all;
}
.org-from {
  color: var(--text-muted);
  flex: 1;
  min-width: 0;
}
.org-arrow {
  color: var(--text-muted);
  flex-shrink: 0;
}
.org-to {
  flex: 1;
  min-width: 0;
  color: var(--text);
}

/* 窄屏：左右分栏改为上下堆叠 */
@media (max-width: 768px) {
  .org-layout {
    grid-template-columns: 1fr;
  }
  .org-dir-panel,
  .org-file-panel {
    max-height: none;
  }
  .org-tree {
    max-height: 220px;
  }
  .org-file-list {
    max-height: 260px;
  }
}
</style>