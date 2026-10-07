import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { initDB, getDB } from './db.js'
import { migrateFilePaths } from './utils/filePaths.js'
import { apiRouter } from './routes/index.js'
import { apiVersionHeader } from './routes/openApi.js'
import { initDownloadQueue } from './routes/download.js'
import { setupWebSocket } from './ws.js'
import { loadSource } from './sourceManager.js'
import {
  getUnionActiveSourceIds,
  migrateGlobalActiveSourcesToUsers,
  removeActiveSourceIdFromAllUsers,
} from './utils/activeSources.js'
import { refreshStoredSourceMeta } from './routes/source.js'
import { installSourceFaultHandlers, recordSourceFault, getSourceFault } from './sourceFault.js'
import { startMemoryGuard } from './utils/memoryGuard.js'
import { startLibraryAutoWatch, stopLibraryAutoWatch } from './utils/libraryAutoWatch.js'
import { ensureDefaultAdmin } from './utils/auth.js'
import { installServerRuntimeLog } from './utils/runtimeLog.js'
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
refreshStoredSourceMeta()
try {
  ensureDefaultAdmin()
} catch (e) {
  console.warn('[auth] 初始化默认管理员失败:', e?.message || e)
}

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
    const fault = getSourceFault()
    let ids = getUnionActiveSourceIds().filter(Boolean)
    if (fault?.id) {
      if (ids.includes(fault.id)) {
        console.warn(`跳过自动激活故障音源: ${fault.name} (${fault.id})`)
      }
      ids = ids.filter((id) => id !== fault.id)
      removeActiveSourceIdFromAllUsers(fault.id)
    }

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
        recordSourceFault(id, e)
      }
    }
  } catch (e) {
    console.error('自动激活音源失败:', e.message)
  }
}

await restoreActiveSources()
initDownloadQueue()
startMemoryGuard()

function shutdown(signal) {
  console.log(`收到 ${signal}，正在关闭服务...`)
  stopLibraryAutoWatch()
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
  startLibraryAutoWatch()
  // 启动后补跑未分析情绪（仅新/未完成文件）
  setTimeout(() => {
    import('./utils/moodAnalyzeJob.js')
      .then(({ scheduleMoodAutoAnalyze }) => scheduleMoodAutoAnalyze({ delayMs: 1000 }))
      .catch(() => {})
  }, 12000).unref?.()
})
