import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isSameSongIdentity,
  dedupeSameSongs,
  findSameSongIndex,
  mergeSameSongSnapshots,
} from './sameSong.js'

test('same song across platforms merges', () => {
  const mg = { key: 'mg:1', name: '晴天', singer: '周杰伦', duration: 269, picUrl: '' }
  const wy = { key: 'wy:2', name: '晴天', singer: '周杰伦', duration: 270, picUrl: 'http://c' }
  assert.equal(isSameSongIdentity(mg, wy), true)
  assert.equal(findSameSongIndex([mg], wy), 0)
  const m = mergeSameSongSnapshots(mg, { ...wy, playedAt: 2 })
  assert.equal(m.key, 'wy:2')
  assert.equal(m.picUrl, 'http://c')
})

test('live version does not merge with original', () => {
  const a = { key: 'mg:1', name: '晴天', singer: '周杰伦', duration: 269 }
  const b = { key: 'wy:2', name: '晴天 (Live)', singer: '周杰伦', duration: 270 }
  assert.equal(isSameSongIdentity(a, b), false)
})

test('dedupeSameSongs collapses list', () => {
  const list = [
    { key: 'mg:1', name: '晴天', singer: '周杰伦', duration: 269 },
    { key: 'wy:2', name: '晴天', singer: '周杰伦', duration: 270, picUrl: 'x' },
    { key: 'kw:3', name: '七里香', singer: '周杰伦', duration: 300 },
  ]
  const out = dedupeSameSongs(list)
  assert.equal(out.length, 2)
  assert.equal(out[0].picUrl, 'x')
})
