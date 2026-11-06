import test from 'node:test'
import assert from 'node:assert/strict'
import { parseByteRange } from './range.js'

test('prefix range', () => {
  assert.deepEqual(parseByteRange('bytes=0-99', 1000), { start: 0, end: 99 })
  assert.deepEqual(parseByteRange('bytes=10-10', 1000), { start: 10, end: 10 })
})

test('open-ended range', () => {
  assert.deepEqual(parseByteRange('bytes=100-', 1000), { start: 100, end: 999 })
})

test('suffix range', () => {
  assert.deepEqual(parseByteRange('bytes=-100', 1000), { start: 900, end: 999 })
  assert.deepEqual(parseByteRange('bytes=-5000', 1000), { start: 0, end: 999 })
})

test('multi-range takes first segment', () => {
  assert.deepEqual(parseByteRange('bytes=0-9,20-29', 1000), { start: 0, end: 9 })
})

test('end larger than total is clamped', () => {
  assert.deepEqual(parseByteRange('bytes=990-2000', 1000), { start: 990, end: 999 })
})

test('invalid or out-of-range returns null', () => {
  assert.equal(parseByteRange('bytes=1000-', 1000), null)
  assert.equal(parseByteRange('bytes=10-5', 1000), null)
  assert.equal(parseByteRange('bytes=-0', 1000), null)
  assert.equal(parseByteRange('bytes=-', 1000), null)
  assert.equal(parseByteRange('items=0-10', 1000), null)
  assert.equal(parseByteRange('bytes=0-10', 0), null)
})
