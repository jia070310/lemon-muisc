import fs from 'fs'
import {
  listMoodAnalyzePending,
  getMoodAnalyzeStats,
  updateMoodResult,
} from './libraryCache.js'
import { analyzeTrackMood, MOOD_ALGO_VERSION } from './moodAnalyze.js'
import { getLibraryScanStatus } from './libraryScanJob.js'
import {
  notifyLibraryMoodProgress,
  notifyLibraryMoodComplete,
} from './libraryNotify.js'

const CONCURRENCY = 1

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
  const stats = getMoodAnalyzeStats({ algoVersion: MOOD_ALGO_VERSION })
  return {
    ...moodState,
    algoVersion: MOOD_ALGO_VERSION,
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
    algoVersion: MOOD_ALGO_VERSION,
    ...extra,
  })
}

async function analyzeOne(item) {
  const filePath = item.filePath
  let fileMtime = item.mtime || 0
  try {
    const st = fs.statSync(filePath)
    fileMtime = st.mtimeMs || fileMtime
  } catch {
    updateMoodResult(filePath, {
      status: 'error',
      version: MOOD_ALGO_VERSION,
      fileMtime,
    })
    return 'error'
  }

  const result = await analyzeTrackMood(filePath)
  updateMoodResult(filePath, {
    status: result.status,
    valence: result.valence,
    arousal: result.arousal,
    bpm: result.bpm,
    version: MOOD_ALGO_VERSION,
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

    const pending = listMoodAnalyzePending({ algoVersion: MOOD_ALGO_VERSION })
    moodState.total = pending.length
    moodState.current = 0
    moodState.analyzed = 0
    moodState.skipped = 0
    moodState.error = 0
    moodState.phase = 'analyze'
    emitProgress({ text: pending.length ? `分析 0/${pending.length}` : '无需分析' })

    if (!pending.length || abortRequested) {
      moodState.phase = abortRequested ? 'idle' : 'done'
      moodState.running = false
      moodState.finishedAt = Date.now()
      emitProgress()
      notifyLibraryMoodComplete({
        ...getMoodAnalyzeStats({ algoVersion: MOOD_ALGO_VERSION }),
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
      await new Promise((resolve) => setImmediate(resolve))
    }

    moodState.phase = abortRequested ? 'idle' : 'done'
    moodState.running = false
    moodState.finishedAt = Date.now()
    emitProgress()
    notifyLibraryMoodComplete({
      ...getMoodAnalyzeStats({ algoVersion: MOOD_ALGO_VERSION }),
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
 */
export function startMoodAnalyzeJob({ force = false } = {}) {
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
