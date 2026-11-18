<template>
  <div class="source-probe-page">
    <div class="page-header-row">
      <button class="btn-ghost btn-sm" type="button" @click="goBack">← 返回</button>
      <div class="page-title">音源状态监测</div>
      <div class="page-header-spacer" />
    </div>
    <div class="source-probe-page-body card">
      <SourceProbePanel :active="true" :show-title="false" />
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import SourceProbePanel from '../components/SourceProbePanel.vue'

defineOptions({ name: 'SourceProbe' })

const router = useRouter()

function goBack() {
  router.replace({ path: '/settings', query: { tab: 'source' } })
}
</script>

<style scoped>
.source-probe-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  min-height: 0;
  padding: 12px 12px 24px;
  box-sizing: border-box;
}
.page-header-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
  min-height: 36px;
}
.page-title {
  text-align: center;
  font-size: 16px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.page-header-spacer {
  width: 64px;
}
.source-probe-page-body {
  padding: 14px 14px 18px;
  min-height: 0;
}
@media (min-width: 769px) {
  .source-probe-page {
    max-width: 920px;
    margin: 0 auto;
    padding: 20px 16px 32px;
  }
}
</style>
