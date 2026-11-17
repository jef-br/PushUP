'use strict';
// CV1: the two src/index.js branches no other test reaches (lcov, 2026-11-17):
//  (1) `_run` called without a factor (default 1.0; `upscale` always passes one);
//  (2) the 4x model output already has the target size, so no Lanczos resize follows. That happens
//      only when `modelInputMax` shrinks the model input: 400x400, factor 2.5 -> target 1000, model
//      sees 250x250 (modelMax = max(ceil(1000/4), min(400, 250)) = 250), 4x of that is exactly 1000.
//      The height only matches when 0.625 * N is an integer, hence 400x400 (N a multiple of 8).
process.env.PUSHUP_QUALITY = 'fast';
process.env.PUSHUP_DEVICE = 'cpu';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const sharp = require('sharp');
const ort = require('onnxruntime-node');
const pushup = require('../src');

const pattern = (n) => Uint8Array.from({ length: n }, (_, i) => ((i * 7) ^ (i >> 5)) & 255);

test('_run without a factor uses 1.0 and equals upscale(arr, stride)', async () => {
  const arr = pattern(400 * 4 * 3);
  const [a, sa] = await pushup._run(arr, 400 * 3);
  const [b, sb] = await pushup.upscale(arr, 400 * 3);
  assert.strictEqual(sa, 400 * 3);
  assert.strictEqual(a.length, 400 * 4 * 3);
  assert.strictEqual(sa, sb);
  assert.ok(Buffer.compare(a, b) === 0);
});

test('model output already at target size is returned as is (no resize step)', async () => {
  const W = 400, H = 400;
  const arr = pattern(W * H * 3);
  const [out, stride] = await pushup._run(arr, W * 3, 2.5, { modelInputMax: 250, lanczosMix: 0 });
  assert.strictEqual(stride, 1000 * 3);
  assert.strictEqual(out.length, 1000 * 1000 * 3);

  // Independent reference: shrink to 250x250 with sharp, run the shipped model, copy the 1000x1000 output.
  const small = await sharp(Buffer.from(arr), { raw: { width: W, height: H, channels: 3 } })
    .resize(250, 250, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
  const session = await ort.InferenceSession.create(path.join(__dirname, '..', 'models', '4xLSDIRCompactC3.onnx'));
  const res = await session.run({ [session.inputNames[0]]: pushup._toTensor(small, 250, 0, 0, 250, 250) });
  const t = res[session.outputNames[0]];
  assert.deepStrictEqual(t.dims.slice(2), [1000, 1000]);
  const ref = Buffer.alloc(1000 * 1000 * 3);
  pushup._copyFromTensor(t, 0, 0, 1000, 1000, ref, 1000, 0, 0);
  assert.ok(Buffer.compare(out, ref) === 0, 'output differs from the model output');
});
