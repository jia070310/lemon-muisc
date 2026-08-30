/** 限制并发执行任务，避免批量读标签时压垮 NAS/磁盘 IO */
export async function mapWithConcurrency(items, limit, mapper) {
  if (!items.length) return []
  const concurrency = Math.max(1, Math.min(limit, items.length))
  const results = new Array(items.length)
  let next = 0

  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await mapper(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}
