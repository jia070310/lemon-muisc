import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

/** 本地开发 / 发行包：加载根目录 .env 与 dau.release.env（不覆盖已有环境变量；无 dotenv 依赖） */
function loadLocalEnvFile() {
  try {
    const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
    for (const name of ['.env', 'dau.release.env']) {
      const envPath = path.join(root, name)
      if (!fs.existsSync(envPath)) continue
      const text = fs.readFileSync(envPath, 'utf8')
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) continue
        const i = line.indexOf('=')
        if (i <= 0) continue
        const key = line.slice(0, i).trim()
        let val = line.slice(i + 1).trim()
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1)
        }
        if (!key || process.env[key] != null) continue
        process.env[key] = val
      }
    }
  } catch {}
}
loadLocalEnvFile()

import { initDB, getDB } from './db.js'
import { migrateFilePaths } from './utils/filePaths.js'
import { apiRouter } from './routes/index.js'
import { apiVersionHeader } from './routes/openApi.js'
import { initDownloadQueue } from './routes/download.js'
import { setupWebSocket } from './ws.js'
import { loadSource, unloadSource } from './sourceManager.js'
import {
  getUnionActiveSourceIds,
  migrateGlobalActiveSourcesToUsers,
  removeActiveSourceIdFromAllUsers,
} from './utils/activeSources.js'
import { refreshStoredSourceMeta } from './routes/source.js'
import {
  installSourceFaultHandlers,
  clearSourceFault,
  shouldRecordSourceFault,
} from './sourceFault.js'
import { installServerRuntimeLog, logRuntime } from './utils/runtimeLog.js'
import { startMemoryGuard } from './utils/memoryGuard.js'
import { startLibraryAutoWatch, stopLibraryAutoWatch } from './utils/libraryAutoWatch.js'
import { ensureDefaultAdmin } from './utils/auth.js'
import { createAppListenServer } from './utils/dualListen.js'
import {
  listFeiniuCertificates,
  resolveTlsListen,
  syncNativeDesktopProtocol,
  writeDesktopProtocolHint,
} from './utils/httpsConfig.js'

installServerRuntimeLog()
installSourceFaultHandlers()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 7983
const DATA_PATH = process.env.DOWNLOAD_PATH || path.join(__dirname, '..', 'data')
const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, '..', 'config')

const app = express()
const tls = resolveTlsListen()
if (tls.enabled && tls.error) {
  console.error(`[https] ${tls.error}`)
  console.error('[https] 已回退为 HTTP。确认飞牛证书可读后重启应用即可。')
} else if (!tls.enabled && tls.meta?.mode === 'auto-no-cert') {
  console.log('[https] 未找到飞牛证书，当前使用 HTTP（有证书后将自动启用 HTTPS）')
  console.log('[https] 已扫描 network_cert_all.conf / network_gateway_cert.conf 与 trim_connect/ssls')
  try {
    if (listFeiniuCertificates().length === 0 && process.env.LEMON_NATIVE) {
      console.log('[https] 若飞牛「证书」里已有证书仍走 HTTP，请检查应用是否可读 /usr/trim/var/trim_connect/ssls')
    }
  } catch {}
} else if (tls.enabled && tls.meta?.certName) {
  console.log(`[https] 使用飞牛证书: ${tls.meta.certName}`)
}
const useHttps = Boolean(tls.enabled && tls.credentials && !tls.error)
// 有证书时同端口双协议：HTTP + HTTPS 均可，避免飞牛用 http 打开时空 502
const listenBundle = createAppListenServer(
  app,
  useHttps ? tls.credentials : null,
  { path: '/ws' },
)
const server = listenBundle.listenServer
const wss = listenBundle.wss
app.locals.httpsEnabled = useHttps
app.locals.httpsDual = Boolean(listenBundle.dual)
app.locals.httpsMeta = tls.meta || null

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '25mb' }))
app.use(apiVersionHeader)

app.locals.dataPath = DATA_PATH
app.locals.configPath = CONFIG_PATH

initDB(CONFIG_PATH)
migrateFilePaths(DATA_PATH)
try {
  ensureDefaultAdmin()
} catch (e) {
  console.warn('[auth] 初始化默认管理员失败:', e?.message || e)
}
// 音源元数据刷新 / 沙箱加载放到 listen 之后后台跑，避免拖慢「应用可打开」

// 兼容 Web：/api；开放客户端优先：/api/v1（同一路由器）
app.use('/api/v1', apiRouter)
app.use('/api', apiRouter)

const publicDir = path.join(__dirname, '..', 'dist', 'public')
const publicIndex = path.join(publicDir, 'index.html')
if (fs.existsSync(publicIndex)) {
  // PWA：避免浏览器强缓存旧 SW；允许根作用域
  app.use((req, res, next) => {
    if (req.path === '/sw.js') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.setHeader('Service-Worker-Allowed', '/')
    } else if (req.path === '/manifest.webmanifest') {
      res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
    }
    next()
  })
  app.use(express.static(publicDir))
  app.get(/^\/(?!api|ws).*/, (_req, res) => {
    res.sendFile(publicIndex)
  })
}

setupWebSocket(wss)

/** 自动加载各用户激活音源的并集（故障音源跳过），须在对外服务前完成 */
async function restoreActiveSources() {
  try {
    migrateGlobalActiveSourcesToUsers()
    // 启动时清掉旧的用户向故障提示记录，并重新尝试加载；偶发失败只写日志，不让用户每次打开网页再被吓一跳
    try { clearSourceFault() } catch {}
    const ids = getUnionActiveSourceIds().filter(Boolean)

    for (const id of ids) {
      try {
        const api = getDB().prepare('SELECT id, script FROM user_apis WHERE id = ?').get(id)
        if (!api) {
          removeActiveSourceIdFromAllUsers(id)
          continue
        }
        const sources = await loadSource(api.id, api.script)
        console.log(`已自动加载音源: ${api.id}`, Object.keys(sources))
      } catch (e) {
        // 启动加载失败：本轮跳过，保留「已激活」配置以便下次启动自动重试；只写运行日志，不弹窗、不永久踢出
        try { unloadSource(id) } catch {}
        const msg = e?.message || String(e)
        console.warn(`[音源] 启动加载失败（已跳过，下次启动重试）: ${id} — ${msg}`)
        try {
          logRuntime(
            shouldRecordSourceFault(e) ? 'error' : 'warn',
            'source-boot',
            `启动加载失败（下次重试）: ${id} — ${msg}`,
            { sourceId: id },
          )
        } catch {}
      }
    }
  } catch (e) {
    console.error('自动激活音源失败:', e.message)
  }
}

initDownloadQueue()
startMemoryGuard()

/** 后台恢复音源沙箱（不阻塞端口监听） */
let sourcesRestorePromise = null
function scheduleRestoreActiveSources() {
  if (sourcesRestorePromise) return sourcesRestorePromise
  sourcesRestorePromise = restoreActiveSources()
    .catch((e) => console.error('自动激活音源失败:', e?.message || e))
    .finally(() => {
      // 允许失败后重试（极少需要）
    })
  return sourcesRestorePromise
}

function shutdown(signal) {
  console.log(`收到 ${signal}，正在关闭服务...`)
  stopLibraryAutoWatch()
  import('./utils/discoverFeedWarm.js')
    .then(({ stopDiscoverFeedWarm }) => stopDiscoverFeedWarm())
    .catch(() => {})
  wss.close(() => {
    listenBundle.close(() => process.exit(0))
  })
  setTimeout(() => process.exit(1), 3000).unref()
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => shutdown(signal))
}

server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用，请关闭其他柠檬音乐/Node 进程后重试`)
    process.exit(1)
  }
  console.error('服务器启动失败:', err)
  process.exit(1)
})

// 桌面入口 protocol 留空，由飞牛按当前桌面 http/https 自适应（勿写死）
try {
  writeDesktopProtocolHint('auto')
  syncNativeDesktopProtocol('auto')
} catch {}

server.listen(PORT, '::', () => {
  if (listenBundle.dual) {
    console.log(`Lemon Music running at http://[::]:${PORT} and https://[::]:${PORT} (IPv4+IPv6, dual)`)
    const name = tls.meta?.certName || ''
    const certPath = tls.meta?.certPath || ''
    console.log(`HTTPS enabled (HTTP also accepted)${name ? ` (${name})` : ''}${certPath ? `: ${certPath}` : ''}`)
  } else {
    console.log(`Lemon Music running at http://[::]:${PORT} (IPv4+IPv6)`)
  }
  console.log(`Download path: ${DATA_PATH}`)
  console.log(`Config path: ${CONFIG_PATH}`)
  try {
    syncNativeDesktopProtocol('auto')
  } catch {}

  // 启动重活错峰：避免同一分钟内音源元数据 + 库指纹 walk + discover-warm 叠满单核
  // 1) 先后台装音源（搜索/试听依赖），不挡页面静态资源
  setImmediate(() => {
    console.log('[boot] 后台加载已激活音源…')
    scheduleRestoreActiveSources().then(() => {
      console.log('[boot] 音源加载完成')
    })
  })

  // 2) ~5min：刷新音源元数据（会读全部脚本，较重）
  setTimeout(() => {
    try {
      refreshStoredSourceMeta()
      console.log('[boot] 音源元数据已刷新')
    } catch (e) {
      console.warn('[boot] 音源元数据刷新失败:', e?.message || e)
    }
  }, 5 * 60 * 1000).unref?.()

  // 3) ~8min：播客订阅自动刷新
  setTimeout(() => {
    import('./utils/podcastAutoRefresh.js')
      .then(({ startPodcastAutoRefresh }) => startPodcastAutoRefresh())
      .catch(() => {})
  }, 8 * 60 * 1000).unref?.()

  // 4) ~10min：音源状态监测
  setTimeout(() => {
    import('./utils/sourceProbeRunner.js')
      .then(({ startSourceProbeScheduler }) => startSourceProbeScheduler())
      .catch(() => {})
  }, 10 * 60 * 1000).unref?.()

  // 5) ~12min：版本检查 / 自动备份
  setTimeout(() => {
    import('./utils/autoUserBackup.js')
      .then(({ runAutoBackupVersionCheck }) => runAutoBackupVersionCheck())
      .catch(() => {})
  }, 12 * 60 * 1000).unref?.()

  // 6) ~15min：音乐库目录监测（大库指纹 walk 很重）
  setTimeout(() => {
    startLibraryAutoWatch()
  }, 15 * 60 * 1000).unref?.()

  // 7) ~30min：发现页预热（内部默认再隔 6h）
  setTimeout(() => {
    import('./utils/discoverFeedWarm.js')
      .then(({ startDiscoverFeedWarm }) => startDiscoverFeedWarm())
      .catch(() => {})
  }, 30 * 60 * 1000).unref?.()

  // 8) ~35min：情绪分析补跑（最耗 CPU，最后）
  setTimeout(() => {
    import('./utils/moodAnalyzeJob.js')
      .then(({ scheduleMoodAutoAnalyze }) => scheduleMoodAutoAnalyze({ delayMs: 5000 }))
      .catch(() => {})
  }, 35 * 60 * 1000).unref?.()

  // 9) 日活上报（需自行配置 LEMON_DAU_URL / LEMON_DAU_TOKEN；未配置则跳过）
  setTimeout(() => {
    import('./utils/dauReport.js')
      .then(({ startDauReporter }) => startDauReporter({ configPath: CONFIG_PATH }))
      .catch(() => {})
  }, 20 * 1000).unref?.()
})
