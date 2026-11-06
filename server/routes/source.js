import fs from 'fs'
import path from 'path'
import { Router } from 'express'
import multer from 'multer'
import { getDB } from '../db.js'
import {
  loadSource,
  unloadSource,
  getActiveSources,
  getActiveSourceIds,
  getMergedSources,
  requestSource,
  getSourceUpdateAlert,
  clearSourceUpdateAlert,
} from '../sourceManager.js'
import {
  getStoredActiveSourceIds,
  addActiveSourceId,
  removeActiveSourceId,
  removeActiveSourceIdFromAllUsers,
  isSourceActiveForAnyUser,
  saveActiveSourceIds,
} from '../utils/activeSources.js'
import { getSourceFault, clearSourceFault, recordSourceFault } from '../sourceFault.js'
import {
  getAllSourceHealth,
  dismissSourceHealth,
  clearSourceHealth,
  recordSourceHealthOutcome,
  sourceHealthPublicView,
} from '../utils/sourceHealth.js'
import { parseScriptMeta, metaToDbFields, scriptUpdateUrl } from '../utils/parseScriptMeta.js'
import { peekPluginMeta, tryParsePluginManifest } from '../utils/musicFreeRuntime.js'
import { fetchSourceScriptFromUrl } from '../utils/fetchSourceScript.js'
import { compareVersion } from '../utils/version.js'
import { requireAdmin } from '../middleware/auth.js'
import { getDownloadPathInfo, getMusicPathsForUser, isNativeHostMode } from '../utils/filePaths.js'
import { buildSourcesExportPayload } from '../utils/backupExport.js'
import {
  getAutoClosedPlatformsPublic,
  dismissAutoClosedPlatforms,
} from '../utils/enabledPlatforms.js'
export const sourceRouter = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 30 },
})

function newUserApiId() {
  return `user_api_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function insertUserApi(script, metaExtra = {}) {
  const meta = parseScriptMeta(script)
  const peek = peekPluginMeta(script)
  const fields = metaToDbFields(meta, {
    ...metaExtra,
    name: metaExtra.name || meta.name || peek.name,
    version: metaExtra.version || meta.version || peek.version,
    author: metaExtra.author || meta.author || peek.author,
    homepage: metaExtra.homepage || meta.homepage || peek.homepage,
    description: metaExtra.description || meta.description || peek.description,
  })
  const id = newUserApiId()
  getDB().prepare(`
    INSERT INTO user_apis (id, name, description, script, author, version, homepage, sources)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, fields.name, fields.description, script, fields.author, fields.version, fields.homepage, '{}')
  import('../utils/autoUserBackup.js')
    .then(({ scheduleAutoBackupAfterUserDataChange }) => scheduleAutoBackupAfterUserDataChange())
    .catch(() => {})
  return { id, name: fields.name, version: fields.version, homepage: fields.homepage }
}

/** 拆分逗号 / 换行 / 分号分隔的多个 URL */
export function splitSourceUrls(raw) {
  if (Array.isArray(raw)) {
    return raw.map((u) => String(u || '').trim()).filter((u) => /^https?:\/\//i.test(u))
  }
  const text = String(raw || '').trim()
  if (!text) return []
  return text
    .split(/[\n,;，；]+/)
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u))
}

function storedNameIsPlaceholder(name) {
  const n = String(name || '').trim()
  return !n || n === '未命名音源'
}

function applyScriptUpdate(id, script, homepageHint = '') {
  const row = getDB().prepare('SELECT * FROM user_apis WHERE id = ?').get(id)
  if (!row) throw new Error('音源不存在')
  const meta = parseScriptMeta(script)
  const peek = peekPluginMeta(script)
  const fields = metaToDbFields(meta, {
    name: storedNameIsPlaceholder(row.name) ? (peek.name || meta.name || row.name) : row.name,
    description: row.description || peek.description,
    author: row.author || peek.author,
    version: row.version || peek.version,
    homepage: homepageHint || row.homepage || peek.homepage,
  })
  // 保留原 homepage（导入 URL），除非脚本自带 @homepage 且原先为空
  const homepage = row.homepage || fields.homepage || homepageHint || ''
  getDB().prepare(`
    UPDATE user_apis
    SET name = ?, description = ?, script = ?, author = ?, version = ?, homepage = ?
    WHERE id = ?
  `).run(fields.name, fields.description, script, fields.author, fields.version, homepage, id)
  clearSourceUpdateAlert(id)
  import('../utils/autoUserBackup.js')
    .then(({ scheduleAutoBackupAfterUserDataChange }) => scheduleAutoBackupAfterUserDataChange())
    .catch(() => {})
  return {
    id,
    name: fields.name,
    version: fields.version,
    homepage,
    previousVersion: row.version || '',
  }
}

async function reloadSourceIfActive(id, script) {
  if (!isSourceActiveForAnyUser(id) && !getActiveSourceIds().includes(id)) return false
  await loadSource(id, script)
  return true
}

async function fetchScriptFromUrl(url) {
  return fetchSourceScriptFromUrl(url)
}

function repairUnnamedSourceNames() {
  const rows = getDB().prepare(`
    SELECT id, script, name, author, version, homepage
    FROM user_apis
    WHERE name IS NULL OR TRIM(name) = '' OR name = '未命名音源'
  `).all()
  if (!rows.length) return
  const update = getDB().prepare(`
    UPDATE user_apis SET name = ?, author = ?, version = ?, homepage = ? WHERE id = ?
  `)
  for (const row of rows) {
    const peek = peekPluginMeta(row.script)
    if (!peek.name) continue
    update.run(
      peek.name,
      row.author || peek.author || '',
      row.version || peek.version || '',
      row.homepage || peek.homepage || '',
      row.id,
    )
  }
}

sourceRouter.get('/list', (req, res) => {
  // 勿在每次列表时 refreshStoredSourceMeta：会把全部脚本读进内存并同步解析，大音源导入后易把事件循环卡住
  repairUnnamedSourceNames()
  const activeIds = new Set(getStoredActiveSourceIds(req.user?.id))
  const healthMap = getAllSourceHealth()
  const rows = getDB().prepare('SELECT id, name, description, author, version, homepage, sources FROM user_apis').all()
  res.json(rows.map(r => ({
    ...r,
    sources: JSON.parse(r.sources || '{}'),
    active: activeIds.has(r.id),
    health: {
      ...(sourceHealthPublicView(healthMap[r.id]) || {}),
      autoClosedPlatforms: getAutoClosedPlatformsPublic(req.user?.id, r.id),
    },
  })))
})

sourceRouter.post('/import', requireAdmin, upload.any(), (req, res) => {
  try {
    const files = (req.files || []).filter((f) => f?.buffer)
    if (files.length > 1) {
      const results = []
      const errors = []
      for (const file of files) {
        try {
          const script = file.buffer.toString('utf-8')
          if (!script.trim()) {
            errors.push({ file: file.originalname || 'file', error: '空文件' })
            continue
          }
          results.push({ ...insertUserApi(script), file: file.originalname || '' })
        } catch (e) {
          errors.push({ file: file.originalname || 'file', error: e.message })
        }
      }
      if (!results.length) {
        return res.status(400).json({ error: errors[0]?.error || '没有成功导入的文件', errors })
      }
      return res.json({
        ok: true,
        batch: true,
        imported: results.length,
        failed: errors.length,
        results,
        errors,
        // 兼容旧前端单条字段
        id: results[0].id,
        name: results[0].name,
      })
    }

    const script = files[0]
      ? files[0].buffer.toString('utf-8')
      : req.body?.script
    if (!script) return res.status(400).json({ error: '没有提供脚本内容' })

    const result = insertUserApi(script)
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

function asImportJob(item) {
  if (typeof item === 'string') return { url: item, name: '', version: '', author: '' }
  return {
    url: String(item?.url || '').trim(),
    name: String(item?.name || '').trim(),
    version: String(item?.version || '').trim(),
    author: String(item?.author || '').trim(),
  }
}

async function collectImportScripts(urls, depth = 0) {
  const results = []
  const errors = []
  const seen = new Set()
  const queue = (urls || []).map(asImportJob)
  while (queue.length) {
    const job = queue.shift()
    const url = job?.url
    if (!url || seen.has(url)) continue
    seen.add(url)
    if (seen.size > 40) {
      errors.push({ url, error: '订阅列表超过 40 条，已截断' })
      break
    }
    try {
      const script = await fetchScriptFromUrl(url)
      const nested = depth < 2 ? tryParsePluginManifest(script, url) : null
      if (nested?.length) {
        queue.push(...nested.map(asImportJob))
        continue
      }
      results.push({
        ...insertUserApi(script, {
          homepage: url,
          name: job.name,
          version: job.version,
          author: job.author,
        }),
        url,
      })
    } catch (e) {
      errors.push({ url, error: e.message })
    }
  }
  return { results, errors }
}

sourceRouter.post('/import-url', requireAdmin, async (req, res) => {
  try {
    const urls = splitSourceUrls(req.body?.urls ?? req.body?.url)
    if (!urls.length) return res.status(400).json({ error: '请提供音源链接（多个可用逗号或换行分隔）' })

    const { results, errors } = await collectImportScripts(urls)
    if (!results.length) {
      return res.status(500).json({
        error: errors[0]?.error || '全部导入失败',
        errors,
      })
    }
    if (urls.length === 1 && results.length === 1 && !errors.length) {
      return res.json({ ok: true, ...results[0] })
    }
    res.json({
      ok: true,
      batch: true,
      imported: results.length,
      failed: errors.length,
      results,
      errors,
      id: results[0].id,
      name: results[0].name,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 检查已导入音源是否有新版本（@updateUrl / @sourceUrl / homepage / updateAlert） */
sourceRouter.post('/check-updates', requireAdmin, async (req, res) => {
  try {
    const onlyId = String(req.body?.id || '').trim()
    const rows = onlyId
      ? getDB().prepare('SELECT id, name, version, homepage, script FROM user_apis WHERE id = ?').all(onlyId)
      : getDB().prepare('SELECT id, name, version, homepage, script FROM user_apis').all()

    const updates = []
    for (const row of rows) {
      const meta = parseScriptMeta(row.script || '')
      const homepage = String(row.homepage || meta.homepage || '').trim()
      const alert = getSourceUpdateAlert(row.id)
      const updateUrl = scriptUpdateUrl(meta, alert?.updateUrl || homepage)
      const item = {
        id: row.id,
        name: row.name,
        currentVersion: row.version || meta.version || '',
        homepage,
        hasUpdate: false,
        remoteVersion: '',
        updateUrl,
        log: alert?.log || '',
        reason: '',
      }

      if (!updateUrl || !/^https?:\/\//i.test(updateUrl)) {
        const alertUrl = String(alert?.updateUrl || '').trim()
        if (alertUrl && /^https?:\/\//i.test(alertUrl)) {
          item.hasUpdate = true
          item.reason = 'script-alert'
          item.updateUrl = alertUrl
          updates.push(item)
        } else {
          item.reason = 'no-homepage'
          updates.push(item)
        }
        continue
      }

      try {
        const remoteScript = await fetchScriptFromUrl(updateUrl)
        const remoteMeta = parseScriptMeta(remoteScript)
        item.remoteVersion = remoteMeta.version || ''
        const verNewer = item.remoteVersion
          && compareVersion(item.remoteVersion, item.currentVersion || '0') > 0
        const contentChanged = remoteScript.trim() !== String(row.script || '').trim()
        if (verNewer) {
          item.hasUpdate = true
          item.reason = 'version'
        } else if (contentChanged) {
          item.hasUpdate = true
          item.reason = 'content'
        } else if (alert?.log || alert?.updateUrl) {
          item.hasUpdate = Boolean(item.updateUrl || alert.updateUrl)
          item.reason = item.hasUpdate ? 'script-alert' : 'up-to-date'
        } else {
          item.reason = 'up-to-date'
        }
        if (!item.updateUrl && alert?.updateUrl && /^https?:\/\//i.test(alert.updateUrl)) {
          item.updateUrl = alert.updateUrl
        }
        if (alert?.log) item.log = alert.log
      } catch (e) {
        item.reason = 'fetch-failed'
        item.error = e.message
        const alertUrl = String(alert?.updateUrl || '').trim()
        if (alertUrl && /^https?:\/\//i.test(alertUrl) && alertUrl !== updateUrl) {
          item.hasUpdate = true
          item.reason = 'script-alert'
          item.updateUrl = alertUrl
        }
        if (alert?.log) item.log = alert.log
      }
      updates.push(item)
    }

    res.json({
      ok: true,
      checked: updates.length,
      outdated: updates.filter((u) => u.hasUpdate).length,
      updates,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/** 按 @updateUrl / homepage 拉取并原地更新音源（保留 id 与激活状态） */
sourceRouter.post('/update/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id
    const row = getDB().prepare('SELECT * FROM user_apis WHERE id = ?').get(id)
    if (!row) return res.status(404).json({ error: '音源不存在' })

    const meta = parseScriptMeta(row.script || '')
    const alert = getSourceUpdateAlert(id)
    const url = String(
      req.body?.url || scriptUpdateUrl(meta, alert?.updateUrl || row.homepage || ''),
    ).trim()
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: '该音源没有可用的更新链接（@updateUrl / homepage）' })
    }

    const script = await fetchScriptFromUrl(url)
    const result = applyScriptUpdate(id, script, row.homepage || url)
    let reloaded = false
    try {
      reloaded = await reloadSourceIfActive(id, script)
    } catch (e) {
      return res.json({
        ok: true,
        updated: true,
        reloaded: false,
        reloadError: e.message,
        ...result,
        hint: '脚本已更新，但重新加载失败，请手动停用后再激活',
      })
    }
    res.json({ ok: true, updated: true, reloaded, ...result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

function safeSourceFilename(name, id) {
  const base = String(name || 'source')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  const suffix = String(id || '').replace(/[^\w.-]/g, '').slice(0, 12)
  return `${base || 'source'}${suffix ? `-${suffix}` : ''}.js`
}

function isDockerStubPath(dir) {
  const p = String(dir || '').replace(/\\/g, '/').replace(/\/+$/, '')
  return p === '/downloads' || p === '/music' || p === '/data'
}

function collectSourceExportRoots(userId) {
  const info = getDownloadPathInfo(userId) || {}
  const native = isNativeHostMode()
  const raw = [
    info.savePath,
    info.sharedPath,
    info.personalPath,
    process.env.DOWNLOADS_HOST_PATH,
    process.env.DOWNLOAD_PATH,
    ...getMusicPathsForUser(userId || null),
    process.env.MUSIC_HOST_PATH,
  ]
  const seen = new Set()
  const roots = []
  for (const item of raw) {
    const dir = String(item || '').trim()
    if (!dir) continue
    if (native && isDockerStubPath(dir)) continue
    let key = dir
    try { key = path.resolve(dir) } catch {}
    if (seen.has(key)) continue
    seen.add(key)
    roots.push(dir)
  }
  return roots
}

function saveSourceExportToDownloadDir(userId, filename, script) {
  const roots = collectSourceExportRoots(userId)
  const errors = []
  for (const root of roots) {
    try {
      const outDir = path.join(root, '音源导出')
      fs.mkdirSync(outDir, { recursive: true })
      const filePath = path.join(outDir, filename)
      fs.writeFileSync(filePath, script, 'utf8')
      if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 1) {
        throw new Error('写入后文件不存在')
      }
      return { savedDir: outDir, savedPath: filePath }
    } catch (e) {
      errors.push(`${root}（${e.message || e}）`)
    }
  }
  const err = new Error(
    roots.length
      ? `无法写入 NAS 目录，已尝试：${errors.join('；')}。请到设置 → 文件路径确认下载/音乐库目录可写。`
      : '未配置下载或音乐库目录，请先在设置 → 文件路径里指定',
  )
  err.code = 'NO_DOWNLOAD_DIR'
  throw err
}

/** 导出全部音源脚本，格式与备份导入兼容 */
sourceRouter.get('/export-all', requireAdmin, (_req, res) => {
  try {
    res.json({ ok: true, ...buildSourcesExportPayload() })
  } catch (e) {
    res.status(500).json({ error: e.message || '导出失败' })
  }
})

sourceRouter.get('/:id/export', requireAdmin, (req, res) => {
  try {
    const row = getDB().prepare('SELECT id, name, version, script FROM user_apis WHERE id = ?').get(req.params.id)
    if (!row) return res.status(404).json({ error: '音源不存在' })
    const script = String(row.script || '')
    if (!script.trim()) return res.status(404).json({ error: '该音源没有可导出的脚本' })
    const filename = safeSourceFilename(row.name, row.id)
    const payload = {
      ok: true,
      id: row.id,
      name: row.name,
      version: row.version || '',
      filename,
      script,
    }
    try {
      Object.assign(payload, saveSourceExportToDownloadDir(req.user?.id, filename, script))
    } catch (e) {
      payload.saveError = e.message || '未能写入下载目录'
    }
    res.json(payload)
  } catch (e) {
    res.status(500).json({ error: e.message || '导出失败' })
  }
})

sourceRouter.delete('/:id', requireAdmin, (req, res) => {
  deleteUserApi(req.params.id)
  res.json({ ok: true })
})

sourceRouter.get('/fault', (_req, res) => {
  res.json(getSourceFault())
})

sourceRouter.post('/fault/dismiss', (_req, res) => {
  clearSourceFault()
  res.json({ ok: true })
})

/** 客户端上报试听片段检测结果（播放侧） */
sourceRouter.post('/health/report', (req, res) => {
  try {
    const { sourceId, isPreview, platform, source } = req.body || {}
    if (!sourceId) return res.status(400).json({ error: '缺少 sourceId' })
    const entry = recordSourceHealthOutcome(
      sourceId,
      Boolean(isPreview),
      platform || source || '',
      req.user?.id || null,
    )
    res.json({
      ok: true,
      health: {
        ...(sourceHealthPublicView(entry) || {}),
        autoClosedPlatforms: getAutoClosedPlatformsPublic(req.user?.id, sourceId),
      },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

sourceRouter.post('/health/dismiss', (req, res) => {
  try {
    const { sourceId } = req.body || {}
    if (!sourceId) return res.status(400).json({ error: '缺少 sourceId' })
    const entry = dismissSourceHealth(sourceId)
    dismissAutoClosedPlatforms(req.user?.id, sourceId)
    res.json({
      ok: true,
      health: {
        ...(sourceHealthPublicView(entry) || {}),
        autoClosedPlatforms: [],
      },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

sourceRouter.post('/health/clear', requireAdmin, (req, res) => {
  try {
    const { sourceId } = req.body || {}
    if (!sourceId) return res.status(400).json({ error: '缺少 sourceId' })
    clearSourceHealth(sourceId)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

sourceRouter.post('/fault/delete', requireAdmin, (_req, res) => {
  try {
    const fault = getSourceFault()
    if (!fault?.id) {
      clearSourceFault()
      return res.json({ ok: true })
    }
    unloadSource(fault.id)
    removeActiveSourceIdFromAllUsers(fault.id)
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
    removeActiveSourceIdFromAllUsers(fault.id)
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

function normalizeSourceIds(raw) {
  const list = Array.isArray(raw) ? raw : []
  return [...new Set(list.map((id) => String(id || '').trim()).filter(Boolean))]
}

async function activateUserApi(id, userId) {
  const row = getDB().prepare('SELECT * FROM user_apis WHERE id = ?').get(id)
  if (!row) {
    const err = new Error('音源不存在')
    err.status = 404
    throw err
  }
  const meta = parseScriptMeta(row.script)
  const peek = peekPluginMeta(row.script)
  const fields = metaToDbFields(meta, {
    name: storedNameIsPlaceholder(row.name) ? (peek.name || meta.name || row.name) : row.name,
    description: row.description || peek.description,
    author: row.author || peek.author,
    version: row.version || peek.version,
    homepage: row.homepage || peek.homepage,
  })
  const alreadyLoaded = getActiveSourceIds().includes(row.id)
  const sources = alreadyLoaded
    ? (getActiveSources().find((s) => s.id === row.id)?.sources || JSON.parse(row.sources || '{}'))
    : await loadSource(row.id, row.script)
  const ids = addActiveSourceId(row.id, userId)
  getDB().prepare(`
    UPDATE user_apis SET name = ?, description = ?, author = ?, version = ?, homepage = ?, sources = ? WHERE id = ?
  `).run(fields.name, fields.description, fields.author, fields.version, fields.homepage, JSON.stringify(sources), row.id)
  const fault = getSourceFault()
  if (fault?.id === row.id) clearSourceFault()
  return { id: row.id, sources, name: fields.name, activeIds: ids }
}

function deactivateUserApi(id, userId) {
  const ids = removeActiveSourceId(id, userId)
  if (!isSourceActiveForAnyUser(id)) unloadSource(id)
  return ids
}

function deleteUserApi(id) {
  unloadSource(id)
  removeActiveSourceIdFromAllUsers(id)
  getDB().prepare('DELETE FROM user_apis WHERE id = ?').run(id)
  const fault = getSourceFault()
  if (fault?.id === id) clearSourceFault()
  clearSourceHealth(id)
  import('../utils/autoUserBackup.js')
    .then(({ scheduleAutoBackupAfterUserDataChange }) => scheduleAutoBackupAfterUserDataChange())
    .catch(() => {})
}

sourceRouter.post('/batch/activate', async (req, res) => {
  const ids = normalizeSourceIds(req.body?.ids)
  if (!ids.length) return res.status(400).json({ error: '请选择要启用的音源' })
  const results = []
  const errors = []
  let activeIds = getStoredActiveSourceIds(req.user.id)
  for (const id of ids) {
    try {
      const result = await activateUserApi(id, req.user.id)
      activeIds = result.activeIds
      results.push({ id, name: result.name, sources: result.sources })
    } catch (e) {
      const { formatUserError } = await import('../utils/userError.js')
      const msg = formatUserError(e, '音源激活失败，请稍后重试')
      recordSourceFault(id, e)
      errors.push({ id, error: msg })
    }
  }
  res.json({
    ok: results.length > 0,
    imported: results.length,
    failed: errors.length,
    results,
    errors,
    activeIds,
    mergedSources: getMergedSources(activeIds),
  })
})

sourceRouter.post('/batch/deactivate', (req, res) => {
  const ids = normalizeSourceIds(req.body?.ids)
  if (!ids.length) return res.status(400).json({ error: '请选择要停用的音源' })
  let activeIds = getStoredActiveSourceIds(req.user.id)
  for (const id of ids) activeIds = deactivateUserApi(id, req.user.id)
  res.json({ ok: true, activeIds })
})

sourceRouter.post('/batch/delete', requireAdmin, (req, res) => {
  const ids = normalizeSourceIds(req.body?.ids)
  if (!ids.length) return res.status(400).json({ error: '请选择要删除的音源' })
  const deleted = []
  for (const id of ids) {
    const row = getDB().prepare('SELECT id FROM user_apis WHERE id = ?').get(id)
    if (!row) continue
    deleteUserApi(id)
    deleted.push(id)
  }
  res.json({ ok: true, deleted, activeIds: getStoredActiveSourceIds(req.user.id) })
})

sourceRouter.post('/activate/:id', async (req, res) => {
  try {
    const result = await activateUserApi(req.params.id, req.user.id)
    res.json({
      ok: true,
      sources: result.sources,
      name: result.name,
      activeIds: result.activeIds,
      mergedSources: getMergedSources(result.activeIds),
    })
  } catch (e) {
    const { formatUserError } = await import('../utils/userError.js')
    const msg = formatUserError(e, '音源激活失败，请稍后重试')
    const status = e.status === 404 ? 404 : 500
    if (status === 500 && recordSourceFault(req.params.id, e)) {
      res.status(500).json({ error: msg, fault: true })
    } else {
      res.status(status).json({ error: msg })
    }
  }
})

sourceRouter.post('/deactivate/:id', (req, res) => {
  const ids = deactivateUserApi(req.params.id, req.user.id)
  res.json({ ok: true, activeIds: ids })
})

sourceRouter.post('/deactivate', (req, res) => {
  const prev = getStoredActiveSourceIds(req.user.id)
  saveActiveSourceIds([], req.user.id)
  for (const id of prev) {
    if (!isSourceActiveForAnyUser(id)) unloadSource(id)
  }
  res.json({ ok: true, activeIds: [] })
})

sourceRouter.get('/active', (req, res) => {
  const ids = getStoredActiveSourceIds(req.user?.id)
  const loaded = new Set(getActiveSourceIds())
  const list = getActiveSources()
    .filter((s) => ids.includes(s.id))
    .map((s) => ({ id: s.id, sources: s.sources }))
  if (!list.length) {
    return res.json({ id: null, ids, sources: {}, list: [] })
  }
  const latest = [...ids].reverse().find((id) => loaded.has(id)) || ids[ids.length - 1] || null
  res.json({
    id: latest,
    ids,
    sources: getMergedSources(ids),
    list,
  })
})

sourceRouter.post('/request', async (req, res) => {
  try {
    const { source, action, info } = req.body
    const result = await requestSource(source, action, info, {
      allowedSourceIds: getStoredActiveSourceIds(req.user?.id),
    })
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
    const peek = peekPluginMeta(row.script)
    const unnamed = storedNameIsPlaceholder(row.name)
    if (!meta.name && !meta.author && !meta.version && !peek.name && !unnamed) continue
    const fields = metaToDbFields(meta, {
      name: unnamed ? (peek.name || meta.name || row.name) : (row.name || peek.name || meta.name),
      description: row.description || peek.description,
      author: row.author || peek.author || meta.author,
      version: row.version || peek.version || meta.version,
      homepage: row.homepage || peek.homepage,
    })
    if (fields.name === '未命名音源' && row.name !== '未命名音源') continue
    update.run(fields.name, fields.description, fields.author, fields.version, fields.homepage, row.id)
  }
}

sourceRouter.post('/refresh-meta', requireAdmin, (req, res) => {
  try {
    refreshStoredSourceMeta()
    const activeIds = new Set(getStoredActiveSourceIds(req.user?.id))
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
