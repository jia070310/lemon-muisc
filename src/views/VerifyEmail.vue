<template>
  <div class="login-page">
    <div class="login-card card">
      <div class="login-brand">
        <h1>邮箱验证</h1>
        <p class="login-sub">{{ message }}</p>
      </div>
      <router-link v-if="done" to="/search" class="btn-primary login-btn">进入应用</router-link>
      <router-link v-else-if="failed" to="/login" class="btn-primary login-btn">返回登录</router-link>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api.js'

const route = useRoute()
const message = ref('正在验证…')
const done = ref(false)
const failed = ref(false)

onMounted(async () => {
  const token = String(route.query.token || '')
  if (!token) {
    message.value = '验证链接无效'
    failed.value = true
    return
  }
  try {
    await api.auth.verifyEmail(token)
    message.value = '邮箱验证成功！'
    done.value = true
  } catch (e) {
    message.value = e.message || '验证失败，链接可能已过期'
    failed.value = true
  }
})
</script>

<style scoped>
.login-page {
  width: 100%; flex: 1; min-height: 100vh; min-height: 100dvh;
  display: flex; align-items: center; justify-content: center; padding: 24px;
  background: var(--bg);
}
.login-card { width: 100%; max-width: 420px; padding: 32px 28px; text-align: center; box-shadow: var(--shadow); }
.login-brand h1 { margin: 0 0 12px; }
.login-sub { margin: 0 0 20px; color: var(--text-secondary); line-height: 1.5; }
.login-btn { display: inline-block; text-decoration: none; text-align: center; padding: 10px 20px; border-radius: var(--radius); }
</style>
