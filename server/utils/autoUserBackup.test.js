import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { initDB, getDB } from '../db.js'
import { createUser, listUsers } from './auth.js'
import { setLibraryUserData, getLibraryUserData } from './libraryUserData.js'
import { setUserSettings } from './userSettings.js'
import {
  buildAutoBackupPayload,
  maybeAutoBackupOnUpdate,
  maybeAutoBackupAfterUserDataChange,
  shouldAutoBackup,
  getAutoBackupDecision,
  computeUserDataFingerprint,
  writeAutoBackupFile,
  pruneAutoBackupFiles,
  _resetAutoBackupStampForTests,
  MAX_AUTO_BACKUP_FILES,
  BACKUP_SUBDIR,
} from './autoUserBackup.js'
import { compareVersion } from './version.js'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lemon-backup-test-'))
const configDir = path.join(tmpRoot, 'config')
const downloadDir = path.join(tmpRoot, 'downloads')
let testerId = ''

test.before(() => {
  fs.mkdirSync(downloadDir, { recursive: true })
  initDB(configDir)
  const user = createUser({
    username: 'backup_tester',
    password: 'testpass1',
    displayName: '备份测试',
    role: 'admin',
  })
  testerId = user.id
  setLibraryUserData(user.id, {
    playlists: [{ id: 'pl1', name: '我的歌单', tracks: [{ name: '测歌', singer: '测歌手' }] }],
    favorites: [{ name: '收藏曲', singer: 'A' }],
    favoriteAlbums: [],
    favoriteArtists: [],
    recentPlays: [],
    playStats: [],
    revision: 1,
  })
  setUserSettings(user.id, { 'source.active': JSON.stringify(['src_demo']) })
  getDB().prepare(`
    INSERT INTO user_apis (id, name, description, script, author, version, homepage, sources)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'src_demo',
    '演示音源',
    'for backup test',
    '// demo script\nmodule.exports = { name: "demo" }',
    'tester',
    '0.0.1',
    '',
    JSON.stringify({ kw: { name: '酷我' } }),
  )
})

test.after(() => {
  try {
    getDB()?.close?.()
  } catch {}
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

test('compareVersion and shouldAutoBackup gate', () => {
  assert.ok(compareVersion('1.2.18', '1.2.17.16') > 0)
  _resetAutoBackupStampForTests()
  assert.equal(shouldAutoBackup('1.2.17.16', '1.2.17.16'), false)
  assert.equal(shouldAutoBackup('1.2.17.16', '1.2.18.0'), true)
  assert.equal(getAutoBackupDecision('1.2.17.16', '1.2.18.0').reason, 'version')
})

test('buildAutoBackupPayload includes sources and playlists', () => {
  const payload = buildAutoBackupPayload({
    currentVersion: '1.2.17.16',
    latestVersion: '1.2.18.0',
  })
  assert.equal(payload.app, 'lemon-music')
  assert.equal(payload.type, 'auto-upgrade-backup')
  assert.equal(payload.version, 2)
  assert.ok(payload.data.sources.some((s) => s.id === 'src_demo' && s.script.includes('demo script')))
  const u = payload.data.users.find((x) => x.username === 'backup_tester')
  assert.ok(u)
  assert.equal(u.playlists[0]?.name, '我的歌单')
  assert.equal(u.favorites.length, 1)
  assert.ok(u.settings['source.active'])
})

test('maybeAutoBackupOnUpdate writes once; content change triggers again', () => {
  _resetAutoBackupStampForTests()
  const first = maybeAutoBackupOnUpdate({
    currentVersion: '1.2.17.16',
    latestVersion: '9.9.9.9',
    downloadRoot: downloadDir,
  })
  assert.equal(first.ok, true)
  assert.equal(first.reason, 'version')
  assert.ok(fs.existsSync(first.filePath))
  assert.ok(first.filePath.includes(BACKUP_SUBDIR))
  assert.match(first.fileName, /-ver-/)

  const second = maybeAutoBackupOnUpdate({
    currentVersion: '1.2.17.16',
    latestVersion: '9.9.9.9',
    downloadRoot: downloadDir,
  })
  assert.equal(second.ok, false)
  assert.equal(second.skipped, true)
  assert.equal(second.reason, 'already-backed-up')

  // 新增歌单 → 指纹变化 → 应追加备份
  const cur = getLibraryUserData(testerId)
  setLibraryUserData(testerId, {
    ...cur,
    playlists: [
      ...(cur.playlists || []),
      { id: 'pl_new', name: '新歌单', tracks: [{ name: '新歌' }] },
    ],
    revision: (cur.revision || 0) + 1,
  })
  assert.notEqual(computeUserDataFingerprint(), first.fingerprint)

  const third = maybeAutoBackupOnUpdate({
    currentVersion: '1.2.17.16',
    latestVersion: '9.9.9.9',
    downloadRoot: downloadDir,
  })
  assert.equal(third.ok, true)
  assert.equal(third.reason, 'content-changed')
  assert.match(third.fileName, /-upd-/)
  assert.notEqual(third.filePath, first.filePath)
  const parsed = JSON.parse(fs.readFileSync(third.filePath, 'utf8'))
  assert.equal(parsed.reason, 'content-changed')
  const u = parsed.data.users.find((x) => x.username === 'backup_tester')
  assert.ok(u.playlists.some((p) => p.id === 'pl_new'))

  // 无新变化再检查应跳过
  const fourth = maybeAutoBackupOnUpdate({
    currentVersion: '1.2.17.16',
    latestVersion: '9.9.9.9',
    downloadRoot: downloadDir,
  })
  assert.equal(fourth.ok, false)
  assert.equal(fourth.reason, 'already-backed-up')
  assert.equal(getAutoBackupDecision('1.2.17.16', '9.9.9.9').reason, 'already-backed-up')

  // 新版本号仍会备份
  const fifth = maybeAutoBackupOnUpdate({
    currentVersion: '1.2.17.16',
    latestVersion: '9.9.9.10',
    downloadRoot: downloadDir,
  })
  assert.equal(fifth.ok, true)
  assert.equal(fifth.reason, 'version')
})

test('maybeAutoBackupAfterUserDataChange backs up without any new version', () => {
  _resetAutoBackupStampForTests()
  const first = maybeAutoBackupAfterUserDataChange({ downloadRoot: downloadDir })
  assert.equal(first.ok, true)
  assert.equal(first.reason, 'content-changed')
  assert.match(first.fileName, /-upd-/)

  const second = maybeAutoBackupAfterUserDataChange({ downloadRoot: downloadDir })
  assert.equal(second.ok, false)
  assert.equal(second.reason, 'already-backed-up')

  // 仅播放历史变化不触发备份
  const before = getLibraryUserData(testerId)
  setLibraryUserData(testerId, {
    ...before,
    recentPlays: [{ name: '随便听听' }],
    playStats: [...(before.playStats || []), { key: 'k1', count: 1 }],
    revision: (before.revision || 0) + 1,
  })
  const playbackOnly = maybeAutoBackupAfterUserDataChange({ downloadRoot: downloadDir })
  assert.equal(playbackOnly.ok, false)

  // 新增收藏 → 触发备份
  const mid = getLibraryUserData(testerId)
  setLibraryUserData(testerId, {
    ...mid,
    favorites: [...(mid.favorites || []), { name: '新收藏', singer: 'B' }],
    revision: (mid.revision || 0) + 1,
  })
  const third = maybeAutoBackupAfterUserDataChange({ downloadRoot: downloadDir })
  assert.equal(third.ok, true)
  assert.equal(third.reason, 'content-changed')
  const parsed = JSON.parse(fs.readFileSync(third.filePath, 'utf8'))
  assert.ok(parsed.data.users.some((u) => u.username === 'backup_tester' && u.favorites.length === 2))
})

test('pruneAutoBackupFiles keeps newest MAX_AUTO_BACKUP_FILES', () => {
  const root = path.join(tmpRoot, 'retention')
  const dir = path.join(root, BACKUP_SUBDIR)
  fs.mkdirSync(dir, { recursive: true })
  const total = MAX_AUTO_BACKUP_FILES + 5
  const baseMs = Date.now() - total * 1000
  for (let i = 0; i < total; i += 1) {
    const name = `lemon-music-backup-1.0.0-old-${String(i).padStart(2, '0')}.json`
    const filePath = path.join(dir, name)
    fs.writeFileSync(filePath, '{}', 'utf8')
    const t = new Date(baseMs + i * 1000)
    fs.utimesSync(filePath, t, t)
  }
  fs.writeFileSync(path.join(dir, 'keep-me.txt'), 'x', 'utf8')
  const removed = pruneAutoBackupFiles(dir)
  assert.equal(removed, 5)
  const left = fs.readdirSync(dir).filter((n) => /^lemon-music-backup-.*\.json$/i.test(n))
  assert.equal(left.length, MAX_AUTO_BACKUP_FILES)
  assert.ok(!left.includes('lemon-music-backup-1.0.0-old-00.json'))
  assert.ok(fs.existsSync(path.join(dir, 'keep-me.txt')))
})

test('writeAutoBackupFile creates lemon-backups subdir', () => {
  const payload = buildAutoBackupPayload({
    currentVersion: '1.0.0',
    latestVersion: '1.0.1',
  })
  const written = writeAutoBackupFile(payload, downloadDir)
  assert.ok(fs.existsSync(written.dir))
  assert.match(written.fileName, /^lemon-music-backup-/)
})

test('listUsers available for fingerprint', () => {
  assert.ok(listUsers().some((u) => u.id === testerId))
})
