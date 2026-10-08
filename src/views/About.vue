<template>
  <div class="about-page">
    <header class="about-hero card">
      <div class="hero-brand">
        <div class="about-icon-wrap">
          <img :src="APP_ICON_URL" alt="" class="about-icon" />
        </div>
        <div class="hero-text">
          <div class="hero-title-row">
            <h1 class="about-title">{{ APP_DISPLAY_NAME }}</h1>
            <span class="version-pill">v{{ info?.currentVersion || '—' }}</span>
            <span v-if="info?.updateAvailable" class="badge-new">有新版</span>
            <span v-else-if="info?.latestVersion && !loading" class="badge-ok">已最新</span>
          </div>
          <p class="about-desc">{{ APP_DESCRIPTION }}</p>
        </div>
      </div>
      <div class="hero-actions">
        <button class="btn-ghost btn-sm" type="button" @click="loadInfo" :disabled="loading">
          {{ loading ? '检测中…' : '检测更新' }}
        </button>
        <a :href="REPO_URL" target="_blank" rel="noopener" class="btn-ghost btn-sm">GitHub</a>
      </div>
      <div class="hero-foot">
        <ul class="feature-chips">
          <li v-for="(line, i) in APP_FEATURES" :key="i">{{ line }}</li>
        </ul>
        <p v-if="!info?.updateAvailable" class="hero-meta">
          仓库最新
          <template v-if="loading">检测中…</template>
          <template v-else-if="info?.latestVersion"><code>v{{ info.latestVersion }}</code></template>
          <template v-else-if="info?.checkError">获取失败</template>
          <template v-else>暂无发布</template>
          <span v-if="info?.checkedAt" class="text-muted"> · {{ formatDate(info.checkedAt) }}</span>
        </p>
        <p v-if="info?.checkError && !info?.updateAvailable" class="text-muted meta-error">{{ info.checkError }}</p>
      </div>
    </header>

    <!-- 仅提示有更新，不提供应用内下载（便于应用中心上架） -->
    <section v-if="info?.updateAvailable" class="update-notice card" role="status">
      <span class="update-notice-dot" aria-hidden="true" />
      <div class="update-notice-text">
        <strong>有新版本可用</strong>
        <span>
          v{{ info.latestVersion }}
          <template v-if="info.currentVersion">（当前 v{{ info.currentVersion }}）</template>
        </span>
      </div>
    </section>

    <div class="about-row">
      <section class="about-card card community-card">
        <h2 class="section-title">交流反馈</h2>
        <div class="community-body">
          <div class="community-info">
            <p class="community-name">飞牛柠檬🍋muisc</p>
            <p class="community-desc">加群反馈问题、交流用法，或获取安装与更新帮助。</p>
            <div class="community-id-row">
              <span class="community-id-label">群号</span>
              <code class="community-id">{{ QQ_GROUP_ID }}</code>
              <button type="button" class="btn-ghost btn-sm" @click="copyGroupId">
                {{ groupIdCopied ? '已复制' : '复制' }}
              </button>
            </div>
            <a
              class="btn-primary btn-sm community-join"
              :href="qqGroupJoinUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              打开 QQ 加群
            </a>
          </div>
          <figure class="community-qr">
            <img :src="QQ_GROUP_QR_URL" alt="飞牛柠檬 QQ 群二维码" class="community-qr-img" />
            <figcaption>扫码加入</figcaption>
          </figure>
        </div>
      </section>

      <section class="about-card card pwa-card">
        <h2 class="section-title">安装到桌面</h2>
        <p class="pwa-desc">
          请用 <strong>HTTPS</strong> 访问。Chrome / Edge 可一键安装；鸿蒙 / Safari 用浏览器菜单添加到主屏幕。
        </p>
        <div v-if="pwa.standalone" class="pwa-status ok">当前已在桌面应用模式</div>
        <template v-else>
          <button
            v-if="pwa.canInstall"
            class="btn-primary btn-sm pwa-install-btn"
            type="button"
            :disabled="pwaInstalling"
            @click="installPwa"
          >
            {{ pwaInstalling ? '请在系统弹窗中确认…' : '安装到桌面' }}
          </button>
          <ol v-if="pwa.canGuideInstall && !pwa.canInstall" class="pwa-steps">
            <template v-if="pwa.isHarmonyNext">
              <li>用手机浏览器打开本站（建议系统自带浏览器或 Chrome）</li>
              <li>打开右上角「⋮ / 菜单」→「添加到桌面」或「添加到主屏幕」</li>
              <li>从桌面图标重新打开；若仍显示地址栏，属鸿蒙 NEXT 当前限制</li>
            </template>
            <template v-else-if="pwa.isHarmony">
              <li>打开浏览器菜单「⋮」</li>
              <li>选择「添加到桌面」或「添加到主屏幕」</li>
              <li>从桌面图标启动以获得接近独立应用的体验</li>
            </template>
            <template v-else-if="pwa.isIosLike">
              <li>使用 Safari 打开本站</li>
              <li>点底部分享按钮 →「添加到主屏幕」</li>
              <li>确认添加后从主屏幕图标打开</li>
            </template>
            <template v-else>
              <li>使用 Chrome / Edge 打开本站</li>
              <li>点地址栏右侧安装图标，或菜单里的「安装应用」</li>
            </template>
          </ol>
          <p v-if="pwa.installHint" class="pwa-hint">{{ pwa.installHint }}</p>
        </template>
      </section>
    </div>

    <section class="about-card card ops-card">
      <div class="ops-head">
        <h2 class="section-title">排查与日志</h2>
        <button
          v-if="isAdminUser"
          class="btn-ghost btn-sm"
          type="button"
          @click="loadServerHealth"
          :disabled="healthLoading"
        >
          {{ healthLoading ? '刷新中…' : '刷新状态' }}
        </button>
      </div>
      <p class="log-path-desc">
        主日志一般为 <code>app.log</code>，依赖安装看 <code>npm-install.log</code>。
      </p>
      <div class="log-path-row">
        <span class="log-path-label">日志目录</span>
        <code class="log-path-value" :title="info?.logDir || ''">{{ info?.logDir || (loading ? '检测中…' : '暂不可用') }}</code>
        <button
          type="button"
          class="btn-ghost btn-sm"
          :disabled="!info?.logDir"
          @click="copyLogPath('dir')"
        >
          {{ logDirCopied ? '已复制' : '复制' }}
        </button>
      </div>
      <div class="log-path-row">
        <span class="log-path-label">主日志</span>
        <code class="log-path-value" :title="info?.appLogPath || ''">{{ info?.appLogPath || (loading ? '检测中…' : '暂不可用') }}</code>
        <button
          type="button"
          class="btn-ghost btn-sm"
          :disabled="!info?.appLogPath"
          @click="copyLogPath('app')"
        >
          {{ appLogCopied ? '已复制' : '复制' }}
        </button>
      </div>
      <p v-if="info && info.logDirExists === false" class="log-path-hint">
        当前目录尚未创建（本地开发或未写入过日志时常见）。飞牛上启用后一般会出现在 <code>/vol*/@appdata/lemon-music/log</code>。
      </p>

      <template v-if="isAdminUser">
        <div class="ops-divider" />
        <p v-if="serverHealth" class="ops-health-line">
          已运行 {{ formatUptime(serverHealth.uptime) }} ·
          内存约 {{ serverHealth.memory.rssMB }} MB ·
          扫描 {{ serverHealth.scan.running ? '进行中' : '空闲' }} ·
          下载 {{ serverHealth.downloads?.running || 0 }} 进行中 / {{ serverHealth.downloads?.pending || 0 }} 排队
        </p>
        <p v-else class="log-path-hint">无法获取服务状态，请确认服务已启动后点击刷新。</p>
        <details v-if="serverHealth?.memoryGuard" class="memory-details">
          <summary>
            内存缓存守护
            <span
              class="memory-guard-badge"
              :class="serverHealth.memoryGuard.nearLimit ? 'warn' : 'ok'"
            >
              {{ serverHealth.memoryGuard.nearLimit ? '接近清理阈值' : '正常' }}
            </span>
          </summary>
          <dl class="health-meta-list">
            <div class="health-meta-row">
              <dt>RSS / 软限制 / 硬限制</dt>
              <dd>
                {{ serverHealth.memoryGuard.rssMB }} / {{ serverHealth.memoryGuard.rssSoftLimitMB }} / {{ serverHealth.memoryGuard.rssHardLimitMB }} MB
              </dd>
            </div>
            <div class="health-meta-row">
              <dt>试听链接缓存</dt>
              <dd>{{ formatCacheStat(serverHealth.memoryGuard.caches?.playUrl) }}</dd>
            </div>
            <div class="health-meta-row">
              <dt>专辑详情缓存</dt>
              <dd>{{ formatCacheStat(serverHealth.memoryGuard.caches?.album) }}</dd>
            </div>
            <div class="health-meta-row">
              <dt>歌单解析缓存</dt>
              <dd>{{ formatCacheStat(serverHealth.memoryGuard.caches?.playlist) }}</dd>
            </div>
            <div class="health-meta-row">
              <dt>自动清理次数</dt>
              <dd>{{ serverHealth.memoryGuard.trimCount || 0 }} 次</dd>
            </div>
            <div class="health-meta-row">
              <dt>上次清理</dt>
              <dd>{{ formatHealthTime(serverHealth.memoryGuard.lastTrimAt) }}</dd>
            </div>
            <div class="health-meta-row">
              <dt>上次检查</dt>
              <dd>{{ formatHealthTime(serverHealth.memoryGuard.lastCheckAt) }}</dd>
            </div>
            <div v-if="serverHealth.memoryGuard.lastTrimRssMB" class="health-meta-row">
              <dt>上次清理时 RSS</dt>
              <dd>约 {{ serverHealth.memoryGuard.lastTrimRssMB }} MB</dd>
            </div>
          </dl>
          <p class="memory-guard-tip">
            RSS 超过 {{ serverHealth.memoryGuard.rssSoftLimitMB }} MB 时会自动裁剪试听/专辑/歌单缓存；超过 {{ serverHealth.memoryGuard.rssHardLimitMB }} MB 时清空相关缓存。
          </p>
        </details>
      </template>
    </section>

    <section v-if="isAdminUser" class="about-admin">
      <h2 class="section-title about-admin-heading">账号恢复</h2>
      <p class="account-info-text account-intro">
        忘记管理员密码时，要在 <b>NAS 命令行</b>里执行，<b>只改登录密码</b>，不会清空歌单、收藏或音乐文件。
        文件管理器改不了这个密码。仍记得密码时，直接去「设置 → 账号管理」改即可。
      </p>
      <div class="account-actions">
        <div class="account-action card">
          <h3 class="action-title">怎么打开命令行</h3>
          <p class="action-desc"><b>飞牛网页（推荐）</b>：电脑打开飞牛 → 控制面板开启 SSH → 打开「终端」应用，用<b>飞牛系统账号</b>登录。</p>
          <p class="action-desc"><b>电脑外部终端</b>：Windows 用「终端 / PowerShell」，Mac / Linux 用自带「终端」，执行 <code>ssh 飞牛用户名@NAS的IP</code>，密码是飞牛系统密码。</p>
          <p class="action-desc">飞牛终端里<b>不要用 npm</b>。配置一般在 <code>@appdata</code>（不是 <code>@appconf</code>）。先列出柠檬音乐账号，再把 <code>用户名</code>、<code>新密码</code> 换成柠檬音乐账号。不在 vol1 时改路径。需已安装应用中心 <b>Node.js v22</b>。</p>
          <div class="cmd-wrap">
            <span class="cmd-label">列出账号</span>
            <pre class="cmd-block">PATH=/var/apps/nodejs_v22/target/bin:$PATH CONFIG_PATH=/vol1/@appdata/lemon-music/config node /var/apps/lemon-music/target/scripts/reset-password.js --list</pre>
          </div>
          <div class="cmd-wrap">
            <span class="cmd-label">重置密码</span>
            <pre class="cmd-block">PATH=/var/apps/nodejs_v22/target/bin:$PATH CONFIG_PATH=/vol1/@appdata/lemon-music/config node /var/apps/lemon-music/target/scripts/reset-password.js 用户名 新密码</pre>
          </div>
          <p class="action-desc">自托管（电脑项目目录；<b>飞牛不要用 npm</b>，会提示 command not found）：</p>
          <div class="cmd-wrap">
            <span class="cmd-label">终端命令</span>
            <pre class="cmd-block">npm run auth:reset-password -- --list
npm run auth:reset-password -- 用户名 新密码</pre>
          </div>
        </div>
      </div>
      <p class="account-tip">
        <span class="account-tip-icon" aria-hidden="true">ℹ</span>
        账号在 <code>lx-music.db</code>（飞牛默认 <code>/vol1/@appdata/lemon-music/config/</code>，不是 <code>@appconf</code>）。若提示没有任何用户，请用 <code>find /vol1 /vol2 -name "lx-music.db"</code> 找对目录。执行后刷新登录页；若仍自动登录，清除本站 Cookie 或用无痕窗口。
      </p>
    </section>

    <p class="about-export-hint">
      本地播放失败或页面报错时，点下面按钮导出最近运行日志，发给开发者即可排查（不含登录密码）。
    </p>
    <div class="about-export-row">
      <button
        type="button"
        class="btn-ghost btn-sm"
        :disabled="exportingLogs"
        @click="exportRuntimeLogs"
      >
        {{ exportingLogs ? '导出中…' : exportedLogs ? '已导出' : '导出运行日志' }}
      </button>
    </div>
    <p class="about-footer">© {{ new Date().getFullYear() }} {{ APP_NAME }}</p>
  </div>

  <div v-if="toast" class="toast" :class="toast.type">{{ toast.text }}</div>
</template>

<script setup>
defineOptions({ name: 'About' })
import { ref, onMounted, onUnmounted } from 'vue'
import { api } from '../api.js'
import { checkForUpdate, hasUpdate } from '../composables/useUpdateCheck.js'
import { APP_NAME, APP_DISPLAY_NAME, APP_DESCRIPTION, APP_FEATURES, REPO_URL } from '../constants/app.js'
import { isAdmin as isAdminUser } from '../utils/auth.js'
import { getPwaInstallState, onPwaInstallState, promptPwaInstall } from '../utils/pwa.js'
import { APP_ICON_URL } from '../utils/appIcon.js'
import { formatRuntimeLogText, downloadTextFile, logRuntime } from '../utils/runtimeLog.js'

const QQ_GROUP_ID = '1126326017'
const QQ_GROUP_QR_URL = '/qq-group-qr.png'
const qqGroupJoinUrl = `https://qm.qq.com/cgi-bin/qm/qr?_wv=1027&jump_from=webapi&noverify=0&group_code=${QQ_GROUP_ID}`

const info = ref(null)
const loading = ref(false)
const serverHealth = ref(null)
const pwa = ref(getPwaInstallState())
const pwaInstalling = ref(false)
const groupIdCopied = ref(false)
const logDirCopied = ref(false)
const appLogCopied = ref(false)
const exportingLogs = ref(false)
const exportedLogs = ref(false)
let stopPwaWatch = null
let groupCopyTimer = null
let logDirCopyTimer = null
let appLogCopyTimer = null

const toast = ref(null)
let toastTimer = null

function showToast(text, type = 'info') {
  toast.value = { text, type }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 3200)
}

async function copyText(text, onOk) {
  const val = String(text || '').trim()
  if (!val) return
  try {
    await navigator.clipboard.writeText(val)
    onOk?.()
  } catch {}
}

async function exportRuntimeLogs() {
  if (exportingLogs.value) return
  exportingLogs.value = true
  try {
    logRuntime('info', 'about', 'export runtime log')
    const sections = []
    try {
      const res = await api.about.diagnostics()
      const data = res?.data || res || {}
      const envLines = [
        `version: ${data.currentVersion || info.value?.currentVersion || ''}`,
        `node: ${data.node || ''}`,
        `platform: ${data.platform || ''}`,
        `uptimeSec: ${data.uptimeSec ?? ''}`,
        `logDir: ${data.logDir || ''}`,
        `generatedAt: ${data.generatedAt || ''}`,
      ]
      sections.push({ title: '--- 服务环境 ---', body: envLines.join('\n') })
      if (data.recentText) {
        sections.push({ title: '--- 服务端近期记录 ---', body: data.recentText })
      }
      for (const [name, text] of Object.entries(data.tails || {})) {
        sections.push({ title: `--- 服务日志 ${name} ---`, body: text })
      }
    } catch (e) {
      sections.push({ title: '--- 服务端日志 ---', body: `获取失败：${e?.message || e}` })
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const ver = String(info.value?.currentVersion || '').replace(/[^\d.]+/g, '') || 'unknown'
    downloadTextFile(`lemon-music-log-v${ver}-${stamp}.txt`, formatRuntimeLogText(sections))
    exportedLogs.value = true
    showToast('已导出运行日志', 'success')
    window.setTimeout(() => { exportedLogs.value = false }, 2500)
  } catch (e) {
    showToast(e?.message || '导出失败', 'error')
  } finally {
    exportingLogs.value = false
  }
}

async function copyLogPath(kind) {
  if (kind === 'app') {
    await copyText(info.value?.appLogPath, () => {
      appLogCopied.value = true
      if (appLogCopyTimer) clearTimeout(appLogCopyTimer)
      appLogCopyTimer = setTimeout(() => { appLogCopied.value = false }, 2000)
    })
    return
  }
  await copyText(info.value?.logDir, () => {
    logDirCopied.value = true
    if (logDirCopyTimer) clearTimeout(logDirCopyTimer)
    logDirCopyTimer = setTimeout(() => { logDirCopied.value = false }, 2000)
  })
}

async function copyGroupId() {
  try {
    await navigator.clipboard.writeText(QQ_GROUP_ID)
    groupIdCopied.value = true
    if (groupCopyTimer) clearTimeout(groupCopyTimer)
    groupCopyTimer = setTimeout(() => { groupIdCopied.value = false }, 2000)
  } catch {}
}

async function installPwa() {
  pwaInstalling.value = true
  try {
    await promptPwaInstall()
  } finally {
    pwaInstalling.value = false
    pwa.value = getPwaInstallState()
  }
}
const healthLoading = ref(false)

onMounted(() => {
  loadInfo()
  if (isAdminUser.value) loadServerHealth()
  stopPwaWatch = onPwaInstallState((state) => {
    pwa.value = state
  })
})

onUnmounted(() => {
  if (typeof stopPwaWatch === 'function') stopPwaWatch()
  stopPwaWatch = null
  if (groupCopyTimer) clearTimeout(groupCopyTimer)
  if (logDirCopyTimer) clearTimeout(logDirCopyTimer)
  if (appLogCopyTimer) clearTimeout(appLogCopyTimer)
  if (toastTimer) clearTimeout(toastTimer)
})

async function loadServerHealth() {
  healthLoading.value = true
  try {
    serverHealth.value = await api.health()
  } catch {
    serverHealth.value = null
  } finally {
    healthLoading.value = false
  }
}

function formatCacheStat(cache) {
  if (!cache) return '—'
  const inflight = cache.inflight ? `，进行中 ${cache.inflight}` : ''
  return `${cache.size || 0} / ${cache.maxEntries || 0}${inflight}`
}

function formatHealthTime(iso) {
  if (!iso) return '尚未触发'
  return formatDate(iso)
}

function formatUptime(seconds = 0) {
  const s = Math.max(0, Number(seconds) || 0)
  if (s < 60) return `${s} 秒`
  if (s < 3600) return `${Math.floor(s / 60)} 分钟`
  if (s < 86400) return `${Math.floor(s / 3600)} 小时`
  return `${Math.floor(s / 86400)} 天`
}

async function loadInfo() {
  loading.value = true
  try {
    info.value = await checkForUpdate()
  } catch (e) {
    info.value = {
      currentVersion: '—',
      latestVersion: null,
      updateAvailable: false,
      checkError: e.message,
      repoUrl: REPO_URL,
    }
    hasUpdate.value = false
  } finally {
    loading.value = false
  }
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN')
  } catch {
    return iso
  }
}
</script>

<style scoped>
.about-page {
  width: 100%;
  max-width: none;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-sizing: border-box;
}

.about-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-items: stretch;
}

/* ── 顶部横条品牌区 ── */
.about-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px 16px;
  padding: 16px 18px;
}

.hero-brand {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  flex: 1;
}

.about-icon-wrap {
  width: 68px;
  height: 68px;
  border-radius: 16px;
  background: var(--lemon-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--lemon-glow);
  flex-shrink: 0;
}

.about-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  object-fit: cover;
  filter: brightness(1.05);
}

.hero-text {
  min-width: 0;
}

.hero-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.about-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
  line-height: 1.3;
}

.version-pill {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  padding: 2px 10px;
  border-radius: var(--radius-pill);
}

.about-privacy-hint {
  margin: 0.5rem 0 0;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--text-muted, #888);
  max-width: 36rem;
}
.about-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 0;
  max-width: none;
}

.about-repo {
  font-size: 12px;
  color: var(--accent);
  word-break: break-all;
  transition: color 0.15s;
}
.about-repo:hover { color: var(--accent-hover); }

.hero-actions {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
}

.hero-foot {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--border-light);
}

.feature-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.feature-chips li {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-secondary);
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  padding: 4px 10px;
  border-radius: var(--radius-pill);
}

.hero-meta {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* ── 更新小提示（无下载） ── */
.update-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: var(--accent-muted);
  border-color: var(--brand-border);
}
.update-notice-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}
.update-notice-text {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 10px;
  min-width: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}
.update-notice-text strong {
  font-size: 14px;
  font-weight: 650;
  color: var(--accent);
}
.toast {
  position: fixed;
  bottom: 80px;
  right: 24px;
  padding: 10px 20px;
  border-radius: var(--radius, 8px);
  font-size: 14px;
  z-index: 1000;
  box-shadow: var(--shadow, 0 8px 24px rgba(0, 0, 0, 0.25));
  max-width: min(420px, calc(100vw - 24px));
}
.toast.success { background: var(--success, #16a34a); color: #fff; }
.toast.error { background: var(--error, #dc2626); color: #fff; }
.toast.info { background: var(--bg-card, #1f2937); border: 1px solid var(--border, #374151); color: var(--text, #fff); }
@media (max-width: 768px) {
  .toast {
    left: 12px;
    right: 12px;
    bottom: calc(var(--player-height, 72px) + var(--mobile-nav-height, 56px) + 16px);
  }
}

.about-meta {
  padding: 12px 16px;
}
.meta-compact {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}
.meta-error { margin: 6px 0 0; font-size: 12px; }

.about-brief {
  padding: 14px 18px;
  gap: 10px;
}
.feature-list.compact {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding-left: 1.1rem;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
}

/* ── 双列内容区（旧样式保留兼容） ── */
.about-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-items: stretch;
}

.about-card {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
}

.pwa-card {
  padding: 14px 18px;
  gap: 4px;
}

.pwa-install-btn {
  align-self: flex-start;
  width: auto;
  min-width: 0;
  max-width: 100%;
  padding: 8px 16px;
  font-size: 13px;
  border-radius: var(--radius-pill, 999px);
}

.pwa-desc {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-secondary);
}

.pwa-status.ok {
  font-size: 13px;
  color: var(--accent);
  font-weight: 600;
}

.pwa-hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted, var(--text-secondary));
}
.pwa-steps {
  margin: 8px 0 0;
  padding-left: 1.2rem;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-secondary);
}
.pwa-steps li + li {
  margin-top: 4px;
}

.log-path-card,
.ops-card {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ops-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.ops-head .section-title { margin: 0; }
.ops-divider {
  height: 1px;
  background: var(--border-light);
  margin: 4px 0;
}
.ops-health-line {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-secondary);
}
.memory-details {
  border-radius: 10px;
  border: 1px solid var(--border-light);
  background: var(--bg-input);
  padding: 0 12px 10px;
}
.memory-details summary {
  cursor: pointer;
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  user-select: none;
}
.memory-details summary::-webkit-details-marker { display: none; }
.account-intro {
  margin: 0 0 4px;
  padding: 0 2px;
}
.log-path-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
}
.log-path-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.log-path-label {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
  min-width: 3.5em;
}
.log-path-value {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 1.4;
  word-break: break-all;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--bg-input, rgba(0, 0, 0, 0.2));
  border: 1px solid var(--border-light);
  color: var(--text);
}
.log-path-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}

.community-card {
  padding: 16px 18px;
}

.community-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}

.community-info {
  flex: 1;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.community-name {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: var(--text);
}

.community-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-secondary);
}

.community-id-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.community-id-label {
  font-size: 12px;
  color: var(--text-muted);
}

.community-id {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text);
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  padding: 4px 10px;
  border-radius: 8px;
}

.community-join {
  align-self: flex-start;
  text-decoration: none;
}

.community-qr {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.community-qr-img {
  width: 124px;
  height: 124px;
  object-fit: contain;
  border-radius: 12px;
  background: #fff;
  border: 1px solid var(--border-light);
  padding: 6px;
  box-sizing: border-box;
}

.community-qr figcaption {
  font-size: 12px;
  color: var(--text-muted);
}

.section-title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.feature-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

.feature-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.feature-dot {
  width: 6px;
  height: 6px;
  margin-top: 7px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}

.meta-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

.meta-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-light);
}

.meta-row:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.meta-row dt {
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.meta-row dd {
  margin: 0;
  font-size: 13px;
  text-align: right;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.meta-row dd code {
  background: var(--bg-input);
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 13px;
}

/* ── 管理员区 ── */
.about-admin {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.about-admin-heading {
  margin: 0;
  padding: 0 2px;
}

.about-admin-heading + .account-info,
.about-admin-heading + .account-actions {
  margin-top: 0;
}

.about-admin-heading:not(:first-child) {
  margin-top: 8px;
}

.account-info {
  padding: 16px 18px;
  background: var(--bg-input);
  border-color: var(--border-light);
}

.account-info-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}

.account-info-text {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.health-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.health-head .account-info-label {
  margin-bottom: 0;
}

.memory-guard-panel {
  margin-top: 4px;
  padding-top: 14px;
  border-top: 1px solid var(--border-light);
}

.memory-guard-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.memory-guard-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.memory-guard-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-light);
}
.memory-guard-badge.ok {
  color: var(--success);
  background: rgba(52, 199, 89, 0.1);
  border-color: rgba(52, 199, 89, 0.25);
}
.memory-guard-badge.warn {
  color: #d97706;
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.3);
}

.health-meta-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.health-meta-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.health-meta-row dt {
  color: var(--text-muted);
  flex-shrink: 0;
}

.health-meta-row dd {
  margin: 0;
  text-align: right;
  color: var(--text-secondary);
}

.memory-guard-tip {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-muted);
}

.account-path {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--bg-card);
  border: 1px solid var(--border-light);
}

.account-path-label {
  font-size: 11px;
  color: var(--text-muted);
}

.account-path-value {
  font-size: 12px;
  word-break: break-all;
  color: var(--text);
}

.account-actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
  align-items: stretch;
}

.account-action {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.action-title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.action-desc {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.action-steps,
.action-notes {
  margin: 0 0 14px;
  padding-left: 1.2em;
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-secondary);
}

.action-steps li + li,
.action-notes li + li {
  margin-top: 8px;
}

.cmd-wrap {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cmd-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
}

.about-admin code {
  font-size: 12px;
  background: var(--bg-input);
  padding: 1px 6px;
  border-radius: 4px;
}

.cmd-block {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  font-size: 12px;
  line-height: 1.5;
  overflow-x: auto;
  color: var(--text);
  font-family: ui-monospace, 'Cascadia Code', 'Consolas', monospace;
}

.account-tip {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 10px 14px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-muted);
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
}

.account-tip-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  border-radius: 50%;
  background: var(--accent-muted);
  color: var(--accent);
}

.text-muted { color: var(--text-muted); font-size: 13px; }

.badge-new {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: var(--accent-muted);
  color: var(--accent);
  border: 1px solid var(--brand-border);
}

.badge-ok {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: rgba(52, 199, 89, 0.12);
  color: var(--success);
  border: 1px solid rgba(52, 199, 89, 0.3);
}

.about-export-hint {
  margin: 16px 0 8px;
  text-align: center;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-muted);
}
.about-export-row {
  display: flex;
  justify-content: center;
  margin-bottom: 8px;
}
.about-footer {
  margin-top: 4px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .about-row {
    grid-template-columns: 1fr;
  }

  .community-body {
    flex-direction: column-reverse;
    align-items: stretch;
  }

  .community-qr {
    align-self: center;
  }

  .community-join {
    align-self: stretch;
    text-align: center;
  }

  .about-hero {
    grid-template-columns: 1fr;
  }

  .hero-foot {
    grid-column: auto;
  }

  .hero-actions {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .hero-actions .btn-primary,
  .hero-actions .btn-ghost {
    flex: 1;
    min-width: 140px;
    text-align: center;
  }

  .about-grid {
    grid-template-columns: 1fr;
  }

  .account-actions {
    grid-template-columns: 1fr;
  }

  .update-banner {
    flex-direction: column;
    align-items: stretch;
  }

  .meta-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .meta-row dd {
    text-align: left;
    justify-content: flex-start;
  }
}
</style>
