import express from 'express'
import cors from 'cors'
import { WebSocketServer } from 'ws'
import http from 'http'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { initDB, getDB } from './db.js'
import { migrateFilePaths } from './utils/filePaths.js'
import { apiRouter } from './routes/index.js'
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

installSourceFaultHandlers()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 7983
const DATA_PATH = process.env.DOWNLOAD_PATH || path.join(__dirname, '..', 'data')
const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, '..', 'config')

const app = express()
const server = http.createServer(app)

app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.locals.dataPath = DATA_PATH
app.locals.configPath = CONFIG_PATH

initDB(CONFIG_PATH)
migrateFilePaths(DATA_PATH)
refreshStoredSourceMeta()

app.use('/api', apiRouter)

const publicDir = path.join(__dirname, '..', 'dist', 'public')
const publicIndex = path.join(publicDir, 'index.html')
if (fs.existsSync(publicIndex)) {
  app.use(express.static(publicDir))
  app.get(/^\/(?!api|ws).*/, (_req, res) => {
    res.sendFile(publicIndex)
  })
}

const wss = new WebSocketServer({ server, path: '/ws' })
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
  wss.close(() => {
    server.close(() => process.exit(0))
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

server.timeout = 120000
server.keepAliveTimeout = 65000
server.headersTimeout = 66000

server.listen(PORT, '::', () => {
  console.log(`Lemon Music running at http://[::]:${PORT} (IPv4+IPv6)`)
  console.log(`Download path: ${DATA_PATH}`)
  console.log(`Config path: ${CONFIG_PATH}`)
})
