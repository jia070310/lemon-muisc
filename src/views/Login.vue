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
          <span class="field-label-row">
            <span>密码</span>
            <button type="button" class="forgot-link" @click="showForgot = true">忘记密码？</button>
          </span>
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

    <div v-if="showForgot" class="modal-overlay" @click.self="showForgot = false">
      <div class="modal-card" role="dialog" aria-labelledby="forgot-title" aria-modal="true">
        <div class="modal-head">
          <h2 id="forgot-title">忘记密码怎么办</h2>
          <button type="button" class="modal-close" aria-label="关闭" @click="showForgot = false">×</button>
        </div>
        <div class="modal-body">
          <p class="lead">
            忘记密码时，要在 <b>NAS 的命令行</b>里执行一条命令，<b>只改登录密码</b>。
            不会清空歌单、收藏、下载任务或音乐文件。文件管理器里点来点去<b>无法</b>改这个密码。
          </p>

          <section class="step">
            <h3>先分清两套账号</h3>
            <ul>
              <li><b>飞牛系统账号</b>：登录飞牛网页 / SSH 用的，一般是装 NAS 时设的管理员。</li>
              <li><b>柠檬音乐账号</b>：登录本页用的。首次默认多为 <code>admin123</code>，你改过用户名就要用新名字。</li>
            </ul>
            <p>下面命令里的「用户名 / 新密码」指的是<b>柠檬音乐账号</b>；SSH 登录用的是<b>飞牛系统账号</b>。</p>
          </section>

          <section class="step">
            <h3>方式一：在飞牛网页里操作（推荐，不用装软件）</h3>
            <ol>
              <li>用<b>电脑浏览器</b>打开飞牛系统（手机 App 里通常没有完整终端）。</li>
              <li>打开 <b>控制面板 → 终端</b>（有的版本叫「SSH」或「终端服务」）。若 SSH 是关的，先打开「允许 SSH」，保存。</li>
              <li>再打开飞牛的 <b>「终端」</b>应用（或控制面板里的网页终端），用<b>飞牛系统账号</b>登录。看到类似 <code>#</code> 或 <code>$</code> 的提示符即可。</li>
              <li>飞牛终端里<b>不要</b>输入 <code>npm ...</code>（系统没有 npm，会报 <code>command not found</code>）。整行复制下面这条即可：</li>
            </ol>
            <pre class="cmd">PATH=/var/apps/nodejs_v22/target/bin:$PATH CONFIG_PATH=/vol1/@appdata/lemon-music/config node /var/apps/lemon-music/target/scripts/reset-password.js --list</pre>
            <p>记住列表里的用户名，再执行重置（把 <code>用户名</code> 和 <code>新密码</code> 换成你的；新密码建议字母+数字，不要空格、不要中文）：</p>
            <pre class="cmd">PATH=/var/apps/nodejs_v22/target/bin:$PATH CONFIG_PATH=/vol1/@appdata/lemon-music/config node /var/apps/lemon-music/target/scripts/reset-password.js 用户名 新密码</pre>
            <p>示例：账号是 <code>admin</code>、新密码是 <code>MyPass123</code>，最后两段写成 <code>admin MyPass123</code>。</p>
          </section>

          <section class="step">
            <h3>方式二：电脑外部终端连到 NAS</h3>
            <p>适合已经开了 SSH、习惯用电脑连 NAS 的情况。工具任选其一：</p>
            <ul>
              <li><b>Windows 11</b>：开始菜单搜「终端」或「PowerShell」（也可用 PuTTY）。</li>
              <li><b>Windows 10</b>：开始菜单搜「cmd」或「PowerShell」。</li>
              <li><b>Mac</b>：启动台 → 其他 → 终端。</li>
              <li><b>Linux</b>：系统自带终端。</li>
            </ul>
            <p>先连上 NAS（把 IP 和飞牛用户名换成你的，例如 <code>192.168.1.8</code>）：</p>
            <pre class="cmd">ssh 飞牛用户名@NAS的IP地址</pre>
            <p>提示输入密码时，输入<b>飞牛系统密码</b>（输入时屏幕往往不显示圆点，直接打完回车即可）。连上后再粘贴上面的 <code>--list</code> / 重置命令。</p>
          </section>

          <section class="step">
            <h3>命令失败时看这里</h3>
            <ul>
              <li>提示 <code>npm: command not found</code>：这是正常的。飞牛请用上面那条以 <code>PATH=/var/apps/nodejs_v22</code> 开头的命令，不要用 <code>npm</code>。</li>
              <li>提示找不到 <code>node</code>：到飞牛<b>应用中心</b>安装 <b>Node.js v22</b>，并确认柠檬音乐依赖了它，然后重试。</li>
              <li>提示找不到配置、或显示「没有任何用户」：配置在 <code>@appdata</code>，不是 <code>@appconf</code>。也可能不在 vol1。把命令里的路径改成实际卷，例如 <code>/vol2/@appdata/lemon-music/config</code>。也可执行 <code>find /vol1 /vol2 -name "lx-music.db"</code> 查找。</li>
              <li>提示没有权限：用飞牛<b>管理员</b>账号登录终端，不要用普通用户。</li>
            </ul>
          </section>

          <section class="step">
            <h3>Docker / 自己跑源码</h3>
            <p>Docker：</p>
            <pre class="cmd">docker compose exec lemon-music node scripts/reset-password.js --list
docker compose exec lemon-music node scripts/reset-password.js 用户名 新密码</pre>
            <p>电脑源码目录（<b>飞牛不要用 npm</b>）：</p>
            <pre class="cmd">npm run auth:reset-password -- --list
npm run auth:reset-password -- 用户名 新密码</pre>
          </section>

          <section class="step">
            <h3>重置成功后</h3>
            <ol>
              <li>回到本登录页，用柠檬音乐「用户名 + 新密码」登录。</li>
              <li>若还是登不进去，用浏览器无痕窗口，或清除本站 Cookie / 站点数据后再试。</li>
              <li>登录后可在「设置 → 账号管理」再改密码；管理员也可在那里给别人重置（那就不用命令行了）。</li>
            </ol>
          </section>

          <section class="step warn">
            <h3>请不要这样做</h3>
            <ul>
              <li>不要为了找回密码去清空用户数据、删配置目录，或卸载时勾选抹掉数据——歌单和设置会一起没。</li>
              <li>命令只在你自己的 NAS / 电脑上执行；不要把新密码发给陌生人。</li>
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
.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.field input { width: 100%; box-sizing: border-box; padding: 11px 12px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--bg-input); color: var(--text); font-size: 15px; }
.field-hint { margin: -4px 0 0; font-size: 12px; line-height: 1.45; color: var(--text-muted); }
.remember-hint { margin-top: 2px; }
.remember { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); }
.login-error { margin: 0; color: var(--error); font-size: 13px; white-space: pre-line; }
.login-btn { width: 100%; min-height: 44px; font-size: 15px; }
.forgot-link {
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--accent, #f07018);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.forgot-link:hover { opacity: 0.85; }

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
