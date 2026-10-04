<template>
  <div class="login-page">
    <div class="login-card card">
      <div class="login-brand">
        <img :src="APP_ICON_URL" alt="柠檬音乐" class="login-logo" />
        <h1>登录柠檬音乐</h1>
        <p class="login-sub">{{ defaultHint }}</p>
      </div>

      <form class="login-form" @submit.prevent="submitLogin">
        <label class="field">
          <span>用户名</span>
          <input v-model="username" type="text" autocomplete="username" :placeholder="defaultAdminPending ? 'admin123' : '用户名'" required />
        </label>
        <label class="field">
          <span>密码</span>
          <input v-model="password" type="password" autocomplete="current-password" placeholder="请输入密码" required />
        </label>
        <label class="remember">
          <input v-model="remember" type="checkbox" />
          <span>保持登录（30 天）</span>
        </label>
        <p class="field-hint remember-hint">勾选后会写入浏览器 Cookie，飞牛手机端关闭应用后再打开也可保持登录。</p>
        <p v-if="error" class="login-error">{{ error }}</p>
        <button class="btn-primary login-btn" type="submit" :disabled="loading">
          {{ loading ? '登录中…' : '登录' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { login } from '../utils/auth.js'
import { api } from '../api.js'
import { APP_ICON_URL } from '../utils/appIcon.js'

const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
const remember = ref(true)
const loading = ref(false)
const error = ref('')
const defaultAdminPending = ref(false)

const defaultHint = computed(() => (
  defaultAdminPending.value
    ? '首次安装默认账号密码均为 admin123，登录后请立即修改。'
    : '请输入用户名和密码。'
))

onMounted(async () => {
  try {
    const data = await api.auth.status()
    defaultAdminPending.value = Boolean(data?.defaultAdminPending)
    if (defaultAdminPending.value && !username.value) username.value = 'admin123'
  } catch {}
})

async function submitLogin() {
  error.value = ''
  loading.value = true
  try {
    const data = await login(username.value, password.value, remember.value)
    const redirect = String(route.query.redirect || '').trim()
    if (data?.user?.mustChangePassword) {
      router.replace({ name: 'ChangeDefaultAccount', query: redirect ? { redirect } : {} })
      return
    }
    router.replace(redirect && redirect.startsWith('/') ? redirect : '/library')
  } catch (e) {
    error.value = e.message || '登录失败'
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
.login-sub { margin: 0 auto; max-width: 40ch; color: var(--text-secondary); font-size: 14px; line-height: 1.55; }
.login-form { display: flex; flex-direction: column; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text-secondary); }
.field input { width: 100%; box-sizing: border-box; padding: 11px 12px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--bg-input); color: var(--text); font-size: 15px; }
.field-hint { margin: -4px 0 0; font-size: 12px; line-height: 1.45; color: var(--text-muted); }
.remember-hint { margin-top: 2px; }
.remember { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); }
.login-error { margin: 0; color: var(--error); font-size: 13px; white-space: pre-line; }
.login-btn { width: 100%; min-height: 44px; font-size: 15px; }
@media (max-width: 768px) {
  .login-page { align-items: flex-start; padding-top: max(32px, env(safe-area-inset-top)); }
  .login-card { max-width: none; padding: 24px 20px; margin-top: clamp(0px, 6vh, 40px); }
  .field input { font-size: 16px; min-height: 48px; }
  .login-btn { min-height: 48px; }
}
</style>
