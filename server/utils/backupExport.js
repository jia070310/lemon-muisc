import { getDB } from '../db.js'
import { listFeeds } from './podcastStore.js'

function stampDate() {
  return new Date().toISOString().slice(0, 10)
}

/** 音源脚本导出（全局 user_apis），格式与备份导入的 data.sources 兼容 */
export function buildSourcesExportPayload() {
  const rows = getDB().prepare(`
    SELECT id, name, description, author, version, homepage, script, sources
    FROM user_apis ORDER BY created_at ASC
  `).all()
  const sources = rows
    .filter((r) => String(r.script || '').trim())
    .map((r) => {
      let parsed = {}
      try {
        parsed = JSON.parse(r.sources || '{}') || {}
      } catch {
        parsed = {}
      }
      return {
        id: r.id,
        name: r.name || '',
        description: r.description || '',
        author: r.author || '',
        version: r.version || '',
        homepage: r.homepage || '',
        script: r.script,
        sources: parsed,
      }
    })
  return {
    filename: `lemon-sources-${stampDate()}.json`,
    payload: {
      app: 'lemon-music',
      type: 'sources-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { sources },
    },
  }
}

/** 单用户播客订阅导出，格式与备份导入的 data.podcastFeeds 兼容 */
export function buildPodcastExportPayload(userId) {
  const podcastFeeds = listFeeds(userId).map((f) => ({
    id: f.id,
    url: f.url,
    title: f.title || '',
    author: f.author || '',
    imageUrl: f.imageUrl || '',
    siteUrl: f.siteUrl || '',
  }))
  return {
    filename: `lemon-podcasts-${stampDate()}.json`,
    payload: {
      app: 'lemon-music',
      type: 'podcast-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { podcastFeeds },
    },
  }
}
