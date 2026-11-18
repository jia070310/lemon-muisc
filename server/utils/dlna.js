import dgram from 'dgram'
import os from 'os'
import needle from 'needle'

const SSDP_ADDR = '239.255.255.250'
const SSDP_PORT = 1900
const DEVICE_TTL_MS = 90_000

/** @type {Map<string, { udn: string, name: string, location: string, controlURL: string, seenAt: number }>} */
const deviceCache = new Map()
/** 正在投屏的设备不过期，避免连播下一首时报「设备不在线」 */
const stickyUdns = new Set()

function parseHeaderMap(text) {
  const map = {}
  for (const line of String(text || '').split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i <= 0) continue
    map[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim()
  }
  return map
}

function xmlTag(xml, name) {
  const re = new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'i')
  const m = String(xml || '').match(re)
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : ''
}

function resolveUrl(base, rel) {
  try {
    return new URL(rel, base).href
  } catch {
    return String(rel || '')
  }
}

function hostOfLocation(location) {
  try {
    return new URL(String(location || '')).hostname || ''
  } catch {
    return ''
  }
}

/** 越高越优先作为该 IP 的主投屏入口；App 接收端分数低 */
function rendererPreferScore(name = '', manufacturer = '', model = '') {
  const n = `${name} ${manufacturer} ${model}`
  // 电视上的第三方 App 也会广播 DLNA，容易和系统电视抢列表
  if (/飞牛影视|飞牛|当贝|影视仓|云视听|极光|Kodi|VLC|Bubble\s*UPnP|DLNA\s*Renderer|MediaPlayer/i.test(n)) {
    return 1
  }
  if (/小米电视|Xiaomi|Redmi|智慧屏|华为智慧屏|海信|TCL|索尼|Samsung|LG|客厅|卧室/i.test(n)) {
    return 12
  }
  if (/电视|TV|MiTV/i.test(n)) return 8
  return 5
}

function isAppRenderer(name = '') {
  return rendererPreferScore(name) <= 1
}

/** 小米 hyperDLNA：GetPositionInfo 会直接 socket hang up，进度只能靠墙钟+元数据 */
export function isXiaomiDlnaDevice(device = {}) {
  const s = `${device.name || ''} ${device.manufacturer || ''} ${device.model || ''} ${device.controlURL || ''} ${device.location || ''}`
  return /Xiaomi|小米|Redmi|hyperDLNA|smartshare|MiTV/i.test(s)
}

function parseAvTransport(xml, location) {
  const name = xmlTag(xml, 'friendlyName') || xmlTag(xml, 'modelName') || 'DLNA 设备'
  const manufacturer = xmlTag(xml, 'manufacturer') || ''
  const model = xmlTag(xml, 'modelName') || xmlTag(xml, 'modelNumber') || ''
  const udn = xmlTag(xml, 'UDN') || location
  const services = String(xml).match(/<service\b[\s\S]*?<\/service>/gi) || []
  let controlURL = ''
  for (const svc of services) {
    const type = xmlTag(svc, 'serviceType')
    if (!/AVTransport/i.test(type)) continue
    controlURL = xmlTag(svc, 'controlURL')
    if (controlURL) break
  }
  if (!controlURL) return null
  const host = hostOfLocation(location)
  return {
    udn,
    name,
    manufacturer,
    model,
    host,
    kind: isAppRenderer(name) ? 'app' : 'device',
    location,
    controlURL: resolveUrl(location, controlURL),
    seenAt: Date.now(),
  }
}

async function fetchDevice(location) {
  const res = await needle('get', location, {
    parse_response: false,
    follow_max: 3,
    timeout: 8000,
    headers: { 'User-Agent': 'LemonMusic/1.2 DLNA' },
  })
  if ((res.statusCode || 0) >= 400) return null
  const xml = Buffer.isBuffer(res.body) ? res.body.toString('utf8') : String(res.body || '')
  return parseAvTransport(xml, location)
}

const SEARCH_TARGETS = [
  'urn:schemas-upnp-org:device:MediaRenderer:1',
  'urn:schemas-upnp-org:device:MediaRenderer:2',
  'urn:schemas-upnp-org:service:AVTransport:1',
  'urn:schemas-upnp-org:service:AVTransport:2',
  'upnp:rootdevice',
  'ssdp:all',
]

function listLocalIpv4() {
  const ips = []
  for (const list of Object.values(os.networkInterfaces() || {})) {
    for (const a of list || []) {
      const v4 = a.family === 4 || a.family === 'IPv4'
      if (!v4 || a.internal) continue
      const ip = String(a.address || '').trim()
      if (!ip || ip.startsWith('169.254.')) continue
      ips.push(ip)
    }
  }
  return [...new Set(ips)]
}

function buildSearchMessages(mx = 3) {
  return SEARCH_TARGETS.map((st) => Buffer.from(
    `M-SEARCH * HTTP/1.1\r\nHOST: ${SSDP_ADDR}:${SSDP_PORT}\r\nMAN: "ssdp:discover"\r\nMX: ${mx}\r\nST: ${st}\r\nUSER-AGENT: LemonMusic/1.2 UPnP/1.1\r\n\r\n`,
  ))
}

function sendSearch(sock) {
  for (const msg of buildSearchMessages()) {
    try { sock.send(msg, SSDP_PORT, SSDP_ADDR) } catch {}
  }
}

function collectSsdpLocations({ bindAddress = '', timeoutMs = 3500 } = {}) {
  return new Promise((resolve) => {
    const locations = new Set()
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    let finished = false
    const done = () => {
      if (finished) return
      finished = true
      try { sock.close() } catch {}
      resolve(locations)
    }
    sock.on('error', () => done())
    sock.on('message', (buf) => {
      const headers = parseHeaderMap(buf.toString('utf8'))
      const loc = headers.location || headers['al']
      if (loc) locations.add(loc)
    })
    const onListen = () => {
      try { sock.setBroadcast(true) } catch {}
      try { sock.setMulticastTTL(4) } catch {}
      if (bindAddress) {
        try { sock.setMulticastInterface(bindAddress) } catch {}
        try { sock.addMembership(SSDP_ADDR, bindAddress) } catch {
          try { sock.addMembership(SSDP_ADDR) } catch {}
        }
      } else {
        try { sock.addMembership(SSDP_ADDR) } catch {}
      }
      sendSearch(sock)
      // 再补发一轮，避开部分设备首包丢失
      setTimeout(() => {
        if (!finished) sendSearch(sock)
      }, 400)
    }
    try {
      if (bindAddress) sock.bind(0, bindAddress, onListen)
      else sock.bind(0, onListen)
    } catch {
      done()
      return
    }
    setTimeout(done, Math.max(1200, timeoutMs))
  })
}

export async function discoverDlnaDevices({ timeoutMs = 3800 } = {}) {
  const locations = new Set()
  const ifaces = listLocalIpv4()
  // Windows / 多网卡：必须按网卡 IP 绑定，否则组播常从错误网卡出去，搜不到电视
  const jobs = ifaces.length
    ? ifaces.map((ip) => collectSsdpLocations({ bindAddress: ip, timeoutMs }))
    : [collectSsdpLocations({ timeoutMs })]
  // 再加一个未指定网卡的兜底（部分环境仍依赖系统默认路由）
  if (ifaces.length) jobs.push(collectSsdpLocations({ timeoutMs }))

  const batches = await Promise.all(jobs)
  for (const set of batches) {
    for (const loc of set) locations.add(loc)
  }

  await Promise.all([...locations].map(async (loc) => {
    try {
      const device = await fetchDevice(loc)
      if (!device) return
      deviceCache.set(device.udn, device)
    } catch {}
  }))
  pruneCache()
  return listCachedDevices()
}

function pruneCache() {
  const now = Date.now()
  for (const [id, d] of deviceCache) {
    if (stickyUdns.has(id)) continue
    if (now - d.seenAt > DEVICE_TTL_MS) deviceCache.delete(id)
  }
}

function deviceListItem(d) {
  return {
    udn: d.udn,
    name: d.name,
    location: d.location,
    host: d.host || hostOfLocation(d.location),
    kind: d.kind || (isAppRenderer(d.name) ? 'app' : 'device'),
    score: rendererPreferScore(d.name, d.manufacturer, d.model),
    seenAt: d.seenAt || 0,
  }
}

function toPublicDevice(d) {
  return {
    udn: d.udn,
    name: d.name,
    location: d.location,
    host: d.host || '',
    kind: d.kind || 'device',
  }
}

/**
 * 同一台电视上的系统接收端 + App（如飞牛影视）都会广播 DLNA。
 * 按 IP 去重，优先保留电视/系统渲染器；正在投屏的 UDN 始终保留。
 */
export function listCachedDevices() {
  pruneCache()
  const all = [...deviceCache.values()].map(deviceListItem)
  const byHost = new Map()
  const noHost = []
  for (const d of all) {
    const host = d.host || ''
    if (!host) {
      noHost.push(d)
      continue
    }
    const prev = byHost.get(host)
    if (!prev) {
      byHost.set(host, d)
      continue
    }
    // 选分更高的；同分取更新；正在投屏的优先保住
    const stickyPrev = stickyUdns.has(prev.udn)
    const stickyNext = stickyUdns.has(d.udn)
    if (stickyNext && !stickyPrev) {
      byHost.set(host, d)
      continue
    }
    if (stickyPrev && !stickyNext) continue
    if ((d.score || 0) > (prev.score || 0)
      || ((d.score || 0) === (prev.score || 0) && (d.seenAt || 0) > (prev.seenAt || 0))) {
      byHost.set(host, d)
    }
  }
  const picked = new Map([...byHost.values(), ...noHost].map((d) => [d.udn, d]))
  // 若当前投屏目标因同 IP 被电视盖掉，仍单独列出，避免「找不到正在投的设备」
  for (const d of all) {
    if (!stickyUdns.has(d.udn) || picked.has(d.udn)) continue
    picked.set(d.udn, d)
  }
  return [...picked.values()]
    .sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.name).localeCompare(String(b.name), 'zh'))
    .map(toPublicDevice)
}

export function getCachedDevice(udn) {
  const id = String(udn || '')
  const hit = deviceCache.get(id)
  if (hit) return hit
  pruneCache()
  return deviceCache.get(id) || null
}

export function pinDlnaDevice(udn) {
  const id = String(udn || '').trim()
  if (!id) return
  stickyUdns.add(id)
  const d = deviceCache.get(id)
  if (d) d.seenAt = Date.now()
}

export function unpinDlnaDevice(udn) {
  stickyUdns.delete(String(udn || ''))
}

export async function ensureDlnaDevice(udn) {
  const id = String(udn || '').trim()
  if (!id) throw new Error('缺少设备')
  let device = getCachedDevice(id)
  if (!device) {
    await discoverDlnaDevices({ timeoutMs: 2200 })
    device = getCachedDevice(id)
  }
  if (!device) throw new Error('设备不在线，请重新搜索')
  pinDlnaDevice(id)
  return device
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isTransientSoapError(err) {
  const msg = String(err?.message || err?.code || err || '')
  return /socket hang up|ECONNRESET|EPIPE|ECONNABORTED|ETIMEDOUT|ESOCKETTIMEDOUT|timeout|ECONNREFUSED/i.test(msg)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function soap(controlURL, action, bodyInner, timeout = 10000) {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${action} xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">${bodyInner}</u:${action}>
  </s:Body>
</s:Envelope>`
  let lastErr = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await needle('post', controlURL, xml, {
        parse_response: false,
        timeout,
        open_timeout: Math.min(5000, timeout),
        response_timeout: timeout,
        read_timeout: timeout,
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          SOAPACTION: `"urn:schemas-upnp-org:service:AVTransport:1#${action}"`,
          'User-Agent': 'LemonMusic/1.2 DLNA',
          // 小米电视等设备常在 Stop/Play 后直接掐连接；close 更稳
          Connection: 'close',
        },
      })
      const text = Buffer.isBuffer(res.body) ? res.body.toString('utf8') : String(res.body || '')
      if ((res.statusCode || 0) >= 400 || /<s:Fault/i.test(text)) {
        const msg = xmlTag(text, 'errorDescription') || xmlTag(text, 'errorCode') || `DLNA ${action} 失败`
        throw new Error(msg)
      }
      return text
    } catch (e) {
      lastErr = e
      if (!isTransientSoapError(e) || attempt >= 2) break
      await sleep(180 + attempt * 220)
    }
  }
  throw lastErr || new Error(`DLNA ${action} 失败`)
}

async function readTransportState(controlURL) {
  try {
    const info = await soap(controlURL, 'GetTransportInfo', '<InstanceID>0</InstanceID>', 4000)
    return String(xmlTag(info, 'CurrentTransportState') || '').toUpperCase()
  } catch {
    return ''
  }
}

function dlnaPn(mime) {
  const m = String(mime || 'audio/mpeg').toLowerCase()
  if (m.includes('mp4') || m.includes('aac') || m.includes('m4a')) return 'AAC_ISO'
  if (m.includes('flac')) return 'FLAC'
  if (m.includes('wav') || m.includes('lpcm')) return 'LPCM'
  return 'MP3'
}

function protocolInfo(mime, { seekable = true } = {}) {
  const m = String(mime || 'audio/mpeg').split(';')[0].trim() || 'audio/mpeg'
  const pn = dlnaPn(m)
  // OP=01 字节 Range；实时转码流不可 Range，改 OP=00，避免电视误以为可拖动却又读不到时长
  const op = seekable ? '01' : '00'
  return `http-get:*:${m}:DLNA.ORG_PN=${pn};DLNA.ORG_OP=${op};DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000`
}

export function formatUpnpDuration(sec) {
  const n = Math.max(0, Math.floor(Number(sec) || 0))
  const h = Math.floor(n / 3600)
  const m = Math.floor((n % 3600) / 60)
  const s = n % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.000`
}

function didl({ title, artist, album, uri, mime, duration, size, artUri = '', seekable = true }) {
  const durAttr = Number(duration) > 1 ? ` duration="${formatUpnpDuration(duration)}"` : ''
  const sizeAttr = Number(size) > 0 ? ` size="${Math.floor(Number(size))}"` : ''
  const bitrateAttr = Number(duration) > 1 && Number(size) > 0
    ? ` bitrate="${Math.max(1, Math.round((Number(size) * 8) / Number(duration)))}"`
    : ''
  const artUrl = String(artUri || '').trim()
  const artXml = artUrl
    ? `<upnp:albumArtURI>${escapeXml(artUrl)}</upnp:albumArtURI>`
    : ''
  return `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">
    <item id="1" parentID="0" restricted="1">
      <dc:title>${escapeXml(String(title || '音频').slice(0, 200))}</dc:title>
      <upnp:class>object.item.audioItem.musicTrack</upnp:class>
      <dc:creator>${escapeXml(String(artist || '').slice(0, 200))}</dc:creator>
      <upnp:artist>${escapeXml(String(artist || '').slice(0, 200))}</upnp:artist>
      <upnp:album>${escapeXml(String(album || '').slice(0, 200))}</upnp:album>
      ${artXml}
      <res protocolInfo="${escapeXml(protocolInfo(mime, { seekable }))}"${durAttr}${sizeAttr}${bitrateAttr}>${escapeXml(uri)}</res>
    </item>
  </DIDL-Lite>`
}

function friendlyDlnaError(raw) {
  const s = String(raw || '')
  if (/无法读取媒体音频|716|714|701|resource not found|illegal mime|unsupported/i.test(s)) {
    return '音箱无法读取该音频（常见于小爱只认 MP3）。已按投屏转码重试；仍失败请确认音箱与 NAS 同一网段，并用局域网地址打开柠檬。'
  }
  if (isTransientSoapError(s)) {
    return '电视/音箱控制通道不稳定，请再点一次投送；并确认设备未息屏、与柠檬同一网段'
  }
  return s || '投屏失败'
}

async function setTransportUri(device, uri, metaInner) {
  await soap(device.controlURL, 'SetAVTransportURI', `
    <InstanceID>0</InstanceID>
    <CurrentURI>${escapeXml(uri)}</CurrentURI>
    <CurrentURIMetaData>${metaInner}</CurrentURIMetaData>
  `)
}

function isActiveTransportState(state) {
  return /^(PLAYING|TRANSITIONING|PAUSED_PLAYBACK)$/.test(String(state || ''))
}

export async function dlnaPlay(udn, {
  uri,
  title,
  artist,
  album,
  mime = 'audio/mpeg',
  duration = 0,
  size = 0,
  seekable = true,
  artUri = '',
} = {}) {
  const device = await ensureDlnaDevice(udn)
  if (!uri) throw new Error('缺少播放地址')
  // 小米电视 Stop 常直接掐连接，忽略即可
  try {
    await soap(device.controlURL, 'Stop', '<InstanceID>0</InstanceID>', 4000)
  } catch {}
  await sleep(220)
  const xml = didl({ title, artist, album, uri, mime, duration, size, artUri, seekable })
  const attempts = [
    () => setTransportUri(device, uri, escapeXml(xml)),
    () => setTransportUri(device, uri, `<![CDATA[${xml}]]>`),
    () => setTransportUri(device, uri, ''),
  ]
  let lastErr = null
  for (const run of attempts) {
    try {
      await run()
      lastErr = null
      break
    } catch (e) {
      lastErr = e
    }
  }
  if (lastErr) throw new Error(friendlyDlnaError(lastErr.message))
  await sleep(320)
  try {
    await soap(device.controlURL, 'Play', '<InstanceID>0</InstanceID><Speed>1</Speed>')
  } catch (e) {
    // 部分电视 Play 已生效却回 socket hang up：用状态确认
    if (isTransientSoapError(e)) {
      await sleep(450)
      let state = await readTransportState(device.controlURL)
      if (isActiveTransportState(state)) {
        return { ok: true, udn: device.udn, name: device.name, state }
      }
      try {
        await soap(device.controlURL, 'Play', '<InstanceID>0</InstanceID><Speed>1</Speed>')
        return { ok: true, udn: device.udn, name: device.name }
      } catch (e2) {
        await sleep(400)
        state = await readTransportState(device.controlURL)
        if (isActiveTransportState(state)) {
          return { ok: true, udn: device.udn, name: device.name, state }
        }
        throw new Error(friendlyDlnaError(e2.message || e.message))
      }
    }
    throw new Error(friendlyDlnaError(e.message))
  }
  return { ok: true, udn: device.udn, name: device.name }
}

export async function dlnaPause(udn) {
  const device = await ensureDlnaDevice(udn)
  await soap(device.controlURL, 'Pause', '<InstanceID>0</InstanceID>')
  return { ok: true, udn: device.udn }
}

export async function dlnaResume(udn) {
  const device = await ensureDlnaDevice(udn)
  await soap(device.controlURL, 'Play', '<InstanceID>0</InstanceID><Speed>1</Speed>')
  return { ok: true, udn: device.udn }
}

export async function dlnaStop(udn) {
  const id = String(udn || '').trim()
  let device = getCachedDevice(id)
  if (!device) {
    try { device = await ensureDlnaDevice(id) } catch {}
  }
  unpinDlnaDevice(id)
  if (!device) return { ok: true }
  try {
    await soap(device.controlURL, 'Stop', '<InstanceID>0</InstanceID>')
  } catch {}
  return { ok: true }
}

function parseUpnpTime(raw) {
  const s = String(raw || '').trim()
  if (!s || s === 'NOT_IMPLEMENTED' || s === '-1') return 0
  const hms = s.match(/^(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d+))?$/)
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3])
  const ms = s.match(/^(\d{1,2}):(\d{1,2})(?:\.(\d+))?$/)
  if (ms) return Number(ms[1]) * 60 + Number(ms[2])
  const n = Number(s)
  return Number.isFinite(n) && n > 0 && n < 86400 ? n : 0
}

export async function dlnaGetStatus(udn) {
  const device = await ensureDlnaDevice(udn)
  const xiaomi = isXiaomiDlnaDevice(device)
  let state = ''
  let relTime = 0
  let duration = 0
  try {
    const info = await soap(device.controlURL, 'GetTransportInfo', '<InstanceID>0</InstanceID>', 4000)
    state = xmlTag(info, 'CurrentTransportState')
  } catch {}
  // 小米 GetPositionInfo 必挂；改用 GetMediaInfo 取曲长，进度交给墙钟
  if (!xiaomi) {
    try {
      const pos = await soap(device.controlURL, 'GetPositionInfo', '<InstanceID>0</InstanceID>', 3500)
      relTime = parseUpnpTime(xmlTag(pos, 'RelTime') || xmlTag(pos, 'AbsTime'))
      duration = parseUpnpTime(xmlTag(pos, 'TrackDuration'))
    } catch {}
  }
  try {
    const med = await soap(device.controlURL, 'GetMediaInfo', '<InstanceID>0</InstanceID>', 3500)
    const mediaDur = parseUpnpTime(xmlTag(med, 'MediaDuration'))
    if (mediaDur > 1) duration = mediaDur
  } catch {}
  return {
    ok: true,
    udn: device.udn,
    name: device.name,
    host: device.host || hostOfLocation(device.location),
    state: String(state || '').toUpperCase(),
    relTime,
    duration,
    xiaomi,
    wallClockOnly: xiaomi,
  }
}

function listLanIpv4() {
  const ips = []
  for (const list of Object.values(os.networkInterfaces() || {})) {
    for (const a of list || []) {
      const family = a.family === 4 || a.family === 'IPv4'
      if (!family || a.internal) continue
      const ip = String(a.address || '').trim()
      if (!ip || ip.startsWith('169.254.')) continue
      ips.push(ip)
    }
  }
  return [...new Set(ips)]
}

export function getAdvertisedBaseUrl(req, { nearHost = '' } = {}) {
  const env = String(process.env.LEMON_PUBLIC_URL || '').replace(/\/+$/, '')
  if (env) return env
  const port = process.env.PORT || '7983'
  const ips = listLanIpv4()
  let peer = String(nearHost || '').trim()
  if (peer && !/^\d+\.\d+\.\d+\.\d+$/.test(peer)) {
    try { peer = new URL(peer.includes('://') ? peer : `http://${peer}`).hostname } catch { peer = '' }
  }
  if (peer && /^\d+\.\d+\.\d+\.\d+$/.test(peer)) {
    const parts = peer.split('.')
    const sameSubnet = ips.find((ip) => {
      const p = ip.split('.')
      return p[0] === parts[0] && p[1] === parts[1] && p[2] === parts[2]
    })
    if (sameSubnet) return `http://${sameSubnet}:${port}`
  }
  const prefer = ips.find((ip) => ip.startsWith('192.168.') || ip.startsWith('10.'))
    || ips.find((ip) => /^172\.(1[6-9]|2\d|3[01])\./.test(ip) && !ip.startsWith('172.17.') && !ip.startsWith('172.18.'))
    || ips[0]
  if (prefer) return `http://${prefer}:${port}`
  const host = String(req.headers.host || '').split(',')[0].trim()
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0]
  if (host) return `${proto}://${host}`
  return `http://127.0.0.1:${port}`
}
