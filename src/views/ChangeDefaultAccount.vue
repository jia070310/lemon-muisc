<template>
  <div class="login-page">
    <div class="login-card card">
      <div class="login-brand">
        <img :src="APP_ICON_URL" alt="柠檬音乐" class="login-logo" />
        <h1>修改默认管理员</h1>
        <p class="login-sub">当前仍是安装默认账号，请立即修改用户名和密码后再使用。</p>
      </div>

      <form class="login-form" @submit.prevent="submit">
        <label class="field">
          <span>新用户名</span>
          <input v-model="username" type="text" autocomplete="username" required />
        </label>
        <label class="field">
          <span>显示名称</span>
          <input v-model="displayName" type="text" autocomplete="name" placeholder="管理员" />
        </label>
        <label class="field">
          <span>新密码</span>
          <input v-model="password" type="password" autocomplete="new-password" placeholder="至少 6 位，勿用默认密码" required />
        </label>
        <label class="field">
          <span>确认新密码</span>
          <input v-model="confirmPassword" type="password" autocomplete="new-password" required />
        </label>
        <p class="field-hint">用户名支持字母、数字、下划线和中文。修改后请用新账号登录。</p>
        <p v-if="error" class="login-error">{{ error }}</p>
        <button class="btn-primary login-btn" type="submit" :disabled="loading">
          {{ loading ? '保存中…' : '保存并进入应用' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api.js'
import { currentUser, patchLocalUser, logout } from '../utils/auth.js'
import { APP_ICON_URL } from '../utils/appIcon.js'

const route = useRoute()
const router = useRouter()

const username = ref(currentUser.value?.username || 'admin123')
const displayName = ref(currentUser.value?.displayName || '管理员')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  if (username.value.trim() === 'admin123') {
    error.value = '请修改默认用户名'
    return
  }
  if (password.value.length < 6) {
    error.value = '新密码至少 6 位'
    return
  }
  if (password.value === 'admin123') {
    error.value = '请设置新密码，不要继续使用默认密码'
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  loading.value = true
  try {
    const res = await api.auth.completeDefaultAccount({
      username: username.value.trim(),
      displayName: displayName.value.trim() || username.value.trim(),
      password: password.value,
    })
    if (res.user) patchLocalUser(res.user)
    const redirect = String(route.query.redirect || '').trim()
    router.replace(redirect && redirect.startsWith('/') ? redirect : '/library')
  } catch (e) {
    error.value = e.message || '保存失败'
    if (String(e.message || '').includes('未登录')) {
      await logout()
      router.replace({ name: 'Login' })
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  width: 100%; flex: 1; min-height: 100vh; min-height: 100dvh;
  display: flex; align-items: center; justify-content: center; box-sizing: border-box;
  padding: max(24px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
  background: radial-gradient(circle at 50% 0%, rgba(240, 112, 24, 0.14), transparent 52%), var(--bg);
}
.login-card { width: 100%; max-width: 420px; margin: 0 auto; padding: 32px 28px; box-shadow: var(--shadow); }
.login-brand { text-align: center; margin-bottom: 24px; }
.login-logo {
  width: 96px;
  height: 96px;
  margin-bottom: 16px;
  border-radius: 22px;
  object-fit: cover;
}
.login-brand h1 { margin: 0 0 8px; font-size: clamp(20px, 4.5vw, 24px); }
.login-sub { margin: 0 auto; max-width: 42ch; color: var(--text-secondary); font-size: 14px; line-height: 1.55; }
.login-form { display: flex; flex-direction: column; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text-secondary); }
.field input { width: 100%; box-sizing: border-box; padding: 11px 12px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--bg-input); color: var(--text); font-size: 15px; }
.field-hint { margin: -4px 0 0; font-size: 12px; line-height: 1.45; color: var(--text-muted); }
.login-error { margin: 0; color: var(--error); font-size: 13px; white-space: pre-line; }
.login-btn { width: 100%; min-height: 44px; font-size: 15px; }
@media (max-width: 768px) {
  .login-page { align-items: flex-start; padding-top: max(32px, env(safe-area-inset-top)); }
  .login-card { max-width: none; padding: 24px 20px; margin-top: clamp(0px, 6vh, 40px); }
  .field input { font-size: 16px; min-height: 48px; }
  .login-btn { min-height: 48px; }
}
</style>
