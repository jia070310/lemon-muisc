#!/usr/bin/env node
/**
 * 忘记密码时，在 NAS / 服务器上通过命令行重置用户密码。
 *
 * 用法：
 *   node scripts/reset-password.js <用户名> <新密码>
 *   CONFIG_PATH=/path/to/config node scripts/reset-password.js admin newpass123
 *   node scripts/reset-password.js --list
 *
 * 飞牛 FPK 配置目录一般为：
 *   /vol1/@appconf/lemon-music/config
 *   或安装时 TRIM_PKGVAR/config（以实际 paths.conf 为准）
 */
import path from 'path'
import { fileURLToPath } from 'url'
import { initDB } from '../server/db.js'
import {
  findUserByUsername,
  hashPassword,
  listUsers,
  deleteUserSessions,
} from '../server/utils/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function printHelp() {
  console.log(`
柠檬音乐 · 重置用户密码

用法:
  npm run auth:reset-password -- <用户名> <新密码>
  node scripts/reset-password.js <用户名> <新密码>

选项:
  --list              列出所有用户
  --help, -h          显示帮助

环境变量:
  CONFIG_PATH         数据库配置目录（默认: 项目根目录/config）

示例:
  CONFIG_PATH=/vol1/@appconf/lemon-music/config \\
    node scripts/reset-password.js admin MyNewPass123
`)
}

function main() {
  const args = process.argv.slice(2)
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    printHelp()
    process.exit(args.length ? 0 : 1)
  }

  const configPath = process.env.CONFIG_PATH || path.join(__dirname, '..', 'config')
  initDB(configPath)

  if (args[0] === '--list') {
    const users = listUsers()
    if (!users.length) {
      console.log('当前没有任何用户，请通过浏览器首次访问完成初始化。')
      return
    }
    console.log('用户列表:')
    for (const u of users) {
      console.log(`  - ${u.username} (${u.displayName}) [${u.role}] id=${u.id}`)
    }
    return
  }

  const [username, newPassword] = args
  if (!username || !newPassword) {
    console.error('错误: 请提供用户名和新密码')
    printHelp()
    process.exit(1)
  }

  if (newPassword.length < 6) {
    console.error('错误: 新密码至少 6 个字符')
    process.exit(1)
  }

  const user = findUserByUsername(username)
  if (!user) {
    console.error(`错误: 用户「${username}」不存在`)
    console.error('提示: 运行 node scripts/reset-password.js --list 查看用户列表')
    process.exit(1)
  }

  const db = initDB(configPath)
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(hashPassword(newPassword), Math.floor(Date.now() / 1000), user.id)
  deleteUserSessions(user.id)

  console.log(`已重置用户「${user.username}」的密码，并清除其所有登录会话。`)
  console.log('请使用新密码重新登录。')
}

main()
