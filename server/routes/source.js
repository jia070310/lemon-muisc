import { Router } from 'express'
import multer from 'multer'
import { getDB } from '../db.js'
import {
  loadSource,
  unloadSource,
  getActiveSource,
  getActiveSources,
  getActiveSourceIds,
  getMergedSources,
  requestSource,
} from '../sourceManager.js'
import {
  getStoredActiveSourceIds,
  addActiveSourceId,
  removeActiveSourceId,
  saveActiveSourceIds,
} from '../utils/activeSources.js'
import { getSourceFault, clearSourceFault, recordSourceFault } from '../sourceFault.js'
import { parseScriptMeta, metaToDbFields } from '../utils/parseScriptMeta.js'
import { requireAdmin } from '../middleware/auth.js'

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
  const activeIds = new Set(getActiveSourceIds().length ? getActiveSourceIds() : getStoredActiveSourceIds())
  const rows = getDB().prepare('SELECT id, name, description, author, version, homepage, sources FROM user_apis').all()
  res.json(rows.map(r => ({
    ...r,
    sources: JSON.parse(r.sources),
    active: activeIds.has(r.id),
  })))
})

sourceRouter.post('/import', requireAdmin, upload.single('file'), (req, res) => {
  try {
    const script = req.file ? req.file.buffer.toString('utf-8') : req.body.script
    if (!script) return res.status(400).json({ error: '没有提供脚本内容' })

    const result = insertUserApi(script)
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

sourceRouter.post('/import-url', requireAdmin, async (req, res) => {
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

sourceRouter.delete('/:id', requireAdmin, (req, res) => {
  unloadSource(req.params.id)
  removeActiveSourceId(req.params.id)
  getDB().prepare('DELETE FROM user_apis WHERE id = ?').run(req.params.id)
  const fault = getSourceFault()
  if (fault?.id === req.params.id) clearSourceFault()
  res.json({ ok: true })
})

sourceRouter.get('/fault', (_req, res) => {
  res.json(getSourceFault())
})

sourceRouter.post('/fault/dismiss', (_req, res) => {
  clearSourceFault()
  res.json({ ok: true })
})

sourceRouter.post('/fault/delete', requireAdmin, (_req, res) => {
  try {
    const fault = getSourceFault()
    if (!fault?.id) {
      clearSourceFault()
      return res.json({ ok: true })
    }
    unloadSource(fault.id)
    removeActiveSourceId(fault.id)
    getDB().prepare('DELETE FROM user_apis WHERE id = ?').run(fault.id)
    clearSourceFault()
    res.json({ ok: true, deletedId: fault.id })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

sourceRouter.post('/fault/reimport', requireAdmin, async (_req, res) => {
  try {
    const fault = getSourceFault()
    if (!fault?.id) return res.status(400).json({ error: '没有待处理的音源故障' })

    const row = getDB().prepare('SELECT * FROM user_apis WHERE id = ?').get(fault.id)
    const script = row?.script
    const homepage = row?.homepage || fault.homepage

    unloadSource(fault.id)
    removeActiveSourceId(fault.id)
    getDB().prepare('DELETE FROM user_apis WHERE id = ?').run(fault.id)
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

sourceRouter.post('/activate/:id', requireAdmin, async (req, res) => {
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
    const ids = addActiveSourceId(row.id)
    getDB().prepare(`
      UPDATE user_apis SET name = ?, description = ?, author = ?, version = ?, homepage = ?, sources = ? WHERE id = ?
    `).run(fields.name, fields.description, fields.author, fields.version, fields.homepage, JSON.stringify(sources), row.id)

    const fault = getSourceFault()
    if (fault?.id === row.id) clearSourceFault()

    res.json({
      ok: true,
      sources,
      name: fields.name,
      activeIds: ids,
      mergedSources: getMergedSources(),
    })
  } catch (e) {
    const { formatUserError } = await import('../utils/userError.js')
    const msg = formatUserError(e, '音源激活失败，请稍后重试')
    if (recordSourceFault(req.params.id, e)) {
      res.status(500).json({ error: msg, fault: true })
    } else {
      res.status(500).json({ error: msg })
    }
  }
})

sourceRouter.post('/deactivate/:id', requireAdmin, (req, res) => {
  unloadSource(req.params.id)
  const ids = removeActiveSourceId(req.params.id)
  res.json({ ok: true, activeIds: ids })
})

sourceRouter.post('/deactivate', requireAdmin, (_req, res) => {
  unloadSource()
  saveActiveSourceIds([])
  res.json({ ok: true, activeIds: [] })
})

sourceRouter.get('/active', (_req, res) => {
  const list = getActiveSources().map(s => ({ id: s.id, sources: s.sources }))
  const ids = getActiveSourceIds()
  if (!list.length) {
    return res.json({ id: null, ids: [], sources: {}, list: [] })
  }
  // 兼容旧前端：保留 id / sources 字段（取最近激活）
  const latest = getActiveSource()
  res.json({
    id: latest?.id || ids[ids.length - 1] || null,
    ids,
    sources: getMergedSources(),
    list,
  })
})

sourceRouter.post('/request', async (req, res) => {
  try {
    const { source, action, info } = req.body
    const result = await requestSource(source, action, info)
    res.json({ ok: true, data: result })
  } catch (e) {
    const { formatUserError } = await import('../utils/userError.js')
    res.status(500).json({ error: formatUserError(e, '音源请求失败，请稍后重试') })
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

sourceRouter.post('/refresh-meta', requireAdmin, (_req, res) => {
  try {
    refreshStoredSourceMeta()
    const activeIds = new Set(getActiveSourceIds().length ? getActiveSourceIds() : getStoredActiveSourceIds())
    const rows = getDB().prepare('SELECT id, name, description, author, version, homepage, sources FROM user_apis').all()
    res.json(rows.map(r => ({
      ...r,
      sources: JSON.parse(r.sources),
      active: activeIds.has(r.id),
    })))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
