'use strict';
// R12: a failed session creation is not cached. getSession() drops a rejected promise from its
// cache, so the call after a failed create retries instead of failing forever.
const test = require('node:test');
const assert = require('node:assert');
const ort = require('onnxruntime-node');
const { upscale, _reset } = require('../src');

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

test('a failed CPU session creation is not cached: the next call retries and succeeds', async () => {
  const saved = { q: process.env.PUSHUP_QUALITY, d: process.env.PUSHUP_DEVICE };
  process.env.PUSHUP_QUALITY = 'fast';
  process.env.PUSHUP_DEVICE = 'cpu';
  const realCreate = ort.InferenceSession.create;
  try {
    // Reference: the same call with no stub, on a fresh session.
    _reset();
    const [expected, expectedStride] = await upscale(image(), STRIDE, 1.0);

    // Now the first create fails, later ones are real.
    _reset();
    let creates = 0;
    ort.InferenceSession.create = (p, o) => {
      creates++;
      if (creates === 1) return Promise.reject(new Error('simulated session creation failure'));
      return realCreate.call(ort.InferenceSession, p, o);
    };

    await assert.rejects(upscale(image(), STRIDE, 1.0), /simulated session creation failure/);
    assert.strictEqual(creates, 1, 'the failing call tried to create exactly one session');

    const [out, outStride] = await upscale(image(), STRIDE, 1.0);
    assert.strictEqual(creates, 2, 'the next call created a session again (the failure was not cached)');
    assert.strictEqual(outStride, expectedStride);
    assert.strictEqual(outStride, W * 3);
    assert.strictEqual(out.length, outStride * H);
    assert.ok(Buffer.from(out).equals(Buffer.from(expected)), 'output equals a run without any stub');

    // The good session is cached from here on.
    await upscale(image(), STRIDE, 1.0);
    assert.strictEqual(creates, 2, 'a successful session is cached (no further create)');
  } finally {
    ort.InferenceSession.create = realCreate;
    if (saved.q === undefined) delete process.env.PUSHUP_QUALITY; else process.env.PUSHUP_QUALITY = saved.q;
    if (saved.d === undefined) delete process.env.PUSHUP_DEVICE; else process.env.PUSHUP_DEVICE = saved.d;
    _reset();
  }
});
