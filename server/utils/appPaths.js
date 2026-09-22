import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * 解析当前设备上的应用日志目录（飞牛 @appdata/log 或本地开发目录）。
 */
export function getAppLogDir() {
  const fromEnv = String(process.env.LOG_PATH || '').trim()
  if (fromEnv) return path.resolve(fromEnv)

  const pkgvar = String(process.env.TRIM_PKGVAR || process.env.PKGVAR_PATH || '').trim()
  if (pkgvar) return path.resolve(pkgvar, 'log')

  const config = String(process.env.CONFIG_PATH || '').trim()
  if (config && (process.env.LEMON_NATIVE === '1' || /@appdata/i.test(config))) {
    return path.resolve(path.dirname(path.resolve(config)), 'log')
  }

  // 本地开发：优先仓库旁 data/log，否则 config 旁
  const candidates = [
    path.join(__dirname, '..', '..', 'data', 'log'),
    path.join(__dirname, '..', '..', 'log'),
  ]
  if (config) candidates.unshift(path.resolve(path.dirname(path.resolve(config)), 'log'))
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir)) return dir
    } catch {}
  }
  return candidates[0]
}

/** 常见日志文件名（用于提示用户） */
const MAIN_LOG_NAMES = ['app.log', 'npm-install.log', 'install.log', 'config.log']

export function getAppLogInfo() {
  const logDir = getAppLogDir()
  let exists = false
  try {
    exists = fs.existsSync(logDir)
  } catch {}

  const files = []
  if (exists) {
    for (const name of MAIN_LOG_NAMES) {
      const fp = path.join(logDir, name)
      try {
        if (fs.existsSync(fp)) {
          const st = fs.statSync(fp)
          files.push({
            name,
            path: fp,
            size: st.size || 0,
          })
        }
      } catch {}
    }
  }

  return {
    logDir,
    exists,
    appLog: path.join(logDir, 'app.log'),
    files,
  }
}
