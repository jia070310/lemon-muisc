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
import { setupWebSocket } from './ws.js'
import { loadSource } from './sourceManager.js'
import { getStoredActiveSourceIds, saveActiveSourceIds } from './utils/activeSources.js'
import { refreshStoredSourceMeta } from './routes/source.js'
import { installSourceFaultHandlers, recordSourceFault, getSourceFault } from './sourceFault.js'

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

server.listen(PORT, '::', async () => {
  console.log(`Lemon Music running at http://[::]:${PORT} (IPv4+IPv6)`)
  console.log(`Download path: ${DATA_PATH}`)
  console.log(`Config path: ${CONFIG_PATH}`)

  // 自动恢复上次激活的音源（可多个；故障音源跳过）
  try {
    const fault = getSourceFault()
    let ids = getStoredActiveSourceIds().filter(Boolean)
    if (fault?.id) {
      if (ids.includes(fault.id)) {
        console.warn(`跳过自动激活故障音源: ${fault.name} (${fault.id})`)
      }
      ids = ids.filter(id => id !== fault.id)
    }
    // 规范化为 JSON 数组（兼容旧版单个 id），并去掉故障音源
    saveActiveSourceIds(ids)

    const okIds = []
    for (const id of ids) {
      try {
        const api = getDB().prepare('SELECT id, script FROM user_apis WHERE id = ?').get(id)
        if (!api) continue
        const sources = await loadSource(api.id, api.script)
        okIds.push(api.id)
        console.log(`已自动激活音源: ${api.id}`, Object.keys(sources))
      } catch (e) {
        recordSourceFault(id, e)
      }
    }
    saveActiveSourceIds(okIds)
  } catch (e) {
    console.error('自动激活音源失败:', e.message)
  }
})
