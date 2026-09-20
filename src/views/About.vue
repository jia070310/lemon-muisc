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
    </header>

    <!-- 更新：版本 + 说明 + 加速，一块说完 -->
    <section v-if="info?.updateAvailable" class="update-card card">
      <div class="update-head">
        <div class="update-head-text">
          <h2 class="update-title">新版本 v{{ info.latestVersion }}</h2>
          <p class="update-sub">
            当前 v{{ info.currentVersion }}
            <template v-if="info.publishedAt"> · {{ formatDate(info.publishedAt) }}</template>
          </p>
        </div>
        <a :href="info.releaseUrl || REPO_URL" target="_blank" rel="noopener" class="btn-primary btn-sm">打开 Release</a>
      </div>

      <details v-if="info.releaseNotes" class="update-notes">
        <summary>发布说明</summary>
        <pre class="update-notes-body">{{ info.releaseNotes }}</pre>
      </details>
      <p v-else class="update-notes-empty">暂无正文说明，可到 GitHub Release 查看。</p>

      <div v-if="info.installHints" class="update-install">
        <div class="update-install-title">FPK 安装包</div>
        <div v-if="fpkAssets.length" class="fpk-actions">
          <template v-for="asset in fpkAssets" :key="asset.name">
            <a
              class="btn-primary btn-sm fpk-btn"
              :href="asset.url"
              target="_blank"
              rel="noopener"
              :download="asset.name"
            >
              下载 {{ asset.label }}
              <span v-if="asset.sizeLabel" class="fpk-size">{{ asset.sizeLabel }}</span>
            </a>
            <a
              class="btn-ghost btn-sm fpk-btn"
              :href="asset.mirrorUrl"
              target="_blank"
              rel="noopener"
              title="国内加速下载"
            >
              {{ asset.label }} 加速
            </a>
          </template>
        </div>
        <p v-else class="update-install-line">
          暂未解析到 FPK 附件，请
          <a :href="info.releaseUrl || REPO_URL" target="_blank" rel="noopener">打开 Release</a>
          手动下载。
        </p>
        <p class="fpk-tip">
          {{ info.installHints.fpkHint }}
        </p>

        <div class="update-mirror">
          <div class="update-mirror-label">
            <span>国内加速（Docker）</span>
            <button type="button" class="btn-ghost btn-xs" @click="copyMirrorCmd">
              {{ mirrorCopied ? '已复制' : '复制命令' }}
            </button>
          </div>
          <code class="update-mirror-cmd">{{ info.installHints.dockerPullMirror }}</code>
          <p class="update-mirror-note">{{ info.installHints.mirrorNote }}</p>
        </div>
      </div>
    </section>

    <section v-else class="about-meta card">
      <div class="meta-compact">
        <span>仓库最新
          <template v-if="loading">检测中…</template>
          <template v-else-if="info?.latestVersion"><code>v{{ info.latestVersion }}</code></template>
          <template v-else-if="info?.checkError">获取失败</template>
          <template v-else>暂无发布</template>
        </span>
        <span v-if="info?.checkedAt" class="text-muted">检测于 {{ formatDate(info.checkedAt) }}</span>
      </div>
      <p v-if="info?.checkError" class="text-muted meta-error">{{ info.checkError }}</p>
    </section>

    <div class="about-row">
      <section class="about-card card about-brief">
        <ul class="feature-list compact">
          <li v-for="(line, i) in APP_FEATURES" :key="i">{{ line }}</li>
        </ul>
        <p class="privacy-one-liner">
          默认可选上报匿名日活（不含歌单/路径/账号）；可在「设置 → 日活统计」关闭。
        </p>
      </section>

      <section class="about-card card pwa-card">
        <h2 class="section-title">添加到桌面</h2>
        <p class="pwa-desc">
          支持 PWA：Safari / 系统浏览器可「添加到主屏幕」。推荐 HTTPS 访问；桌面 Chrome 可用地址栏安装。
        </p>
        <div v-if="pwa.standalone" class="pwa-status ok">当前已在桌面应用模式</div>
        <button
          v-else-if="pwa.canInstall"
          class="btn-primary btn-sm"
          type="button"
          :disabled="pwaInstalling"
          @click="installPwa"
        >
          {{ pwaInstalling ? '请在系统弹窗中确认…' : '安装到桌面' }}
        </button>
        <p v-else-if="!pwa.isSecureContext" class="pwa-hint">
          当前非 HTTPS，部分浏览器可能无法弹出安装提示。
        </p>
      </section>
    </div>

    <section class="about-card card community-card">
      <h2 class="section-title">互动群聊</h2>
      <div class="community-body">
        <div class="community-info">
          <p class="community-name">飞牛柠檬🍋muisc</p>
          <p class="community-desc">加入 QQ 群反馈问题、交流使用心得，或获取安装与更新帮助。</p>
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
            rel="noopener"
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

    <section v-if="isAdminUser" class="about-admin">
      <h2 class="section-title about-admin-heading">服务状态</h2>

      <div v-if="serverHealth" class="account-info card server-health-card">
        <div class="health-head">
          <span class="account-info-label">运行概览</span>
          <button class="btn-ghost btn-sm" type="button" @click="loadServerHealth" :disabled="healthLoading">
            {{ healthLoading ? '刷新中...' : '刷新' }}
          </button>
        </div>
        <p class="account-info-text">
          已运行 {{ formatUptime(serverHealth.uptime) }} ·
          内存占用约 {{ serverHealth.memory.rssMB }} MB（堆 {{ serverHealth.memory.heapUsedMB }}/{{ serverHealth.memory.heapTotalMB }} MB） ·
          音乐库扫描 {{ serverHealth.scan.running ? '进行中' : '空闲' }} ·
          下载任务 {{ serverHealth.downloads?.running || 0 }} 进行中 / {{ serverHealth.downloads?.pending || 0 }} 排队
        </p>

        <div v-if="serverHealth.memoryGuard" class="memory-guard-panel">
          <div class="memory-guard-title-row">
            <span class="memory-guard-title">内存缓存守护</span>
            <span
              class="memory-guard-badge"
              :class="serverHealth.memoryGuard.nearLimit ? 'warn' : 'ok'"
            >
              {{ serverHealth.memoryGuard.nearLimit ? '接近清理阈值' : '正常' }}
            </span>
          </div>
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
            当 RSS 超过 {{ serverHealth.memoryGuard.rssSoftLimitMB }} MB 时，服务会自动裁剪试听/专辑/歌单缓存；超过 {{ serverHealth.memoryGuard.rssHardLimitMB }} MB 时清空相关缓存。
          </p>
        </div>
      </div>
      <div v-else class="account-info card server-health-card">
        <p class="account-info-text text-muted">无法获取服务状态，请确认服务已启动后点击刷新。</p>
        <button class="btn-ghost btn-sm" type="button" @click="loadServerHealth" :disabled="healthLoading">
          {{ healthLoading ? '刷新中...' : '刷新' }}
        </button>
      </div>

      <h2 class="section-title about-admin-heading">账号与恢复</h2>

      <div class="account-info card">
        <p class="account-info-text">
          用户账号保存在配置目录内的数据库文件 <code>lx-music.db</code> 中。
        </p>
        <div class="account-path">
          <span class="account-path-label">飞牛 NAS 默认路径</span>
          <code class="account-path-value">/vol1/@appconf/lemon-music/config/</code>
        </div>
      </div>

      <div class="account-actions">
        <div class="account-action card">
          <h3 class="action-title">忘记密码</h3>
          <p class="action-desc">按优先级尝试以下方式：</p>
          <ol class="action-steps">
            <li>若初始化时勾选了「本地保存账号」，打开配置目录中的 <code>ADMIN_CREDENTIALS.txt</code> 查看。</li>
            <li>若已配置邮件，在登录页点击「忘记密码」通过邮箱重置。</li>
            <li>在服务器项目目录执行下方命令（将 <code>用户名</code>、<code>新密码</code> 替换为实际值）：</li>
          </ol>
          <div class="cmd-wrap">
            <span class="cmd-label">终端命令</span>
            <pre class="cmd-block">npm run auth:reset-password -- 用户名 新密码</pre>
          </div>
        </div>

        <div class="account-action card">
          <h3 class="action-title">清空所有用户</h3>
          <p class="action-desc">删除全部账号并重新进入初始化向导。</p>
          <ul class="action-notes">
            <li>音源、路径等应用设置会保留。</li>
            <li>执行后需重新创建管理员账号。</li>
          </ul>
          <div class="cmd-wrap">
            <span class="cmd-label">终端命令</span>
            <pre class="cmd-block">npm run auth:reset-users -- --yes</pre>
          </div>
        </div>
      </div>

      <p class="account-tip">
        <span class="account-tip-icon" aria-hidden="true">ℹ</span>
        执行命令后请刷新页面。若仍自动登录，请清除浏览器中本站的登录缓存。
      </p>
    </section>

    <p class="about-footer">© {{ new Date().getFullYear() }} {{ APP_NAME }}</p>
  </div>
</template>

<script setup>
defineOptions({ name: 'About' })
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '../api.js'
import { checkForUpdate, hasUpdate } from '../composables/useUpdateCheck.js'
import { APP_NAME, APP_DISPLAY_NAME, APP_DESCRIPTION, APP_FEATURES, REPO_URL } from '../constants/app.js'
import { isAdmin as isAdminUser } from '../utils/auth.js'
import { getPwaInstallState, onPwaInstallState, promptPwaInstall } from '../utils/pwa.js'
import { APP_ICON_URL } from '../utils/appIcon.js'

const QQ_GROUP_ID = '1126326017'
const QQ_GROUP_QR_URL = '/qq-group-qr.png'
/** 已安装 QQ 时尝试唤起加群页；否则请扫码或复制群号 */
const qqGroupJoinUrl = `mqqapi://card/show_psw?src_type=internal&version=1&uin=${QQ_GROUP_ID}&card_type=group&source=qrcode`

const info = ref(null)
const loading = ref(false)
const serverHealth = ref(null)
const pwa = ref(getPwaInstallState())
const pwaInstalling = ref(false)
const mirrorCopied = ref(false)
const groupIdCopied = ref(false)
let stopPwaWatch = null
let mirrorCopyTimer = null
let groupCopyTimer = null

const fpkAssets = computed(() => {
  const fromHints = info.value?.installHints?.fpkAssets
  if (Array.isArray(fromHints) && fromHints.length) return fromHints
  return Array.isArray(info.value?.fpkAssets) ? info.value.fpkAssets : []
})

async function copyMirrorCmd() {
  const cmd = info.value?.installHints?.dockerPullMirror
  if (!cmd) return
  try {
    await navigator.clipboard.writeText(cmd)
    mirrorCopied.value = true
    if (mirrorCopyTimer) clearTimeout(mirrorCopyTimer)
    mirrorCopyTimer = setTimeout(() => { mirrorCopied.value = false }, 2000)
  } catch {}
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
  if (mirrorCopyTimer) clearTimeout(mirrorCopyTimer)
  if (groupCopyTimer) clearTimeout(groupCopyTimer)
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
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
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

/* ── 更新卡片 ── */
.update-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
  background: var(--accent-muted);
  border-color: var(--brand-border);
}
.update-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.update-title {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: var(--accent);
}
.update-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}
.update-notes {
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 0 12px;
}
.update-notes summary {
  cursor: pointer;
  list-style: none;
  padding: 10px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  user-select: none;
}
.update-notes summary::-webkit-details-marker { display: none; }
.update-notes summary::after {
  content: '展开';
  float: right;
  font-weight: 500;
  font-size: 12px;
  color: var(--text-secondary);
}
.update-notes[open] summary::after { content: '收起'; }
.update-notes-body {
  margin: 0 0 12px;
  padding: 0;
  max-height: min(40vh, 320px);
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-secondary);
}
.update-notes-empty {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}
.update-install {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.update-install-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.update-install-line {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}
.fpk-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.fpk-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
}
.fpk-size {
  font-size: 11px;
  opacity: 0.75;
  font-weight: 500;
}
.fpk-tip {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text);
  background: rgba(255, 180, 60, 0.12);
  border: 1px solid rgba(255, 180, 60, 0.28);
}
.update-mirror {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.update-mirror-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}
.update-mirror-cmd {
  display: block;
  font-size: 12px;
  line-height: 1.45;
  word-break: break-all;
  color: var(--accent);
}
.update-mirror-note {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted, var(--text-secondary));
}
.btn-xs {
  padding: 2px 8px;
  font-size: 11px;
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
.privacy-one-liner {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted, var(--text-secondary));
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
  width: 148px;
  height: 148px;
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
    flex-direction: column;
    align-items: stretch;
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
