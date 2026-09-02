<template>
  <details class="mail-guide" :class="{ compact }">
    <summary>{{ compact ? '查看配置教程' : '邮件服务配置教程' }}</summary>
    <div class="mail-guide-body">
      <p class="mail-guide-lead">配置 SMTP 后可用于<strong>邮箱验证</strong>与<strong>忘记密码</strong>找回。QQ / 163 等邮箱需使用<strong>授权码</strong>，不是登录密码。</p>

      <h4>通用填写说明</h4>
      <ul>
        <li><strong>SMTP 服务器 / 端口</strong>：见下方常用邮箱；端口一般为 <code>465</code>（SSL）。</li>
        <li><strong>发件人地址</strong>：与 SMTP 账号一致，如 <code>music@qq.com</code> 或 <code>柠檬音乐 &lt;music@qq.com&gt;</code>。</li>
        <li><strong>SMTP 用户名</strong>：完整邮箱地址。</li>
        <li><strong>SMTP 密码</strong>：邮箱服务商提供的<strong>授权码</strong>（见各邮箱获取方式）。</li>
        <li><strong>应用访问地址</strong>：浏览器打开本应用的完整地址，邮件中的验证/重置链接会以此为前缀。例如 <code>http://192.168.1.100:7983</code> 或 <code>https://nas.example.com:7983</code>；飞牛 NAS 请填实际访问地址，留空则尝试自动识别。</li>
      </ul>

      <h4>QQ 邮箱</h4>
      <ol>
        <li>登录 <a href="https://mail.qq.com" target="_blank" rel="noopener">QQ 邮箱</a> → 设置 → 账户。</li>
        <li>找到「POP3/IMAP/SMTP…」→ 开启 <strong>IMAP/SMTP 服务</strong>。</li>
        <li>按提示用手机验证后，点击「生成授权码」，复制保存（只显示一次）。</li>
      </ol>
      <table class="mail-guide-table">
        <tbody>
          <tr><th>SMTP 服务器</th><td><code>smtp.qq.com</code></td></tr>
          <tr><th>端口</th><td><code>465</code></td></tr>
          <tr><th>用户名</th><td>你的 QQ 邮箱，如 <code>123456789@qq.com</code></td></tr>
          <tr><th>密码</th><td>上一步生成的<strong>授权码</strong></td></tr>
        </tbody>
      </table>

      <h4>网易 163 邮箱</h4>
      <ol>
        <li>登录 <a href="https://mail.163.com" target="_blank" rel="noopener">163 邮箱</a> → 设置 → POP3/SMTP/IMAP。</li>
        <li>开启 <strong>IMAP/SMTP 服务</strong>，按提示设置客户端授权密码（授权码）。</li>
      </ol>
      <table class="mail-guide-table">
        <tbody>
          <tr><th>SMTP 服务器</th><td><code>smtp.163.com</code></td></tr>
          <tr><th>端口</th><td><code>465</code></td></tr>
          <tr><th>用户名</th><td>完整 163 邮箱地址</td></tr>
          <tr><th>密码</th><td>客户端授权密码（授权码）</td></tr>
        </tbody>
      </table>

      <h4>配置完成后</h4>
      <ol>
        <li>打开「启用邮件」，保存各项设置。</li>
        <li>在下方填写测试收件邮箱，点击「发送测试邮件」确认能收到。</li>
        <li>各用户在「设置」中绑定邮箱并完成验证后，方可使用「忘记密码」。</li>
        <li>若忘记管理员密码且未配置邮件，可在服务器执行：<code>npm run auth:reset-password -- 用户名 新密码</code></li>
      </ol>
    </div>
  </details>
</template>

<script setup>
defineProps({
  compact: { type: Boolean, default: false },
})
</script>

<style scoped>
.mail-guide {
  margin: 0 0 16px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-secondary, var(--surface-2, rgba(0, 0, 0, 0.04)));
  overflow: hidden;
}
.mail-guide.compact { margin-bottom: 12px; }
.mail-guide summary {
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  cursor: pointer;
  user-select: none;
  list-style: none;
}
.mail-guide summary::-webkit-details-marker { display: none; }
.mail-guide summary::before {
  content: '▸ ';
  display: inline-block;
  transition: transform 0.15s;
}
.mail-guide[open] summary::before { transform: rotate(90deg); }
.mail-guide-body {
  padding: 0 12px 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
  border-top: 1px solid var(--border-light);
}
.mail-guide-lead { margin: 10px 0 12px; }
.mail-guide-body h4 {
  margin: 14px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.mail-guide-body h4:first-of-type { margin-top: 10px; }
.mail-guide-body ul,
.mail-guide-body ol {
  margin: 0 0 10px;
  padding-left: 1.25em;
}
.mail-guide-body li { margin-bottom: 4px; }
.mail-guide-body code {
  font-size: 12px;
  background: var(--bg-input);
  padding: 1px 5px;
  border-radius: 4px;
}
.mail-guide-body a { color: var(--accent); }
.mail-guide-table {
  width: 100%;
  margin: 0 0 10px;
  border-collapse: collapse;
  font-size: 12px;
}
.mail-guide-table th,
.mail-guide-table td {
  padding: 6px 8px;
  border: 1px solid var(--border-light);
  text-align: left;
  vertical-align: top;
}
.mail-guide-table th {
  width: 28%;
  background: var(--bg-input);
  color: var(--text);
  font-weight: 500;
}
.compact .mail-guide-body h4 { font-size: 12px; }
.compact .mail-guide-table { font-size: 11px; }
</style>
