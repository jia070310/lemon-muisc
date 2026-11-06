import test from 'node:test'
import assert from 'node:assert/strict'
import { isImageBuffer, detectImageMime } from './fetchPic.js'

function pad(head, size = 1024) {
  const buf = Buffer.from(head)
  if (buf.length >= size) return buf
  return Buffer.concat([buf, Buffer.alloc(size - buf.length)])
}

const jpeg = pad([0xff, 0xd8, 0xff, 0xe0])
const png = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const gif = pad([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(2048)])
const bmp = pad([0x42, 0x4d])
const html = Buffer.from('<html><body>403 Forbidden</body></html>'.repeat(80))

test('accepts common image magic bytes', () => {
  assert.equal(isImageBuffer(jpeg), true)
  assert.equal(isImageBuffer(png), true)
  assert.equal(isImageBuffer(gif), true)
  assert.equal(isImageBuffer(webp), true)
  assert.equal(isImageBuffer(bmp), true)
})

test('rejects HTML error pages and tiny or empty buffers', () => {
  assert.equal(isImageBuffer(html), false)
  assert.equal(isImageBuffer(Buffer.from([0xff, 0xd8, 0xff])), false)
  assert.equal(isImageBuffer(Buffer.alloc(0)), false)
  assert.equal(isImageBuffer(null), false)
})

test('detectImageMime keeps existing behavior', () => {
  assert.equal(detectImageMime(jpeg), 'image/jpeg')
  assert.equal(detectImageMime(png), 'image/png')
  assert.equal(detectImageMime(gif), 'image/gif')
  assert.equal(detectImageMime(webp), 'image/webp')
  // 无法识别时保持原有默认值
  assert.equal(detectImageMime(html), 'image/jpeg')
})
