import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { initDB, getDB } from '../db.js'
import { createUser } from './auth.js'
import { restorePodcastFeeds } from './autoUserBackup.js'
import { buildSourcesExportPayload, buildPodcastExportPayload } from './backupExport.js'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lemon-export-test-'))
const configDir = path.join(tmpRoot, 'config')
let userA = null
let userB = null
let userC = null

test.before(() => {
  initDB(configDir)
  userA = createUser({ username: 'export_user_a', password: 'testpass1', displayName: 'A', role: 'admin' })
  userB = createUser({ username: 'export_user_b', password: 'testpass1', displayName: 'B', role: 'user' })
  userC = createUser({ username: 'export_user_c', password: 'testpass1', displayName: 'C', role: 'user' })

  const insert = getDB().prepare(`
    INSERT INTO user_apis (id, name, description, script, author, version, homepage, sources, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  insert.run(
    'src_one', '音源一', 'desc', '// script one', '作者一', '1.0.0', 'https://one.example', '{"kw":{"name":"酷我"}}', 1,
  )
  insert.run(
    'src_two', '音源二', '', '// script two', '', '2.0.0', '', 'not-json', 2,
  )
  insert.run(
    'src_empty', '空脚本音源', '', '   ', '', '', '', '{}', 3,
  )

  restorePodcastFeeds(userA.id, [
    { url: 'https://a.example/feed.xml', title: 'A 播客', author: '作者 A', imageUrl: 'https://a.example/i.png', siteUrl: 'https://a.example' },
    { url: 'https://a.example/second.xml', title: 'A 播客二', author: '', imageUrl: '', siteUrl: '' },
    { url: 'not-a-url', title: '坏订阅' },
  ])
  restorePodcastFeeds(userB.id, [
    { url: 'https://b.example/feed.xml', title: 'B 播客', author: '作者 B', imageUrl: '', siteUrl: '' },
  ])
})

test.after(() => {
  try {
    getDB()?.close?.()
  } catch {}
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

test('buildSourcesExportPayload 只导出有脚本的音源并解析 sources', () => {
  const { payload } = buildSourcesExportPayload()
  const sources = payload.data.sources
  assert.equal(sources.length, 2)
  assert.deepEqual(sources.map((s) => s.id), ['src_one', 'src_two'])

  const one = sources.find((s) => s.id === 'src_one')
  assert.equal(one.name, '音源一')
  assert.equal(one.description, 'desc')
  assert.equal(one.author, '作者一')
  assert.equal(one.version, '1.0.0')
  assert.equal(one.homepage, 'https://one.example')
  assert.equal(one.script, '// script one')
  assert.deepEqual(one.sources, { kw: { name: '酷我' } })

  // sources 字段不是合法 JSON 时降级为空对象，避免导出失败
  const two = sources.find((s) => s.id === 'src_two')
  assert.deepEqual(two.sources, {})
  assert.equal(two.script, '// script two')
})

test('buildSourcesExportPayload 文件名与备份标识正确', () => {
  const { filename, payload } = buildSourcesExportPayload()
  assert.match(filename, /^lemon-sources-\d{4}-\d{2}-\d{2}\.json$/)
  assert.equal(payload.app, 'lemon-music')
  assert.equal(payload.type, 'sources-backup')
  assert.equal(payload.version, 1)
  assert.ok(Array.isArray(payload.data.sources))
  assert.ok(payload.exportedAt)
})

test('buildPodcastExportPayload 只导出当前用户的订阅', () => {
  const { payload } = buildPodcastExportPayload(userA.id)
  const feeds = payload.data.podcastFeeds
  // 非法 URL 在恢复阶段已被跳过，导出时不会再出现
  assert.equal(feeds.length, 2)
  assert.deepEqual(feeds.map((f) => f.url).sort(), [
    'https://a.example/feed.xml',
    'https://a.example/second.xml',
  ])

  const first = feeds.find((f) => f.url === 'https://a.example/feed.xml')
  assert.equal(first.title, 'A 播客')
  assert.equal(first.author, '作者 A')
  assert.equal(first.imageUrl, 'https://a.example/i.png')
  assert.equal(first.siteUrl, 'https://a.example')
  assert.ok(first.id)

  // 不含其他用户的订阅，也不含剧集数据（仅订阅元数据）
  assert.ok(!feeds.some((f) => f.url === 'https://b.example/feed.xml'))
  assert.deepEqual(
    Object.keys(first).sort(),
    ['author', 'id', 'imageUrl', 'siteUrl', 'title', 'url'],
  )
})

test('buildPodcastExportPayload 无订阅时导出空数组', () => {
  const { filename, payload } = buildPodcastExportPayload(userC.id)
  assert.match(filename, /^lemon-podcasts-\d{4}-\d{2}-\d{2}\.json$/)
  assert.equal(payload.type, 'podcast-backup')
  assert.deepEqual(payload.data.podcastFeeds, [])
})

test('导出结果 JSON 序列化后仍可被导入识别', () => {
  const sourcesExport = buildSourcesExportPayload().payload
  const podcastsExport = buildPodcastExportPayload(userA.id).payload
  const roundTripSources = JSON.parse(JSON.stringify(sourcesExport))
  const roundTripPodcasts = JSON.parse(JSON.stringify(podcastsExport))

  // backup/import 的 v1 分支读取 data.sources / data.podcastFeeds
  assert.ok(Array.isArray(roundTripSources.data.sources))
  assert.ok(roundTripSources.data.sources.length > 0)
  assert.equal(roundTripSources.data.sources[0].script, '// script one')

  assert.ok(Array.isArray(roundTripPodcasts.data.podcastFeeds))
  assert.equal(roundTripPodcasts.data.podcastFeeds.length, 2)
})
