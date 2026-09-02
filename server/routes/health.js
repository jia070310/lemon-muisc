import { Router } from 'express'
import { getLibraryScanStatus } from '../utils/libraryScanJob.js'
import { getDownloadQueueStats } from './download.js'
import { getMemoryGuardStatus } from '../utils/memoryGuard.js'

export const healthRouter = Router()

healthRouter.get('/', (_req, res) => {
  const mem = process.memoryUsage()
  const scan = getLibraryScanStatus()
  const downloads = getDownloadQueueStats()
  const memoryGuard = getMemoryGuardStatus()
  res.json({
    ok: true,
    uptime: Math.floor(process.uptime()),
    memory: {
      rssMB: Math.round(mem.rss / 1048576),
      heapUsedMB: Math.round(mem.heapUsed / 1048576),
      heapTotalMB: Math.round(mem.heapTotal / 1048576),
    },
    memoryGuard,
    scan: {
      running: Boolean(scan.running),
      phase: scan.phase || 'idle',
    },
    downloads,
  })
})
