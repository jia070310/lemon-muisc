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
        <button type="button" class="forgot-link" @click="showForgot = true">忘记密码？</button>
      </form>
    </div>

    <div v-if="showForgot" class="modal-overlay" @click.self="showForgot = false">
      <div class="modal-card" role="dialog" aria-labelledby="forgot-title" aria-modal="true">
        <div class="modal-head">
          <h2 id="forgot-title">忘记密码怎么办</h2>
          <button type="button" class="modal-close" aria-label="关闭" @click="showForgot = false">×</button>
        </div>
        <div class="modal-body">
          <p class="lead">
            忘记密码时，请在 NAS 上用脚本<b>只重置登录密码</b>。
            不会清空歌单、收藏、下载任务或音乐文件。
          </p>

          <section class="step">
            <h3>1. 先确认账号名</h3>
            <p>常见管理员账号是安装后改过的名字；若从未改过，首次默认可能是 <code>admin123</code>。</p>
            <p>不确定时，可在 SSH 里先列出全部账号（不会改密码）：</p>
            <pre class="cmd">PATH=/var/apps/nodejs_v22/target/bin:$PATH CONFIG_PATH=/vol1/@appconf/lemon-music/config node /var/apps/lemon-music/target/scripts/reset-password.js --list</pre>
          </section>

          <section class="step">
            <h3>2. 用飞牛 SSH 重置密码</h3>
            <p>打开飞牛的 SSH / 终端，把下面命令里的 <code>用户名</code> 和 <code>新密码</code> 换成你的，再执行：</p>
            <pre class="cmd">PATH=/var/apps/nodejs_v22/target/bin:$PATH CONFIG_PATH=/vol1/@appconf/lemon-music/config node /var/apps/lemon-music/target/scripts/reset-password.js 用户名 新密码</pre>
            <ul>
              <li>示例：用户名为 <code>admin</code>、新密码为 <code>MyPass123</code> 时，最后两段写成 <code>admin MyPass123</code>。</li>
              <li>配置目录不在 <code>vol1</code> 时，请把 <code>CONFIG_PATH</code> 改成实际路径（账号在 <code>lx-music.db</code> 里）。</li>
              <li>依赖应用中心的 <b>Node.js v22</b>；若提示找不到 <code>node</code>，请确认已安装并勾选依赖。</li>
            </ul>
          </section>

          <section class="step">
            <h3>3. 自托管（非飞牛）时</h3>
            <p>在项目目录执行：</p>
            <pre class="cmd">npm run auth:reset-password -- 用户名 新密码</pre>
            <p>同样可用 <code>--list</code> 查看账号列表。</p>
          </section>

          <section class="step">
            <h3>4. 重置后如何重新登录</h3>
            <ol>
              <li>回到本登录页，用「用户名 + 新密码」登录。</li>
              <li>若浏览器仍自动用旧会话登录失败，请清除本站 Cookie / 站点数据，或换无痕窗口再试。</li>
              <li>登录成功后，可在「设置 → 账号管理」再次修改密码；管理员也可在此为其他用户重置密码。</li>
            </ol>
          </section>

          <section class="step warn">
            <h3>请不要这样做</h3>
            <ul>
              <li>不要为了找回密码去清空用户数据、删除配置目录或卸载并抹掉数据——那样会丢掉歌单与设置。</li>
              <li>不要把新密码发给不可信的人；命令只在你自己的 NAS 上执行即可。</li>
            </ul>
          </section>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn-primary" @click="showForgot = false">知道了</button>
        </div>
      </div>
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
const showForgot = ref(false)

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
.forgot-link {
  align-self: center;
  margin-top: -4px;
  padding: 4px 8px;
  border: none;
  background: none;
  color: var(--accent);
  font-size: 13px;
  cursor: pointer;
}
.forgot-link:hover { opacity: 0.85; text-decoration: underline; }

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  background: rgba(0, 0, 0, 0.55);
  box-sizing: border-box;
}
.modal-card {
  width: 100%;
  max-width: 560px;
  max-height: min(88vh, 720px);
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-lg, 14px);
  background: var(--bg-card, var(--bg-elevated, #1e1e1e));
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  overflow: hidden;
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.modal-head h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.modal-close {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}
.modal-close:hover { background: var(--bg-hover); color: var(--text); }
.modal-body {
  padding: 14px 18px 8px;
  overflow: auto;
  font-size: 14px;
  line-height: 1.55;
  color: var(--text-secondary);
}
.lead { margin: 0 0 14px; color: var(--text); }
.step { margin: 0 0 16px; }
.step h3 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.step p { margin: 0 0 8px; }
.step ul, .step ol {
  margin: 0 0 8px;
  padding-left: 1.25em;
}
.step li { margin-bottom: 6px; }
.step.warn {
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--warning, #e6a23c) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--warning, #e6a23c) 35%, var(--border));
}
.step.warn h3 { color: var(--warning, #e6a23c); }
.cmd {
  margin: 0 0 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg-input, rgba(0,0,0,0.25));
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-x: auto;
}
.modal-body code {
  font-size: 12px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--bg-hover, rgba(255,255,255,0.06));
  color: var(--text);
}
.modal-foot {
  display: flex;
  justify-content: flex-end;
  padding: 12px 18px 16px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
.modal-foot .btn-primary {
  min-width: 96px;
  min-height: 40px;
}

@media (max-width: 768px) {
  .login-page { align-items: flex-start; padding-top: max(32px, env(safe-area-inset-top)); }
  .login-card { max-width: none; padding: 24px 20px; margin-top: clamp(0px, 6vh, 40px); }
  .field input { font-size: 16px; min-height: 48px; }
  .login-btn { min-height: 48px; }
  .modal-card { max-height: 90vh; }
}
</style>
