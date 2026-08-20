<template>
  <div class="app">
    <aside class="sidebar">
      <div class="logo">
        <img src="/icon.png" alt="Lemon Music" class="logo-img" />
        <div>
          <h1>Lemon Music</h1>
          <span class="logo-sub">音乐下载工具</span>
        </div>
      </div>

      <nav class="nav-section">
        <div class="nav-label">功能</div>
        <router-link to="/search" class="nav-item" active-class="active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>搜索</span>
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
        <div class="ws-status" :class="{ online: wsConnected }">
          <span class="dot"></span>
          {{ wsConnected ? '服务已连接' : '服务未连接' }}
        </div>
      </div>
    </aside>

    <main class="content" :class="{ 'content-fixed': isTagPage }">
      <router-view />
    </main>

    <PlayerBar />
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { connectWS, connected as wsConnected } from './ws.js'
import { initPlayer } from './stores/player.js'
import { checkForUpdate, hasUpdate } from './composables/useUpdateCheck.js'
import PlayerBar from './components/PlayerBar.vue'

const route = useRoute()
const isTagPage = computed(() => route.path === '/tag' || route.path.startsWith('/tag/'))

onMounted(() => {
  connectWS()
  initPlayer()
  checkForUpdate()
})
</script>

<style scoped>
.app {
  display: flex;
  min-height: 100vh;
  background: var(--bg);
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
.logo-sub { font-size: 11px; color: var(--text-muted); }

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
  background: var(--warning);
  margin-left: auto;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px var(--bg-sidebar);
}

.sidebar-footer {
  margin-top: auto;
  padding: 16px 20px;
  border-top: 1px solid var(--border-light);
}
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
  min-width: 0;
  min-height: 100vh;
}
.content-fixed {
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.content-fixed > * {
  flex: 1;
  min-height: 0;
}

@media (max-width: 768px) {
  .sidebar {
    width: 100%;
    height: auto;
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
  }
  .logo { padding: 12px 16px; }
  .nav-section { display: flex; align-items: center; padding: 0 8px; }
  .nav-label { display: none; }
  nav { display: flex; }
  .nav-item span { display: none; }
  .sidebar-footer { display: none; }
  .content { margin-left: 0; padding: 16px 16px 80px; }
  .content-fixed {
    height: auto;
    overflow: visible;
    display: block;
  }
  .content-fixed > * {
    flex: none;
    min-height: auto;
  }
}
</style>
