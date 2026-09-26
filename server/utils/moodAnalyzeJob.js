import fs from 'fs'
import {
  listMoodAnalyzePending,
  getMoodAnalyzeStats,
  updateMoodResult,
  recalibrateMoodPercentiles,
} from './libraryCache.js'
import {
  analyzeTrackMood,
  getActiveMoodAlgoVersion,
  getMoodAnalyzer,
  setMoodAnalyzerOverride,
  MOOD_HEURISTIC_VERSION,
} from './moodAnalyze.js'
import { getLibraryScanStatus } from './libraryScanJob.js'
import {
  notifyLibraryMoodProgress,
  notifyLibraryMoodComplete,
} from './libraryNotify.js'

const CONCURRENCY = 1
/** 每分析多少首做一次库内百分位重标定（启发式） */
const CALIBRATE_EVERY = 25

/** @type {{ running: boolean, phase: string, current: number, total: number, analyzed: number, skipped: number, error: number, errorMsg: string, startedAt: number, finishedAt: number }} */
let moodState = {
  running: false,
  phase: 'idle',
  current: 0,
  total: 0,
  analyzed: 0,
  skipped: 0,
  error: 0,
  errorMsg: '',
  startedAt: 0,
  finishedAt: 0,
}

let jobPromise = null
let abortRequested = false

export function getMoodAnalyzeStatus() {
  const algoVersion = getActiveMoodAlgoVersion()
  const stats = getMoodAnalyzeStats({ algoVersion })
  return {
    ...moodState,
    algoVersion,
    library: stats,
  }
}

function emitProgress(extra = {}) {
  notifyLibraryMoodProgress({
    phase: moodState.phase,
    current: moodState.current,
    total: moodState.total,
    analyzed: moodState.analyzed,
    skipped: moodState.skipped,
    error: moodState.error,
    running: moodState.running,
    errorMsg: moodState.errorMsg || '',
    algoVersion: getActiveMoodAlgoVersion(),
    ...extra,
  })
}

function maybeCalibrateHeuristic(force = false) {
  if (getMoodAnalyzer() !== 'heuristic') return
  if (!force && moodState.analyzed > 0 && moodState.analyzed % CALIBRATE_EVERY !== 0) return
  try {
    const { updated } = recalibrateMoodPercentiles({ version: MOOD_HEURISTIC_VERSION })
    if (updated > 0) {
      emitProgress({ text: `相对标定 ${updated} 首`, calibrated: updated })
    }
  } catch {
    // 标定失败不阻断分析
  }
}

async function analyzeOne(item) {
  const filePath = item.filePath
  let fileMtime = item.mtime || 0
  const algoVersion = getActiveMoodAlgoVersion()
  try {
    const st = fs.statSync(filePath)
    fileMtime = st.mtimeMs || fileMtime
  } catch {
    updateMoodResult(filePath, {
      status: 'error',
      version: algoVersion,
      fileMtime,
    })
    return 'error'
  }

  const result = await analyzeTrackMood(filePath)
  updateMoodResult(filePath, {
    status: result.status,
    valence: result.valence,
    arousal: result.arousal,
    rawValence: result.rawValence ?? result.valence,
    rawArousal: result.rawArousal ?? result.arousal,
    bpm: result.bpm,
    version: result.version || algoVersion,
    fileMtime,
  })
  if (result.status === 'ok') return 'ok'
  if (result.status === 'skipped') return 'skipped'
  return 'error'
}

async function runMoodJob() {
  try {
    moodState.phase = 'prepare'
    moodState.errorMsg = ''
    emitProgress({ text: '准备分析队列' })

    const algoVersion = getActiveMoodAlgoVersion()
    const pending = listMoodAnalyzePending({ algoVersion })
    moodState.total = pending.length
    moodState.current = 0
    moodState.analyzed = 0
    moodState.skipped = 0
    moodState.error = 0
    moodState.phase = 'analyze'
    emitProgress({ text: pending.length ? `分析 0/${pending.length}` : '无需分析' })

    if (!pending.length || abortRequested) {
      if (!abortRequested && getMoodAnalyzer() === 'heuristic') {
        moodState.phase = 'calibrate'
        maybeCalibrateHeuristic(true)
      }
      moodState.phase = abortRequested ? 'idle' : 'done'
      moodState.running = false
      moodState.finishedAt = Date.now()
      emitProgress()
      notifyLibraryMoodComplete({
        ...getMoodAnalyzeStats({ algoVersion }),
        aborted: abortRequested,
      })
      return
    }

    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      if (abortRequested) break
      const batch = pending.slice(i, i + CONCURRENCY)
      const results = await Promise.all(batch.map((item) => analyzeOne(item)))
      for (const r of results) {
        if (r === 'ok') moodState.analyzed += 1
        else if (r === 'skipped') moodState.skipped += 1
        else moodState.error += 1
      }
      moodState.current = Math.min(i + batch.length, pending.length)
      emitProgress({ text: `分析 ${moodState.current}/${pending.length}` })
      maybeCalibrateHeuristic(false)
      await new Promise((resolve) => setImmediate(resolve))
    }

    if (!abortRequested && getMoodAnalyzer() === 'heuristic') {
      moodState.phase = 'calibrate'
      emitProgress({ text: '正在按曲库相对分布标定…' })
      maybeCalibrateHeuristic(true)
    }

    moodState.phase = abortRequested ? 'idle' : 'done'
    moodState.running = false
    moodState.finishedAt = Date.now()
    emitProgress()
    notifyLibraryMoodComplete({
      ...getMoodAnalyzeStats({ algoVersion: getActiveMoodAlgoVersion() }),
      analyzedNow: moodState.analyzed,
      skippedNow: moodState.skipped,
      errorNow: moodState.error,
      aborted: abortRequested,
    })
  } catch (e) {
    moodState.phase = 'error'
    moodState.errorMsg = e.message || '情绪分析失败'
    moodState.running = false
    moodState.finishedAt = Date.now()
    emitProgress()
  }
}

/**
 * 启动本地情绪分析（与曲库扫描互斥）
 * @param {{ force?: boolean, analyzer?: string }} opts
 */
export function startMoodAnalyzeJob({ force = false, analyzer } = {}) {
  const scan = getLibraryScanStatus()
  if (scan.running) {
    return {
      ...getMoodAnalyzeStatus(),
      blocked: true,
      errorMsg: '曲库正在扫描，请稍后再分析情绪',
    }
  }

  if (moodState.running) {
    if (!force) return getMoodAnalyzeStatus()
    abortRequested = true
  }

  if (analyzer != null) setMoodAnalyzerOverride(analyzer)

  abortRequested = false
  moodState = {
    running: true,
    phase: 'prepare',
    current: 0,
    total: 0,
    analyzed: 0,
    skipped: 0,
    error: 0,
    errorMsg: '',
    startedAt: Date.now(),
    finishedAt: 0,
  }

  jobPromise = runMoodJob().finally(() => {
    jobPromise = null
    abortRequested = false
  })

  return getMoodAnalyzeStatus()
}

export function stopMoodAnalyzeJob() {
  if (!moodState.running) return getMoodAnalyzeStatus()
  abortRequested = true
  return getMoodAnalyzeStatus()
}

export function waitForMoodAnalyzeJob() {
  return jobPromise || Promise.resolve()
}

let autoTimer = null
let autoScheduled = false

/**
 * 新文件入库后自动补情绪分析（防抖）。
 * 仅处理未分析 / 失败 / 已改文件；不因算法版本整库重跑。
 */
export function scheduleMoodAutoAnalyze({ delayMs = 2500 } = {}) {
  autoScheduled = true
  if (autoTimer) clearTimeout(autoTimer)
  autoTimer = setTimeout(() => {
    autoTimer = null
    runMoodAutoAnalyze().catch((e) => {
      console.warn('[mood-auto]', e?.message || e)
    })
  }, Math.max(500, Number(delayMs) || 2500))
  if (typeof autoTimer.unref === 'function') autoTimer.unref()
}

async function runMoodAutoAnalyze() {
  if (!autoScheduled && !listMoodAnalyzePending({}).length) return
  autoScheduled = false

  if (getLibraryScanStatus().running) {
    scheduleMoodAutoAnalyze({ delayMs: 5000 })
    return
  }
  if (moodState.running) return

  const pending = listMoodAnalyzePending({})
  if (!pending.length) return

  let analyzer = getMoodAnalyzer()
  if (analyzer === 'essentia') {
    try {
      const { probeEssentiaAi } = await import('./moodAiEssentia.js')
      const probe = await probeEssentiaAi()
      if (!probe.ready) analyzer = 'heuristic'
    } catch {
      analyzer = 'heuristic'
    }
  }

  startMoodAnalyzeJob({ analyzer })
}
