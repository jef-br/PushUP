'use strict';
// Q1: calls are serialised through one queue; a failure inside the queue must not poison it.
// Sessions are wrapped (no change to src/) so the test can see and fail individual inferences.
const test = require('node:test');
const assert = require('node:assert');
const ort = require('onnxruntime-node');
const pushup = require('../src');

const { _reset } = pushup;
const W = 400, H = 300;

// Flat-ish image whose first pixel (and thus first model input value) identifies the call.
function image(tag) {
  const arr = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    arr[i] = (x + y + tag) & 255;
    arr[i + 1] = (x * 2) & 255;
    arr[i + 2] = (y * 3) & 255;
  }
  arr[0] = tag; arr[1] = 10; arr[2] = 10;
  return arr;
}

// Wrap every session created while `hook` is installed. `onRun(feeds, real)` runs in place of session.run.
async function withSessionHook(onRun, fn) {
  const saved = { q: process.env.PUSHUP_QUALITY, d: process.env.PUSHUP_DEVICE };
  process.env.PUSHUP_QUALITY = 'fast';
  process.env.PUSHUP_DEVICE = 'cpu';
  _reset();
  const realCreate = ort.InferenceSession.create;
  ort.InferenceSession.create = async (...args) => {
    const real = await realCreate.apply(ort.InferenceSession, args);
    return {
      inputNames: real.inputNames,
      outputNames: real.outputNames,
      run: (feeds) => onRun(feeds, () => real.run(feeds)),
    };
  };
  try { await fn(); } finally {
    ort.InferenceSession.create = realCreate;
    if (saved.q === undefined) delete process.env.PUSHUP_QUALITY; else process.env.PUSHUP_QUALITY = saved.q;
    if (saved.d === undefined) delete process.env.PUSHUP_DEVICE; else process.env.PUSHUP_DEVICE = saved.d;
    _reset();
  }
}

test('an inference that fails inside the queue does not poison later calls', async () => {
  let runs = 0;
  await withSessionHook(
    (feeds, real) => { if (++runs === 1) throw new Error('boom'); return real(); },
    async () => {
      const a = pushup.upscale(image(1), W * 3, 1);
      const b = pushup.upscale(image(2), W * 3, 1); // queued behind the failing call
      await assert.rejects(a, /boom/);
      const [out, stride] = await b;
      assert.strictEqual(stride, W * 3);
      assert.strictEqual(out.length, W * H * 3);
      // And a call started after the failure has settled works too.
      const [out2] = await pushup.upscale(image(3), W * 3, 1);
      assert.strictEqual(out2.length, W * H * 3);
      assert.strictEqual(runs, 3);
    },
  );
});

test('calls run one at a time, in the order they were made', async () => {
  let active = 0, maxActive = 0;
  const order = [];
  await withSessionHook(
    async (feeds, real) => {
      active++; maxActive = Math.max(maxActive, active);
      const t = Object.values(feeds)[0];
      order.push(Math.round(t.data[0] * 255)); // first pixel's red value = call tag
      try { return await real(); } finally { active--; }
    },
    async () => {
      const tags = [21, 22, 23];
      const results = await Promise.all(tags.map((t) => pushup.upscale(image(t), W * 3, 1)));
      assert.strictEqual(results.length, 3);
      assert.strictEqual(maxActive, 1, 'inferences must not overlap');
      assert.deepStrictEqual(order, tags);
    },
  );
});
