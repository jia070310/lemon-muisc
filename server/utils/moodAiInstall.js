/**
 * AI 情绪分析环境一键准备（飞牛 / NAS 无需手动终端）：
 * 检测或下载便携 Python → 创建 venv → pip install essentia-tensorflow → 下载模型
 */
import fs from 'fs'
import path from 'path'
import { spawn, execFile } from 'child_process'
import { promisify } from 'util'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { ensureMoodModels, getMoodModelsStatus, probeEssentiaAi } from './moodAiEssentia.js'

const execFileAsync = promisify(execFile)

/** python-build-standalone 固定版本（install_only） */
const PYTHON_STANDALONE_TAG = '20250317'
const PYTHON_VERSION = '3.11.11'
const INSTALL_TIMEOUT_MS = 45 * 60 * 1000
/** 单个下载源无进度超时（秒），卡住就换源 */
const DOWNLOAD_STALL_MS = 90 * 1000
const PIP_FALLBACK_TIMEOUT_MS = 8 * 60 * 1000

/** 轻量依赖走国内镜像即可 */
const PIP_DEP_INDEXES = [
  'https://pypi.tuna.tsinghua.edu.cn/simple',
  'https://mirrors.aliyun.com/pypi/simple/',
  'https://pypi.org/simple',
]

/** 固定版本；约 280MB，必须直链下载才有百分比，勿静默 pip */
const ESSENTIA_TF_VERSION = '2.1b6.dev1389'
const ESSENTIA_TF_SPEC = `essentia-tensorflow==${ESSENTIA_TF_VERSION}`

/** 便携 Python 3.11 + Linux x86_64 的已知轮子路径（PyPI packages/ 相对路径） */
const ESSENTIA_WHEEL_FALLBACK = {
  'linux-x64-cp311':
    'f0/5f/7283634ee1d5d195d75986adc98a2309fab2df121a4618f3826eb2073d29/essentia_tensorflow-2.1b6.dev1389-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl',
}

/**
 * essentia-tensorflow 官方只发了 Linux x86_64 与 macOS 轮子，无 Windows / Linux ARM。
 * @returns {{ ok: boolean, reason?: string }}
 */
export function getEssentiaPlatformSupport() {
  const plat = process.platform
  const arch = process.arch
  if (plat === 'linux' && arch === 'x64') return { ok: true }
  if (plat === 'darwin' && (arch === 'x64' || arch === 'arm64')) return { ok: true }
  if (plat === 'linux' && (arch === 'arm64' || arch === 'aarch64')) {
    return { ok: false, reason: '当前设备为 ARM，不支持 AI 引擎，请改用本地启发式' }
  }
  if (plat === 'win32') {
    return { ok: false, reason: 'Windows 不支持 AI 引擎，请改用本地启发式' }
  }
  return { ok: false, reason: '当前系统不支持 AI 引擎，请改用本地启发式' }
}

/** 把 pip / 系统英文错误收成简短中文，避免直接甩给用户 */
function toUserFriendlyError(err) {
  const raw = String(err?.message || err || '').trim()
  if (!raw) return '准备失败，请稍后重试'
  if (/No matching distribution|from versions:\s*none/i.test(raw)) {
    return '找不到可用安装包，当前系统可能不支持，请改用本地启发式'
  }
  if (/Could not find a version that satisfies/i.test(raw)) {
    return '找不到可用安装包，请改用本地启发式或检查网络'
  }
  if (/timed out|ETIMEDOUT|ECONNRESET|ENOTFOUND|network|Temporary failure|命令超时|无进度/i.test(raw)) {
    return '下载超时或网络异常，请稍后重试'
  }
  if (/HTTP\s*[45]\d\d/i.test(raw)) return '下载失败，请稍后重试'
  if (/找不到安装包|无匹配轮子/i.test(raw)) return '找不到可用安装包，请改用本地启发式'
  if (/tar|解压/i.test(raw)) return '解压失败，请确认系统支持 tar'
  if (/venv|虚拟环境/i.test(raw)) return '创建运行环境失败，请重试'
  if (/import essentia|essentia/i.test(raw) && /失败|Error|ModuleNotFound/i.test(raw)) {
    return '依赖安装不完整，请重新点「准备 AI」'
  }
  // 已是中文短句则原样返回；过长英文不展示
  if (/[\u4e00-\u9fff]/.test(raw)) return raw.slice(0, 80)
  return '准备失败，请稍后重试'
}

/** @type {{
 *  phase: string,
 *  progress: number,
 *  message: string,
 *  error: string,
 *  startedAt: number,
 *  finishedAt: number,
 *  log: string[],
 * }} */
let installState = {
  phase: 'idle',
  progress: 0,
  message: '',
  error: '',
  startedAt: 0,
  finishedAt: 0,
  log: [],
}

let installPromise = null

/** 与飞牛「卸载保留数据」一致：写入 CONFIG_PATH，勿放应用包内 data/（重装会被清掉） */
function persistRoot() {
  return process.env.CONFIG_PATH || path.join(process.cwd(), 'config')
}

function legacyMoodAiRoot() {
  return path.resolve(process.cwd(), 'data', 'mood-ai')
}

/** 便携 Python / venv 根目录（持久化目录） */
export function getMoodAiPaths() {
  const root = path.join(persistRoot(), 'mood-ai')
  const portableDir = path.join(root, 'python')
  const venvDir = path.join(root, 'venv')
  const pyName = process.platform === 'win32' ? 'python.exe' : 'python3'
  const portableBin = process.platform === 'win32'
    ? path.join(portableDir, 'python.exe')
    : path.join(portableDir, 'bin', 'python3')
  const venvBin = process.platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python3')
  const venvPip = process.platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'pip.exe')
    : path.join(venvDir, 'bin', 'pip')
  return { root, portableDir, venvDir, portableBin, venvBin, venvPip, pyName }
}

/** 旧版装在 cwd/data/mood-ai，迁移到 CONFIG_PATH 以便保留数据 */
export function migrateLegacyMoodAiIfNeeded() {
  const { root, venvBin, portableBin } = getMoodAiPaths()
  const legacy = legacyMoodAiRoot()
  if (!fs.existsSync(legacy)) return false
  if (fs.existsSync(venvBin) || fs.existsSync(portableBin)) return false
  try {
    if (fs.existsSync(root)) {
      try { fs.rmSync(root, { recursive: true, force: true }) } catch {}
    }
    fs.mkdirSync(path.dirname(root), { recursive: true })
    fs.renameSync(legacy, root)
    return true
  } catch {
    return false
  }
}

function pushLog(line) {
  const text = String(line || '').trim()
  if (!text) return
  installState.log = [...installState.log.slice(-60), text.slice(0, 400)]
}

function setPhase(phase, message, progress = installState.progress) {
  installState = {
    ...installState,
    phase,
    message: String(message || ''),
    progress: Math.max(0, Math.min(100, Number(progress) || 0)),
    updatedAt: Date.now(),
    error: phase === 'error' ? String(message || installState.error || '') : '',
  }
  pushLog(message)
}

export function getMoodAiInstallStatus() {
  return {
    ...installState,
    running: Boolean(installPromise),
    paths: getMoodAiPaths(),
  }
}

function pythonAsset() {
  const plat = process.platform
  const arch = process.arch
  const ver = PYTHON_VERSION
  const tag = PYTHON_STANDALONE_TAG
  if (plat === 'linux' && arch === 'x64') {
    return `cpython-${ver}+${tag}-x86_64-unknown-linux-gnu-install_only.tar.gz`
  }
  if (plat === 'linux' && (arch === 'arm64' || arch === 'aarch64')) {
    return `cpython-${ver}+${tag}-aarch64-unknown-linux-gnu-install_only.tar.gz`
  }
  if (plat === 'darwin' && arch === 'arm64') {
    return `cpython-${ver}+${tag}-aarch64-apple-darwin-install_only.tar.gz`
  }
  if (plat === 'darwin' && arch === 'x64') {
    return `cpython-${ver}+${tag}-x86_64-apple-darwin-install_only.tar.gz`
  }
  if (plat === 'win32' && arch === 'x64') {
    return `cpython-${ver}+${tag}-x86_64-pc-windows-msvc-install_only.tar.gz`
  }
  return ''
}

function pythonDownloadUrls(asset) {
  const base = `https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_STANDALONE_TAG}/${asset}`
  return [
    `https://ghfast.top/${base}`,
    `https://mirror.ghproxy.com/${base}`,
    base,
  ]
}

function runSpawn(command, args, {
  timeoutMs = 120000,
  onStdout,
  onStderr,
  env,
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: env ? { ...process.env, ...env } : process.env,
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch {}
      reject(new Error('命令超时'))
    }, timeoutMs)
    child.stdout.on('data', (d) => {
      const s = d.toString()
      stdout += s
      onStdout?.(s)
    })
    child.stderr.on('data', (d) => {
      const s = d.toString()
      stderr += s
      onStderr?.(s)
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

async function downloadToFile(url, destPath, onProgress) {
  const ctrl = new AbortController()
  const hardTimer = setTimeout(() => ctrl.abort(), INSTALL_TIMEOUT_MS)
  let stallTimer = null
  const armStall = () => {
    if (stallTimer) clearTimeout(stallTimer)
    stallTimer = setTimeout(() => {
      try { ctrl.abort() } catch {}
    }, DOWNLOAD_STALL_MS)
  }
  try {
    armStall()
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'lemon-music-mood-ai-installer/1.0' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    if (!res.body) throw new Error('空响应')
    const total = Number(res.headers.get('content-length') || 0)
    const tmp = `${destPath}.part`
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    const file = fs.createWriteStream(tmp)
    const nodeReadable = Readable.fromWeb(res.body)
    let received = 0
    nodeReadable.on('data', (chunk) => {
      received += chunk.length
      armStall()
      if (typeof onProgress === 'function') {
        onProgress({
          received,
          total,
          ratio: total > 0 ? received / total : 0,
        })
      }
    })
    await pipeline(nodeReadable, file)
    if (stallTimer) clearTimeout(stallTimer)
    // 过小则视为失败（轮子约百兆级）
    const size = fs.statSync(tmp).size
    if (total > 0 && size < total * 0.98) throw new Error('下载不完整')
    if (size < 1_000_000) throw new Error('下载文件过小')
    fs.renameSync(tmp, destPath)
    return { destPath, size, total: total || size }
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error('下载无进度超时，正在换源')
    throw e
  } finally {
    clearTimeout(hardTimer)
    if (stallTimer) clearTimeout(stallTimer)
  }
}

function formatMb(n) {
  return `${(Number(n) / (1024 * 1024)).toFixed(0)}MB`
}

function wheelKey(pyMinor) {
  const plat = process.platform
  const arch = process.arch
  if (plat === 'linux' && arch === 'x64') return `linux-x64-cp3${pyMinor}`
  if (plat === 'darwin' && arch === 'arm64') return `darwin-arm64-cp3${pyMinor}`
  if (plat === 'darwin' && arch === 'x64') return `darwin-x64-cp3${pyMinor}`
  return ''
}

function matchWheelFile(filename, pyMinor) {
  const plat = process.platform
  const arch = process.arch
  const tag = `cp3${pyMinor}-cp3${pyMinor}`
  if (!filename.includes(tag)) return false
  if (plat === 'linux' && arch === 'x64') return /manylinux.*x86_64/.test(filename)
  if (plat === 'darwin' && arch === 'arm64') return /macosx.*arm64/.test(filename)
  if (plat === 'darwin' && arch === 'x64') return /macosx.*x86_64/.test(filename)
  return false
}

async function resolveEssentiaWheelPath(pyMinor) {
  const key = wheelKey(pyMinor)
  const jsonUrls = [
    `https://pypi.tuna.tsinghua.edu.cn/pypi/essentia-tensorflow/${ESSENTIA_TF_VERSION}/json`,
    `https://mirrors.aliyun.com/pypi/pypi/essentia-tensorflow/${ESSENTIA_TF_VERSION}/json`,
    `https://pypi.org/pypi/essentia-tensorflow/${ESSENTIA_TF_VERSION}/json`,
  ]
  for (const url of jsonUrls) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 20000)
      const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' })
      clearTimeout(t)
      if (!res.ok) continue
      const data = await res.json()
      const hit = (data.urls || []).find((u) => matchWheelFile(u.filename || '', pyMinor))
      if (hit?.url) {
        const m = String(hit.url).match(/\/packages\/(.+)$/)
        if (m) return { packagePath: m[1], size: Number(hit.size) || 0, filename: hit.filename }
      }
    } catch (e) {
      pushLog(`查包失败 ${url}: ${e.message || e}`)
    }
  }
  const fb = ESSENTIA_WHEEL_FALLBACK[key]
  if (fb) return { packagePath: fb, size: 291543635, filename: path.basename(fb) }
  throw new Error('无匹配轮子')
}

function essentiaWheelDownloadUrls(packagePath) {
  return [
    `https://pypi.tuna.tsinghua.edu.cn/packages/${packagePath}`,
    `https://mirrors.aliyun.com/pypi/packages/${packagePath}`,
    `https://mirrors.cloud.tencent.com/pypi/packages/${packagePath}`,
    `https://files.pythonhosted.org/packages/${packagePath}`,
  ]
}

async function downloadEssentiaWheel(pyMinor) {
  const { root } = getMoodAiPaths()
  const meta = await resolveEssentiaWheelPath(pyMinor)
  const dest = path.join(root, 'wheels', meta.filename)
  if (fs.existsSync(dest) && fs.statSync(dest).size > 50_000_000) {
    setPhase('pip', `已有安装包 ${formatMb(fs.statSync(dest).size)}，跳过下载`, 58)
    return dest
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const urls = essentiaWheelDownloadUrls(meta.packagePath)
  let lastErr = null
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    setPhase('pip', `下载 AI 安装包（源 ${i + 1}/${urls.length}，约 ${formatMb(meta.size || 290e6)}）…`, 40)
    pushLog(`wheel: ${url}`)
    try {
      await downloadToFile(url, dest, ({ received, total, ratio }) => {
        const tot = total || meta.size || 0
        const pct = tot > 0 ? Math.round((received / tot) * 100) : Math.round(ratio * 100)
        const msg = tot > 0
          ? `下载 AI 安装包 ${formatMb(received)} / ${formatMb(tot)}（${pct}%）`
          : `下载 AI 安装包 ${formatMb(received)}…`
        setPhase('pip', msg, 40 + Math.round((pct / 100) * 22))
      })
      return dest
    } catch (e) {
      lastErr = e
      pushLog(`下载失败：${e.message || e}`)
      try { fs.unlinkSync(dest) } catch {}
      try { fs.unlinkSync(`${dest}.part`) } catch {}
    }
  }
  throw lastErr || new Error('下载安装包失败')
}

async function extractTarGz(archive, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  // 系统 tar（Linux / macOS / Win10+）
  try {
    await execFileAsync('tar', ['-xzf', archive, '-C', destDir], { timeout: 600000 })
    return
  } catch (e) {
    pushLog(`tar 解压失败，尝试 Node 流：${e.message || e}`)
  }
  // 回退：仅解压 gzip 后交给 tar（少见）
  throw new Error('无法解压，请确认系统带有 tar')
}

async function probePythonBin(bin) {
  if (!bin || !fs.existsSync(bin)) return false
  try {
    const r = await runSpawn(bin, ['-c', 'import sys; print(sys.version_info[0])'], { timeoutMs: 15000 })
    return r.code === 0 && /3/.test(r.stdout)
  } catch {
    return false
  }
}

async function findSystemPython() {
  const envBin = String(process.env.MOOD_PYTHON || process.env.PYTHON || '').trim()
  const candidates = []
  if (envBin) candidates.push(envBin)
  if (process.platform === 'win32') {
    candidates.push('py', 'python', 'python3')
  } else {
    candidates.push('python3', 'python')
    candidates.push('/usr/bin/python3', '/usr/local/bin/python3')
  }
  for (const bin of candidates) {
    const args = bin === 'py'
      ? ['-3', '-c', 'import sys; print(sys.executable)']
      : ['-c', 'import sys; print(sys.executable)']
    try {
      const r = await runSpawn(bin, args, { timeoutMs: 15000 })
      if (r.code === 0) {
        const exe = String(r.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop()
        if (exe && (await probePythonBin(exe))) return exe
        if (bin !== 'py' && await probePythonBin(bin)) return bin
      }
    } catch {}
  }
  return ''
}

async function ensurePortablePython() {
  const { root, portableDir, portableBin } = getMoodAiPaths()
  if (await probePythonBin(portableBin)) {
    setPhase('detect', `已有便携 Python：${portableBin}`, 22)
    return portableBin
  }

  const asset = pythonAsset()
  if (!asset) {
    throw new Error('当前系统无法自动下载 Python，请先安装 Python 3')
  }

  fs.mkdirSync(root, { recursive: true })
  const archive = path.join(root, asset)
  const urls = pythonDownloadUrls(asset)
  let lastErr = null
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    setPhase('download-python', `正在下载便携 Python（源 ${i + 1}/${urls.length}）…`, 8 + i * 2)
    try {
      await downloadToFile(url, archive, ({ ratio }) => {
        setPhase('download-python', `正在下载便携 Python… ${Math.round(ratio * 100)}%`, 8 + Math.round(ratio * 14))
      })
      setPhase('extract-python', '正在解压便携 Python…', 24)
      // 清理旧目录
      try { fs.rmSync(portableDir, { recursive: true, force: true }) } catch {}
      const extractTmp = path.join(root, `_py_extract_${Date.now()}`)
      fs.mkdirSync(extractTmp, { recursive: true })
      await extractTarGz(archive, extractTmp)
      // install_only 解压出 python/ 目录
      const nested = path.join(extractTmp, 'python')
      if (fs.existsSync(nested)) {
        fs.renameSync(nested, portableDir)
      } else {
        // 有的包直接摊开
        fs.renameSync(extractTmp, portableDir)
      }
      try { fs.rmSync(extractTmp, { recursive: true, force: true }) } catch {}
      try { fs.unlinkSync(archive) } catch {}
      if (!(await probePythonBin(portableBin))) {
        throw new Error('便携 Python 无法运行')
      }
      if (process.platform !== 'win32') {
        try { fs.chmodSync(portableBin, 0o755) } catch {}
      }
      return portableBin
    } catch (e) {
      lastErr = e
      pushLog(`下载/解压失败：${e.message || e}`)
      try { fs.unlinkSync(archive) } catch {}
      try { fs.unlinkSync(`${archive}.part`) } catch {}
    }
  }
  throw new Error(toUserFriendlyError(lastErr) || '下载 Python 失败，请检查网络后重试')
}

async function ensureVenv(basePython) {
  const { venvDir, venvBin } = getMoodAiPaths()
  if (await probePythonBin(venvBin)) {
    setPhase('venv', `已有虚拟环境：${venvDir}`, 32)
    return venvBin
  }
  setPhase('venv', '正在创建 Python 虚拟环境…', 28)
  fs.mkdirSync(path.dirname(venvDir), { recursive: true })
  try { fs.rmSync(venvDir, { recursive: true, force: true }) } catch {}
  const r = await runSpawn(basePython, ['-m', 'venv', venvDir], {
    timeoutMs: 180000,
    onStderr: (s) => pushLog(s),
  })
  if (r.code !== 0 || !(await probePythonBin(venvBin))) {
    throw new Error('创建运行环境失败，请重试')
  }
  return venvBin
}

async function pipInstallEssentia(venvBin) {
  const support = getEssentiaPlatformSupport()
  if (!support.ok) throw new Error(support.reason)

  let pyMinor = 11
  try {
    const ver = await runSpawn(venvBin, ['-c', 'import sys; print("%d.%d"%sys.version_info[:2])'], { timeoutMs: 15000 })
    const text = String(ver.stdout || '').trim()
    pushLog(`venv python ${text} @ ${process.platform}/${process.arch}`)
    const m = text.match(/3\.(\d+)/)
    if (m) pyMinor = Number(m[1])
  } catch {}

  setPhase('pip', '正在升级 pip…', 36)
  await runSpawn(venvBin, ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel', '-i', PIP_DEP_INDEXES[0]], {
    timeoutMs: 180000,
    onStdout: (s) => { if (/Successfully|Downloading/i.test(s)) pushLog(s.trim().slice(0, 160)) },
  }).catch(() => {})

  // 先装轻量依赖（快），再本地装大轮子（有下载进度）
  setPhase('pip', '正在安装基础依赖…', 38)
  for (const idx of PIP_DEP_INDEXES) {
    const r = await runSpawn(venvBin, [
      '-m', 'pip', 'install', 'numpy>=1.25', 'pyyaml', 'six', '-i', idx,
    ], { timeoutMs: 300000 })
    if (r.code === 0) break
  }

  let wheelPath = ''
  try {
    wheelPath = await downloadEssentiaWheel(pyMinor)
  } catch (e) {
    pushLog(`直链下载失败，回退 pip：${e.message || e}`)
  }

  if (wheelPath) {
    setPhase('pip', '正在安装 AI 引擎（本地包）…', 64)
    const r = await runSpawn(venvBin, [
      '-m', 'pip', 'install', '--no-deps', '--force-reinstall', wheelPath,
    ], {
      timeoutMs: 600000,
      onStdout: (s) => { if (/Processing|Successfully|Installing/i.test(s)) pushLog(s.trim().slice(0, 200)) },
    })
    if (r.code === 0) {
      const check = await runSpawn(venvBin, ['-c', 'import essentia, essentia.standard; print("ok")'], { timeoutMs: 60000 })
      if (check.code === 0 && /ok/.test(check.stdout)) {
        setPhase('pip', 'Essentia 安装完成', 72)
        return
      }
    }
    pushLog('本地轮子安装失败，尝试 pip 源…')
  }

  // 回退：短超时 pip，避免长时间卡在 40%
  let lastErr = new Error('安装依赖失败')
  for (let i = 0; i < PIP_DEP_INDEXES.length; i++) {
    const mirror = PIP_DEP_INDEXES[i]
    setPhase('pip', `正在通过 pip 安装（源 ${i + 1}/${PIP_DEP_INDEXES.length}）…`, 66 + i)
    pushLog(`pip index: ${mirror}`)
    try {
      const r = await runSpawn(venvBin, [
        '-m', 'pip', 'install',
        '--only-binary=:all:',
        '--prefer-binary',
        '--default-timeout', '45',
        '-i', mirror,
        ESSENTIA_TF_SPEC,
      ], {
        timeoutMs: PIP_FALLBACK_TIMEOUT_MS,
        onStdout: (s) => {
          const line = s.trim()
          if (!line) return
          if (/Downloading|Installing|Successfully|Collecting/i.test(line)) {
            pushLog(line.slice(0, 220))
            const m = line.match(/(\d+)\s*%/)
            if (m) setPhase('pip', `pip 下载中 ${m[1]}%`, 66 + Math.round(Number(m[1]) * 0.05))
          }
        },
        onStderr: (s) => {
          const line = s.trim()
          if (line && /ERROR|No matching/i.test(line)) pushLog(line.slice(0, 200))
        },
      })
      if (r.code === 0) {
        const check = await runSpawn(venvBin, ['-c', 'import essentia, essentia.standard; print("ok")'], { timeoutMs: 60000 })
        if (check.code === 0 && /ok/.test(check.stdout)) {
          setPhase('pip', 'Essentia 安装完成', 72)
          return
        }
        lastErr = new Error('依赖校验失败')
        continue
      }
      lastErr = new Error('安装依赖失败')
    } catch (e) {
      lastErr = e
      pushLog(`pip 失败：${e.message || e}`)
    }
  }

  throw new Error(toUserFriendlyError(lastErr))
}

/**
 * 解析用于预测的 Python（优先 venv）
 */
export async function resolveMoodAiPython() {
  const { venvBin, portableBin } = getMoodAiPaths()
  if (await probePythonBin(venvBin)) return venvBin
  if (await probePythonBin(portableBin)) return portableBin
  return findSystemPython()
}

/**
 * 一键向导：Python → venv → pip → 模型
 */
export async function runMoodAiPrepareWizard() {
  if (installPromise) return installPromise

  installState = {
    phase: 'prepare',
    progress: 2,
    message: '准备 AI 环境…',
    error: '',
    startedAt: Date.now(),
    finishedAt: 0,
    log: [],
  }

  installPromise = (async () => {
    try {
      migrateLegacyMoodAiIfNeeded()
      const support = getEssentiaPlatformSupport()
      if (!support.ok) throw new Error(support.reason)

      // 持久目录里已有完整 AI 环境则跳过下载
      setPhase('detect', '检测已有 AI 环境…', 5)
      {
        const existing = await probeEssentiaAi()
        if (existing.ready) {
          setPhase('done', '已复用本地 AI 环境', 100)
          installState.finishedAt = Date.now()
          return { install: getMoodAiInstallStatus(), probe: existing, models: getMoodModelsStatus() }
        }
      }

      setPhase('detect', '检测 Python…', 8)
      let basePy = await findSystemPython()
      if (basePy) {
        setPhase('detect', `已找到系统 Python：${basePy}`, 18)
      } else {
        setPhase('download-python', '未检测到系统 Python，开始下载便携版…', 8)
        basePy = await ensurePortablePython()
        setPhase('detect', `便携 Python 就绪：${basePy}`, 26)
      }

      const venvPy = await ensureVenv(basePy)
      await pipInstallEssentia(venvPy)

      setPhase('models', '正在下载 Essentia 情绪模型…', 76)
      await ensureMoodModels({
        onProgress: ({ file, index, total, progress }) => {
          const base = 76 + Math.round(((index + progress) / Math.max(1, total)) * 20)
          setPhase('models', `下载模型 ${file}… ${Math.round(progress * 100)}%`, base)
        },
      })

      setPhase('verify', '正在验证 AI 环境…', 96)
      const probe = await probeEssentiaAi()
      if (!probe.ready) {
        throw new Error(probe.hint || '环境验证未通过')
      }

      setPhase('done', 'AI 已就绪', 100)
      installState.finishedAt = Date.now()
      return { install: getMoodAiInstallStatus(), probe, models: getMoodModelsStatus() }
    } catch (e) {
      setPhase('error', toUserFriendlyError(e), installState.progress)
      installState.finishedAt = Date.now()
      throw e
    } finally {
      installPromise = null
    }
  })()

  return installPromise
}

export async function getMoodAiSetupSnapshot({ probe = false } = {}) {
  migrateLegacyMoodAiIfNeeded()
  const install = getMoodAiInstallStatus()
  const models = getMoodModelsStatus()
  const platform = getEssentiaPlatformSupport()
  const steps = [
    '装包时不下载 AI 依赖',
    '启用 AI 时再检测；已装环境保存在应用配置目录，卸载保留数据可复用',
    '缺环境时点「准备 AI」',
    '仅 Linux x86_64 / macOS 支持；ARM / Windows 请用本地启发式',
  ]

  if (!platform.ok) {
    return {
      pythonOk: false,
      essentiaOk: false,
      models,
      ready: false,
      probed: false,
      platformOk: false,
      hint: platform.reason,
      install,
      canPrepare: false,
      steps,
    }
  }

  if (!probe) {
    return {
      pythonOk: false,
      essentiaOk: false,
      models,
      ready: false,
      probed: false,
      platformOk: true,
      hint: '启用后将检测环境，缺依赖时点「准备 AI」',
      install,
      canPrepare: true,
      steps,
    }
  }

  let result = null
  try {
    result = await probeEssentiaAi()
  } catch (e) {
    result = { ready: false, hint: toUserFriendlyError(e) }
  }
  return {
    ...result,
    models: getMoodModelsStatus(),
    probed: true,
    platformOk: true,
    install,
    canPrepare: true,
    steps,
  }
}
