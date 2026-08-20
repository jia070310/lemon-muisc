import { Router } from 'express'
import multer from 'multer'
import { getDB } from '../db.js'
import { loadSource, unloadSource, getActiveSource, requestSource } from '../sourceManager.js'
import { parseScriptMeta, metaToDbFields } from '../utils/parseScriptMeta.js'

export const sourceRouter = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

sourceRouter.get('/list', (_req, res) => {
  refreshStoredSourceMeta()
  const rows = getDB().prepare('SELECT id, name, description, author, version, homepage, sources FROM user_apis').all()
  res.json(rows.map(r => ({ ...r, sources: JSON.parse(r.sources) })))
})

sourceRouter.post('/import', upload.single('file'), (req, res) => {
  try {
    const script = req.file ? req.file.buffer.toString('utf-8') : req.body.script
    if (!script) return res.status(400).json({ error: '没有提供脚本内容' })

    const meta = parseScriptMeta(script)
    const fields = metaToDbFields(meta)
    const id = `user_api_${Date.now()}`

    getDB().prepare(`
      INSERT INTO user_apis (id, name, description, script, author, version, homepage, sources)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, fields.name, fields.description, script, fields.author, fields.version, fields.homepage, '{}')

    res.json({ ok: true, id, name: fields.name })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

sourceRouter.post('/import-url', async (req, res) => {
  try {
    const { url } = req.body
    if (!url) return res.status(400).json({ error: '请提供音源链接' })

    const { default: needle } = await import('needle')
    const resp = await needle('get', url, { follow_max: 5, timeout: 15000, parse_response: false })
    if (resp.statusCode !== 200) return res.status(400).json({ error: `下载失败: HTTP ${resp.statusCode}` })

    const script = Buffer.isBuffer(resp.body) ? resp.body.toString('utf-8') : String(resp.body)
    if (!script || script.length < 10) return res.status(400).json({ error: '获取到的脚本内容为空' })

    const meta = parseScriptMeta(script)
    const fields = metaToDbFields(meta, { homepage: url })
    const id = `user_api_${Date.now()}`

    getDB().prepare(`
      INSERT INTO user_apis (id, name, description, script, author, version, homepage, sources)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, fields.name, fields.description, script, fields.author, fields.version, fields.homepage, '{}')

    res.json({ ok: true, id, name: fields.name })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

sourceRouter.delete('/:id', (req, res) => {
  const active = getDB().prepare("SELECT value FROM settings WHERE key = 'source.active'").get()
  if (active?.value === req.params.id) unloadSource()
  getDB().prepare('DELETE FROM user_apis WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

sourceRouter.post('/activate/:id', async (req, res) => {
  try {
    const row = getDB().prepare('SELECT * FROM user_apis WHERE id = ?').get(req.params.id)
    if (!row) return res.status(404).json({ error: '音源不存在' })

    const meta = parseScriptMeta(row.script)
    const fields = metaToDbFields(meta, {
      name: row.name,
      description: row.description,
      author: row.author,
      version: row.version,
      homepage: row.homepage,
    })

    const sources = await loadSource(row.id, row.script)
    getDB().prepare("INSERT INTO settings (key, value) VALUES ('source.active', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(row.id)
    getDB().prepare(`
      UPDATE user_apis SET name = ?, description = ?, author = ?, version = ?, homepage = ?, sources = ? WHERE id = ?
    `).run(fields.name, fields.description, fields.author, fields.version, fields.homepage, JSON.stringify(sources), row.id)

    res.json({ ok: true, sources, name: fields.name })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

sourceRouter.post('/deactivate', (_req, res) => {
  unloadSource()
  getDB().prepare("INSERT INTO settings (key, value) VALUES ('source.active', '') ON CONFLICT(key) DO UPDATE SET value = ''").run()
  res.json({ ok: true })
})

sourceRouter.get('/active', (_req, res) => {
  const active = getActiveSource()
  res.json(active ? { id: active.id, sources: active.sources } : null)
})

sourceRouter.post('/request', async (req, res) => {
  try {
    const { source, action, info } = req.body
    const result = await requestSource(source, action, info)
    res.json({ ok: true, data: result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export function refreshStoredSourceMeta() {
  const rows = getDB().prepare('SELECT id, script, name, description, author, version, homepage FROM user_apis').all()
  const update = getDB().prepare(`
    UPDATE user_apis SET name = ?, description = ?, author = ?, version = ?, homepage = ? WHERE id = ?
  `)
  for (const row of rows) {
    const meta = parseScriptMeta(row.script)
    if (!meta.name && !meta.author && !meta.version) continue
    const fields = metaToDbFields(meta, {
      name: row.name,
      description: row.description,
      author: row.author,
      version: row.version,
      homepage: row.homepage,
    })
    if (fields.name === '未命名音源' && row.name !== '未命名音源') continue
    update.run(fields.name, fields.description, fields.author, fields.version, fields.homepage, row.id)
  }
}

sourceRouter.post('/refresh-meta', (_req, res) => {
  try {
    refreshStoredSourceMeta()
    const rows = getDB().prepare('SELECT id, name, description, author, version, homepage, sources FROM user_apis').all()
    res.json(rows.map(r => ({ ...r, sources: JSON.parse(r.sources) })))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
