'use strict';
// R10: a call rejected before the queue (bad size, bad stride) must not disturb valid calls
// queued around it, and the queue keeps working afterwards.
const test = require('node:test');
const assert = require('node:assert');
const { upscale, _reset } = require('../src');

// Thin images (short side 12) keep the `fast` model cheap.
function image(w, h, tag) {
  const arr = new Uint8Array(w * h * 3);
  for (let i = 0; i < arr.length; i++) arr[i] = (i * 7 + tag * 31 + ((i / 3 / w) | 0) * 13) & 255;
  return arr;
}

async function withFast(fn) {
  const saved = { q: process.env.PUSHUP_QUALITY, d: process.env.PUSHUP_DEVICE };
  process.env.PUSHUP_QUALITY = 'fast';
  process.env.PUSHUP_DEVICE = 'cpu';
  _reset();
  try { await fn(); } finally {
    if (saved.q === undefined) delete process.env.PUSHUP_QUALITY; else process.env.PUSHUP_QUALITY = saved.q;
    if (saved.d === undefined) delete process.env.PUSHUP_DEVICE; else process.env.PUSHUP_DEVICE = saved.d;
    _reset();
  }
}

const same = (a, b) => Buffer.from(a).equals(Buffer.from(b));

async function checkBatch(invalidCall, errorClass, label) {
  const a = { w: 400, h: 12, tag: 1 }, c = { w: 500, h: 12, tag: 3 };
  const inA = image(a.w, a.h, a.tag), inC = image(c.w, c.h, c.tag);
  const settled = await Promise.allSettled([
    upscale(inA, a.w * 3, 1.0),
    invalidCall(),
    upscale(inC, c.w * 3, 1.0),
  ]);
  assert.strictEqual(settled[0].status, 'fulfilled', `${label}: first call`);
  assert.strictEqual(settled[1].status, 'rejected', `${label}: invalid call`);
  assert.ok(settled[1].reason instanceof errorClass, `${label}: expected ${errorClass.name}, got ${settled[1].reason}`);
  assert.strictEqual(settled[2].status, 'fulfilled', `${label}: last call`);

  for (const [i, { w, h }, input] of [[0, a, inA], [2, c, inC]]) {
    const [out, stride] = settled[i].value;
    assert.strictEqual(stride, w * 3, `${label}: call ${i} stride_out`);
    assert.strictEqual(out.length, stride * h, `${label}: call ${i} output length`);
    const [solo, soloStride] = await upscale(input, w * 3, 1.0);
    assert.strictEqual(soloStride, stride);
    assert.ok(same(out, solo), `${label}: call ${i} differs from the same call made alone`);
  }
  // The queue still works after the rejection.
  const [again] = await upscale(inA, a.w * 3, 1.0);
  assert.ok(same(again, settled[0].value[0]), `${label}: a later call gives the same bytes`);
}

test('a call with a too-small largest side (RangeError) in the middle of a batch rejects alone', () =>
  withFast(() => checkBatch(() => upscale(image(399, 12, 2), 399 * 3, 1.0), RangeError, 'size 399')));

test('a call with a non-integer stride (TypeError) in the middle of a batch rejects alone', () =>
  withFast(() => checkBatch(() => upscale(image(400, 12, 2), 1.5, 1.0), TypeError, 'stride 1.5')));

test('a call with upscale_factor 0 (RangeError) in the middle of a batch rejects alone', () =>
  withFast(() => checkBatch(() => upscale(image(400, 12, 2), 400 * 3, 0), RangeError, 'factor 0')));

test('a call with a string instead of a byte array (TypeError) in the middle of a batch rejects alone', () =>
  withFast(() => checkBatch(() => upscale('not bytes', 400 * 3, 1.0), TypeError, 'arr string')));
