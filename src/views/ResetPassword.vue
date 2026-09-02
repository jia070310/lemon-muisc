<template>
  <div class="login-page">
    <div class="login-card card">
      <div class="login-brand">
        <h1>设置新密码</h1>
        <p class="login-sub">请输入新密码完成重置</p>
      </div>
      <form class="login-form" @submit.prevent="submit">
        <label class="field">
          <span>新密码</span>
          <input v-model="password" type="password" autocomplete="new-password" placeholder="至少 6 位" required />
        </label>
        <label class="field">
          <span>确认密码</span>
          <input v-model="confirmPassword" type="password" autocomplete="new-password" placeholder="再次输入" required />
        </label>
        <p v-if="error" class="login-error">{{ error }}</p>
        <p v-if="success" class="login-success">{{ success }}</p>
        <button class="btn-primary login-btn" type="submit" :disabled="loading || !token">
          {{ loading ? '处理中…' : '确认重置' }}
        </button>
        <router-link to="/login" class="link-btn">返回登录</router-link>
      </form>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api.js'

const route = useRoute()
const router = useRouter()
const token = computed(() => String(route.query.token || ''))
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')
const success = ref('')

async function submit() {
  error.value = ''
  success.value = ''
  if (!token.value) {
    error.value = '链接无效，请从邮件中打开或重新申请'
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  loading.value = true
  try {
    await api.auth.resetPasswordByToken(token.value, password.value)
    success.value = '密码已重置，即将跳转登录…'
    setTimeout(() => router.replace('/login'), 1500)
  } catch (e) {
    error.value = e.message || '重置失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  width: 100%; flex: 1; min-height: 100vh; min-height: 100dvh;
  display: flex; align-items: center; justify-content: center; padding: 24px;
  background: radial-gradient(circle at 50% 0%, rgba(240, 112, 24, 0.14), transparent 52%), var(--bg);
}
.login-card { width: 100%; max-width: 420px; padding: 32px 28px; box-shadow: var(--shadow); }
.login-brand { text-align: center; margin-bottom: 24px; }
.login-brand h1 { margin: 0 0 8px; font-size: 22px; }
.login-sub { margin: 0; color: var(--text-secondary); font-size: 14px; }
.login-form { display: flex; flex-direction: column; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text-secondary); }
.field input {
  padding: 11px 12px; border-radius: var(--radius); border: 1px solid var(--border);
  background: var(--bg-input); color: var(--text); font-size: 15px;
}
.login-error { margin: 0; color: var(--error); font-size: 13px; }
.login-success { margin: 0; color: var(--success); font-size: 13px; }
.login-btn { width: 100%; min-height: 44px; }
.link-btn { text-align: center; color: var(--accent); font-size: 13px; text-decoration: none; }
</style>
