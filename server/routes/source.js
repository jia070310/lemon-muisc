import { Router } from 'express'
import multer from 'multer'
import { getDB } from '../db.js'
import { loadSource, unloadSource, getActiveSource, requestSource } from '../sourceManager.js'
import { getSourceFault, clearSourceFault, recordSourceFault } from '../sourceFault.js'
import { parseScriptMeta, metaToDbFields } from '../utils/parseScriptMeta.js'

export const sourceRouter = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

function insertUserApi(script, metaExtra = {}) {
  const meta = parseScriptMeta(script)
  const fields = metaToDbFields(meta, metaExtra)
  const id = `user_api_${Date.now()}`
  getDB().prepare(`
    INSERT INTO user_apis (id, name, description, script, author, version, homepage, sources)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, fields.name, fields.description, script, fields.author, fields.version, fields.homepage, '{}')
  return { id, name: fields.name }
}

async function fetchScriptFromUrl(url) {
  const { default: needle } = await import('needle')
  const resp = await needle('get', url, { follow_max: 5, timeout: 15000, parse_response: false })
  if (resp.statusCode !== 200) throw new Error(`下载失败: HTTP ${resp.statusCode}`)
  const script = Buffer.isBuffer(resp.body) ? resp.body.toString('utf-8') : String(resp.body)
  if (!script || script.length < 10) throw new Error('获取到的脚本内容为空')
  return script
}

sourceRouter.get('/list', (_req, res) => {
  refreshStoredSourceMeta()
  const rows = getDB().prepare('SELECT id, name, description, author, version, homepage, sources FROM user_apis').all()
  res.json(rows.map(r => ({ ...r, sources: JSON.parse(r.sources) })))
})

sourceRouter.post('/import', upload.single('file'), (req, res) => {
  try {
    const script = req.file ? req.file.buffer.toString('utf-8') : req.body.script
    if (!script) return res.status(400).json({ error: '没有提供脚本内容' })

    const result = insertUserApi(script)
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

sourceRouter.post('/import-url', async (req, res) => {
  try {
    const { url } = req.body
    if (!url) return res.status(400).json({ error: '请提供音源链接' })

    const script = await fetchScriptFromUrl(url)
    const result = insertUserApi(script, { homepage: url })
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

sourceRouter.delete('/:id', (req, res) => {
  const active = getDB().prepare("SELECT value FROM settings WHERE key = 'source.active'").get()
  if (active?.value === req.params.id) unloadSource()
  getDB().prepare('DELETE FROM user_apis WHERE id = ?').run(req.params.id)
  const fault = getSourceFault()
  if (fault?.id === req.params.id) clearSourceFault()
  res.json({ ok: true })
})

sourceRouter.get('/fault', (_req, res) => {
  res.json(getSourceFault())
})

sourceRouter.post('/fault/delete', (_req, res) => {
  try {
    const fault = getSourceFault()
    if (!fault?.id) {
      clearSourceFault()
      return res.json({ ok: true })
    }
    if (getActiveSource()?.id === fault.id) unloadSource()
    getDB().prepare('DELETE FROM user_apis WHERE id = ?').run(fault.id)
    getDB().prepare(`
      INSERT INTO settings (key, value) VALUES ('source.active', '')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run()
    clearSourceFault()
    res.json({ ok: true, deletedId: fault.id })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

sourceRouter.post('/fault/reimport', async (_req, res) => {
  try {
    const fault = getSourceFault()
    if (!fault?.id) return res.status(400).json({ error: '没有待处理的音源故障' })

    const row = getDB().prepare('SELECT * FROM user_apis WHERE id = ?').get(fault.id)
    const script = row?.script
    const homepage = row?.homepage || fault.homepage

    if (getActiveSource()?.id === fault.id) unloadSource()
    getDB().prepare('DELETE FROM user_apis WHERE id = ?').run(fault.id)
    getDB().prepare(`
      INSERT INTO settings (key, value) VALUES ('source.active', '')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run()
    clearSourceFault()

    if (homepage && /^https?:\/\//i.test(homepage)) {
      try {
        const fetched = await fetchScriptFromUrl(homepage)
        const result = insertUserApi(fetched, { homepage })
        return res.json({ ok: true, reimported: true, method: 'url', ...result })
      } catch (e) {
        return res.json({
          ok: true,
          reimported: false,
          method: 'url',
          error: e.message,
          homepage,
          hint: '链接重新导入失败，请在设置中手动导入音源脚本',
        })
      }
    }

    if (script) {
      const result = insertUserApi(script, { homepage: homepage || '' })
      return res.json({ ok: true, reimported: true, method: 'script', ...result })
    }

    res.json({
      ok: true,
      reimported: false,
      hint: '无法自动重新导入，请在设置 → 音源管理中手动导入',
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
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

    clearSourceFault()
    res.json({ ok: true, sources, name: fields.name })
  } catch (e) {
    recordSourceFault(req.params.id, e)
    res.status(500).json({ error: e.message, fault: true })
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
