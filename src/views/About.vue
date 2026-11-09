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
        <button
          class="btn-sm"
          :class="info?.updateAvailable ? 'btn-primary' : 'btn-ghost'"
          type="button"
          :disabled="loading || autoUpdateBusy"
          @click="onUpdateEntry"
        >
          {{ headerActionLabel }}
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

    <!-- 更新：版本 + 说明 + 加速保存到「下载目录/柠檬音乐更新」 -->
    <section v-if="info?.updateAvailable" ref="updateCardEl" class="update-card card">
      <div class="update-head">
        <div class="update-head-text">
          <h2 class="update-title">新版本 v{{ info.latestVersion }}</h2>
          <p class="update-sub">
            当前 v{{ info.currentVersion }}
            <template v-if="info.publishedAt"> · {{ formatDate(info.publishedAt) }}</template>
          </p>
        </div>
        <div class="update-head-actions">
          <a :href="info.releaseUrl || REPO_URL" target="_blank" rel="noopener" class="btn-ghost btn-sm">打开 Release</a>
        </div>
      </div>

      <p v-if="!info.releaseNotes" class="update-notes-empty">暂无正文说明，可到 GitHub Release 查看。</p>

      <div v-if="info.installHints" class="update-install">
        <div class="update-install-title">{{ canAutoUpdate ? '安装更新' : 'FPK 安装包' }}</div>
        <template v-if="isAdminUser">
          <div v-if="canAutoUpdate" class="auto-update-box">
            <p class="fpk-mirror-hint">
              点击右上角「立即更新」将自动选择 <strong>{{ hostArchLabel }}</strong> 安装包并加速下载，随后由飞牛应用中心完成安装与重启，无需手动导入。
            </p>
            <div v-if="autoUpdateVisible" class="fpk-progress-card">
              <div class="fpk-progress-head">
                <span>{{ autoUpdateTitle }}</span>
                <span v-if="autoUpdatePct !== null">{{ autoUpdatePct }}%</span>
              </div>
              <div v-if="autoUpdatePct !== null" class="fpk-progress-track" role="progressbar" :aria-valuenow="autoUpdatePct" aria-valuemin="0" aria-valuemax="100">
                <div class="fpk-progress-bar" :style="{ width: `${autoUpdatePct}%` }" />
              </div>
              <div class="fpk-progress-meta">
                <span>{{ autoUpdateMeta }}</span>
                <span v-if="installJob?.fileName" class="fpk-progress-name" :title="installJob.fileName">{{ installJob.fileName }}</span>
              </div>
            </div>
            <p v-if="autoUpdateError" class="fpk-error">{{ autoUpdateError }}</p>
          </div>
          <template v-else>
            <p class="update-install-line auto-unavailable">
              当前环境不支持应用内自动安装（仅飞牛 fnOS 原生应用可用）；可保存安装包后到应用中心手动安装。
            </p>
            <div v-if="fpkAssets.length" class="fpk-actions">
              <template v-for="asset in fpkAssets" :key="asset.name">
                <button
                  type="button"
                  class="btn-primary btn-sm fpk-btn fpk-btn-strong"
                  :disabled="!!fpkDownloading[asset.name]"
                  title="先测速国内加速节点，失败后回落 GitHub，保存到下载目录下的「柠檬音乐更新」"
                  @click="downloadFpkToNas(asset, true)"
                >
                  {{ fpkDownloading[asset.name] === 'mirror' ? '加速保存中…' : `${asset.label} 加速保存` }}
                  <span v-if="asset.sizeLabel && !fpkDownloading[asset.name]" class="fpk-size">{{ asset.sizeLabel }}</span>
                </button>
                <button
                  type="button"
                  class="btn-primary btn-sm fpk-btn fpk-btn-strong"
                  :disabled="!!fpkDownloading[asset.name]"
                  title="直连 GitHub 保存到下载目录下的「柠檬音乐更新」（需能访问 GitHub）"
                  @click="downloadFpkToNas(asset, false)"
                >
                  {{ fpkDownloading[asset.name] === 'direct' ? '保存中…' : `直连 ${asset.label}` }}
                  <span v-if="asset.sizeLabel && !fpkDownloading[asset.name]" class="fpk-size">{{ asset.sizeLabel }}</span>
                </button>
              </template>
            </div>
            <p v-if="fpkAssets.length" class="fpk-mirror-hint">
              「加速保存」会先对各加速节点短测速再拉取，失败自动换源，最后回落 GitHub 直连；保存后可在飞牛应用中心「手动安装」直接选该文件夹。
            </p>
            <p v-else class="update-install-line">
              暂未解析到 FPK 附件，请
              <a :href="info.releaseUrl || REPO_URL" target="_blank" rel="noopener">打开 Release</a>
              手动下载后放到下载目录下的 <code>柠檬音乐更新</code>。
            </p>
            <p v-if="fpkUpdateDir" class="fpk-save-path" :title="fpkUpdateDir">
              保存目录：<code>{{ fpkUpdateDir }}</code>
              <button type="button" class="btn-ghost btn-xs" @click="copyFpkDir">{{ fpkDirCopied ? '已复制' : '复制' }}</button>
            </p>
            <div v-if="fpkJob && fpkJob.status === 'downloading' && fpkJob.action !== 'install'" class="fpk-progress-card">
              <div class="fpk-progress-head">
                <span>
                  {{ fpkJob.label || '' }}{{ fpkJob.mirror ? ' 加速' : ' 直连' }}保存中
                  <template v-if="fpkJob.mirrorHost">（{{ fpkJob.mirrorHost }}）</template>
                </span>
                <span>{{ fpkProgressPct }}%</span>
              </div>
              <div class="fpk-progress-track" role="progressbar" :aria-valuenow="fpkProgressPct" aria-valuemin="0" aria-valuemax="100">
                <div class="fpk-progress-bar" :style="{ width: `${fpkProgressPct}%` }" />
              </div>
              <div class="fpk-progress-meta">
                <span>{{ fpkJob.downloadedLabel || '0 KB' }}<template v-if="fpkJob.totalLabel"> / {{ fpkJob.totalLabel }}</template></span>
                <span v-if="fpkJob.fileName" class="fpk-progress-name" :title="fpkJob.fileName">{{ fpkJob.fileName }}</span>
              </div>
            </div>
            <p v-if="fpkLastSaved" class="fpk-saved-ok">
              已保存：<code :title="fpkLastSaved.path">{{ fpkLastSaved.fileName }}</code>
              <span v-if="fpkLastSaved.sizeLabel">（{{ fpkLastSaved.sizeLabel }}）</span>
            </p>
            <p v-if="fpkError" class="fpk-error">{{ fpkError }}</p>
            <p class="fpk-tip">{{ info.installHints.fpkHint }}</p>
          </template>
        </template>
        <p v-else class="update-install-line">
          请联系管理员在「关于」页将 FPK 保存到下载目录，或
          <a :href="info.releaseUrl || REPO_URL" target="_blank" rel="noopener">打开 Release</a>
          自行下载。
        </p>
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
    </div>

    <section v-if="isAdminUser" class="about-admin">
      <h2 class="section-title about-admin-heading">账号恢复</h2>
      <p class="account-info-text account-intro">
        忘记登录密码时，在命令行重置即可，<b>只改密码</b>，不会清空歌单、收藏或音乐文件。
        记得密码时直接去「设置 → 账号管理」。文件管理器改不了这个密码。
      </p>

      <div class="account-actions">
        <div class="account-action card">
          <h3 class="action-title">飞牛 NAS</h3>
          <ol class="action-steps">
            <li>控制面板开启 SSH → 打开「终端」，用<b>飞牛系统账号</b>登录（也可用电脑 <code>ssh 飞牛用户名@NAS的IP</code>）。</li>
            <li>需已安装应用中心 <b>Node.js v22</b>。飞牛终端里<b>不要用 npm</b>（会报 command not found）。</li>
            <li>配置在 <code>@appdata</code>，不是 <code>@appconf</code>。不在 vol1 时把命令里的路径改成实际卷。</li>
          </ol>
          <div class="cmd-wrap">
            <span class="cmd-label">1. 列出柠檬音乐账号</span>
            <pre class="cmd-block">PATH=/var/apps/nodejs_v22/target/bin:$PATH CONFIG_PATH=/vol1/@appdata/lemon-music/config node /var/apps/lemon-music/target/scripts/reset-password.js --list</pre>
          </div>
          <div class="cmd-wrap">
            <span class="cmd-label">2. 重置密码（换成你的用户名和新密码）</span>
            <pre class="cmd-block">PATH=/var/apps/nodejs_v22/target/bin:$PATH CONFIG_PATH=/vol1/@appdata/lemon-music/config node /var/apps/lemon-music/target/scripts/reset-password.js 用户名 新密码</pre>
          </div>
        </div>

        <div class="account-action card">
          <h3 class="action-title">本地测试端 / Docker</h3>
          <p class="action-desc">仅在本地测试端或 Docker 容器内使用；飞牛请用上面的命令。</p>
          <div class="cmd-wrap">
            <span class="cmd-label">本地测试端</span>
            <pre class="cmd-block">npm run auth:reset-password -- --list
npm run auth:reset-password -- 用户名 新密码</pre>
          </div>
          <div class="cmd-wrap">
            <span class="cmd-label">Docker Compose</span>
            <pre class="cmd-block">docker compose exec lemon-music node scripts/reset-password.js --list
docker compose exec lemon-music node scripts/reset-password.js 用户名 新密码</pre>
          </div>
        </div>
      </div>

      <div class="account-tip">
        <span class="account-tip-icon" aria-hidden="true">ℹ</span>
        <ul class="account-tip-list">
          <li>账号库：<code>lx-music.db</code>，飞牛默认 <code>/vol1/@appdata/lemon-music/config/</code>。</li>
          <li>提示「没有任何用户」时执行：<code>find /vol1 /vol2 -name "lx-music.db"</code>，把找到的目录填进 <code>CONFIG_PATH</code>。</li>
          <li>重置后刷新登录页；若仍自动登录，清除本站 Cookie 或改用无痕窗口。</li>
        </ul>
      </div>
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

  <div v-if="notesOpen && info?.updateAvailable" class="notes-modal-mask" @click.self="notesOpen = false">
    <div class="notes-modal" role="dialog" aria-modal="true" aria-labelledby="notes-modal-title">
      <div class="notes-modal-head">
        <h3 id="notes-modal-title">v{{ info.latestVersion }} 更新内容</h3>
        <button type="button" class="btn-ghost btn-xs" @click="notesOpen = false">关闭</button>
      </div>
      <pre v-if="info.releaseNotes" class="notes-modal-body">{{ info.releaseNotes }}</pre>
      <p v-else class="notes-modal-empty">本次发布暂无更新说明，可直接更新。</p>
      <p v-if="!canAutoUpdate" class="notes-modal-warn">
        当前环境不支持应用内自动安装（仅飞牛 fnOS 原生应用可用）；可先保存安装包后到应用中心手动安装。
      </p>
      <p v-else-if="!info.fpkAssets?.length" class="notes-modal-warn">
        该版本尚未上传 FPK 安装包，暂时无法自动更新，请稍后再试。
      </p>
      <div class="notes-modal-foot">
        <a :href="info.releaseUrl || REPO_URL" target="_blank" rel="noopener" class="btn-ghost btn-sm">打开 Release</a>
        <button type="button" class="btn-primary btn-sm" :disabled="!canStartAutoUpdate" @click="confirmUpdate">
          {{ autoUpdateBusy ? '更新中…' : '立即更新' }}
        </button>
      </div>
    </div>
  </div>

  <div v-if="toast" class="toast" :class="toast.type">{{ toast.text }}</div>
</template>

<script setup>
defineOptions({ name: 'About' })
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { api } from '../api.js'
import { checkForUpdate, hasUpdate } from '../composables/useUpdateCheck.js'
import { APP_NAME, APP_DISPLAY_NAME, APP_DESCRIPTION, APP_FEATURES, REPO_URL } from '../constants/app.js'
import { isAdmin as isAdminUser } from '../utils/auth.js'
import { getPwaInstallState, onPwaInstallState, promptPwaInstall } from '../utils/pwa.js'
import { APP_ICON_URL } from '../utils/appIcon.js'
import { onWS } from '../ws.js'
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

const fpkAssets = computed(() => {
  const fromHints = info.value?.installHints?.fpkAssets
  if (Array.isArray(fromHints) && fromHints.length) return fromHints
  return Array.isArray(info.value?.fpkAssets) ? info.value.fpkAssets : []
})

const fpkUpdateDir = computed(() => String(info.value?.fpkUpdateDir || '').trim())
const fpkDownloading = ref({})
const fpkJob = ref(null)
const fpkLastSaved = ref(null)
const fpkError = ref('')
const fpkDirCopied = ref(false)
let fpkDirCopyTimer = null
let fpkPollTimer = null
let lastFpkToastKey = ''
const fpkWsUnsubs = []

const fpkProgressPct = computed(() => {
  const p = Number(fpkJob.value?.progress)
  if (!Number.isFinite(p) || p < 0) return 0
  return Math.min(100, Math.round(p * 100))
})

const notesOpen = ref(false)
const updateCardEl = ref(null)
const autoUpdateError = ref('')
const installJob = computed(() => (fpkJob.value?.action === 'install' ? fpkJob.value : null))
const canAutoUpdate = computed(() => Boolean(
  isAdminUser.value && info.value?.updateAvailable && info.value?.canAutoUpdate,
))
const hostArchLabel = computed(() => {
  const arch = info.value?.hostArch
  if (arch === 'arm') return 'ARM'
  if (arch === 'x86') return 'x86'
  return '当前平台'
})
const autoUpdateVisible = computed(() => {
  const job = installJob.value
  if (job) return ['downloading', 'installing', 'done'].includes(job.status)
  return info.value?.lastAutoUpdate?.status === 'installing'
})
const autoUpdateBusy = computed(() => {
  const status = installJob.value?.status
  return status === 'downloading'
    || status === 'installing'
    || info.value?.lastAutoUpdate?.status === 'installing'
})
const autoUpdatePct = computed(() => {
  const job = installJob.value
  if (!job) return null
  if (job.status === 'downloading') {
    const p = Number(job.progress)
    return Number.isFinite(p) ? Math.min(100, Math.round(p * 100)) : 0
  }
  return 100
})
const autoUpdateTitle = computed(() => {
  const job = installJob.value
  if (!job) {
    const last = info.value?.lastAutoUpdate
    return last?.status === 'installing' ? `正在安装 v${last.version}…` : ''
  }
  if (job.status === 'downloading') {
    const arch = job.arch === 'arm' ? 'ARM' : job.arch === 'x86' ? 'x86' : ''
    return `下载 ${arch} 安装包${job.mirror ? '（加速）' : ''}`
  }
  if (job.status === 'installing') return job.installStep || '正在安装…'
  if (job.status === 'done') return '升级完成'
  return '更新失败'
})
const autoUpdateMeta = computed(() => {
  const job = installJob.value
  if (!job) return '应用中心正在完成安装，稍后会自动恢复访问'
  if (job.status === 'downloading') {
    const size = `${job.downloadedLabel || '0 KB'}${job.totalLabel ? ` / ${job.totalLabel}` : ''}`
    return job.mirrorHost ? `${size} · ${job.mirrorHost}` : size
  }
  if (job.status === 'installing') return '应用会短暂停止，完成后自动恢复运行'
  return job.fileName || ''
})

const canStartAutoUpdate = computed(() => Boolean(
  canAutoUpdate.value
  && (info.value?.fpkAssets?.length || 0) > 0
  && !autoUpdateBusy.value,
))
const headerActionLabel = computed(() => {
  if (autoUpdateBusy.value) return '更新中…'
  if (info.value?.updateAvailable) return '立即更新'
  return loading.value ? '检测中…' : '检测更新'
})

function onUpdateEntry() {
  if (info.value?.updateAvailable) {
    notesOpen.value = true
    return
  }
  loadInfo()
}

function confirmUpdate() {
  if (!canStartAutoUpdate.value) return
  notesOpen.value = false
  startAutoUpdate()
  nextTick(() => {
    updateCardEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function showToast(text, type = 'info') {
  toast.value = { text, type }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 3200)
}

function stopFpkPoll() {
  if (fpkPollTimer) {
    clearInterval(fpkPollTimer)
    clearTimeout(fpkPollTimer)
    fpkPollTimer = null
  }
}

/** 应用内更新结束：确认版本并刷新信息 */
function finishAutoUpdate(version) {
  if (
    version
    && autoUpdateAnnouncedVersion === version
    && fpkJob.value?.status === 'done'
    && fpkJob.value?.installStep === '升级完成'
  ) return
  stopFpkPoll()
  autoUpdateError.value = ''
  if (version) autoUpdateAnnouncedVersion = version
  fpkJob.value = {
    ...(fpkJob.value || {}),
    action: 'install',
    status: 'done',
    installStep: '升级完成',
    targetVersion: version || fpkJob.value?.targetVersion || '',
  }
  const current = String(info.value?.currentVersion || '')
  if (version && current && version !== current) {
    showToast(`已升级到 v${version}，正在刷新…`, 'success')
  } else {
    showToast(`已更新到 v${version || current}`, 'success')
  }
  loadInfo()
}

function applyFpkJob(job, { toastOnTerminal = true } = {}) {
  if (!job) return
  fpkJob.value = job
  const key = job.name || job.fileName
  const isInstall = job.action === 'install'
  if (job.status === 'downloading' && key) {
    fpkDownloading.value = {
      ...fpkDownloading.value,
      [key]: job.mirror ? 'mirror' : 'direct',
    }
  }
  if (job.status === 'installing') {
    autoUpdateError.value = ''
    return
  }
  if (job.status === 'done') {
    if (isInstall) {
      finishAutoUpdate(job.targetVersion)
      return
    }
    fpkLastSaved.value = {
      fileName: job.fileName || key,
      path: job.path || '',
      sizeLabel: job.sizeLabel || '',
    }
    fpkError.value = ''
    if (job.dir && info.value) {
      info.value = { ...info.value, fpkUpdateDir: job.dir }
    }
    if (key) {
      const next = { ...fpkDownloading.value }
      delete next[key]
      fpkDownloading.value = next
    }
    stopFpkPoll()
    if (toastOnTerminal) {
      const toastKey = `done:${job.jobKey || key}:${job.finishedAt || job.fileName}`
      if (toastKey !== lastFpkToastKey) {
        lastFpkToastKey = toastKey
        showToast(`已保存：${job.fileName || key}`, 'success')
      }
    }
  }
  if (job.status === 'error') {
    if (isInstall) {
      autoUpdateError.value = job.error || '应用内升级失败'
      stopFpkPoll()
      if (toastOnTerminal) {
        const toastKey = `install-err:${job.jobKey || key}:${job.finishedAt || autoUpdateError.value}`
        if (toastKey !== lastFpkToastKey) {
          lastFpkToastKey = toastKey
          showToast(autoUpdateError.value, 'error')
        }
      }
      return
    }
    fpkError.value = job.error || '保存安装包失败'
    if (key) {
      const next = { ...fpkDownloading.value }
      delete next[key]
      fpkDownloading.value = next
    }
    stopFpkPoll()
    if (toastOnTerminal) {
      const toastKey = `err:${job.jobKey || key}:${job.finishedAt || fpkError.value}`
      if (toastKey !== lastFpkToastKey) {
        lastFpkToastKey = toastKey
        showToast(fpkError.value, 'error')
      }
    }
  }
}

function startFpkPoll(asset) {
  stopFpkPoll()
  fpkPollTimer = setInterval(async () => {
    try {
      const res = await api.about.downloadFpkStatus({
        name: asset?.name,
        arch: asset?.arch,
      })
      const job = res.data || res
      if (job) applyFpkJob(job)
      if (job?.status === 'done' || job?.status === 'error') stopFpkPoll()
    } catch {}
  }, 800)
}

let installPollDeadline = 0

async function startAutoUpdate() {
  if (!isAdminUser.value) {
    showToast('仅管理员可执行应用内更新', 'error')
    return
  }
  if (!canAutoUpdate.value || autoUpdateBusy.value) return
  autoUpdateError.value = ''
  fpkError.value = ''
  fpkLastSaved.value = null
  fpkJob.value = {
    action: 'install',
    status: 'downloading',
    progress: 0,
    arch: info.value?.hostArch || '',
    mirror: true,
    fileName: '',
    downloadedLabel: '0 KB',
    totalLabel: '',
  }
  try {
    const res = await api.about.installUpdate({ mirror: true })
    const data = res.data || res
    if (data) applyFpkJob(data, { toastOnTerminal: false })
    startInstallPoll()
  } catch (e) {
    autoUpdateError.value = e.message || '启动更新失败'
    fpkJob.value = null
    showToast(autoUpdateError.value, 'error')
  }
}

function startInstallPoll() {
  installPollDeadline = Date.now() + 8 * 60 * 1000
  scheduleInstallPoll(1200)
}

/** 应用重启期间接口会短暂不可用，这里持续重试直到拿到最终状态 */
function scheduleInstallPoll(delay) {
  stopFpkPoll()
  fpkPollTimer = setTimeout(async () => {
    let finished = false
    try {
      const res = await api.about.installUpdateStatus()
      const job = res.data || res
      if (job) {
        applyFpkJob(job, { toastOnTerminal: true })
        if (job.status === 'done' || job.status === 'error') finished = true
      }
      const last = res.last || null
      if (!finished && last?.status === 'success' && last.version) {
        finishAutoUpdate(last.version)
        finished = true
      } else if (!finished && last?.status === 'error') {
        autoUpdateError.value = last.message || '应用内升级失败'
        finished = true
      }
    } catch {
      // 应用正在重启
    }
    if (finished) return
    if (Date.now() > installPollDeadline) {
      autoUpdateError.value = '升级耗时较长，请稍后刷新页面确认版本'
      return
    }
    scheduleInstallPoll(2000)
  }, delay)
}

async function copyFpkDir() {
  const dir = fpkUpdateDir.value
  if (!dir) return
  try {
    await navigator.clipboard.writeText(dir)
    fpkDirCopied.value = true
    if (fpkDirCopyTimer) clearTimeout(fpkDirCopyTimer)
    fpkDirCopyTimer = setTimeout(() => { fpkDirCopied.value = false }, 2000)
  } catch {}
}

async function downloadFpkToNas(asset, useMirror = true) {
  if (!asset?.name || !isAdminUser.value) {
    fpkError.value = '仅管理员可将安装包保存到下载目录'
    showToast(fpkError.value, 'error')
    return
  }
  if (fpkDownloading.value[asset.name]) return

  fpkError.value = ''
  fpkLastSaved.value = null
  fpkJob.value = {
    name: asset.name,
    fileName: asset.name,
    label: asset.label,
    mirror: useMirror,
    status: 'downloading',
    progress: 0,
    downloadedLabel: '0 KB',
    totalLabel: asset.sizeLabel || '',
  }
  fpkDownloading.value = { ...fpkDownloading.value, [asset.name]: useMirror ? 'mirror' : 'direct' }
  showToast(`${asset.label}${useMirror ? ' 加速' : ' 直连'}开始保存…`, 'info')

  try {
    const res = await api.about.downloadFpk({
      name: asset.name,
      arch: asset.arch,
      mirror: useMirror,
    })
    const data = res.data || res
    applyFpkJob(data, { toastOnTerminal: false })
    if (data?.status === 'downloading') startFpkPoll(asset)
  } catch (e) {
    fpkError.value = e.message || '保存安装包失败'
    const next = { ...fpkDownloading.value }
    delete next[asset.name]
    fpkDownloading.value = next
    fpkJob.value = fpkJob.value ? { ...fpkJob.value, status: 'error', error: fpkError.value } : null
    stopFpkPoll()
    showToast(fpkError.value, 'error')
  }
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
  fpkWsUnsubs.push(onWS('about:fpk-progress', (job) => applyFpkJob(job, { toastOnTerminal: false })))
  fpkWsUnsubs.push(onWS('about:fpk-done', (job) => applyFpkJob(job)))
  fpkWsUnsubs.push(onWS('about:fpk-error', (job) => applyFpkJob(job)))
})

onUnmounted(() => {
  if (typeof stopPwaWatch === 'function') stopPwaWatch()
  stopPwaWatch = null
  if (groupCopyTimer) clearTimeout(groupCopyTimer)
  if (logDirCopyTimer) clearTimeout(logDirCopyTimer)
  if (appLogCopyTimer) clearTimeout(appLogCopyTimer)
  if (fpkDirCopyTimer) clearTimeout(fpkDirCopyTimer)
  if (toastTimer) clearTimeout(toastTimer)
  stopFpkPoll()
  while (fpkWsUnsubs.length) {
    try { fpkWsUnsubs.pop()?.() } catch {}
  }
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

let autoUpdateAnnouncedVersion = ''

/** 页面重开/应用重启后，确认上一次应用内更新的结果 */
function maybeAnnounceAutoUpdate() {
  const last = info.value?.lastAutoUpdate
  if (!last?.version) return
  const current = String(info.value?.currentVersion || '')
  if (last.status === 'success' && current === last.version) {
    if (autoUpdateAnnouncedVersion !== last.version) {
      autoUpdateAnnouncedVersion = last.version
      fpkJob.value = {
        ...(fpkJob.value || {}),
        action: 'install',
        status: 'done',
        installStep: '升级完成',
        targetVersion: last.version,
        fileName: last.fileName || '',
      }
      showToast(`已更新到 v${last.version}`, 'success')
    }
    return
  }
  if (last.status === 'installing' && Date.now() - (Number(last.startedAt) || 0) < 15 * 60 * 1000) {
    if (isAdminUser.value) startInstallPoll()
  }
}

async function loadInfo() {
  loading.value = true
  try {
    info.value = await checkForUpdate()
    maybeAnnounceAutoUpdate()
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
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr) minmax(0, 1.2fr);
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

/* ── 更新卡片（加速保存到下载目录/柠檬音乐更新） ── */
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
.update-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.notes-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 260;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.55);
}
.notes-modal {
  display: flex;
  flex-direction: column;
  width: min(640px, 100%);
  max-height: min(80vh, 640px);
  border-radius: 14px;
  background: var(--bg-elevated, #1c1f26);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}
.notes-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.notes-modal-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: var(--text);
}
.notes-modal-body {
  flex: 1;
  margin: 0;
  padding: 14px 16px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-secondary);
}
.notes-modal-empty {
  flex: 1;
  margin: 0;
  padding: 14px 16px;
  font-size: 13px;
  color: var(--text-secondary);
}
.notes-modal-warn {
  margin: 0;
  padding: 0 16px 12px;
  font-size: 12px;
  line-height: 1.5;
  color: #f0a34a;
}
.notes-modal-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.auto-unavailable {
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
.auto-update-box {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
  border-radius: 10px;
  background: var(--bg-secondary, rgba(255, 255, 255, 0.03));
}
.auto-update-box .fpk-mirror-hint {
  margin: 0;
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
.fpk-btn-strong {
  font-weight: 700;
  box-shadow: 0 0 0 1px rgba(255, 140, 0, 0.45), 0 4px 14px rgba(255, 140, 0, 0.28);
}
.fpk-btn:disabled {
  opacity: 0.65;
  cursor: wait;
}
.fpk-size {
  font-size: 11px;
  opacity: 0.75;
  font-weight: 500;
}
.fpk-mirror-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--accent, #f59e0b);
}
.fpk-progress-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent, #3b82f6) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent, #3b82f6) 28%, transparent);
}
.fpk-progress-head,
.fpk-progress-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
.fpk-progress-head {
  font-weight: 600;
  color: var(--text);
}
.fpk-progress-track {
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
}
.fpk-progress-bar {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--accent, #3b82f6), color-mix(in srgb, var(--accent, #3b82f6) 70%, #fff));
  transition: width 0.2s ease;
}
.fpk-progress-name {
  max-width: 55%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fpk-save-path,
.fpk-saved-ok,
.fpk-error {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.fpk-save-path {
  color: var(--text-secondary);
}
.fpk-save-path code,
.fpk-saved-ok code {
  font-size: 11px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fpk-saved-ok {
  color: var(--success, #16a34a);
}
.fpk-error {
  color: var(--danger, #dc2626);
}
.about-page .btn-xs {
  padding: 2px 8px;
  font-size: 11px;
  line-height: 1.4;
  flex-shrink: 0;
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
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: nowrap;
  min-width: 0;
}

.community-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  width: 96px;
  height: 96px;
  object-fit: contain;
  border-radius: 12px;
  background: #fff;
  border: 1px solid var(--border-light);
  padding: 5px;
  box-sizing: border-box;
}

.about-row .ops-card,
.about-row .pwa-card,
.about-row .community-card {
  min-width: 0;
  height: 100%;
}

.about-row .log-path-row {
  flex-wrap: nowrap;
}

.about-row .log-path-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  word-break: normal;
}

.about-row .ops-health-line {
  font-size: 12px;
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
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
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
  min-width: 0;
  max-width: 100%;
}

.account-action {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
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
  margin: 0 0 12px;
  padding-left: 1.2em;
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-secondary);
}

.action-steps li + li,
.action-notes li + li {
  margin-top: 6px;
}

.cmd-wrap {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
}

.cmd-wrap + .cmd-wrap {
  margin-top: 12px;
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
  max-width: 100%;
  overflow-x: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-all;
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
  margin-top: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  border-radius: 50%;
  background: var(--accent-muted);
  color: var(--accent);
}

.account-tip-list {
  margin: 0;
  padding-left: 1.1em;
}

.account-tip-list li + li {
  margin-top: 4px;
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

@media (max-width: 1100px) {
  .about-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .about-row .ops-card {
    grid-column: 1 / -1;
  }
}

@media (max-width: 768px) {
  .about-row {
    grid-template-columns: 1fr;
  }

  .about-row .ops-card {
    grid-column: auto;
  }

  .community-body {
    flex-direction: column-reverse;
    align-items: stretch;
    flex-wrap: wrap;
  }

  .community-qr {
    align-self: center;
  }

  .community-qr-img {
    width: 124px;
    height: 124px;
  }

  .about-row .log-path-row {
    flex-wrap: wrap;
  }

  .about-row .log-path-value {
    white-space: normal;
    word-break: break-all;
    text-overflow: unset;
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
