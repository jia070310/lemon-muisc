/**
 * 应用内 HTTPS（同一 PORT 直接 TLS，不依赖反向代理）。
 *
 * 飞牛原生 FPK：自动扫描系统证书目录，有证书则开。
 * Docker / 自托管：容器内无飞牛证书，需挂载文件并设置
 *   SSL_CERT + SSL_KEY（或 HTTPS=1），见 docs/docker.md。
 * 关闭：HTTPS=0 或 https.json 里 enabled:false。
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
  // 环境变量：HTTPS=0 关闭；HTTPS=1 强制开；挂载 SSL_CERT+SSL_KEY 则按手动证书（Docker）
  const envOn = String(process.env.HTTPS || process.env.LEMON_HTTPS || '').trim()
  if (envOn === '0' || /^false$/i.test(envOn)) cfg.enabled = false
  else if (envOn === '1' || /^true$/i.test(envOn)) cfg.enabled = true
  if (process.env.SSL_CERT) cfg.certPath = String(process.env.SSL_CERT).trim()
  if (process.env.SSL_KEY) cfg.keyPath = String(process.env.SSL_KEY).trim()
  if (process.env.SSL_CERT && process.env.SSL_KEY) {
    cfg.source = 'manual'
    // Docker 常见：只挂证书不写 HTTPS=1，也视为要开
    if (cfg.enabled == null) cfg.enabled = true
  }
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
  // 桌面入口默认交给飞牛自适应，不随应用 TLS 写死 http/https
  writeDesktopProtocolHint('auto')
  return out
}

/**
 * 桌面入口协议提示。
 * - http / https：写死
 * - auto / 空：交给飞牛按当前桌面访问方式自适应（推荐）
 */
export function writeDesktopProtocolHint(protocol) {
  const raw = String(protocol || '').trim().toLowerCase()
  const p = raw === 'https' || raw === 'http' ? raw : 'auto'
  try {
    const dir = configRoot()
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(desktopProtocolPath(), `${p}\n`, 'utf8')
  } catch {}
  return p
}

export function readDesktopProtocolHint() {
  const raw = safeRead(desktopProtocolPath()).trim().toLowerCase()
  if (raw === 'https' || raw === 'http') return raw
  return 'auto'
}

/** 在多个候选路径中选第一个可读文件；优先含 fullchain 的路径（完整链，减少浏览器「不安全」） */
function firstReadableCert(paths) {
  const list = (paths || []).map((p) => String(p || '').trim()).filter(Boolean)
  const preferred = list.filter((p) => /fullchain/i.test(p))
  const rest = list.filter((p) => !/fullchain/i.test(p))
  return [...preferred, ...rest].find(readableFile) || ''
}

function firstReadableKey(paths) {
  const list = (paths || []).map((p) => String(p || '').trim()).filter(Boolean)
  return list.find(readableFile) || ''
}

function scoreCertEntry(entry) {
  let s = 0
  if (entry.used) s += 100
  if (entry.fromGateway) s += 40
  if (/fullchain/i.test(entry.certPath || '')) s += 20
  if (!/^fnos$/i.test(entry.name || '')) s += 10
  s += Math.min(10, Math.floor((entry.mtime || 0) / 1e12))
  return s
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
    const next = {
      name,
      certPath,
      keyPath,
      mtime,
      source: 'feiniu',
      used: Boolean(entry.used),
      fromGateway: Boolean(entry.fromGateway),
    }
    const prev = byKey.get(name)
    if (!prev || scoreCertEntry(next) >= scoreCertEntry(prev)) {
      byKey.set(name, next)
    }
  }

  for (const conf of FNOS_CERT_CONF) {
    const text = safeRead(conf)
    if (!text) continue
    const fromGateway = /network_gateway_cert\.conf$/i.test(conf)
    // JSON 数组 / 对象（飞牛常见：host + cert + key；另有 fullchain / old_*）
    try {
      const data = JSON.parse(text)
      const items = Array.isArray(data) ? data : (data.certs || data.list || data.items || [data])
      for (const item of items) {
        if (!item || typeof item !== 'object') continue
        const certPath = firstReadableCert([
          item.fullchain,
          item.old_fullchain,
          item.cert,
          item.crt,
          item.old_crt,
        ])
        const keyPath = firstReadableKey([
          item.key,
          item.privateKey,
          item.old_key,
          item.privkey,
        ])
        add({
          name: item.host || item.domain || item.name || item.certName,
          certPath,
          keyPath,
          used: item.used === true || item.used === 1 || item.used === '1',
          fromGateway,
        })
      }
    } catch {
      // 非标准 JSON：用正则抽路径
    }
    const certRe = /"(?:fullchain|old_fullchain|cert|crt|old_crt)"\s*:\s*"([^"]+\.(?:crt|pem))"/gi
    const keyRe = /"(?:key|privateKey|old_key|privkey)"\s*:\s*"([^"]+\.(?:key|pem))"/gi
    const hostRe = /"(?:host|domain|name|certName)"\s*:\s*"([^"]+)"/gi
    const certs = [...text.matchAll(certRe)].map((m) => m[1])
    const keys = [...text.matchAll(keyRe)].map((m) => m[1])
    const hosts = [...text.matchAll(hostRe)].map((m) => m[1])
    const n = Math.max(certs.length, keys.length)
    for (let i = 0; i < n; i++) {
      const certPath = firstReadableCert([certs[i]])
      const keyPath = firstReadableKey([keys[i]])
      const fromPath = certPath
        ? path.basename(certPath).replace(/\.(crt|pem)$/i, '')
        : ''
      add({
        name: hosts[i] || (fromPath && fromPath !== 'fullchain' ? fromPath : '') || `cert-${i + 1}`,
        certPath,
        keyPath,
        fromGateway,
      })
    }
    // yaml 风格：优先 old_fullchain，再 old_crt / crt
    const yamlFull = text.match(/(?:^|\n)\s*(?:old_)?fullchain\s*:\s*"([^"]+)"/i)
    const yamlCert = text.match(/(?:^|\n)\s*(?:old_)?crt\s*:\s*"([^"]+)"/i)
    const yamlKey = text.match(/(?:^|\n)\s*(?:old_)?key\s*:\s*"([^"]+)"/i)
    if (yamlKey && (yamlFull || yamlCert)) {
      const certPath = firstReadableCert([yamlFull?.[1], yamlCert?.[1]])
      add({
        name: path.basename(certPath || yamlCert?.[1] || '', path.extname(certPath || yamlCert?.[1] || '')) || 'fnOS',
        certPath,
        keyPath: yamlKey[1],
        fromGateway,
      })
    }
  }

  // 扫描：/usr/trim/var/trim_connect/ssls/<name>/<timestamp>/…
  // 同域名多版本时优先数字时间戳更大的目录；证书优先 fullchain.*
  try {
    if (fs.existsSync(FNOS_SSLS_ROOT)) {
      for (const name of fs.readdirSync(FNOS_SSLS_ROOT)) {
        const domainDir = path.join(FNOS_SSLS_ROOT, name)
        let st
        try { st = fs.statSync(domainDir) } catch { continue }
        if (!st.isDirectory()) continue
        let versions = []
        try { versions = fs.readdirSync(domainDir) } catch { continue }
        versions.sort((a, b) => {
          const na = Number(a)
          const nb = Number(b)
          if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na
          return String(b).localeCompare(String(a))
        })
        for (const ver of versions) {
          const dir = path.join(domainDir, ver)
          try {
            if (!fs.statSync(dir).isDirectory()) continue
          } catch { continue }
          const certPath = firstReadableCert([
            path.join(dir, 'fullchain.crt'),
            path.join(dir, 'fullchain.pem'),
            path.join(dir, `${name}.crt`),
            path.join(dir, `${name}.pem`),
            path.join(dir, 'cert.crt'),
            path.join(dir, 'cert.pem'),
          ])
          const keyPath = firstReadableKey([
            path.join(dir, `${name}.key`),
            path.join(dir, 'privkey.pem'),
            path.join(dir, 'private.key'),
            path.join(dir, 'cert.key'),
            path.join(dir, `${name}.pem`),
          ])
          if (certPath && keyPath && certPath !== keyPath) {
            add({ name, certPath, keyPath })
            // 已找到该域名最新可用版本，不再扫更旧时间戳
            break
          }
        }
      }
    }
  } catch {}

  return [...byKey.values()]
    .sort((a, b) => scoreCertEntry(b) - scoreCertEntry(a) || a.name.localeCompare(b.name))
    .map(({ name, certPath, keyPath, source, used, fromGateway }) => ({
      name,
      certPath,
      keyPath,
      source,
      used: Boolean(used),
      fromGateway: Boolean(fromGateway),
    }))
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
    // 域名包含匹配（如证书目录名与入口域名略有差异）
    const contain = list.find((c) =>
      c.name.toLowerCase().includes(want.toLowerCase())
      || want.toLowerCase().includes(c.name.toLowerCase()),
    )
    if (contain) return contain
  }
  // 已按 score 排序：gateway / used / fullchain / 非 fnOS 优先
  return list[0]
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
          // 保持 auto（null）语义，勿把首次成功启动写成强制 enabled:true
          const snap = {
            enabled: cfg.enabled === false ? false : cfg.enabled === true ? true : null,
            source: 'feiniu',
            certName,
            certPath,
            keyPath,
          }
          fs.mkdirSync(configRoot(), { recursive: true })
          fs.writeFileSync(httpsConfigPath(), `${JSON.stringify(snap, null, 2)}\n`, 'utf8')
        } catch {}
      } catch (e) {
        // 复制失败时仍可直接读系统路径（权限允许时）
        certPath = pair.certPath
        keyPath = pair.keyPath
        try {
          console.warn(`[https] 复制飞牛证书到配置目录失败，尝试直读系统路径: ${e?.message || e}`)
        } catch {}
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

/**
 * 启动后把飞牛桌面入口 protocol 设为空（自适应）。
 * 飞牛文档：protocol 可留空，按当前桌面是 http 还是 https 打开应用。
 * 不再把入口写死成应用监听协议，避免 HTTPS 飞牛桌面却打开 http。
 */
export function syncNativeDesktopProtocol(_protocol) {
  writeDesktopProtocolHint('auto')
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
        if (item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, 'protocol')) {
          if (item.protocol !== '') {
            item.protocol = ''
            changed = true
          }
        }
      }
      if (changed) {
        fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
      }
    } catch {}
  }
}
