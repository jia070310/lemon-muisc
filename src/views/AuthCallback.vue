<template>
  <div class="auth-callback">
    <p>{{ message }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { TrimApp } from '@trimjs/web-app'

const message = ref('正在处理文件夹选择结果…')

onMounted(() => {
  try {
    const sdk = new TrimApp()
    const result = sdk.parseAppAuthCallback(window.location.href)

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({
        type: 'lemon-music:auth-result',
        result,
      }, window.location.origin)
      message.value = '选择完成，正在关闭…'
      window.close()
    } else {
      message.value = '选择已完成，请返回应用页面刷新路径列表。'
    }
  } catch (e) {
    message.value = e.message || '处理授权结果失败'
  }
})
</script>

<style scoped>
.auth-callback {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  color: var(--text-muted);
  font-size: 14px;
}
</style>
