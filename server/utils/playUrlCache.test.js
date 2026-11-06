import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPlayUrlCacheKey,
  setCachedPlayUrl,
  getCachedPlayUrl,
  clearCachedPlayUrl,
} from './playUrlCache.js'

test('buildPlayUrlCacheKey composes source/song/quality', () => {
  assert.equal(buildPlayUrlCacheKey('kg', 'abc', '128k'), 'kg:abc:128k')
  assert.equal(buildPlayUrlCacheKey('', '', ''), '::128k')
})

test('set and get cached play url', () => {
  const key = buildPlayUrlCacheKey('kg', 'song-1', '128k')
  setCachedPlayUrl(key, '/api/play/proxy?url=test')
  assert.equal(getCachedPlayUrl(key), '/api/play/proxy?url=test')
})

test('clearCachedPlayUrl makes the next resolve refetch', () => {
  const key = buildPlayUrlCacheKey('kg', 'song-2', '128k')
  setCachedPlayUrl(key, '/api/play/proxy?url=dead-link')
  clearCachedPlayUrl(key)
  assert.equal(getCachedPlayUrl(key), '')
  assert.equal(getCachedPlayUrl('kg:song-2:128k'), '')
})

test('expired entry is evicted on read', () => {
  const key = buildPlayUrlCacheKey('kg', 'song-3', '128k')
  setCachedPlayUrl(key, '/old', -1)
  assert.equal(getCachedPlayUrl(key), '')
})
