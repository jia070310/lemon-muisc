<template>
  <div class="about-page">
    <header class="about-hero card">
      <div class="hero-brand">
        <div class="about-icon-wrap">
          <img src="/icon.png" alt="" class="about-icon" />
        </div>
        <div class="hero-text">
          <div class="hero-title-row">
            <h1 class="about-title">{{ APP_DISPLAY_NAME }}</h1>
            <span class="version-pill">v{{ info?.currentVersion || '—' }}</span>
          </div>
          <p class="about-desc">{{ APP_DESCRIPTION }}</p>
          <a :href="REPO_URL" target="_blank" rel="noopener" class="about-repo">{{ REPO_URL }}</a>
        </div>
      </div>
      <div class="hero-actions">
        <button class="btn-ghost btn-sm" @click="loadInfo" :disabled="loading">
          {{ loading ? '检测中...' : '重新检测更新' }}
        </button>
        <a :href="REPO_URL" target="_blank" rel="noopener" class="btn-primary btn-sm">打开 GitHub 仓库</a>
      </div>
    </header>

    <div v-if="info?.updateAvailable" class="update-banner card">
      <div class="update-banner-text">
        <strong>发现新版本 v{{ info.latestVersion }}</strong>
        <span>当前版本 v{{ info.currentVersion }}，建议更新以获得最新功能与修复。</span>
      </div>
      <a :href="info.releaseUrl || REPO_URL" target="_blank" rel="noopener" class="btn-primary btn-sm">前往更新</a>
    </div>

    <div class="about-grid">
      <section class="about-card card">
        <h2 class="section-title">功能特性</h2>
        <ul class="feature-list">
          <li v-for="(line, i) in APP_FEATURES" :key="i" class="feature-item">
            <span class="feature-dot" aria-hidden="true" />
            <span>{{ line }}</span>
          </li>
        </ul>
      </section>

      <section class="about-card card">
        <h2 class="section-title">版本信息</h2>
        <dl class="meta-list">
          <div class="meta-row">
            <dt>当前版本</dt>
            <dd><code>v{{ info?.currentVersion || '—' }}</code></dd>
          </div>
          <div class="meta-row">
            <dt>仓库最新版</dt>
            <dd>
              <template v-if="loading">检测中...</template>
              <template v-else-if="info?.latestVersion">
                <code>v{{ info.latestVersion }}</code>
                <span v-if="info.updateAvailable" class="badge-new">可更新</span>
                <span v-else class="badge-ok">已是最新</span>
              </template>
              <template v-else-if="info?.checkError">
                <span class="text-muted">获取失败：{{ info.checkError }}</span>
              </template>
              <template v-else>
                <span class="text-muted">仓库暂无发布版本</span>
              </template>
            </dd>
          </div>
          <div v-if="info?.publishedAt" class="meta-row">
            <dt>最新发布时间</dt>
            <dd class="text-muted">{{ formatDate(info.publishedAt) }}</dd>
          </div>
          <div v-if="info?.checkedAt" class="meta-row">
            <dt>检测时间</dt>
            <dd class="text-muted">{{ formatDate(info.checkedAt) }}</dd>
          </div>
        </dl>
      </section>
    </div>

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
import { ref, onMounted } from 'vue'
import { api } from '../api.js'
import { checkForUpdate, hasUpdate } from '../composables/useUpdateCheck.js'
import { APP_NAME, APP_DISPLAY_NAME, APP_DESCRIPTION, APP_FEATURES, REPO_URL } from '../constants/app.js'
import { isAdmin as isAdminUser } from '../utils/auth.js'

const info = ref(null)
const loading = ref(false)
const serverHealth = ref(null)
const healthLoading = ref(false)

onMounted(() => {
  loadInfo()
  if (isAdminUser.value) loadServerHealth()
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
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ── 顶部横条品牌区 ── */
.about-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 22px;
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

.about-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height:  1.5;
  margin: 0 0 4px;
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

/* ── 更新横幅 ── */
.update-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  background: var(--accent-muted);
  border-color: var(--brand-border);
}

.update-banner-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary);
  min-width: 0;
}

.update-banner-text strong {
  color: var(--accent);
  font-size: 14px;
}

/* ── 双列内容区 ── */
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

.section-title {
  margin: 0 0 14px;
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
