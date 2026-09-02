/** 限制同类异步任务的最大并发数 */
export function createLimiter(max) {
  let active = 0
  const queue = []

  return function run(task) {
    return new Promise((resolve, reject) => {
      const execute = async () => {
        active++
        try {
          resolve(await task())
        } catch (e) {
          reject(e)
        } finally {
          active--
          const next = queue.shift()
          if (next) next()
        }
      }

      if (active < max) execute()
      else queue.push(execute)
    })
  }
}

export function withTimeout(promise, ms, message = '请求超时') {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer)
  })
}
