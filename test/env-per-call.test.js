'use strict';
// R13: PUSHUP_QUALITY is read on every call, not once. With PUSHUP_DEVICE=cpu, switching the
// setting between calls in one process creates the session for the newly chosen model, and going
// back to a model that already has a session reuses it (no new create).
// The `high` model is never loaded: its create is made to reject, so the test stays cheap.
const test = require('node:test');
const assert = require('node:assert');
const ort = require('onnxruntime-node');
const { upscale, _reset, _MODES } = require('../src');

const W = 400, H = 12, STRIDE = W * 3;

function image() {
  const arr = new Uint8Array(STRIDE * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * STRIDE + x * 3;
    arr[i] = (x * 5 + y) & 255;
    arr[i + 1] = (128 + 90 * Math.sin(x / 7) * Math.cos(y / 11)) | 0;
    arr[i + 2] = (x ^ (y * 3)) & 255;
  }
  return arr;
}

test('PUSHUP_QUALITY is read per call: fast, then high, then fast again reuses the fast session', async () => {
  const saved = { q: process.env.PUSHUP_QUALITY, d: process.env.PUSHUP_DEVICE };
  process.env.PUSHUP_DEVICE = 'cpu';
  const realCreate = ort.InferenceSession.create;
  try {
    _reset();
    const created = [];
    ort.InferenceSession.create = (modelPath, options) => {
      created.push(modelPath);
      if (modelPath === _MODES.high.modelPath) return Promise.reject(new Error('high model not loaded in this test'));
      return realCreate.call(ort.InferenceSession, modelPath, options);
    };

    process.env.PUSHUP_QUALITY = 'fast';
    const [first, firstStride] = await upscale(image(), STRIDE, 1.0);
    assert.deepStrictEqual(created, [_MODES.fast.modelPath], 'fast: a session for the fast model');
    assert.strictEqual(firstStride, W * 3);
    assert.strictEqual(first.length, firstStride * H);

    // Same process, only the setting changes: the high model is chosen for this call.
    process.env.PUSHUP_QUALITY = 'high';
    await assert.rejects(upscale(image(), STRIDE, 1.0), /high model not loaded in this test/);
    assert.deepStrictEqual(created, [_MODES.fast.modelPath, _MODES.high.modelPath],
      'high: a session is requested for the high model');

    // Back to fast: the cached fast session is reused, and the output is unchanged.
    process.env.PUSHUP_QUALITY = 'fast';
    const [again, againStride] = await upscale(image(), STRIDE, 1.0);
    assert.deepStrictEqual(created, [_MODES.fast.modelPath, _MODES.high.modelPath],
      'fast again: no new create call');
    assert.strictEqual(againStride, firstStride);
    assert.ok(Buffer.from(again).equals(Buffer.from(first)), 'same bytes as the first fast call');
  } finally {
    ort.InferenceSession.create = realCreate;
    if (saved.q === undefined) delete process.env.PUSHUP_QUALITY; else process.env.PUSHUP_QUALITY = saved.q;
    if (saved.d === undefined) delete process.env.PUSHUP_DEVICE; else process.env.PUSHUP_DEVICE = saved.d;
    _reset();
  }
});
