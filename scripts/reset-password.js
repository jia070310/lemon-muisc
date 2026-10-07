#!/usr/bin/env node
/**
 * 忘记密码时，在 NAS / 服务器上通过命令行重置用户密码。
 *
 * 飞牛真实配置一般在：
 *   /vol1/@appdata/lemon-music/config
 * （不是 @appconf。脚本会自动查找 lx-music.db）
 */
import fs from 'fs'
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
const SCRIPT = '/var/apps/lemon-music/target/scripts/reset-password.js'
const NODE_PREFIX = 'PATH=/var/apps/nodejs_v22/target/bin:$PATH'

function printHelp() {
  console.log(`
柠檬音乐 · 重置用户密码（只改登录密码，不清空歌单/收藏）

飞牛 NAS（不要用 npm，系统里没有）：
  1. 电脑打开飞牛 → 控制面板开启 SSH → 打开「终端」
     或电脑执行: ssh 飞牛用户名@NAS的IP
  2. SSH 用飞牛系统账号；下面「用户名」是柠檬音乐账号
  3. 先列出账号，再重置（也可不写 CONFIG_PATH，脚本会自动找库）：

  ${NODE_PREFIX} node ${SCRIPT} --list
  ${NODE_PREFIX} node ${SCRIPT} 用户名 新密码

自托管:
  npm run auth:reset-password -- --list
  npm run auth:reset-password -- <用户名> <新密码>

选项:
  --list              列出所有用户
  --help, -h          显示帮助

环境变量:
  CONFIG_PATH         配置目录（含 lx-music.db）。飞牛一般为
                      /vol1/@appdata/lemon-music/config
`)
}

function dbFile(configDir) {
  return path.join(configDir, 'lx-music.db')
}

function dirHasDb(configDir) {
  try {
    return Boolean(configDir) && fs.existsSync(dbFile(configDir))
  } catch {
    return false
  }
}

function collectCandidateDirs() {
  const out = []
  const add = (dir) => {
    const resolved = path.resolve(dir)
    if (!out.includes(resolved)) out.push(resolved)
  }
  if (process.env.CONFIG_PATH) add(process.env.CONFIG_PATH)
  add(path.join(__dirname, '..', 'config'))
  for (let i = 1; i <= 8; i++) {
    add(`/vol${i}/@appdata/lemon-music/config`)
    add(`/vol${i}/@appconf/lemon-music/config`)
  }
  return out
}

function resolveConfigDir() {
  const candidates = collectCandidateDirs()
  const withDb = candidates.filter(dirHasDb)
  const envDir = process.env.CONFIG_PATH ? path.resolve(process.env.CONFIG_PATH) : ''

  if (envDir && dirHasDb(envDir)) {
    return { configDir: envDir, dbPath: dbFile(envDir), found: true, extras: withDb.filter((d) => d !== envDir) }
  }

  if (withDb.length) {
    const configDir = withDb[0]
    return {
      configDir,
      dbPath: dbFile(configDir),
      found: true,
      extras: withDb.slice(1),
      ignoredEmptyEnv: envDir && !dirHasDb(envDir) ? envDir : '',
    }
  }

  return {
    configDir: envDir || candidates[0],
    dbPath: dbFile(envDir || candidates[0]),
    found: false,
    extras: [],
  }
}

function printFindHint() {
  console.error('请在同一终端执行下面命令查找真正的数据库：')
  console.error('  find /vol1 /vol2 /vol3 -name "lx-music.db" 2>/dev/null')
  console.error('找到后把 CONFIG_PATH 设成该文件所在目录（不要包含文件名），例如：')
  console.error(`  ${NODE_PREFIX} CONFIG_PATH=/vol1/@appdata/lemon-music/config node ${SCRIPT} --list`)
}

function main() {
  const args = process.argv.slice(2)
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    printHelp()
    process.exit(args.length ? 0 : 1)
  }

  const resolved = resolveConfigDir()
  if (!resolved.found) {
    console.error(`未找到 lx-music.db（当前尝试: ${resolved.dbPath}）`)
    printFindHint()
    process.exit(1)
  }

  if (resolved.ignoredEmptyEnv) {
    console.log(`提示: CONFIG_PATH=${resolved.ignoredEmptyEnv} 里没有账号库，已改用 ${resolved.configDir}`)
  }
  console.log(`数据库: ${resolved.dbPath}`)
  if (resolved.extras.length) {
    console.log(`另外还发现: ${resolved.extras.map(dbFile).join(', ')}`)
  }

  initDB(resolved.configDir)

  if (args[0] === '--list') {
    const users = listUsers()
    if (!users.length) {
      console.log('这个库里目前没有用户。若你平时能登录柠檬音乐，说明还不是正在使用的那份库。')
      printFindHint()
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
    console.error('提示: 先加 --list 查看用户列表')
    process.exit(1)
  }

  const db = initDB(resolved.configDir)
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(hashPassword(newPassword), Math.floor(Date.now() / 1000), user.id)
  deleteUserSessions(user.id)

  console.log(`已重置用户「${user.username}」的密码，并清除其所有登录会话。`)
  console.log('请使用新密码重新登录。')
}

main()
