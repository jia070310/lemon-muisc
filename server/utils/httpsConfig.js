/**
 * 应用内 HTTPS：默认自动开启——只要扫到飞牛系统证书就用 TLS。
 * 仅当 https.json 里显式 enabled:false，或环境变量 HTTPS=0 时关闭。
 * 不依赖反向代理；启用后同一 PORT 以 TLS 监听。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const FNOS_CERT_CONF = [
  '/usr/trim/etc/network_cert_all.conf',
  '/usr/trim/etc/network_gateway_cert.conf',
]
const FNOS_SSLS_ROOT = '/usr/trim/var/trim_connect/ssls'
const DESKTOP_PROTOCOL_FILE = 'desktop-protocol'

function configRoot() {
  return process.env.CONFIG_PATH || path.join(__dirname, '..', '..', 'config')
}

export function httpsConfigPath() {
  return path.join(configRoot(), 'https.json')
}

function desktopProtocolPath() {
  return path.join(configRoot(), DESKTOP_PROTOCOL_FILE)
}

function readableFile(p) {
  try {
    return Boolean(p) && fs.existsSync(p) && fs.statSync(p).isFile()
  } catch {
    return false
  }
}

function safeRead(p) {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return ''
  }
}

function defaultConfig() {
  return {
    /** null=自动（有飞牛证书就开）；true/false=强制 */
    enabled: null,
    /** feiniu | manual */
    source: 'feiniu',
    /** 飞牛证书域名 / 名称，如 zpf1223.fnos.net 或 fnOS */
    certName: '',
    certPath: '',
    keyPath: '',
  }
}

function parseEnabledFlag(raw) {
  if (raw == null || raw === '') return null
  if (raw === true || raw === 1 || raw === '1' || /^true$/i.test(String(raw))) return true
  if (raw === false || raw === 0 || raw === '0' || /^false$/i.test(String(raw))) return false
  return null
}

export function loadHttpsConfig() {
  const cfg = defaultConfig()
  const file = httpsConfigPath()
  if (readableFile(file)) {
    try {
      const parsed = JSON.parse(safeRead(file) || '{}')
      if (parsed && typeof parsed === 'object') {
        if (Object.prototype.hasOwnProperty.call(parsed, 'enabled')) {
          cfg.enabled = parseEnabledFlag(parsed.enabled)
        }
        if (parsed.source === 'manual' || parsed.source === 'feiniu') cfg.source = parsed.source
        if (parsed.certName != null) cfg.certName = String(parsed.certName || '').trim()
        if (parsed.certPath != null) cfg.certPath = String(parsed.certPath || '').trim()
        if (parsed.keyPath != null) cfg.keyPath = String(parsed.keyPath || '').trim()
      }
    } catch {}
  }
  // 环境变量可覆盖：HTTPS=0 关闭；HTTPS=1 强制开
  const envOn = String(process.env.HTTPS || process.env.LEMON_HTTPS || '').trim()
  if (envOn === '0' || /^false$/i.test(envOn)) cfg.enabled = false
  else if (envOn === '1' || /^true$/i.test(envOn)) cfg.enabled = true
  if (process.env.SSL_CERT) cfg.certPath = String(process.env.SSL_CERT).trim()
  if (process.env.SSL_KEY) cfg.keyPath = String(process.env.SSL_KEY).trim()
  if (process.env.SSL_CERT && process.env.SSL_KEY) cfg.source = 'manual'
  if (process.env.LEMON_SSL_CERT_NAME) {
    cfg.certName = String(process.env.LEMON_SSL_CERT_NAME).trim()
    cfg.source = 'feiniu'
  }
  return cfg
}

/** 是否应尝试 HTTPS：默认有证书就开；仅显式关闭时不开 */
export function wantsHttps(cfg = loadHttpsConfig()) {
  if (cfg.enabled === false) return false
  if (cfg.enabled === true) return true
  if (cfg.source === 'manual' && readableFile(cfg.certPath) && readableFile(cfg.keyPath)) return true
  if (listFeiniuCertificates().length) return true
  // 已有本地副本（曾成功开过）也继续开
  const localCert = path.join(configRoot(), 'ssl', 'server.crt')
  const localKey = path.join(configRoot(), 'ssl', 'server.key')
  return readableFile(localCert) && readableFile(localKey)
}

function copyCertIntoConfig(certPath, keyPath) {
  const sslDir = path.join(configRoot(), 'ssl')
  fs.mkdirSync(sslDir, { recursive: true })
  const destCert = path.join(sslDir, 'server.crt')
  const destKey = path.join(sslDir, 'server.key')
  fs.copyFileSync(certPath, destCert)
  fs.copyFileSync(keyPath, destKey)
  try { fs.chmodSync(destCert, 0o644) } catch {}
  try { fs.chmodSync(destKey, 0o600) } catch {}
  return { certPath: destCert, keyPath: destKey }
}

export function saveHttpsConfig(partial) {
  const cur = loadHttpsConfig()
  const next = { ...cur, ...partial }
  if (Object.prototype.hasOwnProperty.call(partial, 'enabled')) {
    // 设置页开关：开=默认自动（true），关=显式 false
    next.enabled = parseEnabledFlag(partial.enabled)
    if (next.enabled !== false) next.enabled = true
  }
  next.source = next.source === 'manual' ? 'manual' : 'feiniu'
  next.certName = String(next.certName || '').trim()
  next.certPath = String(next.certPath || '').trim()
  next.keyPath = String(next.keyPath || '').trim()

  if (next.enabled !== false) {
    let certPath = next.certPath
    let keyPath = next.keyPath
    if (next.source === 'feiniu' || !readableFile(certPath) || !readableFile(keyPath)) {
      const pair = resolveFeiniuPair(next.certName)
      if (pair) {
        next.certName = pair.name
        certPath = pair.certPath
        keyPath = pair.keyPath
      }
    }
    if (readableFile(certPath) && readableFile(keyPath)) {
      try {
        const copied = copyCertIntoConfig(certPath, keyPath)
        next.certPath = copied.certPath
        next.keyPath = copied.keyPath
      } catch (e) {
        throw new Error(`复制证书到配置目录失败: ${e?.message || e}`)
      }
    }
  }

  const out = {
    enabled: next.enabled === false ? false : true,
    source: next.source,
    certName: next.certName,
    certPath: next.certPath,
    keyPath: next.keyPath,
  }
  const dir = configRoot()
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(httpsConfigPath(), `${JSON.stringify(out, null, 2)}\n`, 'utf8')
  writeDesktopProtocolHint(out.enabled === false ? 'http' : 'https')
  return out
}

export function writeDesktopProtocolHint(protocol) {
  const p = protocol === 'https' ? 'https' : 'http'
  try {
    const dir = configRoot()
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(desktopProtocolPath(), `${p}\n`, 'utf8')
  } catch {}
  return p
}

export function readDesktopProtocolHint() {
  const raw = safeRead(desktopProtocolPath()).trim().toLowerCase()
  return raw === 'https' ? 'https' : 'http'
}

/** 从飞牛证书配置 / 目录扫描可用证书 */
export function listFeiniuCertificates() {
  const byKey = new Map()

  const add = (entry) => {
    const name = String(entry.name || entry.domain || '').trim()
    const certPath = String(entry.certPath || entry.cert || '').trim()
    const keyPath = String(entry.keyPath || entry.key || entry.privateKey || '').trim()
    if (!name || !readableFile(certPath) || !readableFile(keyPath)) return
    let mtime = 0
    try { mtime = fs.statSync(certPath).mtimeMs } catch {}
    const prev = byKey.get(name)
    if (!prev || mtime >= prev.mtime) {
      byKey.set(name, { name, certPath, keyPath, mtime, source: 'feiniu' })
    }
  }

  for (const conf of FNOS_CERT_CONF) {
    const text = safeRead(conf)
    if (!text) continue
    // JSON 数组 / 对象
    try {
      const data = JSON.parse(text)
      const items = Array.isArray(data) ? data : (data.certs || data.list || data.items || [data])
      for (const item of items) {
        if (!item || typeof item !== 'object') continue
        add({
          name: item.host || item.domain || item.name || item.certName,
          certPath: item.cert || item.crt || item.fullchain || item.old_crt,
          keyPath: item.key || item.privateKey || item.old_key,
        })
      }
    } catch {
      // 非标准 JSON：用正则抽路径
    }
    const certRe = /"(?:cert|crt|fullchain|old_crt)"\s*:\s*"([^"]+\.crt)"/gi
    const keyRe = /"(?:key|privateKey|old_key)"\s*:\s*"([^"]+\.key)"/gi
    const hostRe = /"(?:host|domain|name|certName)"\s*:\s*"([^"]+)"/gi
    const certs = [...text.matchAll(certRe)].map((m) => m[1])
    const keys = [...text.matchAll(keyRe)].map((m) => m[1])
    const hosts = [...text.matchAll(hostRe)].map((m) => m[1])
    const n = Math.max(certs.length, keys.length)
    for (let i = 0; i < n; i++) {
      const certPath = certs[i] || ''
      const keyPath = keys[i] || ''
      const fromPath = path.basename(certPath, '.crt')
      add({
        name: hosts[i] || fromPath || `cert-${i + 1}`,
        certPath,
        keyPath,
      })
    }
    // yaml 风格 old_crt: "..."
    const yamlCert = text.match(/(?:^|\n)\s*(?:old_)?crt\s*:\s*"([^"]+)"/i)
    const yamlKey = text.match(/(?:^|\n)\s*(?:old_)?key\s*:\s*"([^"]+)"/i)
    if (yamlCert && yamlKey) {
      add({
        name: path.basename(yamlCert[1], '.crt') || 'fnOS',
        certPath: yamlCert[1],
        keyPath: yamlKey[1],
      })
    }
  }

  // 扫描证书目录：/usr/trim/var/trim_connect/ssls/<name>/<ts>/<name>.crt
  try {
    if (fs.existsSync(FNOS_SSLS_ROOT)) {
      for (const name of fs.readdirSync(FNOS_SSLS_ROOT)) {
        const domainDir = path.join(FNOS_SSLS_ROOT, name)
        let st
        try { st = fs.statSync(domainDir) } catch { continue }
        if (!st.isDirectory()) continue
        let versions = []
        try { versions = fs.readdirSync(domainDir) } catch { continue }
        for (const ver of versions) {
          const dir = path.join(domainDir, ver)
          try {
            if (!fs.statSync(dir).isDirectory()) continue
          } catch { continue }
          const candidates = [
            path.join(dir, `${name}.crt`),
            path.join(dir, 'fullchain.crt'),
            path.join(dir, 'cert.crt'),
          ]
          const keyCandidates = [
            path.join(dir, `${name}.key`),
            path.join(dir, 'private.key'),
            path.join(dir, 'cert.key'),
          ]
          const certPath = candidates.find(readableFile)
          const keyPath = keyCandidates.find(readableFile)
          if (certPath && keyPath) add({ name, certPath, keyPath })
        }
      }
    }
  } catch {}

  return [...byKey.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, certPath, keyPath, source }) => ({ name, certPath, keyPath, source }))
}

function resolveFeiniuPair(certName) {
  const list = listFeiniuCertificates()
  if (!list.length) return null
  const want = String(certName || '').trim()
  if (want) {
    const exact = list.find((c) => c.name === want)
    if (exact) return exact
    const fuzzy = list.find((c) => c.name.toLowerCase() === want.toLowerCase())
    if (fuzzy) return fuzzy
  }
  // 优先非系统默认名
  const prefer = list.find((c) => !/^fnos$/i.test(c.name)) || list[0]
  return prefer
}

/**
 * 解析当前应使用的证书材料。
 * 默认：有飞牛证书 / 本地副本则开 HTTPS；显式关闭或完全没有证书则 HTTP。
 */
export function resolveTlsListen() {
  const cfg = loadHttpsConfig()
  if (cfg.enabled === false) {
    return { enabled: false, meta: { ...cfg, mode: 'off' } }
  }

  let certPath = cfg.certPath
  let keyPath = cfg.keyPath
  let certName = cfg.certName

  // 飞牛来源：每次启动尽量读最新系统证书并刷新本地副本（续期免手动）
  if (cfg.source !== 'manual') {
    const pair = resolveFeiniuPair(certName)
    if (pair) {
      certName = pair.name
      try {
        const copied = copyCertIntoConfig(pair.certPath, pair.keyPath)
        certPath = copied.certPath
        keyPath = copied.keyPath
        try {
          const snap = {
            enabled: cfg.enabled === false ? false : true,
            source: 'feiniu',
            certName,
            certPath,
            keyPath,
          }
          fs.mkdirSync(configRoot(), { recursive: true })
          fs.writeFileSync(httpsConfigPath(), `${JSON.stringify(snap, null, 2)}\n`, 'utf8')
        } catch {}
      } catch {
        certPath = pair.certPath
        keyPath = pair.keyPath
      }
    }
  }

  if (!readableFile(certPath) || !readableFile(keyPath)) {
    const localCert = path.join(configRoot(), 'ssl', 'server.crt')
    const localKey = path.join(configRoot(), 'ssl', 'server.key')
    if (readableFile(localCert) && readableFile(localKey)) {
      certPath = localCert
      keyPath = localKey
    }
  }

  if (!readableFile(certPath) || !readableFile(keyPath)) {
    // 默认开启：没证书时安静回退 HTTP，不报错打断启动
    if (cfg.enabled !== true) {
      return { enabled: false, meta: { ...cfg, certPath, keyPath, certName, mode: 'auto-no-cert' } }
    }
    return {
      enabled: true,
      error: '已强制启用 HTTPS，但未找到可用证书。请确认飞牛「证书」里已有证书。',
      meta: { ...cfg, certPath, keyPath, certName },
    }
  }

  try {
    const cert = fs.readFileSync(certPath)
    const key = fs.readFileSync(keyPath)
    return {
      enabled: true,
      credentials: { cert, key },
      meta: {
        ...cfg,
        enabled: true,
        certName,
        certPath,
        keyPath,
        active: true,
        mode: cfg.enabled === true ? 'forced' : 'auto',
      },
    }
  } catch (e) {
    if (cfg.enabled !== true) {
      return { enabled: false, meta: { ...cfg, certPath, keyPath, certName, mode: 'auto-read-fail' } }
    }
    return {
      enabled: true,
      error: `读取证书失败: ${e?.message || e}`,
      meta: { ...cfg, certPath, keyPath, certName },
    }
  }
}

/** 启动成功后尽量把飞牛桌面入口协议改成 https/http */
export function syncNativeDesktopProtocol(protocol) {
  const p = protocol === 'https' ? 'https' : 'http'
  writeDesktopProtocolHint(p)
  const appname = process.env.TRIM_APPNAME || 'lemon-music'
  const files = [
    path.join(process.env.TRIM_APPDEST || '', 'ui', 'config'),
    `/var/apps_ui/${appname}/config`,
    `/var/apps/${appname}/target/ui/config`,
  ].filter(Boolean)

  for (const file of files) {
    if (!readableFile(file)) continue
    try {
      const data = JSON.parse(safeRead(file) || '{}')
      const root = data?.['.url']
      if (!root || typeof root !== 'object') continue
      let changed = false
      for (const item of Object.values(root)) {
        if (item && typeof item === 'object' && item.protocol != null && item.protocol !== p) {
          item.protocol = p
          changed = true
        }
      }
      if (changed) {
        fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
      }
    } catch {}
  }
}
