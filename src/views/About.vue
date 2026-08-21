<template>
  <div class="about-page">
    <div class="about-header">
      <img src="/icon.png" alt="" class="about-icon" />
      <div>
        <div class="page-title">关于</div>
        <div class="page-subtitle">{{ APP_DISPLAY_NAME }} · {{ APP_NAME }}</div>
      </div>
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
        <span class="info-label">工具说明</span>
        <ul class="info-features">
          <li v-for="(line, i) in APP_FEATURES" :key="i">{{ line }}</li>
        </ul>
      </div>
      <div class="info-row">
        <span class="info-label">仓库地址</span>
        <a :href="REPO_URL" target="_blank" rel="noopener" class="info-link">{{ REPO_URL }}</a>
      </div>
      <div class="info-row">
        <span class="info-label">当前版本</span>
        <span class="info-value"><code>v{{ info?.currentVersion || '—' }}</code></span>
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
      <a :href="REPO_URL" target="_blank" rel="noopener" class="btn-primary btn-sm">打开 GitHub 仓库</a>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api.js'
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
.about-page { max-width: 720px; }

.about-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}
.about-header .page-subtitle { margin-bottom: 0; }
.about-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  object-fit: cover;
  flex-shrink: 0;
}

.update-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  margin-bottom: 16px;
  background: rgba(60, 110, 247, 0.12);
  border-color: rgba(60, 110, 247, 0.35);
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
.info-value.desc { line-height: 1.6; color: var(--text-secondary); }
.info-features {
  flex: 1;
  margin: 0;
  padding-left: 18px;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.8;
}
.info-features li { list-style: disc; }
.info-link {
  color: var(--accent);
  word-break: break-all;
  font-size: 14px;
}
.info-link:hover { color: var(--accent-hover); }
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
  background: rgba(255, 159, 10, 0.15);
  color: var(--warning);
  border: 1px solid rgba(255, 159, 10, 0.35);
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
}

@media (max-width: 768px) {
  .about-header { gap: 12px; }
  .about-icon { width: 48px; height: 48px; }
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
  .about-actions .btn-primary,
  .about-actions .btn-ghost {
    flex: 1;
    text-align: center;
  }
}
</style>
