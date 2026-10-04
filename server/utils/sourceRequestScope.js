import { AsyncLocalStorage } from 'async_hooks'

/** 当前取链周期内的 HTTP 取消函数（超时后一并 abort） */
const sourceRequestScope = new AsyncLocalStorage()

export function runWithSourceAborts(aborts, fn) {
  return sourceRequestScope.run(aborts, fn)
}

export function trackSourceAbort(fn) {
  const bag = sourceRequestScope.getStore()
  if (Array.isArray(bag) && typeof fn === 'function') bag.push(fn)
}

export function abortTrackedSourceRequests() {
  const bag = sourceRequestScope.getStore()
  if (!Array.isArray(bag)) return
  for (const abort of bag) {
    try { abort() } catch {}
  }
  bag.length = 0
}
