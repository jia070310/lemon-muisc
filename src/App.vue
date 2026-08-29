<template>
  <div class="app">
    <aside class="sidebar">
      <div class="logo">
        <img src="/icon.png" alt="柠檬音乐下载" class="logo-img" />
        <div>
          <h1>柠檬音乐下载</h1>
          <span class="logo-sub">音乐下载工具</span>
        </div>
      </div>

      <nav class="nav-section">
        <div class="nav-label">功能</div>
        <router-link to="/search" class="nav-item" active-class="active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>搜索</span>
        </router-link>
        <router-link to="/discover" class="nav-item" active-class="active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          <span>发现</span>
        </router-link>
        <router-link to="/download" class="nav-item" active-class="active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>下载</span>
        </router-link>
        <router-link to="/tag" class="nav-item" active-class="active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          <span>标签编辑</span>
        </router-link>
      </nav>

      <nav class="nav-section">
        <div class="nav-label">系统</div>
        <router-link to="/settings" class="nav-item" active-class="active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>设置</span>
        </router-link>
        <router-link to="/about" class="nav-item" active-class="active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span>关于</span>
          <span v-if="hasUpdate" class="nav-update-dot" title="有新版本"></span>
        </router-link>
      </nav>

      <div class="sidebar-footer">
        <button class="theme-toggle" type="button" :title="theme === 'light' ? '切换深色模式' : '切换浅色模式'" @click="toggleTheme">
          <svg v-if="theme === 'dark'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z"/></svg>
          <span>{{ theme === 'light' ? '浅色模式' : '深色模式' }}</span>
        </button>
        <div class="ws-status" :class="{ online: wsConnected }">
          <span class="dot"></span>
          {{ wsConnected ? '服务已连接' : '服务未连接' }}
        </div>
      </div>
    </aside>

    <header class="mobile-topbar">
      <div class="mobile-brand">
        <img src="/icon.png" alt="" class="mobile-brand-icon" />
        <span>柠檬音乐下载</span>
      </div>
      <button
        class="mobile-theme-btn"
        type="button"
        :title="theme === 'light' ? '切换深色模式' : '切换浅色模式'"
        @click="toggleTheme"
        :aria-label="theme === 'light' ? '切换深色模式' : '切换浅色模式'"
      >
        <svg v-if="theme === 'dark'" class="theme-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5"/>
          <path d="M12 2.5v2M12 19.5v2M4.4 4.4l1.4 1.4M18.2 18.2l1.4 1.4M2.5 12h2M19.5 12h2M4.4 19.6l1.4-1.4M18.2 5.8l1.4-1.4"/>
        </svg>
        <svg v-else class="theme-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20.5 14.2A8.2 8.2 0 0 1 9.8 3.5 7 7 0 1 0 20.5 14.2z"/>
        </svg>
      </button>
    </header>

    <main class="content" :class="{ 'content-fixed': isTagPage }">
      <div v-if="setupBanner" class="setup-banner">
        <strong>首次使用请先配置数据目录</strong>
        <span>请到「应用设置 → 访问权限」添加音乐库与下载目录，保存后停用再启用。</span>
        <router-link to="/settings" class="setup-link">打开设置</router-link>
      </div>
      <router-view />
    </main>

    <PlayerBar />
    <FullscreenPlayer />

    <div v-if="showFaultModal" class="modal-overlay source-fault-overlay">
      <div class="source-fault-modal">
        <h3>音源异常</h3>
        <template v-if="sourceFault">
          <p class="fault-desc">当前音源「{{ sourceFault.name }}」运行出错，已自动停用以避免影响应用。若为临时网络问题，可保留音源稍后重试；若音源脚本损坏，请删除或重新导入。</p>
          <div class="fault-error">{{ formatPromptReason(sourceFault.message) }}</div>
        </template>
        <p v-if="faultResult" class="fault-result" :class="{ ok: faultResult.ok }">{{ faultResult.text }}</p>
        <div v-if="sourceFault" class="fault-actions">
          <button class="btn-ghost" :disabled="faultBusy" @click="handleFaultDismiss">知道了，保留音源</button>
          <button class="btn-ghost" :disabled="faultBusy" @click="handleFaultDelete">删除音源</button>
          <button class="btn-primary" :disabled="faultBusy" @click="handleFaultReimport">
            {{ faultBusy ? '处理中…' : '删除并重新导入' }}
          </button>
        </div>
        <div v-else class="fault-actions">
          <router-link to="/settings" class="btn-primary fault-settings-btn" @click="closeFaultModal">前往设置 → 音源管理</router-link>
          <button class="btn-ghost" @click="closeFaultModal">关闭</button>
        </div>
      </div>
    </div>

    <div v-if="downgradePrompt" class="modal-overlay downgrade-overlay" @click.self="dismissDowngradePrompt">
      <div class="downgrade-modal">
        <h3>下载失败，请选择下一步</h3>
        <p class="downgrade-desc">
          「{{ downgradePrompt.name }}」在
          <strong>{{ downgradePrompt.offer?.fromLabel || downgradePrompt.offer?.fromQuality }}</strong>
          音质下已自动重试多次仍失败。
        </p>
        <div v-if="downgradePrompt.offer?.reason" class="downgrade-reason">
          <div class="downgrade-reason-label">失败原因</div>
          <div>{{ formatPromptReason(downgradePrompt.offer.reason) }}</div>
        </div>
        <div class="downgrade-hint">
          <p><strong>重试原音质：</strong>失败多半是音源服务或网络短暂中断，稍后再用同一音质常能成功。</p>
          <p><strong>降质下载：</strong>改用
            <em>{{ downgradePrompt.offer?.toLabel || downgradePrompt.offer?.toQuality }}</em>
            ，取链通常更稳，但音质会低于你最初的选择。
          </p>
        </div>
        <div class="downgrade-actions">
          <button class="btn-ghost" :disabled="downgradeBusy" @click="rejectDowngradePrompt">暂不处理</button>
          <button class="btn-ghost" :disabled="downgradeBusy" @click="retrySameQualityPrompt" title="保持原音质再试一次（适合临时网络抖动）">
            {{ downgradeBusy === 'retry' ? '重试中…' : '重试原音质' }}
          </button>
          <button class="btn-primary" :disabled="downgradeBusy" @click="acceptDowngradePrompt" title="改用更低音质重新下载">
            {{ downgradeBusy === 'downgrade' ? '处理中…' : '确认降质下载' }}
          </button>
        </div>
      </div>
    </div>

    <nav class="mobile-tabbar" aria-label="主导航">
      <router-link to="/search" class="tab-item" active-class="active">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <span>搜索</span>
      </router-link>
      <router-link to="/discover" class="tab-item" active-class="active">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <span>发现</span>
      </router-link>
      <router-link to="/download" class="tab-item" active-class="active">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span>下载</span>
      </router-link>
      <router-link to="/tag" class="tab-item" active-class="active">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
        <span>标签</span>
      </router-link>
      <router-link to="/settings" class="tab-item" active-class="active">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <span>设置</span>
      </router-link>
      <router-link to="/about" class="tab-item" active-class="active">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <span>关于</span>
        <span v-if="hasUpdate" class="tab-dot"></span>
      </router-link>
    </nav>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { connectWS, connected as wsConnected, onWS } from './ws.js'
import { initPlayer } from './stores/player.js'
import { checkForUpdate, hasUpdate } from './composables/useUpdateCheck.js'
import { api } from './api.js'
import { applyTheme, theme, THEME_KEY, COLOR_SCHEME_KEY, CUSTOM_COLOR_KEY } from './utils/theme.js'
import { formatUserError } from './utils/userError.js'
import PlayerBar from './components/PlayerBar.vue'
import FullscreenPlayer from './components/FullscreenPlayer.vue'

const route = useRoute()
const isTagPage = computed(() => route.path === '/tag' || route.path.startsWith('/tag/'))
const setupBanner = ref(false)
const sourceFault = ref(null)
const faultBusy = ref(false)
const faultResult = ref(null)
const showFaultModal = computed(() => Boolean(sourceFault.value || faultResult.value))
let offSourceFaultWS = null

const downgradePrompt = ref(null)
/** @type {import('vue').Ref<false | 'retry' | 'downgrade' | 'reject'>} */
const downgradeBusy = ref(false)
let offDowngradeWS = null
/** @type {Array<{ id: string, name?: string, singer?: string, offer?: object, downgradeOffer?: object }>} */
const downgradeQueue = []

function enqueueDowngradePrompt(payload) {
  const offer = payload?.downgradeOffer || payload?.offer
  if (!payload?.id || !offer?.toQuality) return
  const item = {
    id: payload.id,
    name: payload.name || '未知歌曲',
    singer: payload.singer || '',
    offer,
    downgradeOffer: offer,
  }
  if (downgradePrompt.value?.id === item.id) {
    downgradePrompt.value = item
    return
  }
  if (downgradePrompt.value) {
    if (!downgradeQueue.some(q => q.id === item.id)) downgradeQueue.push(item)
    return
  }
  downgradePrompt.value = item
}

function showNextDowngradePrompt() {
  downgradePrompt.value = downgradeQueue.shift() || null
}

function formatPromptReason(reason) {
  return formatUserError(reason, '音源取链失败，请稍后重试')
}

/** 仅关闭弹窗，任务仍保持「待确认」，可在下载页再操作 */
function dismissDowngradePrompt() {
  if (downgradeBusy.value) return
  downgradePrompt.value = null
  showNextDowngradePrompt()
}

async function acceptDowngradePrompt() {
  const cur = downgradePrompt.value
  if (!cur?.id) return
  downgradeBusy.value = 'downgrade'
  try {
    await api.download.confirmDowngrade(cur.id)
    downgradePrompt.value = null
    showNextDowngradePrompt()
  } catch (e) {
    alert(e.message || '确认降质失败')
  } finally {
    downgradeBusy.value = false
  }
}

/** 保持原音质重新排队（临时网络问题常见，再试可能成功） */
async function retrySameQualityPrompt() {
  const cur = downgradePrompt.value
  if (!cur?.id) return
  downgradeBusy.value = 'retry'
  try {
    await api.download.resume(cur.id)
    downgradePrompt.value = null
    showNextDowngradePrompt()
  } catch (e) {
    alert(e.message || '重试失败')
  } finally {
    downgradeBusy.value = false
  }
}

async function rejectDowngradePrompt() {
  const cur = downgradePrompt.value
  if (!cur?.id) {
    downgradePrompt.value = null
    return
  }
  downgradeBusy.value = 'reject'
  try {
    await api.download.rejectDowngrade(cur.id)
  } catch {}
  finally {
    downgradeBusy.value = false
    downgradePrompt.value = null
    showNextDowngradePrompt()
  }
}

async function loadPendingDowngradePrompts() {
  try {
    const list = await api.download.list()
    for (const task of list || []) {
      if (task.status === 'await_confirm' && task.meta?.downgradeOffer?.toQuality) {
        enqueueDowngradePrompt({
          id: task.id,
          name: task.name,
          singer: task.singer,
          downgradeOffer: task.meta.downgradeOffer,
        })
      }
    }
  } catch {}
}

function closeFaultModal() {
  sourceFault.value = null
  faultResult.value = null
}

async function loadSourceFault() {
  try {
    const fault = await api.source.getFault()
    sourceFault.value = fault?.id ? fault : null
  } catch {}
}

async function handleFaultDismiss() {
  faultBusy.value = true
  try {
    await api.source.dismissFault()
    closeFaultModal()
  } catch (e) {
    faultResult.value = { ok: false, text: e.message || '操作失败' }
  } finally {
    faultBusy.value = false
  }
}

async function handleFaultDelete() {
  faultBusy.value = true
  try {
    await api.source.deleteFault()
    closeFaultModal()
  } catch (e) {
    faultResult.value = { ok: false, text: e.message || '删除失败' }
  } finally {
    faultBusy.value = false
  }
}

async function handleFaultReimport() {
  faultBusy.value = true
  try {
    const res = await api.source.reimportFault()
    sourceFault.value = null
    if (res.reimported) {
      faultResult.value = { ok: true, text: `已重新导入音源「${res.name}」，请在设置中重新激活。` }
    } else if (res.hint) {
      faultResult.value = { ok: false, text: res.error ? `${res.hint}（${res.error}）` : res.hint }
    } else {
      closeFaultModal()
    }
  } catch (e) {
    faultResult.value = { ok: false, text: e.message || '重新导入失败' }
  } finally {
    faultBusy.value = false
  }
}

async function persistTheme(next) {
  applyTheme(next)
  try { await api.settings.update({ [THEME_KEY]: theme.value }) } catch {}
}

function toggleTheme() {
  persistTheme(theme.value === 'light' ? 'dark' : 'light')
}

onMounted(() => {
  connectWS()
  initPlayer()
  checkForUpdate()
  loadSourceFault()
  loadPendingDowngradePrompts()
  offSourceFaultWS = onWS('source.fault', (fault) => {
    sourceFault.value = fault?.id ? fault : null
    faultResult.value = null
  })
  offDowngradeWS = onWS('download:status', (d) => {
    if (d?.status === 'await_confirm' && d.downgradeOffer?.toQuality) {
      enqueueDowngradePrompt(d)
    } else if (d?.id && downgradePrompt.value?.id === d.id && d.status !== 'await_confirm') {
      // 已在下载页点确认/放弃时，关掉对应弹窗
      downgradePrompt.value = null
      showNextDowngradePrompt()
    }
  })
  api.paths.list().then((res) => {
    setupBanner.value = Boolean(res.setup?.needsPathConfig)
  }).catch(() => {})
  api.settings.get().then((s) => {
    if (s?.[THEME_KEY] || s?.[COLOR_SCHEME_KEY] || s?.[CUSTOM_COLOR_KEY]) {
      applyTheme(s?.[THEME_KEY] || theme.value, {
        color: s?.[COLOR_SCHEME_KEY],
        customHex: s?.[CUSTOM_COLOR_KEY],
      })
    }
  }).catch(() => {})
})

onUnmounted(() => {
  offSourceFaultWS?.()
  offDowngradeWS?.()
})
</script>

<style scoped>
.app {
  display: flex;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--bg);
  width: 100%;
  overflow-x: hidden;
}

.sidebar {
  width: var(--sidebar-width);
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  height: 100dvh;
  z-index: 100;
}

.logo {
  padding: 24px 20px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.logo-img {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
}
.logo h1 { font-size: 16px; font-weight: 700; line-height: 1.2; }
.logo-sub { font-size: 11px; color: var(--lemon); opacity: 0.85; }

.nav-section { padding: 0 12px; margin-bottom: 8px; }
.nav-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 8px 10px 6px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: var(--radius);
  color: var(--text-secondary);
  transition: all 0.15s;
  margin-bottom: 2px;
  position: relative;
  font-size: 14px;
}
.nav-item:hover { background: var(--bg-hover); color: var(--text); }
.nav-item.active {
  background: var(--accent-muted);
  color: var(--accent);
  font-weight: 500;
}
.nav-item.active::before {
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
.nav-item svg { width: 18px; height: 18px; flex-shrink: 0; opacity: 0.85; }
.nav-item.active svg { opacity: 1; }
.nav-update-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--lemon);
  margin-left: auto;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px var(--bg-sidebar);
}

.sidebar-footer {
  margin-top: auto;
  padding: 16px 20px;
  border-top: 1px solid var(--border-light);
}
.theme-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-bottom: 12px;
  padding: 8px 10px;
  border-radius: var(--radius);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 13px;
}
.theme-toggle:hover { background: var(--bg-hover); color: var(--text); }
.theme-toggle svg { width: 16px; height: 16px; flex-shrink: 0; }
.ws-status {
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--error);
  flex-shrink: 0;
}
.ws-status.online .dot { background: var(--success); }

.content {
  flex: 1;
  margin-left: var(--sidebar-width);
  padding: 28px 32px 88px;
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 0;
  min-height: 100vh;
  min-height: 100dvh;
  width: 100%;
}
.content-fixed {
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.content-fixed > .setup-banner {
  flex: 0 0 auto;
  margin-bottom: 12px;
}
.content-fixed > *:not(.setup-banner) {
  flex: 1;
  min-height: 0;
}

.setup-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(255, 193, 7, 0.12);
  border: 1px solid rgba(255, 193, 7, 0.35);
  color: var(--text);
  font-size: 13px;
  line-height: 1.4;
}
.setup-banner strong { color: #ffc107; }
.setup-link {
  margin-left: auto;
  color: var(--accent);
  text-decoration: none;
  white-space: nowrap;
}
.setup-link:hover { text-decoration: underline; }

.mobile-topbar { display: none; }
.mobile-tabbar { display: none; }

@media (max-width: 768px) {
  .app {
    flex-direction: column;
  }

  .sidebar { display: none; }

  .content {
    margin-left: 0;
    padding: calc(52px + env(safe-area-inset-top, 0px)) 14px calc(var(--player-height) + var(--mobile-nav-height) + 20px + env(safe-area-inset-bottom, 0px));
    min-height: auto;
    width: 100%;
  }

  .mobile-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 110;
    height: calc(52px + env(safe-area-inset-top, 0px));
    padding: env(safe-area-inset-top, 0px) 12px 0 14px;
    background: var(--bg-nav);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border-light);
  }
  .mobile-brand {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 15px;
    font-weight: 650;
    color: var(--text);
  }
  .mobile-brand span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mobile-brand-icon {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    object-fit: cover;
    flex-shrink: 0;
  }
  .mobile-theme-btn {
    width: 38px;
    height: 38px;
    border: none;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: var(--bg-elevated);
    color: var(--text);
    cursor: pointer;
    padding: 0;
    line-height: 0;
  }
  .mobile-theme-btn .theme-icon,
  .mobile-theme-btn svg {
    width: 22px !important;
    height: 22px !important;
    min-width: 22px;
    min-height: 22px;
    display: block;
    flex-shrink: 0;
  }
  .mobile-theme-btn:hover {
    background: var(--bg-hover);
  }
  .mobile-theme-btn:active {
    transform: scale(0.94);
  }

  .content-fixed {
    height: auto;
    min-height: calc(100dvh - var(--player-height) - var(--mobile-nav-height));
    overflow: visible;
    display: block;
  }
  .content-fixed > * {
    flex: none;
    min-height: auto;
  }

  .setup-banner {
    font-size: 12px;
    padding: 8px 10px;
  }
  .setup-link {
    margin-left: 0;
    width: 100%;
  }

  .mobile-tabbar {
    display: flex;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 120;
    height: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom, 0px));
    padding: 0 4px env(safe-area-inset-bottom, 0px);
    background: var(--bg-nav);
    backdrop-filter: blur(12px);
    border-top: 1px solid var(--border-light);
    justify-content: space-around;
    align-items: stretch;
  }

  .tab-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    color: var(--text-muted);
    font-size: 10px;
    text-decoration: none;
    position: relative;
    min-width: 0;
    padding: 6px 2px;
  }
  .tab-item svg {
    width: 22px;
    height: 22px;
  }
  .tab-item.active {
    color: var(--accent);
  }
  .tab-dot {
    position: absolute;
    top: 6px;
    right: calc(50% - 14px);
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--lemon);
  }
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.source-fault-modal {
  width: min(480px, 100%);
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}

.source-fault-modal h3 {
  margin: 0 0 12px;
  font-size: 18px;
  color: var(--error);
}

.fault-desc {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.fault-error {
  margin-bottom: 16px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(244, 67, 54, 0.1);
  border: 1px solid rgba(244, 67, 54, 0.25);
  font-size: 13px;
  line-height: 1.4;
  color: var(--text);
  word-break: break-word;
}

.fault-result {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--error);
}
.fault-result.ok { color: var(--success); }

.fault-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.fault-settings-btn {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.downgrade-modal {
  width: min(440px, 100%);
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}
.downgrade-modal h3 {
  margin: 0 0 12px;
  font-size: 18px;
  color: var(--text);
}
.downgrade-desc {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--text-secondary);
}
.downgrade-desc strong {
  color: var(--accent);
  font-weight: 650;
}
.downgrade-reason {
  margin: 10px 0 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-muted);
  word-break: break-word;
}
.downgrade-reason-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
  font-weight: 600;
}
.downgrade-hint {
  margin: 0 0 16px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--accent-muted);
  border: 1px solid var(--brand-border-soft);
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-secondary);
}
.downgrade-hint p {
  margin: 0 0 8px;
}
.downgrade-hint p:last-child {
  margin-bottom: 0;
}
.downgrade-hint strong {
  color: var(--text);
}
.downgrade-hint em {
  color: var(--accent);
  font-style: normal;
  font-weight: 650;
}
.downgrade-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  flex-wrap: wrap;
  margin-top: 8px;
}
</style>
