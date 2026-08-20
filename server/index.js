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
import { refreshStoredSourceMeta } from './routes/source.js'

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

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`Lemon Music running at http://0.0.0.0:${PORT}`)
  console.log(`Download path: ${DATA_PATH}`)
  console.log(`Config path: ${CONFIG_PATH}`)

  // 自动恢复上次激活的音源
  try {
    const row = getDB().prepare("SELECT value FROM settings WHERE key = 'source.active'").get()
    if (row?.value) {
      const api = getDB().prepare('SELECT id, script FROM user_apis WHERE id = ?').get(row.value)
      if (api) {
        const sources = await loadSource(api.id, api.script)
        console.log(`已自动激活音源: ${api.id}`, Object.keys(sources))
      }
    }
  } catch (e) {
    console.error('自动激活音源失败:', e.message)
  }
})
