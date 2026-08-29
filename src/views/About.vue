<template>
  <div class="about-page">
    <div class="about-hero card">
      <div class="about-icon-wrap">
        <img src="/icon.png" alt="" class="about-icon" />
      </div>
      <h1 class="about-title">{{ APP_DISPLAY_NAME }}</h1>
      <p class="about-version">版本 {{ info?.currentVersion || '—' }}</p>
      <p class="about-desc">{{ APP_FEATURES[0] }}</p>
      <a :href="REPO_URL" target="_blank" rel="noopener" class="about-repo">{{ REPO_URL }}</a>
    </div>

    <div v-if="info?.updateAvailable" class="update-banner card">
      <div class="update-banner-text">
        <strong>发现新版本 v{{ info.latestVersion }}</strong>
        <span>当前版本 v{{ info.currentVersion }}，建议更新以获得最新功能与修复。</span>
      </div>
      <a :href="info.releaseUrl || REPO_URL" target="_blank" rel="noopener" class="btn-primary btn-sm">前往更新</a>
    </div>

    <div class="about-card card">
      <div class="info-row">
        <span class="info-label">功能特性</span>
        <ul class="info-features">
          <li v-for="(line, i) in APP_FEATURES" :key="i">{{ line }}</li>
        </ul>
      </div>
      <div class="info-row">
        <span class="info-label">仓库最新版</span>
        <span class="info-value">
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
        </span>
      </div>
      <div class="info-row" v-if="info?.publishedAt">
        <span class="info-label">最新发布时间</span>
        <span class="info-value text-muted">{{ formatDate(info.publishedAt) }}</span>
      </div>
      <div class="info-row" v-if="info?.checkedAt">
        <span class="info-label">检测时间</span>
        <span class="info-value text-muted">{{ formatDate(info.checkedAt) }}</span>
      </div>
    </div>

    <div class="about-actions">
      <button class="btn-ghost btn-sm" @click="loadInfo" :disabled="loading">
        {{ loading ? '检测中...' : '重新检测更新' }}
      </button>
      <a :href="REPO_URL" target="_blank" rel="noopener" class="btn-primary btn-sm about-main-btn">打开 GitHub 仓库</a>
    </div>

    <p class="about-footer">© {{ new Date().getFullYear() }} {{ APP_NAME }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { checkForUpdate, hasUpdate } from '../composables/useUpdateCheck.js'
import { APP_NAME, APP_DISPLAY_NAME, APP_FEATURES, REPO_URL } from '../constants/app.js'

const info = ref(null)
const loading = ref(false)

onMounted(() => loadInfo())

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
  max-width: 560px;
  margin: 0 auto;
}

.about-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 36px 28px 32px;
  margin-bottom: 16px;
}

.about-icon-wrap {
  width: 72px;
  height: 72px;
  border-radius: 16px;
  background: var(--lemon-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--lemon-glow);
  margin-bottom: 16px;
}

.about-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  object-fit: cover;
  filter: brightness(1.05);
}

.about-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 4px;
}

.about-version {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 14px;
}

.about-desc {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.7;
  margin-bottom: 12px;
  max-width: 420px;
}

.about-repo {
  font-size: 13px;
  color: var(--accent);
  word-break: break-all;
  transition: color 0.15s;
}
.about-repo:hover { color: var(--accent-hover); }

.update-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  margin-bottom: 16px;
  background: var(--accent-muted);
  border-color: rgba(255, 102, 0, 0.35);
}
.update-banner-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary);
}
.update-banner-text strong { color: var(--accent); font-size: 14px; }

.about-card { padding: 4px 0; margin-bottom: 16px; }

.info-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-light);
}
.info-row:last-child { border-bottom: none; }
.info-label {
  width: 100px;
  flex-shrink: 0;
  font-size: 13px;
  color: var(--text-muted);
  padding-top: 2px;
}
.info-value {
  flex: 1;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.info-features {
  flex: 1;
  margin: 0;
  padding-left: 18px;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.8;
}
.info-features li { list-style: disc; }
.info-value code {
  background: var(--bg-input);
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 13px;
}
.text-muted { color: var(--text-muted); font-size: 13px; }

.badge-new {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: var(--accent-muted);
  color: var(--accent);
  border: 1px solid rgba(255, 102, 0, 0.35);
}
.badge-ok {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: rgba(52, 199, 89, 0.12);
  color: var(--success);
  border: 1px solid rgba(52, 199, 89, 0.3);
}

.about-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
  padding: 4px 2px;
  overflow: visible;
}
.about-main-btn {
  min-width: 160px;
  text-align: center;
}

.about-footer {
  margin-top: 28px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .about-hero { padding: 28px 20px 24px; }
  .about-icon-wrap { width: 64px; height: 64px; }
  .about-icon { width: 46px; height: 46px; }
  .update-banner {
    flex-direction: column;
    align-items: stretch;
  }
  .info-row {
    flex-direction: column;
    gap: 6px;
    padding: 12px 14px;
  }
  .info-label { width: auto; }
  .about-actions {
    flex-direction: column;
  }
  .about-actions .btn-primary,
  .about-actions .btn-ghost {
    width: 100%;
    text-align: center;
  }
}
</style>
