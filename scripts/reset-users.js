#!/usr/bin/env node
/**
 * 清空所有用户账号，然后重新生成默认管理员 admin123。
 * 不会删除音源、路径、下载记录等全局设置。
 *
 * 用法：
 *   飞牛（不要用 npm）：
 *     PATH=/var/apps/nodejs_v22/target/bin:$PATH CONFIG_PATH=/vol1/@appdata/lemon-music/config node /var/apps/lemon-music/target/scripts/reset-users.js --yes
 *   本地源码：
 *     npm run auth:reset-users -- --yes
 *     CONFIG_PATH=/path/to/config node scripts/reset-users.js --yes
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { initDB, getDB } from '../server/db.js'
import { listUsers, ensureDefaultAdmin } from '../server/utils/auth.js'
import { getSetupHintPath, getCredentialsFilePath } from '../server/utils/setupHint.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function printHelp() {
  console.log(`
柠檬音乐 · 清空所有用户

飞牛 NAS（不要用 npm，系统里没有）:
  PATH=/var/apps/nodejs_v22/target/bin:$PATH CONFIG_PATH=/vol1/@appdata/lemon-music/config node /var/apps/lemon-music/target/scripts/reset-users.js --list
  PATH=/var/apps/nodejs_v22/target/bin:$PATH CONFIG_PATH=/vol1/@appdata/lemon-music/config node /var/apps/lemon-music/target/scripts/reset-users.js --yes

自托管:
  npm run auth:reset-users -- --yes
  node scripts/reset-users.js --yes

选项:
  --list              列出当前用户（不删除）
  --yes, -y           确认执行清空（必填，防止误操作）
  --help, -h          显示帮助

环境变量:
  CONFIG_PATH         数据库配置目录（默认: 项目根目录/config）

说明:
  · 仅删除 users / sessions / auth_tokens / user_settings
  · 保留音源、路径、下载任务、音乐库索引等数据
  · 执行后刷新浏览器，使用默认账号 admin123 / admin123 登录，并立即修改
  · 浏览器若仍自动登录，请清除本站 localStorage 或退出登录

飞牛 NAS 配置目录示例:
  /vol1/@appdata/lemon-music/config（不是 @appconf）

数据库文件:
  {CONFIG_PATH}/lx-music.db
`)
}

function main() {
  const args = process.argv.slice(2)
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    printHelp()
    process.exit(args.length ? 0 : 1)
  }

  const configPath = process.env.CONFIG_PATH || path.join(__dirname, '..', 'config')
  const dbPath = path.join(configPath, 'lx-music.db')

  if (!fs.existsSync(dbPath)) {
    console.error(`错误: 未找到数据库文件 ${dbPath}`)
    console.error('请检查 CONFIG_PATH 是否指向正确的配置目录。')
    process.exit(1)
  }

  initDB(configPath)

  if (args.includes('--list')) {
    const users = listUsers()
    if (!users.length) {
      console.log('当前没有任何用户。')
      return
    }
    console.log(`配置目录: ${configPath}`)
    console.log(`数据库: ${dbPath}`)
    console.log('用户列表:')
    for (const u of users) {
      const mail = u.email ? ` · ${u.email}` : ''
      console.log(`  - ${u.username} (${u.displayName}) [${u.role}]${mail}`)
    }
    return
  }

  if (!args.includes('--yes') && !args.includes('-y')) {
    const users = listUsers()
    console.log(`配置目录: ${configPath}`)
    console.log(`数据库: ${dbPath}`)
    if (!users.length) {
      console.log('当前没有任何用户，无需清空。')
      return
    }
    console.log('\n将删除以下用户:')
    for (const u of users) {
      console.log(`  - ${u.username} [${u.role}]`)
    }
    console.log('\n同时清除：登录会话、令牌、用户个人歌单与收藏。')
    console.log('不会删除：音源脚本、路径设置、下载任务、音乐库索引。')
    console.log('\n请添加 --yes 确认执行，例如:')
    console.log('  npm run auth:reset-users -- --yes')
    process.exit(1)
  }

  const db = getDB()
  const before = listUsers()

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM sessions').run()
    db.prepare('DELETE FROM auth_tokens').run()
    db.prepare('DELETE FROM user_settings').run()
    db.prepare('DELETE FROM users').run()
  })
  tx()

  for (const filePath of [getSetupHintPath(configPath), getCredentialsFilePath(configPath)]) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  }

  const afterDelete = listUsers().length
  console.log(`配置目录: ${configPath}`)
  console.log(`数据库: ${dbPath}`)
  console.log(`已删除 ${before.length} 个用户，当前用户数: ${afterDelete}`)
  if (before.length) {
    console.log('已删除用户:', before.map(u => u.username).join(', '))
  }
  const created = ensureDefaultAdmin()
  if (created) {
    console.log('\n已重新生成默认管理员: admin123 / admin123')
    console.log('下一步: 刷新浏览器并登录，立即修改用户名和密码。')
  }
  console.log('若仍自动登录，请硬刷新页面（Ctrl+Shift+R），或清除浏览器中本站的 lemon-auth-token / lemon-auth-user。')
}

main()
