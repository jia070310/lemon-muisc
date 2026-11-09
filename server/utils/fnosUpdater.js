/**
 * 飞牛 fnOS 应用内升级。
 *
 * 与 appcenter-cli 不同，应用中心守护进程提供就地升级通道：
 * 暂存安装包 → 升级前检查 → 提交升级任务，由守护进程完成
 * 停止旧进程、替换文件、恢复运行状态，用户无需到应用中心手动导入。
 *
 * 通道为 Unix Socket + JSON RPC，仅在 fnOS 上存在；其他平台回落到
 * 「保存安装包 + 手动安装」的旧流程。
 */
import fs from 'fs'
import http from 'http'
import crypto from 'crypto'
import os from 'os'
import path from 'path'

/** 应用中心守护进程 socket */
const DAEMON_SOCKET = '/var/run/com.trim.app.center.sock'
const APP_NAME = 'lemon-music'
const MAX_RESPONSE_BYTES = 1024 * 1024
const RPC_TIMEOUT_MS = 30000
const DOWNLOAD_TIMEOUT_MS = 180000
const STATUS_RETRY_MS = 1500

/** 本次进程实例标识：用于判断应用是否真的重启过 */
const BOOT_ID = crypto.randomUUID()

export function getBootId() {
  return BOOT_ID
}

/** 当前主机对应的 FPK 架构标识 */
export function detectHostArch() {
  const arch = os.arch()
  if (arch === 'x64') return 'x86'
  if (arch === 'arm64' || arch === 'arm') return 'arm'
  return 'other'
}

function resolveDaemonSocket() {
  try {
    if (fs.existsSync(DAEMON_SOCKET)) return DAEMON_SOCKET
    // 兼容个别版本的文件名差异
    const dir = path.dirname(DAEMON_SOCKET)
    const match = fs.readdirSync(dir).find((name) => /^com\.trim\.app.*\.sock$/.test(name))
    if (match) return path.join(dir, match)
  } catch {}
  return ''
}

/** 是否运行在飞牛 fnOS 且具备应用内升级通道 */
export function isFnOSHost() {
  return process.platform === 'linux' && Boolean(resolveDaemonSocket())
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 调用应用中心守护进程 RPC，返回信封里的 data */
function rpcCall(route, body, timeoutMs = RPC_TIMEOUT_MS) {
  const socketPath = resolveDaemonSocket()
  if (!socketPath) return Promise.reject(new Error('未检测到飞牛应用中心服务'))
  const payload = Buffer.from(JSON.stringify(body || {}))
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (err, data) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve(data)
    }
    const req = http.request(
      {
        socketPath,
        path: route,
        method: 'POST',
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length,
        },
      },
      (res) => {
        const chunks = []
        let size = 0
        res.on('data', (chunk) => {
          size += chunk.length
          if (size > MAX_RESPONSE_BYTES) {
            req.destroy()
            finish(new Error('应用中心响应异常'))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => {
          if (res.statusCode !== 200) {
            finish(new Error(`应用中心返回 HTTP ${res.statusCode}`))
            return
          }
          let envelope
          try {
            envelope = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          } catch {
            finish(new Error('应用中心响应解析失败'))
            return
          }
          if (typeof envelope?.code !== 'number') {
            finish(new Error('应用中心响应格式异常'))
            return
          }
          if (envelope.code !== 0) {
            const err = new Error(envelope.msg || `应用中心返回错误码 ${envelope.code}`)
            err.daemonCode = envelope.code
            finish(err)
            return
          }
          finish(null, envelope.data || {})
        })
        res.on('error', (err) => finish(err))
      },
    )
    req.on('timeout', () => {
      req.destroy()
      finish(new Error('应用中心响应超时'))
    })
    req.on('error', (err) => finish(err))
    req.write(payload)
    req.end()
  })
}

/** 暂存安装包（守护进程复制到自己的目录），返回暂存结果 */
async function stagePackage(fpkPath) {
  const task = await rpcCall('/rpc/v1/download/task', {
    packageSourceType: 'file',
    path: fpkPath,
  })
  const taskId = String(task?.downloadTaskId || '')
  if (!taskId) throw new Error('应用中心未返回暂存任务 ID')

  const deadline = Date.now() + DOWNLOAD_TIMEOUT_MS
  while (Date.now() < deadline) {
    const status = await rpcCall('/rpc/v1/download/status', { downloadTaskId: taskId })
    const phase = status?.status
    if (phase === 2) {
      if (!status?.appName || !status?.version) {
        throw new Error('应用中心未能识别安装包内容')
      }
      return status
    }
    if (phase !== 1) {
      throw new Error(status?.message || `安装包暂存失败（状态 ${phase}）`)
    }
    await delay(STATUS_RETRY_MS)
  }
  throw new Error('安装包暂存超时')
}

async function getUpdateInfo({ version, packageType }) {
  return rpcCall('/rpc/v1/update/info', {
    appName: APP_NAME,
    updateVersion: version,
    packageType,
    language: 'zh-CN',
  })
}

async function submitUpdateTask({ version, packageType, installVolumeID }) {
  const task = await rpcCall('/rpc/v1/update/task', {
    appName: APP_NAME,
    updateVersion: version,
    packageType,
    systemParameters: {
      agreedToProtocol: true,
      installVolumeID,
      dataVolumeId: installVolumeID,
      immediateStart: false,
    },
    customParameters: [],
    language: 'zh-CN',
  })
  const taskId = String(task?.taskId || '')
  if (!taskId) throw new Error('应用中心未返回升级任务 ID')
  return taskId
}

function getStateDir() {
  const base = String(
    process.env.TRIM_PKGVAR
    || process.env.PKGVAR_PATH
    || process.env.CONFIG_PATH
    || path.join(process.cwd(), 'data'),
  ).trim()
  return path.join(base, 'update')
}

function getStateFile() {
  return path.join(getStateDir(), 'last-install.json')
}

/** 读取最近一次应用内升级的状态；重启后用于确认升级结果 */
export function readLastUpdateState() {
  try {
    const raw = fs.readFileSync(getStateFile(), 'utf8')
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null
    return data
  } catch {
    return null
  }
}

export function writeLastUpdateState(state) {
  try {
    const dir = getStateDir()
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, 'last-install.json')
    const tmp = `${file}.tmp`
    const payload = { ...state, bootId: BOOT_ID, updatedAt: Date.now() }
    fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    fs.renameSync(tmp, file)
  } catch {}
}

/**
 * 用已下载的 FPK 完成应用内升级。
 * onStep 用于把「暂存/校验/提交」阶段回传给前端。
 */
export async function installFpkInApp({ fpkPath, version, onStep }) {
  const report = (step) => {
    try { onStep?.(step) } catch {}
  }

  report('正在暂存安装包…')
  const staged = await stagePackage(fpkPath)
  if (staged?.appName && staged.appName !== APP_NAME) {
    throw new Error(`安装包应用标识不匹配（${staged.appName}）`)
  }
  if (staged?.version && staged.version !== version) {
    throw new Error(`安装包版本不匹配（${staged.version}）`)
  }
  if (staged?.installed !== true) {
    throw new Error('安装包未通过应用中心校验')
  }
  const packageType = String(staged?.packageType || 'path')
  const stagedVersion = String(staged?.version || version)

  report('正在检查升级环境…')
  const info = await getUpdateInfo({ version: stagedVersion, packageType })
  const installVolumeID = Number(info?.wizardInfo?.installedVolumeID)
  if (!Number.isInteger(installVolumeID) || installVolumeID <= 0) {
    throw new Error('无法确定应用安装卷，已中止升级')
  }

  writeLastUpdateState({
    status: 'installing',
    version: stagedVersion,
    fileName: path.basename(fpkPath),
    startedAt: Date.now(),
  })

  report('正在提交升级任务…')
  const taskId = await submitUpdateTask({ version: stagedVersion, packageType, installVolumeID })
  writeLastUpdateState({
    status: 'installing',
    version: stagedVersion,
    fileName: path.basename(fpkPath),
    taskId,
    startedAt: Date.now(),
  })

  report('应用即将重启…')
  return { taskId, version: stagedVersion }
}
