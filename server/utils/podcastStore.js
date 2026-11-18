import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { getDB } from '../db.js'
import { getAppCacheSubdir } from './appPaths.js'
import { fetchPodcastFeed } from './podcastRss.js'

export function ensurePodcastTables() {
  const db = getDB()
  if (!db) return
  db.exec(`
    CREATE TABLE IF NOT EXISTS podcast_feeds (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT DEFAULT '',
      author TEXT DEFAULT '',
      description TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      site_url TEXT DEFAULT '',
      last_error TEXT DEFAULT '',
      last_fetched_at INTEGER DEFAULT 0,
      newest_pub_date INTEGER DEFAULT 0,
      unread_count INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(user_id, url)
    );
    CREATE INDEX IF NOT EXISTS idx_podcast_feeds_user ON podcast_feeds(user_id);

    CREATE TABLE IF NOT EXISTS podcast_episodes (
      id TEXT PRIMARY KEY,
      feed_id TEXT NOT NULL,
      guid TEXT NOT NULL,
      title TEXT DEFAULT '',
      description TEXT DEFAULT '',
      audio_url TEXT NOT NULL,
      duration INTEGER DEFAULT 0,
      pub_date INTEGER DEFAULT 0,
      image_url TEXT DEFAULT '',
      created_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(feed_id, guid),
      FOREIGN KEY (feed_id) REFERENCES podcast_feeds(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_podcast_episodes_feed ON podcast_episodes(feed_id, pub_date DESC);

    CREATE TABLE IF NOT EXISTS podcast_progress (
      user_id TEXT NOT NULL,
      episode_id TEXT NOT NULL,
      position_sec REAL DEFAULT 0,
      duration_sec REAL DEFAULT 0,
      completed INTEGER DEFAULT 0,
      updated_at INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (user_id, episode_id)
    );
    CREATE INDEX IF NOT EXISTS idx_podcast_progress_user ON podcast_progress(user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS podcast_favorites (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      target_id TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(user_id, kind, target_id)
    );
    CREATE INDEX IF NOT EXISTS idx_podcast_favorites_user ON podcast_favorites(user_id, created_at DESC);
  `)
  // 兼容旧库：补列
  try {
    const cols = db.prepare('PRAGMA table_info(podcast_feeds)').all().map((c) => c.name)
    if (!cols.includes('newest_pub_date')) {
      db.exec('ALTER TABLE podcast_feeds ADD COLUMN newest_pub_date INTEGER DEFAULT 0')
    }
    if (!cols.includes('unread_count')) {
      db.exec('ALTER TABLE podcast_feeds ADD COLUMN unread_count INTEGER DEFAULT 0')
    }
    if (!cols.includes('image_custom')) {
      db.exec('ALTER TABLE podcast_feeds ADD COLUMN image_custom INTEGER DEFAULT 0')
    }
  } catch {}
}

function podcastCoverDir(userId) {
  return getAppCacheSubdir(path.join('podcast-covers', String(userId || 'anon')))
}

function podcastCoverFilePath(userId, feedId, ext = '.jpg') {
  const safeExt = /^\.(jpe?g|png|webp|gif)$/i.test(ext) ? ext.toLowerCase().replace('jpeg', 'jpg') : '.jpg'
  return path.join(podcastCoverDir(userId), `${feedId}${safeExt}`)
}

export function resolvePodcastCoverFile(userId, feedId) {
  const dir = podcastCoverDir(userId)
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.gif']) {
    const fp = path.join(dir, `${feedId}${ext}`)
    try {
      if (fs.existsSync(fp)) return fp
    } catch {}
  }
  return ''
}

function removePodcastCoverFiles(userId, feedId) {
  const dir = podcastCoverDir(userId)
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.gif']) {
    try {
      fs.unlinkSync(path.join(dir, `${feedId}${ext}`))
    } catch {}
  }
}

function parseDataImage(dataUrl) {
  const m = String(dataUrl || '').match(/^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i)
  if (!m) return null
  const mime = m[1].toLowerCase()
  const buf = Buffer.from(m[2].replace(/\s+/g, ''), 'base64')
  if (!buf.length || buf.length > 6 * 1024 * 1024) return null
  const ext = mime.includes('png') ? '.png'
    : mime.includes('webp') ? '.webp'
      : mime.includes('gif') ? '.gif'
        : '.jpg'
  return { buf, ext }
}

function customCoverApiUrl(feedId) {
  return `/api/podcasts/${encodeURIComponent(feedId)}/cover?v=${Date.now()}`
}

function mapFeed(row, extra = {}) {
  if (!row) return null
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    author: row.author,
    description: row.description,
    imageUrl: row.image_url,
    imageCustom: Boolean(Number(row.image_custom) || 0),
    siteUrl: row.site_url,
    lastError: row.last_error || '',
    lastFetchedAt: row.last_fetched_at || 0,
    newestPubDate: Number(row.newest_pub_date || 0) || 0,
    unreadCount: Number(row.unread_count || 0) || 0,
    createdAt: row.created_at,
    episodeCount: extra.episodeCount ?? row.episode_count ?? 0,
    favorited: Boolean(extra.favorited ?? row.favorited),
  }
}

function mapEpisode(row, feed = null) {
  if (!row) return null
  return {
    id: row.id,
    feedId: row.feed_id,
    guid: row.guid,
    title: row.title,
    description: row.description,
    audioUrl: row.audio_url,
    duration: row.duration || 0,
    pubDate: row.pub_date || 0,
    imageUrl: row.image_url || feed?.imageUrl || '',
    feedTitle: feed?.title || row.feed_title || '',
    feedAuthor: feed?.author || row.feed_author || '',
    feedImageUrl: feed?.imageUrl || row.feed_image_url || '',
  }
}

export function episodeToTrack(ep) {
  if (!ep) return null
  const singer = ep.feedAuthor || ep.feedTitle || '播客'
  const duration = Number(ep.duration) || 0
  return {
    id: ep.id,
    key: `podcast:${ep.id}`,
    source: 'podcast',
    name: ep.title,
    singer,
    album: ep.feedTitle || '播客',
    albumName: ep.feedTitle || '播客',
    duration,
    // 与歌曲字段对齐，避免播放条只认 interval 时总时长空白
    interval: duration > 0 ? duration : '',
    picUrl: ep.imageUrl || ep.feedImageUrl || '',
    img: ep.imageUrl || ep.feedImageUrl || '',
    podcastEpisodeId: ep.id,
    podcastFeedId: ep.feedId,
  }
}

function upsertEpisodes(feedId, episodes) {
  const db = getDB()
  const exists = db.prepare('SELECT id FROM podcast_episodes WHERE feed_id = ? AND guid = ?')
  const insert = db.prepare(`
    INSERT INTO podcast_episodes (id, feed_id, guid, title, description, audio_url, duration, pub_date, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(feed_id, guid) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      audio_url = excluded.audio_url,
      duration = excluded.duration,
      pub_date = excluded.pub_date,
      image_url = excluded.image_url
  `)
  let inserted = 0
  let newestPub = 0
  const tx = db.transaction((list) => {
    for (const ep of list) {
      const pub = Number(ep.pubDate) || 0
      if (pub > newestPub) newestPub = pub
      const had = exists.get(feedId, ep.guid)
      insert.run(
        randomUUID(),
        feedId,
        ep.guid,
        ep.title,
        ep.description,
        ep.audioUrl,
        ep.duration || 0,
        pub,
        ep.imageUrl || '',
      )
      if (!had) inserted += 1
    }
  })
  tx(episodes)
  return { inserted, newestPub }
}

function updateFeedFreshness(feedId, userId, { newestPub = 0, inserted = 0 } = {}) {
  const db = getDB()
  const row = db.prepare('SELECT newest_pub_date, unread_count FROM podcast_feeds WHERE id = ? AND user_id = ?')
    .get(feedId, userId)
  if (!row) return
  const prevNewest = Number(row.newest_pub_date) || 0
  const nextNewest = Math.max(prevNewest, Number(newestPub) || 0)
  const unread = Math.max(0, (Number(row.unread_count) || 0) + (Number(inserted) || 0))
  db.prepare(`
    UPDATE podcast_feeds SET newest_pub_date = ?, unread_count = ? WHERE id = ? AND user_id = ?
  `).run(nextNewest, unread, feedId, userId)
}

export function listFeeds(userId) {
  ensurePodcastTables()
  const rows = getDB().prepare(`
    SELECT f.*, (SELECT COUNT(*) FROM podcast_episodes e WHERE e.feed_id = f.id) AS episode_count
    FROM podcast_feeds f
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
  `).all(userId)
  return rows.map((r) => mapFeed(r))
}

export function getFeed(userId, feedId) {
  ensurePodcastTables()
  const row = getDB().prepare('SELECT * FROM podcast_feeds WHERE id = ? AND user_id = ?').get(feedId, userId)
  if (!row) return null
  const episodeCount = getDB().prepare('SELECT COUNT(*) AS n FROM podcast_episodes WHERE feed_id = ?').get(feedId)?.n || 0
  return mapFeed(row, { episodeCount })
}

export function listEpisodes(userId, feedId, { page = 1, limit = 50 } = {}) {
  const feed = getFeed(userId, feedId)
  if (!feed) return null
  const lim = Math.min(100, Math.max(1, Number(limit) || 50))
  const pg = Math.max(1, Number(page) || 1)
  const offset = (pg - 1) * lim
  const total = getDB().prepare('SELECT COUNT(*) AS n FROM podcast_episodes WHERE feed_id = ?').get(feedId)?.n || 0
  const rows = getDB().prepare(`
    SELECT * FROM podcast_episodes WHERE feed_id = ?
    ORDER BY pub_date DESC, created_at DESC
    LIMIT ? OFFSET ?
  `).all(feedId, lim, offset)
  return {
    feed,
    total,
    page: pg,
    limit: lim,
    episodes: rows.map((r) => mapEpisode(r, feed)),
  }
}

export function getEpisodeForUser(userId, episodeId) {
  ensurePodcastTables()
  const row = getDB().prepare(`
    SELECT e.*, f.title AS feed_title, f.author AS feed_author, f.image_url AS feed_image_url, f.user_id
    FROM podcast_episodes e
    JOIN podcast_feeds f ON f.id = e.feed_id
    WHERE e.id = ? AND f.user_id = ?
  `).get(episodeId, userId)
  return mapEpisode(row)
}

export async function subscribeFeed(userId, url) {
  ensurePodcastTables()
  const normalized = String(url || '').trim()
  const parsed = await fetchPodcastFeed(normalized)
  const existing = getDB().prepare('SELECT id FROM podcast_feeds WHERE user_id = ? AND url = ?').get(userId, normalized)
  const id = existing?.id || randomUUID()
  getDB().prepare(`
    INSERT INTO podcast_feeds (id, user_id, url, title, author, description, image_url, site_url, last_error, last_fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', unixepoch())
    ON CONFLICT(user_id, url) DO UPDATE SET
      title = excluded.title,
      author = excluded.author,
      description = excluded.description,
      image_url = excluded.image_url,
      site_url = excluded.site_url,
      last_error = '',
      last_fetched_at = unixepoch()
  `).run(
    id,
    userId,
    normalized,
    parsed.meta.title,
    parsed.meta.author,
    parsed.meta.description,
    parsed.meta.imageUrl,
    parsed.meta.siteUrl,
  )
  const up = upsertEpisodes(id, parsed.episodes)
  // 首次订阅不把全部历史算作「未读」
  getDB().prepare(`
    UPDATE podcast_feeds SET newest_pub_date = ?, unread_count = 0 WHERE id = ? AND user_id = ?
  `).run(up.newestPub || 0, id, userId)
  return getFeed(userId, id)
}

export async function refreshFeed(userId, feedId) {
  const feed = getFeed(userId, feedId)
  if (!feed) throw new Error('订阅不存在')
  try {
    const parsed = await fetchPodcastFeed(feed.url)
    const keepCustomImage = Boolean(feed.imageCustom)
    getDB().prepare(`
      UPDATE podcast_feeds SET
        title = ?, author = ?, description = ?,
        image_url = CASE WHEN ? = 1 THEN image_url ELSE ? END,
        site_url = ?,
        last_error = '', last_fetched_at = unixepoch()
      WHERE id = ? AND user_id = ?
    `).run(
      parsed.meta.title,
      parsed.meta.author,
      parsed.meta.description,
      keepCustomImage ? 1 : 0,
      parsed.meta.imageUrl || '',
      parsed.meta.siteUrl,
      feedId,
      userId,
    )
    const up = upsertEpisodes(feedId, parsed.episodes)
    updateFeedFreshness(feedId, userId, up)
    const next = getFeed(userId, feedId)
    return { feed: next, inserted: up.inserted, newestPub: up.newestPub }
  } catch (e) {
    getDB().prepare('UPDATE podcast_feeds SET last_error = ? WHERE id = ? AND user_id = ?')
      .run(String(e.message || e).slice(0, 300), feedId, userId)
    throw e
  }
}

/**
 * 修改订阅：自定义封面、更换 RSS 链接（可选立即按新链接拉取）
 * @param {object} patch
 * @param {string} [patch.url]
 * @param {string} [patch.imageUrl]  http(s) / data:image / 空字符串清除自定义
 * @param {boolean} [patch.clearCustomImage]
 * @param {string} [patch.title]
 * @param {boolean} [patch.refetch]  url 变更时默认 true
 */
export async function updateFeed(userId, feedId, patch = {}) {
  ensurePodcastTables()
  const feed = getFeed(userId, feedId)
  if (!feed) throw new Error('订阅不存在')

  const db = getDB()
  let nextUrl = feed.url
  let nextTitle = feed.title
  let nextImage = feed.imageUrl || ''
  let nextCustom = Boolean(feed.imageCustom)
  let urlChanged = false

  if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
    const t = String(patch.title || '').trim()
    if (t) nextTitle = t.slice(0, 200)
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'url')) {
    const u = String(patch.url || '').trim()
    if (!u) throw new Error('请填写订阅链接')
    if (u !== feed.url) {
      const clash = db.prepare('SELECT id FROM podcast_feeds WHERE user_id = ? AND url = ? AND id != ?')
        .get(userId, u, feedId)
      if (clash) throw new Error('该链接已在订阅列表中')
      nextUrl = u
      urlChanged = true
    }
  }

  const clearCustom = Boolean(patch.clearCustomImage)
    || (Object.prototype.hasOwnProperty.call(patch, 'imageUrl') && String(patch.imageUrl || '').trim() === '')

  if (clearCustom) {
    removePodcastCoverFiles(userId, feedId)
    nextCustom = false
    nextImage = ''
  } else if (Object.prototype.hasOwnProperty.call(patch, 'imageUrl')) {
    const raw = String(patch.imageUrl || '').trim()
    if (/^data:image\//i.test(raw)) {
      const parsed = parseDataImage(raw)
      if (!parsed) throw new Error('封面图片无效或过大（最大 6MB）')
      removePodcastCoverFiles(userId, feedId)
      const fp = podcastCoverFilePath(userId, feedId, parsed.ext)
      fs.mkdirSync(path.dirname(fp), { recursive: true })
      fs.writeFileSync(fp, parsed.buf)
      nextImage = customCoverApiUrl(feedId)
      nextCustom = true
    } else if (/^https?:\/\//i.test(raw)) {
      removePodcastCoverFiles(userId, feedId)
      nextImage = raw.slice(0, 2000)
      nextCustom = true
    } else if (raw.startsWith('/api/podcasts/')) {
      nextImage = raw.slice(0, 500)
      nextCustom = true
    } else {
      throw new Error('封面请使用图片链接，或上传本地图片')
    }
  }

  db.prepare(`
    UPDATE podcast_feeds SET
      url = ?, title = ?, image_url = ?, image_custom = ?
    WHERE id = ? AND user_id = ?
  `).run(nextUrl, nextTitle, nextImage, nextCustom ? 1 : 0, feedId, userId)

  const shouldRefetch = urlChanged
    ? patch.refetch !== false
    : Boolean(patch.refetch)

  if (shouldRefetch) {
    try {
      return await refreshFeed(userId, feedId)
    } catch (e) {
      // 链接已改但拉取失败：保留修改，把错误记在 last_error
      const current = getFeed(userId, feedId)
      return { feed: current, inserted: 0, newestPub: 0, fetchError: String(e.message || e) }
    }
  }

  // 清除自定义封面后，若未强制刷新，尝试用当前源封面补一次
  if (clearCustom && !nextImage) {
    try {
      const parsed = await fetchPodcastFeed(nextUrl)
      const img = parsed?.meta?.imageUrl || ''
      if (img) {
        db.prepare('UPDATE podcast_feeds SET image_url = ?, image_custom = 0 WHERE id = ? AND user_id = ?')
          .run(img, feedId, userId)
      }
    } catch {}
  }

  return { feed: getFeed(userId, feedId), inserted: 0, newestPub: 0 }
}

export function unsubscribeFeed(userId, feedId) {
  ensurePodcastTables()
  const db = getDB()
  const epIds = db.prepare('SELECT id FROM podcast_episodes WHERE feed_id = ?').all(feedId).map((r) => r.id)
  const info = db.prepare('DELETE FROM podcast_feeds WHERE id = ? AND user_id = ?').run(feedId, userId)
  if (info.changes) {
    removePodcastCoverFiles(userId, feedId)
    if (epIds.length) {
      const ph = epIds.map(() => '?').join(',')
      db.prepare(`DELETE FROM podcast_progress WHERE user_id = ? AND episode_id IN (${ph})`)
        .run(userId, ...epIds)
      db.prepare(`DELETE FROM podcast_favorites WHERE user_id = ? AND kind = 'episode' AND target_id IN (${ph})`)
        .run(userId, ...epIds)
    }
    db.prepare('DELETE FROM podcast_episodes WHERE feed_id = ?').run(feedId)
    db.prepare('DELETE FROM podcast_favorites WHERE user_id = ? AND kind = ? AND target_id = ?')
      .run(userId, 'feed', feedId)
  }
  return info.changes > 0
}

export function markFeedRead(userId, feedId) {
  ensurePodcastTables()
  const info = getDB().prepare(`
    UPDATE podcast_feeds SET unread_count = 0 WHERE id = ? AND user_id = ?
  `).run(feedId, userId)
  return info.changes > 0
}

export function listUpdatedFeeds(userId, { limit = 20 } = {}) {
  ensurePodcastTables()
  const lim = Math.min(50, Math.max(1, Number(limit) || 20))
  const rows = getDB().prepare(`
    SELECT f.*, (SELECT COUNT(*) FROM podcast_episodes e WHERE e.feed_id = f.id) AS episode_count
    FROM podcast_feeds f
    WHERE f.user_id = ? AND (f.unread_count > 0 OR f.newest_pub_date > 0)
    ORDER BY
      CASE WHEN f.unread_count > 0 THEN 0 ELSE 1 END,
      f.newest_pub_date DESC,
      f.last_fetched_at DESC
    LIMIT ?
  `).all(userId, lim)
  return rows.map((r) => mapFeed(r))
}

export function upsertProgress(userId, episodeId, {
  positionSec = 0,
  durationSec = 0,
  completed = false,
  reset = false,
} = {}) {
  ensurePodcastTables()
  const ep = getEpisodeForUser(userId, episodeId)
  if (!ep) return null
  const pos = Math.max(0, Number(positionSec) || 0)
  const dur = Math.max(0, Number(durationSec) || Number(ep.duration) || 0)
  const done = completed || (dur > 30 && pos >= dur * 0.92) ? 1 : 0
  const forceReset = Boolean(reset)
  // 默认只前进不回退，避免开播 touch(0) 把已有进度抹掉；重新播放传 reset=true
  getDB().prepare(`
    INSERT INTO podcast_progress (user_id, episode_id, position_sec, duration_sec, completed, updated_at)
    VALUES (?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(user_id, episode_id) DO UPDATE SET
      position_sec = CASE
        WHEN ? = 1 THEN excluded.position_sec
        WHEN excluded.completed = 1 THEN excluded.position_sec
        WHEN excluded.position_sec > podcast_progress.position_sec THEN excluded.position_sec
        ELSE podcast_progress.position_sec
      END,
      duration_sec = CASE
        WHEN excluded.duration_sec > 0 THEN excluded.duration_sec
        ELSE podcast_progress.duration_sec
      END,
      completed = CASE
        WHEN ? = 1 THEN excluded.completed
        WHEN excluded.completed = 1 THEN 1
        ELSE podcast_progress.completed
      END,
      updated_at = unixepoch()
  `).run(userId, episodeId, pos, dur, done, forceReset ? 1 : 0, forceReset ? 1 : 0)
  try { prunePlayHistory(userId) } catch {}
  return getProgress(userId, episodeId)
}

export function getProgress(userId, episodeId) {
  ensurePodcastTables()
  const row = getDB().prepare(`
    SELECT * FROM podcast_progress WHERE user_id = ? AND episode_id = ?
  `).get(userId, episodeId)
  if (!row) return null
  return {
    episodeId: row.episode_id,
    positionSec: Number(row.position_sec) || 0,
    durationSec: Number(row.duration_sec) || 0,
    completed: Boolean(row.completed),
    updatedAt: row.updated_at || 0,
  }
}

export function listProgressMap(userId, episodeIds = []) {
  ensurePodcastTables()
  const ids = [...new Set((episodeIds || []).map(String).filter(Boolean))]
  if (!ids.length) return {}
  const placeholders = ids.map(() => '?').join(',')
  const rows = getDB().prepare(`
    SELECT * FROM podcast_progress WHERE user_id = ? AND episode_id IN (${placeholders})
  `).all(userId, ...ids)
  const out = {}
  for (const row of rows) {
    out[row.episode_id] = {
      episodeId: row.episode_id,
      positionSec: Number(row.position_sec) || 0,
      durationSec: Number(row.duration_sec) || 0,
      completed: Boolean(row.completed),
      updatedAt: row.updated_at || 0,
    }
  }
  return out
}

const PLAY_HISTORY_KEEP = 40

function mapProgressRow(r) {
  const ep = mapEpisode(r)
  const completed = Boolean(r.completed)
  return {
    ...ep,
    progress: {
      episodeId: r.id,
      positionSec: Number(r.position_sec) || 0,
      durationSec: Number(r.duration_sec) || Number(r.duration) || 0,
      completed,
      updatedAt: r.progress_updated_at || 0,
    },
    track: episodeToTrack(ep),
  }
}

/** 播放历史：最近听过的节目（含已听完），至少保留 20 条 */
export function listPlayHistory(userId, { limit = 20 } = {}) {
  ensurePodcastTables()
  const lim = Math.min(PLAY_HISTORY_KEEP, Math.max(20, Number(limit) || 20))
  const rows = getDB().prepare(`
    SELECT e.*, f.title AS feed_title, f.author AS feed_author, f.image_url AS feed_image_url,
           p.position_sec, p.duration_sec, p.completed, p.updated_at AS progress_updated_at
    FROM podcast_progress p
    JOIN podcast_episodes e ON e.id = p.episode_id
    JOIN podcast_feeds f ON f.id = e.feed_id
    WHERE p.user_id = ? AND f.user_id = ?
    ORDER BY p.updated_at DESC
    LIMIT ?
  `).all(userId, userId, lim)
  return rows.map(mapProgressRow)
}

/** @deprecated 使用 listPlayHistory；仍返回未听完且进度≥5 秒的条目 */
export function listContinueListening(userId, { limit = 20 } = {}) {
  return listPlayHistory(userId, { limit }).filter(
    (item) => !item.progress?.completed && (Number(item.progress?.positionSec) || 0) >= 5,
  )
}

function prunePlayHistory(userId) {
  const db = getDB()
  const rows = db.prepare(`
    SELECT episode_id FROM podcast_progress WHERE user_id = ? ORDER BY updated_at DESC
  `).all(userId)
  if (rows.length <= PLAY_HISTORY_KEEP) return
  const drop = rows.slice(PLAY_HISTORY_KEEP).map((r) => r.episode_id)
  if (!drop.length) return
  const ph = drop.map(() => '?').join(',')
  db.prepare(`DELETE FROM podcast_progress WHERE user_id = ? AND episode_id IN (${ph})`)
    .run(userId, ...drop)
}

export function toggleFavorite(userId, kind, targetId) {
  ensurePodcastTables()
  const k = kind === 'feed' ? 'feed' : 'episode'
  const tid = String(targetId || '').trim()
  if (!tid) throw new Error('缺少收藏目标')
  if (k === 'feed') {
    if (!getFeed(userId, tid)) throw new Error('订阅不存在')
  } else if (!getEpisodeForUser(userId, tid)) {
    throw new Error('节目不存在')
  }
  const db = getDB()
  const existing = db.prepare(`
    SELECT id FROM podcast_favorites WHERE user_id = ? AND kind = ? AND target_id = ?
  `).get(userId, k, tid)
  if (existing) {
    db.prepare('DELETE FROM podcast_favorites WHERE id = ?').run(existing.id)
    return { favorited: false, kind: k, targetId: tid }
  }
  db.prepare(`
    INSERT INTO podcast_favorites (id, user_id, kind, target_id) VALUES (?, ?, ?, ?)
  `).run(randomUUID(), userId, k, tid)
  return { favorited: true, kind: k, targetId: tid }
}

export function listFavorites(userId) {
  ensurePodcastTables()
  const db = getDB()
  const rows = db.prepare(`
    SELECT * FROM podcast_favorites WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId)
  const feeds = []
  const episodes = []
  const episodeIds = []
  for (const row of rows) {
    if (row.kind === 'feed') {
      const f = getFeed(userId, row.target_id)
      if (f) feeds.push({ ...f, favorited: true, favoritedAt: row.created_at })
    } else {
      const ep = getEpisodeForUser(userId, row.target_id)
      if (ep) {
        episodeIds.push(ep.id)
        episodes.push({
          ...ep,
          favorited: true,
          favoritedAt: row.created_at,
          track: episodeToTrack(ep),
        })
      }
    }
  }
  const progressMap = listProgressMap(userId, episodeIds)
  for (const ep of episodes) {
    ep.progress = progressMap[ep.id] || null
  }
  return { feeds, episodes }
}

export function isFavorited(userId, kind, targetId) {
  ensurePodcastTables()
  const row = getDB().prepare(`
    SELECT 1 AS ok FROM podcast_favorites WHERE user_id = ? AND kind = ? AND target_id = ?
  `).get(userId, kind === 'feed' ? 'feed' : 'episode', targetId)
  return Boolean(row)
}

/** 刷新某用户全部订阅；返回有新节目的频道 */
export async function refreshAllFeeds(userId, { concurrency = 2 } = {}) {
  ensurePodcastTables()
  const feeds = listFeeds(userId)
  const updated = []
  const errors = []
  let i = 0
  async function worker() {
    while (i < feeds.length) {
      const idx = i
      i += 1
      const f = feeds[idx]
      try {
        const res = await refreshFeed(userId, f.id)
        if (res.inserted > 0) {
          updated.push({ ...res.feed, inserted: res.inserted })
        }
      } catch (e) {
        errors.push({ feedId: f.id, title: f.title, error: String(e.message || e).slice(0, 200) })
      }
    }
  }
  const n = Math.max(1, Math.min(4, Number(concurrency) || 2))
  await Promise.all(Array.from({ length: n }, () => worker()))
  return { updated, errors, total: feeds.length }
}

/** 列出所有有订阅的用户 id（供后台自动刷新） */
export function listPodcastUserIds() {
  ensurePodcastTables()
  return getDB().prepare('SELECT DISTINCT user_id AS id FROM podcast_feeds').all().map((r) => r.id)
}
