<template>
  <div class="login-page">
    <div class="login-card card" :class="{ wide: setupMode && setupStep === 2 }">
      <div class="login-brand">
        <img src="/icon.png" alt="柠檬音乐" class="login-logo" />
        <h1>{{ title }}</h1>
        <p class="login-sub">{{ subtitle }}</p>
        <div v-if="setupMode" class="setup-steps">
          <span :class="{ active: setupStep === 1, done: setupStep > 1 }">1. 管理员</span>
          <span class="step-sep">→</span>
          <span :class="{ active: setupStep === 2 }">2. 恢复方式</span>
        </div>
      </div>

      <form v-if="mode === 'login'" class="login-form" @submit.prevent="submitLogin">
        <label class="field">
          <span>用户名</span>
          <input v-model="username" type="text" autocomplete="username" placeholder="admin" required />
        </label>
        <label class="field">
          <span>密码</span>
          <input v-model="password" type="password" autocomplete="current-password" placeholder="至少 6 位" required />
        </label>
        <label class="remember">
          <input v-model="remember" type="checkbox" />
          <span>保持登录（30 天）</span>
        </label>
        <p v-if="error" class="login-error">{{ error }}</p>
        <button class="btn-primary login-btn" type="submit" :disabled="loading">登录</button>
        <button type="button" class="link-btn" @click="mode = 'forgot'">忘记密码？</button>
      </form>

      <form v-else-if="mode === 'forgot'" class="login-form" @submit.prevent="submitForgot">
        <label class="field">
          <span>用户名或邮箱</span>
          <input v-model="forgotAccount" type="text" placeholder="输入绑定的用户名或邮箱" required />
        </label>
        <p class="field-hint">仅已验证邮箱的账号可通过邮件找回密码。</p>
        <p v-if="info" class="login-info">{{ info }}</p>
        <p v-if="error" class="login-error">{{ error }}</p>
        <button class="btn-primary login-btn" type="submit" :disabled="loading">发送重置链接</button>
        <button type="button" class="link-btn" @click="backToLogin">返回登录</button>
      </form>

      <form v-else-if="setupStep === 1" class="login-form" @submit.prevent="goSetupStep2">
        <label class="field">
          <span>用户名</span>
          <input v-model="username" type="text" autocomplete="username" placeholder="admin" required />
        </label>
        <label class="field">
          <span>显示名称</span>
          <input v-model="displayName" type="text" autocomplete="name" placeholder="管理员" />
        </label>
        <label class="field">
          <span>邮箱</span>
          <input v-model="email" type="email" autocomplete="email" placeholder="选择邮件找回时填写" />
        </label>
        <p class="field-hint">邮箱仅在选择「邮件找回」时需要，用于验证与忘记密码。</p>
        <label class="field">
          <span>密码</span>
          <input v-model="password" type="password" autocomplete="new-password" placeholder="至少 6 位" required />
        </label>
        <label class="field">
          <span>确认密码</span>
          <input v-model="confirmPassword" type="password" autocomplete="new-password" placeholder="再次输入密码" required />
        </label>
        <p v-if="error" class="login-error">{{ error }}</p>
        <button class="btn-primary login-btn" type="submit">下一步：选择恢复方式</button>
      </form>

      <form v-else class="login-form" @submit.prevent="submitSetup()">
        <p class="field-hint">选择忘记密码时的找回方式，之后也可在「设置 → 邮件服务」中补充配置。</p>

        <div class="recovery-options">
          <label class="recovery-option" :class="{ active: recoveryMode === 'mail' }">
            <input v-model="recoveryMode" type="radio" value="mail" />
            <div class="recovery-option-body">
              <strong>邮件找回</strong>
              <span>配置 SMTP，支持邮箱验证与「忘记密码」邮件</span>
            </div>
          </label>
          <label class="recovery-option" :class="{ active: recoveryMode === 'local' }">
            <input v-model="recoveryMode" type="radio" value="local" />
            <div class="recovery-option-body">
              <strong>本地保存账号</strong>
              <span>将用户名和密码写入配置目录，无需配置邮箱</span>
            </div>
          </label>
        </div>

        <template v-if="recoveryMode === 'mail'">
          <MailConfigGuide compact />
          <label class="field">
            <span>SMTP 服务器</span>
            <input v-model="mail.host" type="text" placeholder="smtp.qq.com" />
          </label>
          <label class="field">
            <span>端口</span>
            <input v-model="mail.port" type="number" placeholder="465" />
          </label>
          <label class="field">
            <span>发件人</span>
            <input v-model="mail.from" type="text" placeholder="music@example.com" />
          </label>
          <label class="field">
            <span>SMTP 用户名</span>
            <input v-model="mail.user" type="text" />
          </label>
          <label class="field">
            <span>SMTP 密码 / 授权码</span>
            <input v-model="mail.pass" type="password" />
          </label>
          <label class="field">
            <span>应用访问地址</span>
            <input v-model="mail.appUrl" type="url" :placeholder="defaultAppUrl" />
          </label>
          <p class="field-hint">邮件中的验证/重置链接会使用此地址，建议填写 NAS 访问地址。</p>
          <div class="mail-test-row">
            <button type="button" class="btn-ghost btn-sm" :disabled="mailTesting" @click="testSetupMail">
              {{ mailTesting ? '发送中…' : '发送测试邮件' }}
            </button>
            <span v-if="mailTestOk" class="login-info">测试邮件已发送</span>
          </div>
        </template>

        <div v-else class="local-save-info">
          <p>初始化完成后，将在<strong>配置目录</strong>生成账号文件：</p>
          <pre class="local-save-path">ADMIN_CREDENTIALS.txt</pre>
          <p class="field-hint">本地开发一般为项目下的 <code>config/</code> 目录；飞牛 NAS 一般在 <code>/vol1/@appconf/lemon-music/config/</code>。</p>
          <p class="local-save-warn">文件内含明文密码，请妥善保管，勿分享或上传到公网。</p>
        </div>

        <p v-if="error" class="login-error">{{ error }}</p>
        <p v-if="info" class="login-info">{{ info }}</p>
        <div class="setup-actions">
          <button type="button" class="btn-ghost" @click="setupStep = 1">上一步</button>
          <button class="btn-primary login-btn" type="submit" :disabled="loading">
            {{ loading ? '创建中…' : '完成初始化' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { login, setupAdmin, needsSetup } from '../utils/auth.js'
import { api } from '../api.js'
import MailConfigGuide from '../components/MailConfigGuide.vue'

const route = useRoute()
const router = useRouter()

const setupMode = computed(() => needsSetup.value || route.name === 'Setup')
const setupStep = ref(1)
const mode = ref('login')
const title = computed(() => {
  if (setupMode.value) return setupStep.value === 1 ? '初始化管理员' : '选择恢复方式'
  if (mode.value === 'forgot') return '找回密码'
  return '登录柠檬音乐'
})
const subtitle = computed(() => {
  if (setupMode.value && setupStep.value === 1) return '首次使用，请创建管理员账号'
  if (setupMode.value) return '选择忘记密码时的找回方式'
  if (mode.value === 'forgot') return '向已验证的邮箱发送重置链接'
  return '请输入账号密码继续'
})

const username = ref('admin')
const displayName = ref('管理员')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const remember = ref(true)
const forgotAccount = ref('')
const loading = ref(false)
const error = ref('')
const info = ref('')
const mailTesting = ref(false)
const mailTestOk = ref(false)
const recoveryMode = ref('local')
const defaultAppUrl = ref(`${location.protocol}//${location.host}`)

const mail = reactive({
  host: '',
  port: '465',
  from: '',
  user: '',
  pass: '',
  appUrl: '',
})

onMounted(() => {
  if (setupMode.value) {
    mode.value = 'setup'
    mail.appUrl = defaultAppUrl.value
  }
})

function backToLogin() {
  mode.value = 'login'
  error.value = ''
  info.value = ''
}

function goSetupStep2() {
  error.value = ''
  if (password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  if (mail.from && !mail.from.includes('@') && email.value) {
    mail.from = email.value
  }
  if (mail.user && !mail.host) {
    mail.host = guessSmtpHost(mail.user)
  }
  setupStep.value = 2
}

function guessSmtpHost(addr) {
  const domain = String(addr).split('@')[1] || ''
  if (domain.includes('qq.com')) return 'smtp.qq.com'
  if (domain.includes('163.com')) return 'smtp.163.com'
  if (domain.includes('gmail.com')) return 'smtp.gmail.com'
  return ''
}

function buildMailPayload(includeMail) {
  if (!includeMail || !mail.host) return null
  return {
    enabled: true,
    host: mail.host,
    port: mail.port,
    secure: true,
    user: mail.user,
    pass: mail.pass,
    from: mail.from || email.value,
    appUrl: mail.appUrl || defaultAppUrl.value,
  }
}

async function testSetupMail() {
  error.value = ''
  mailTestOk.value = false
  const testTo = email.value || mail.from
  if (!testTo) {
    error.value = '请先填写管理员邮箱或发件人地址'
    return
  }
  if (!mail.host) {
    error.value = '请填写 SMTP 服务器'
    return
  }
  mailTesting.value = true
  try {
    await api.auth.setupTestMail(buildMailPayload(true), testTo)
    mailTestOk.value = true
  } catch (e) {
    error.value = e.message || '测试邮件发送失败'
  } finally {
    mailTesting.value = false
  }
}

async function submitSetup() {
  error.value = ''
  info.value = ''
  if (setupStep.value === 1 && password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  loading.value = true
  try {
    const includeMail = recoveryMode.value === 'mail' && Boolean(mail.host)
    const data = await setupAdmin(
      username.value,
      password.value,
      displayName.value,
      recoveryMode.value === 'mail' ? email.value : '',
      includeMail ? buildMailPayload(true) : null,
      recoveryMode.value,
    )

    const hints = []
    if (data.credentialsFile) {
      hints.push(`账号已保存至：\n${data.credentialsFile}`)
      hints.push('请妥善保管该文件，忘记密码时可查看。')
    }
    if (data.verificationSent) hints.push('验证邮件已发送，请查收并点击链接。')
    else if (recoveryMode.value === 'mail' && email.value && data.mailConfigured) {
      hints.push('邮箱已保存，可在设置中重发验证邮件。')
    }
    else if (recoveryMode.value === 'mail' && email.value && !data.mailConfigured) {
      hints.push('邮箱已保存，请稍后在「设置 → 邮件服务」配置 SMTP。')
    }
    if (data.hintMessage) hints.push(data.hintMessage)
    if (hints.length) info.value = hints.join('\n')

    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/search'
    setTimeout(() => router.replace(redirect), hints.length ? 2800 : 0)
  } catch (e) {
    error.value = e.message || '初始化失败'
  } finally {
    loading.value = false
  }
}

async function submitLogin() {
  error.value = ''
  loading.value = true
  try {
    await login(username.value, password.value, remember.value)
    router.replace(typeof route.query.redirect === 'string' ? route.query.redirect : '/search')
  } catch (e) {
    error.value = e.message || '登录失败'
  } finally {
    loading.value = false
  }
}

async function submitForgot() {
  error.value = ''
  info.value = ''
  loading.value = true
  try {
    const data = await api.auth.forgotPassword(forgotAccount.value)
    info.value = data.message || '若账号已绑定并验证邮箱，重置链接已发送'
    forgotAccount.value = ''
  } catch (e) {
    error.value = e.message || '发送失败'
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
.login-card.wide { max-width: 480px; }
.login-brand { text-align: center; margin-bottom: 24px; }
.login-logo { width: 56px; height: 56px; margin-bottom: 12px; }
.login-brand h1 { margin: 0 0 8px; font-size: clamp(20px, 4.5vw, 24px); }
.login-sub { margin: 0 auto; max-width: 40ch; color: var(--text-secondary); font-size: 14px; line-height: 1.55; }
.setup-steps { display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 14px; font-size: 12px; color: var(--text-muted); }
.setup-steps span.active { color: var(--accent); font-weight: 600; }
.setup-steps span.done { color: var(--success); }
.step-sep { opacity: 0.5; }
.login-form { display: flex; flex-direction: column; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text-secondary); }
.field input { width: 100%; box-sizing: border-box; padding: 11px 12px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--bg-input); color: var(--text); font-size: 15px; }
.field-hint { margin: -4px 0 0; font-size: 12px; line-height: 1.45; color: var(--text-muted); }
.remember { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); }
.login-error { margin: 0; color: var(--error); font-size: 13px; white-space: pre-line; }
.login-info { margin: 0; color: var(--success); font-size: 13px; line-height: 1.45; white-space: pre-line; }
.login-btn { width: 100%; min-height: 44px; font-size: 15px; }
.link-btn { background: none; border: none; color: var(--accent); font-size: 13px; cursor: pointer; padding: 4px 0; }
.setup-actions { display: flex; gap: 10px; align-items: center; }
.setup-actions .login-btn { flex: 1; width: auto; }
.mail-test-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.recovery-options { display: flex; flex-direction: column; gap: 10px; }
.recovery-option {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 14px; border-radius: var(--radius);
  border: 1px solid var(--border); background: var(--bg-input);
  cursor: pointer; transition: border-color 0.15s, background 0.15s;
}
.recovery-option.active { border-color: var(--accent); background: var(--accent-muted); }
.recovery-option input { margin-top: 3px; flex-shrink: 0; accent-color: var(--accent); }
.recovery-option-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.recovery-option-body strong { font-size: 14px; color: var(--text); }
.recovery-option-body span { font-size: 12px; line-height: 1.45; color: var(--text-muted); }
.local-save-info {
  padding: 12px 14px; border-radius: var(--radius);
  background: var(--bg-input); border: 1px solid var(--border-light);
  font-size: 13px; line-height: 1.55; color: var(--text-secondary);
}
.local-save-info p { margin: 0 0 8px; }
.local-save-path {
  margin: 0 0 10px; padding: 10px 12px; border-radius: 6px;
  background: var(--bg); border: 1px solid var(--border-light);
  font-size: 12px; font-family: monospace; overflow-x: auto;
}
.local-save-info code { font-size: 12px; background: var(--bg); padding: 1px 5px; border-radius: 4px; }
.local-save-warn { margin: 0; color: var(--warning, #c87800); font-size: 12px; }
@media (max-width: 768px) {
  .login-page { align-items: flex-start; padding-top: max(32px, env(safe-area-inset-top)); }
  .login-card, .login-card.wide { max-width: none; padding: 24px 20px; margin-top: clamp(0px, 6vh, 40px); }
  .field input { font-size: 16px; min-height: 48px; }
  .login-btn { min-height: 48px; }
}
</style>
