import fs from 'fs'
import path from 'path'

const HINT_FILE = 'SETUP_README.txt'
const CREDENTIALS_FILE = 'ADMIN_CREDENTIALS.txt'

export function writeSetupHint(configPath, {
  username,
  email,
  mailConfigured,
  verificationSent,
  recoveryMode = 'mail',
  credentialsFile = null,
}) {
  if (!configPath) return null
  const filePath = path.join(configPath, HINT_FILE)
  const recoveryLabel = recoveryMode === 'local'
    ? '本地保存账号文件'
    : (mailConfigured ? '邮件找回' : '未配置（可稍后在设置中配置邮件）')

  const lines = [
    '柠檬音乐 · 初始化完成',
    `时间: ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    '',
    `管理员用户名: ${username}`,
    email ? `绑定邮箱: ${email}` : '绑定邮箱: （未填写）',
    `账号恢复方式: ${recoveryLabel}`,
    recoveryMode === 'local' && credentialsFile ? `账号文件: ${credentialsFile}` : '',
    recoveryMode === 'mail' ? `邮件服务: ${mailConfigured ? '已配置' : '未配置'}` : '',
    recoveryMode === 'mail' && email && mailConfigured
      ? `验证邮件: ${verificationSent ? '已发送' : '未发送（请登录后在设置中重发）'}`
      : '',
    '',
    `配置目录: ${configPath}`,
    `数据库文件: ${path.join(configPath, 'lx-music.db')}`,
    '',
    '—— 忘记密码怎么办？ ——',
    '',
    ...(recoveryMode === 'local' && credentialsFile
      ? [
        '方式一：查看本地账号文件',
        `  ${credentialsFile}`,
        '  文件内含初始化时设置的用户名与密码，请妥善保管。',
        '',
      ]
      : [
        '方式一：邮件找回',
        '  前提：已配置 SMTP，且邮箱已完成验证。',
        '  在登录页点击「忘记密码」，按提示操作。',
        '',
      ]),
    '方式二：命令行重置（NAS SSH）',
    `  CONFIG_PATH="${configPath}" npm run auth:reset-password -- ${username} 新密码`,
    '',
    '安全提示：',
    '  · 本文件不含密码。',
    recoveryMode === 'local'
      ? '  · 账号密码保存在 ADMIN_CREDENTIALS.txt，请勿泄露或上传到公网。'
      : '  · 请勿在 SETUP_README.txt 中手写密码。',
    '  · 请勿删除 lx-music.db，除非你知道如何恢复数据。',
    '',
  ].filter(Boolean)

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
  return filePath
}

export function writeLocalCredentials(configPath, { username, password, displayName }) {
  if (!configPath) return null
  const filePath = path.join(configPath, CREDENTIALS_FILE)
  const lines = [
    '柠檬音乐 · 管理员账号信息',
    `时间: ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    '',
    `显示名称: ${displayName || username}`,
    `用户名: ${username}`,
    `密码: ${password}`,
    '',
    `文件位置: ${filePath}`,
    `配置目录: ${configPath}`,
    '',
    '—— 说明 ——',
    '',
    '此文件在初始化时由你选择的「本地保存账号」方式生成，忘记密码时可查看。',
    '请妥善保管，切勿分享给他人、上传到公网或放入共享文件夹。',
    '',
    '若丢失此文件，可在服务器执行：',
    `  CONFIG_PATH="${configPath}" npm run auth:reset-password -- ${username} 新密码`,
    '',
  ]

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
  try { fs.chmodSync(filePath, 0o600) } catch {}
  return filePath
}

export function getSetupHintPath(configPath) {
  return path.join(configPath, HINT_FILE)
}

export function getCredentialsFilePath(configPath) {
  return path.join(configPath, CREDENTIALS_FILE)
}
