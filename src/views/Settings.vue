<template>
  <div class="settings-page">
    <aside class="settings-nav">
      <h2 class="nav-title">设置</h2>
      <p class="nav-sub">个性化您的音乐体验</p>
      <button
        v-for="tab in tabs" :key="tab.id"
        :class="['nav-tab', { active: activeTab === tab.id }]"
        @click="activeTab = tab.id"
      >{{ tab.label }}</button>
    </aside>

    <main class="settings-panel card">
      <h3 class="panel-title">{{ currentTab.label }}</h3>

      <!-- 文件路径 -->
      <div v-if="activeTab === 'paths'" class="panel-body">
        <div v-if="needsPathSetup" class="setup-alert">
          <strong>尚未配置数据目录</strong>
          <p>请到飞牛「应用设置 → <b>访问权限</b>」用文件夹选择器添加音乐库与下载目录（会自动授权），保存后停用再启用应用。也可在「运行设置」填写绝对路径。</p>
        </div>
        <div v-else class="config-summary card-inner">
          <div class="block-label">已配置的数据目录</div>
          <div class="summary-row">
            <span class="summary-key">音乐库</span>
            <code class="summary-val">{{ mountInfo?.music?.host || '未设置' }}</code>
          </div>
          <div class="summary-row">
            <span class="summary-key">下载</span>
            <code class="summary-val">{{ mountInfo?.downloads?.host || '未设置' }}</code>
          </div>
          <div class="summary-row" v-if="mountProbeText">
            <span class="summary-key">探测</span>
            <span class="summary-val">{{ mountProbeText }}</span>
          </div>
          <p class="summary-tip">修改路径：飞牛应用设置 → 运行设置（或访问权限授权两个文件夹）→ 保存后停用再启用。</p>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">音乐文件夹</div>
            <div class="setting-item-desc">
              扫描音乐时使用的目录。请使用 NAS 绝对路径（如 <code>/vol1/1000/Music</code>），同一物理目录只会保留一条。
              {{ fnosAvailable ? '点击「选择文件夹」会调用系统文件管理器。' : '' }}
            </div>
          </div>
          <div class="setting-item-action">
            <button v-if="fnosAvailable" class="btn-primary btn-sm" @click="browseAddPath" :disabled="pickingFolder">
              {{ pickingFolder ? '选择中...' : '选择文件夹' }}
            </button>
            <button v-else class="btn-primary btn-sm" @click="addPath">添加路径</button>
          </div>
        </div>

        <div v-if="filePaths.length" class="path-block">
          <div class="block-label">已添加的文件夹</div>
          <div v-for="p in filePaths" :key="p" class="path-row">
            <template v-if="editingPath === p">
              <input v-model="editPathValue" class="path-input" @keydown.enter="saveEditPath(p)" />
              <button v-if="fnosAvailable" class="btn-sm btn-ghost" @click="browseEditPath(p)" :disabled="pickingFolder">浏览</button>
              <button class="btn-sm btn-primary" @click="saveEditPath(p)">保存</button>
              <button class="btn-sm btn-ghost" @click="cancelEditPath">取消</button>
            </template>
            <template v-else>
              <span class="path-text" :title="p">{{ p }}</span>
              <div class="path-actions">
                <button v-if="fnosAvailable" class="btn-sm btn-ghost" @click="browseReplacePath(p)" :disabled="pickingFolder">浏览</button>
                <button class="btn-sm btn-ghost" @click="startEditPath(p)">修改</button>
                <button class="btn-sm btn-danger" @click="removePath(p)" :disabled="filePaths.length <= 1">移除</button>
              </div>
            </template>
          </div>
        </div>
        <div v-else class="empty-hint">暂无文件夹，请添加或选择路径</div>

        <div v-if="!fnosAvailable" class="path-manual">
          <input v-model="newPath" placeholder="手动输入绝对路径，如 /vol1/1000/Music" class="path-input" @keydown.enter="addPath" />
          <button class="btn-primary btn-sm" @click="addPath">添加</button>
        </div>
      </div>

      <!-- 音源管理 -->
      <div v-if="activeTab === 'source'" class="panel-body">
        <p class="source-tip">支持同时激活多个音源。试听 / 下载时按平台匹配，同一平台有多个音源时优先使用最近激活的，失败会自动尝试其他已激活音源。</p>
        <div class="source-list" v-if="sourceList.length">
          <div v-for="s in sourceList" :key="s.id" class="source-item" :class="{ active: isSourceActive(s.id) }">
            <div class="source-info">
              <span class="source-name">{{ s.name }}</span>
              <span class="source-meta">{{ s.author || '未知作者' }} · v{{ s.version || '?' }}{{ isSourceActive(s.id) ? ' · 已激活' : '' }}</span>
            </div>
            <div class="source-actions">
              <button v-if="!isSourceActive(s.id)" class="btn-sm btn-primary" @click="activateSource(s.id)">激活</button>
              <button v-else class="btn-sm btn-ghost" @click="deactivateSource(s.id)">停用</button>
              <button class="btn-sm btn-danger" @click="removeSource(s.id)">删除</button>
            </div>
          </div>
        </div>
        <div v-else class="empty-hint">暂未导入音源</div>

        <div class="import-tabs">
          <button :class="['pill-tab', { active: importMode === 'file' }]" @click="importMode = 'file'">本地导入</button>
          <button :class="['pill-tab', { active: importMode === 'url' }]" @click="importMode = 'url'">在线导入</button>
        </div>
        <div class="import-area" v-if="importMode === 'file'">
          <input type="file" ref="fileInput" accept=".js" @change="importFile" style="display:none" />
          <button class="btn-primary btn-sm" @click="$refs.fileInput.click()">选择文件</button>
          <span class="hint">支持 .js 格式的自定义音源脚本</span>
        </div>
        <div class="import-area" v-else>
          <input v-model="importUrl" placeholder="输入音源脚本链接" class="url-input" />
          <button class="btn-primary btn-sm" @click="importFromUrl" :disabled="importingUrl">
            {{ importingUrl ? '导入中...' : '导入' }}
          </button>
        </div>
      </div>

      <!-- 试听设置 -->
      <div v-if="activeTab === 'player'" class="panel-body">
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">界面主题</div>
            <div class="setting-item-desc">深色夜间模式或浅色日间模式</div>
          </div>
          <select v-model="settings['ui.theme']" @change="saveTheme" class="setting-select">
            <option value="dark">深色</option>
            <option value="light">浅色</option>
          </select>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">封面样式</div>
            <div class="setting-item-desc">播放栏封面显示方式</div>
          </div>
          <select v-model="settings['player.coverStyle']" @change="saveSetting('player.coverStyle')" class="setting-select">
            <option value="disc">圆形（播放时旋转）</option>
            <option value="card">圆角方形（固定不转）</option>
          </select>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">音频可视化</div>
            <div class="setting-item-desc">播放栏背景与全屏播放页显示频谱动态效果</div>
          </div>
          <label class="toggle"><input type="checkbox" :checked="settings['player.visualizer'] === 'true'" @change="toggleSetting('player.visualizer')" /><span class="slider"></span></label>
        </div>
      </div>

      <!-- 下载设置 -->
      <div v-if="activeTab === 'download'" class="panel-body">
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">保存路径</div>
            <div class="setting-item-desc">下载文件的默认保存目录</div>
          </div>
          <select v-model="downloadPath" @change="saveDownloadPath" :disabled="!filePaths.length" class="setting-select">
            <option v-for="p in filePaths" :key="p" :value="p">{{ p }}</option>
          </select>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">文件名格式</div>
            <div class="setting-item-desc">下载文件的命名规则</div>
          </div>
          <select v-model="settings['download.fileName']" @change="saveSetting('download.fileName')" class="setting-select">
            <option value="{name} - {singer}">歌名 - 歌手</option>
            <option value="{singer} - {name}">歌手 - 歌名</option>
            <option value="{name}">仅歌名</option>
          </select>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">最大并发</div>
            <div class="setting-item-desc">同时下载的任务数量</div>
          </div>
          <select v-model="settings['download.maxDownloadNum']" @change="saveSetting('download.maxDownloadNum')" class="setting-select">
            <option v-for="n in 6" :key="n" :value="String(n)">{{ n }}</option>
          </select>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">跳过已存在文件</div>
            <div class="setting-item-desc">目标路径已有同名文件时跳过下载</div>
          </div>
          <label class="toggle"><input type="checkbox" :checked="settings['download.skipExistFile'] === 'true'" @change="toggleSetting('download.skipExistFile')" /><span class="slider"></span></label>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">按专辑名分组</div>
            <div class="setting-item-desc">按歌曲专辑名创建子文件夹保存</div>
          </div>
          <label class="toggle"><input type="checkbox" :checked="settings['download.isSavePathGroupByListName'] === 'true'" @change="toggleSetting('download.isSavePathGroupByListName')" /><span class="slider"></span></label>
        </div>
      </div>

      <!-- 内嵌数据 -->
      <div v-if="activeTab === 'embed'" class="panel-body">
        <div class="setting-item" v-for="item in embedItems" :key="item.key">
          <div class="setting-item-info">
            <div class="setting-item-label">{{ item.label }}</div>
            <div class="setting-item-desc">{{ item.desc }}</div>
          </div>
          <label class="toggle"><input type="checkbox" :checked="settings[item.key] === 'true'" @change="toggleSetting(item.key)" /><span class="slider"></span></label>
        </div>
      </div>

      <!-- 歌词文件 -->
      <div v-if="activeTab === 'lrc'" class="panel-body">
        <div class="setting-item" v-for="item in lrcToggleItems" :key="item.key">
          <div class="setting-item-info">
            <div class="setting-item-label">{{ item.label }}</div>
            <div class="setting-item-desc">{{ item.desc }}</div>
          </div>
          <label class="toggle"><input type="checkbox" :checked="settings[item.key] === 'true'" @change="toggleSetting(item.key)" /><span class="slider"></span></label>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">歌词编码</div>
            <div class="setting-item-desc">独立歌词文件的字符编码</div>
          </div>
          <select v-model="settings['download.lrcFormat']" @change="saveSetting('download.lrcFormat')" class="setting-select">
            <option value="utf8">UTF-8</option>
            <option value="gbk">GBK</option>
          </select>
        </div>
      </div>
    </main>

    <div v-if="toast" class="toast" :class="toast.type">{{ toast.text }}</div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { api } from '../api.js'
import { loadCoverStyle, loadVisualizerSetting } from '../stores/player.js'
import { canPickFolder, pickFolder } from '../utils/fnos.js'
import { applyTheme, theme as currentTheme, THEME_KEY } from '../utils/theme.js'

const settings = reactive({})
const sourceList = ref([])
const activeSourceIds = ref([])
const fileInput = ref(null)
const toast = ref(null)
const importMode = ref('file')
const importUrl = ref('')
const importingUrl = ref(false)
const filePaths = ref([])
const downloadPath = ref('')
const newPath = ref('')
const editingPath = ref('')
const editPathValue = ref('')
const fnosAvailable = ref(false)
const pickingFolder = ref(false)
const editFromPicker = ref(false)
const activeTab = ref('paths')
const needsPathSetup = ref(false)
const mountInfo = ref(null)
const mountProbeText = ref('')

function parseActiveIds(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (raw == null || raw === '') return []
  const s = String(raw).trim()
  if (!s) return []
  try {
    const parsed = JSON.parse(s)
    if (Array.isArray(parsed)) return parsed.filter(Boolean)
  } catch {}
  return [s]
}

function isSourceActive(id) {
  return activeSourceIds.value.includes(id)
}

const tabs = [
  { id: 'paths', label: '文件路径' },
  { id: 'source', label: '音源管理' },
  { id: 'player', label: '试听设置' },
  { id: 'download', label: '下载设置' },
  { id: 'embed', label: '内嵌数据' },
  { id: 'lrc', label: '歌词文件' },
]

const embedItems = [
  { key: 'download.isEmbedPic', label: '内嵌封面', desc: '将封面写入音频文件' },
  { key: 'download.isEmbedLyric', label: '内嵌歌词', desc: '将歌词写入音频文件' },
  { key: 'download.isEmbedLyricT', label: '内嵌翻译歌词', desc: '写入翻译版歌词' },
  { key: 'download.isEmbedLyricR', label: '内嵌罗马音歌词', desc: '写入罗马音歌词' },
]

const lrcToggleItems = [
  { key: 'download.isDownloadLrc', label: '下载歌词文件', desc: '在下载目录保存同名 .lrc 文件' },
  { key: 'download.isDownloadTLrc', label: '下载翻译歌词', desc: '写入 .lrc 时附带翻译' },
  { key: 'download.isDownloadRLrc', label: '下载罗马音歌词', desc: '写入 .lrc 时附带罗马音' },
]

const currentTab = computed(() => tabs.find(t => t.id === activeTab.value) || tabs[0])

watch(currentTheme, (v) => {
  settings[THEME_KEY] = v
})

onMounted(async () => {
  try {
    fnosAvailable.value = await canPickFolder()
  } catch {}
  try {
    const s = await api.settings.get()
    Object.assign(settings, s)
    activeSourceIds.value = parseActiveIds(settings['source.active'])
    if (!settings['player.coverStyle']) settings['player.coverStyle'] = 'disc'
    if (settings['player.visualizer'] == null) settings['player.visualizer'] = 'true'
    if (!settings[THEME_KEY]) settings[THEME_KEY] = currentTheme.value
    applyTheme(settings[THEME_KEY])
  } catch {}
  try {
    sourceList.value = await api.source.list()
    const fromList = sourceList.value.filter(s => s.active).map(s => s.id)
    if (fromList.length) activeSourceIds.value = fromList
  } catch {}
  await loadPaths()
})

async function loadPaths() {
  try {
    const res = await api.paths.list()
    filePaths.value = res.data || []
    downloadPath.value = res.downloadPath || filePaths.value[0] || ''
    needsPathSetup.value = Boolean(res.setup?.needsPathConfig)
    mountInfo.value = res.setup?.mountInfo || null
    const mp = res.setup?.musicProbe
    const musicLabel = '音乐库'
    if (res.setup?.mountLooksEmpty) {
      mountProbeText.value = '警告：音乐库目录是空的。请到「运行设置」确认路径并停用后重新启用。'
    } else if (mp?.readable) {
      mountProbeText.value = `探测 ${musicLabel}：共 ${mp.entryCount} 项，音频 ${mp.audioCount} 个`
    } else if (mp?.error) {
      mountProbeText.value = `探测 ${musicLabel} 失败：${mp.error}`
    } else {
      mountProbeText.value = ''
    }
  } catch {}
}

async function addPath(fromPicker = false) {
  const val = newPath.value.trim()
  if (!val) return
  try {
    const res = await api.paths.add(val, fromPicker)
    filePaths.value = res.data || []
    downloadPath.value = res.downloadPath || downloadPath.value
    newPath.value = ''
    showToast(fromPicker ? '路径已添加（NAS 路径已自动转换为容器路径）' : '路径已添加', 'success')
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function browseAddPath() {
  pickingFolder.value = true
  try {
    const path = await pickFolder({ title: '选择音乐文件夹' })
    if (!path) return
    newPath.value = path
    await addPath(true)
  } catch (e) {
    if (e.message && !e.message.includes('未选择')) showToast(e.message, 'error')
  } finally {
    pickingFolder.value = false
  }
}

async function browseReplacePath(oldPath) {
  pickingFolder.value = true
  try {
    const path = await pickFolder({ title: '选择新文件夹' })
    if (!path) return
    const res = await api.paths.update(oldPath, path, true)
    filePaths.value = res.data || []
    downloadPath.value = res.downloadPath || downloadPath.value
    showToast('路径已更新', 'success')
  } catch (e) {
    if (e.message && !e.message.includes('未选择')) showToast(e.message, 'error')
  } finally {
    pickingFolder.value = false
  }
}

async function browseEditPath(oldPath) {
  pickingFolder.value = true
  try {
    const path = await pickFolder({ title: '选择新文件夹' })
    if (!path) return
    editPathValue.value = path
    editFromPicker.value = true
  } catch (e) {
    if (e.message && !e.message.includes('未选择')) showToast(e.message, 'error')
  } finally {
    pickingFolder.value = false
  }
}

function startEditPath(p) {
  editingPath.value = p
  editPathValue.value = p
  editFromPicker.value = false
}

function cancelEditPath() {
  editingPath.value = ''
  editPathValue.value = ''
  editFromPicker.value = false
}

async function saveEditPath(oldPath) {
  const val = editPathValue.value.trim()
  if (!val || val === oldPath) {
    cancelEditPath()
    return
  }
  try {
    const res = await api.paths.update(oldPath, val, editFromPicker.value)
    filePaths.value = res.data || []
    downloadPath.value = res.downloadPath || downloadPath.value
    cancelEditPath()
    showToast('路径已更新', 'success')
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function removePath(dirPath) {
  try {
    const res = await api.paths.remove(dirPath)
    filePaths.value = res.data || []
    downloadPath.value = res.downloadPath || filePaths.value[0] || ''
    showToast('路径已删除', 'success')
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function saveDownloadPath() {
  try {
    await api.paths.setDownload(downloadPath.value)
    showToast('下载路径已更新', 'success')
  } catch (e) {
    showToast(e.message, 'error')
    await loadPaths()
  }
}

async function saveSetting(key) {
  try {
    await api.settings.update({ [key]: settings[key] })
    if (key === 'player.coverStyle') loadCoverStyle()
    if (key === 'player.visualizer') loadVisualizerSetting()
    if (key === THEME_KEY) applyTheme(settings[key])
  } catch (e) { showToast(e.message, 'error') }
}

async function saveTheme() {
  applyTheme(settings[THEME_KEY])
  await saveSetting(THEME_KEY)
}

function toggleSetting(key) {
  settings[key] = settings[key] === 'true' ? 'false' : 'true'
  saveSetting(key)
}

async function importFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    const res = await api.source.importFile(file)
    if (res.error) throw new Error(res.error)
    showToast(`导入成功: ${res.name || file.name}`, 'success')
    sourceList.value = await api.source.list()
  } catch (e) {
    showToast(e.message, 'error')
  }
  e.target.value = ''
}

async function importFromUrl() {
  if (!importUrl.value.trim()) return
  importingUrl.value = true
  try {
    const res = await api.source.importUrl(importUrl.value.trim())
    if (res.error) throw new Error(res.error)
    showToast(`导入成功: ${res.name}`, 'success')
    sourceList.value = await api.source.list()
    importUrl.value = ''
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    importingUrl.value = false
  }
}

async function activateSource(id) {
  try {
    const res = await api.source.activate(id)
    if (Array.isArray(res?.activeIds)) {
      activeSourceIds.value = res.activeIds
    } else if (!activeSourceIds.value.includes(id)) {
      activeSourceIds.value = [...activeSourceIds.value, id]
    }
    sourceList.value = sourceList.value.map(s => ({
      ...s,
      active: activeSourceIds.value.includes(s.id),
    }))
    showToast('音源已激活', 'success')
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function deactivateSource(id) {
  try {
    const res = await api.source.deactivate(id)
    if (Array.isArray(res?.activeIds)) {
      activeSourceIds.value = res.activeIds
    } else {
      activeSourceIds.value = activeSourceIds.value.filter(x => x !== id)
    }
    sourceList.value = sourceList.value.map(s => ({
      ...s,
      active: activeSourceIds.value.includes(s.id),
    }))
    showToast('音源已停用', 'success')
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function removeSource(id) {
  try {
    await api.source.remove(id)
    sourceList.value = sourceList.value.filter(s => s.id !== id)
    activeSourceIds.value = activeSourceIds.value.filter(x => x !== id)
    showToast('已删除', 'success')
  } catch (e) {
    showToast(e.message, 'error')
  }
}

function showToast(text, type = 'info') {
  toast.value = { text, type }
  setTimeout(() => { toast.value = null }, 3000)
}
</script>

<style scoped>
.settings-page {
  display: flex;
  gap: 24px;
  max-width: 960px;
  min-height: calc(100vh - 160px);
}

.settings-nav {
  width: 180px;
  flex-shrink: 0;
}
.nav-title { font-size: 22px; font-weight: 600; margin-bottom: 4px; }
.nav-sub { font-size: 12px; color: var(--text-muted); margin-bottom: 20px; line-height: 1.5; }

.nav-tab {
  display: block;
  width: 100%;
  text-align: left;
  padding: 9px 12px;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 2px;
  position: relative;
  transition: all 0.15s;
}
.nav-tab:hover { background: var(--bg-hover); color: var(--text); }
.nav-tab.active {
  background: var(--accent-muted);
  color: var(--accent);
  font-weight: 500;
}
.nav-tab.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 18px;
  background: var(--accent);
  border-radius: 0 2px 2px 0;
}

.settings-panel { flex: 1; min-width: 0; padding: 24px 28px; }
.panel-title { font-size: 18px; font-weight: 600; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border-light); }
.panel-body { display: flex; flex-direction: column; }

.setup-alert {
  margin-bottom: 16px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(255, 193, 7, 0.1);
  border: 1px solid rgba(255, 193, 7, 0.3);
  font-size: 13px;
  line-height: 1.6;
}
.setup-alert strong { color: #ffc107; }
.setup-alert p { margin: 6px 0 0; color: var(--text-muted); }
.setup-alert-sub { margin-top: 8px !important; font-size: 12px; }
.config-summary {
  margin-bottom: 16px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(108, 158, 255, 0.08);
  border: 1px solid rgba(108, 158, 255, 0.25);
  font-size: 13px;
  line-height: 1.6;
}
.summary-row {
  display: flex;
  gap: 12px;
  align-items: baseline;
  margin-top: 6px;
  flex-wrap: wrap;
}
.summary-key {
  color: var(--text-muted);
  min-width: 120px;
  font-size: 12px;
}
.summary-val {
  font-size: 12px;
  word-break: break-all;
}
.summary-tip {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}
.setup-hint {
  margin-bottom: 16px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid var(--border-light);
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
}
.setup-hint code { font-size: 11px; }

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-light);
}
.setting-item:last-child { border-bottom: none; }
.setting-item-info { flex: 1; min-width: 0; }
.setting-item-label { font-size: 14px; font-weight: 500; margin-bottom: 2px; }
.setting-item-desc { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
.setting-item-action { flex-shrink: 0; }
.setting-select { min-width: 180px; font-size: 13px; }

.path-block { margin-top: 8px; }
.block-label { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }
.path-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--radius);
  background: var(--bg-input);
  margin-bottom: 6px;
}
.path-text { flex: 1; min-width: 0; font-size: 13px; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.path-actions { display: flex; gap: 6px; flex-shrink: 0; }
.path-manual { display: flex; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-light); }
.path-input { flex: 1; min-width: 0; font-size: 13px; }
.empty-hint { font-size: 13px; color: var(--text-muted); padding: 12px 0; }

.source-tip {
  margin: 0 0 14px;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
  background: var(--bg-secondary, var(--surface-2, rgba(0,0,0,0.04)));
  border-radius: 8px;
}
.source-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.source-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-radius: var(--radius);
  background: var(--bg-input);
  border: 1px solid transparent;
}
.source-item.active { border-color: var(--accent); background: var(--accent-muted); }
.source-info { display: flex; flex-direction: column; gap: 2px; }
.source-name { font-size: 14px; font-weight: 500; }
.source-meta { font-size: 12px; color: var(--text-muted); }
.source-actions { display: flex; gap: 6px; }

.import-tabs { display: flex; gap: 6px; margin-bottom: 12px; }
.pill-tab {
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  background: var(--bg-input);
  color: var(--text-secondary);
  font-size: 13px;
  border: 1px solid var(--border);
}
.pill-tab:hover { background: var(--bg-hover); }
.pill-tab.active { background: var(--accent); color: #fff; border-color: var(--accent); }

.import-area { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.url-input { flex: 1; min-width: 200px; }
.hint { font-size: 12px; color: var(--text-muted); }

.toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  cursor: pointer;
  flex-shrink: 0;
}
.toggle input { display: none; }
.slider {
  position: absolute;
  inset: 0;
  background: var(--border);
  border-radius: 24px;
  transition: 0.25s;
}
.slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: 0.25s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
.toggle input:checked + .slider { background: var(--accent); }
.toggle input:checked + .slider::before { transform: translateX(20px); }

.toast {
  position: fixed;
  bottom: 80px;
  right: 24px;
  padding: 10px 20px;
  border-radius: var(--radius);
  font-size: 14px;
  z-index: 1000;
  animation: fadeIn 0.2s;
  box-shadow: var(--shadow);
}
.toast.success { background: var(--success); color: #fff; }
.toast.error { background: var(--error); color: #fff; }
.toast.info { background: var(--bg-card); border: 1px solid var(--border); }

@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

@media (max-width: 768px) {
  .settings-page { flex-direction: column; gap: 12px; }
  .settings-nav {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 12px 14px;
    position: sticky;
    top: 0;
    z-index: 5;
    background: var(--bg);
  }
  .nav-title { width: 100%; font-size: 18px; margin-bottom: 0; }
  .nav-sub { width: 100%; margin-bottom: 4px; }
  .nav-tab {
    width: auto;
    display: inline-block;
    padding: 7px 12px;
    font-size: 13px;
    margin-bottom: 0;
  }
  .nav-tab.active::before { display: none; }
  .settings-panel { padding: 16px; }
  .panel-title { font-size: 16px; margin-bottom: 14px; padding-bottom: 12px; }
  .setting-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  .setting-item-action { width: 100%; }
  .setting-select { width: 100%; min-width: 0; }
  .path-row { flex-wrap: wrap; }
  .path-actions { width: 100%; }
  .path-manual { flex-direction: column; }
  .source-item { flex-direction: column; align-items: flex-start; gap: 10px; }
  .source-actions { width: 100%; }
  .import-area { flex-direction: column; align-items: stretch; }
  .url-input { min-width: 0; width: 100%; }
  .toast {
    left: 12px;
    right: 12px;
    bottom: calc(var(--player-height) + var(--mobile-nav-height) + 16px);
  }
}
</style>
