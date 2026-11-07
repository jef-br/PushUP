'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { upscale } = require('../src');

// Smooth synthetic RGB image with row padding support.
function makeImage(w, h, pad = 0) {
  const stride = w * 3 + pad;
  const arr = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * stride + x * 3;
    arr[i] = (x * 255) / w;
    arr[i + 1] = (y * 255) / h;
    arr[i + 2] = 128 + 100 * Math.sin(x / 15) * Math.cos(y / 20);
  }
  return { arr, stride };
}

async function outSize(w, h, factor) {
  const { arr, stride } = makeImage(w, h);
  const [out, strideOut] = await upscale(arr, stride, factor);
  assert.strictEqual(strideOut % 3, 0);
  const ow = strideOut / 3;
  assert.strictEqual(out.length % strideOut, 0);
  return [ow, out.length / strideOut];
}

test('default factor 1.0 keeps the size', async () => {
  assert.deepStrictEqual(await outSize(800, 600), [800, 600]);
});

test('factor scales the input, capped at 1000px', async () => {
  assert.deepStrictEqual(await outSize(800, 600, 1.5), [1000, 750]); // 1200 -> clamped
  assert.deepStrictEqual(await outSize(300, 400, 1.5), [450, 600]);
  assert.deepStrictEqual(await outSize(400, 300, 2.5), [1000, 750]);
  assert.deepStrictEqual(await outSize(400, 300, 3), [1000, 750]); // 1200 -> clamped
});

test('row padding in stride is handled', async () => {
  const { arr, stride } = makeImage(401, 300, 2);
  const [out, strideOut] = await upscale(arr, stride, 2);
  assert.strictEqual(strideOut, 802 * 3);
  assert.strictEqual(out.length, 802 * 600 * 3);
});

test('output colours stay close to input (no shift)', async () => {
  const { arr, stride } = makeImage(400, 400);
  const [out] = await upscale(arr, stride, 2.5);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  assert.ok(Math.abs(mean(arr) - mean(out)) < 2);
});

test('concurrent calls resolve', async () => {
  const a = makeImage(400, 300), b = makeImage(600, 450);
  const [r1, r2] = await Promise.all([upscale(a.arr, a.stride, 2), upscale(b.arr, b.stride, 2)]);
  assert.strictEqual(r1[1], 800 * 3);
  assert.strictEqual(r2[1], 1000 * 3);
});

test('rejects out-of-range input sizes', async () => {
  const small = makeImage(399, 200), big = makeImage(801, 200);
  await assert.rejects(upscale(small.arr, small.stride), RangeError);
  await assert.rejects(upscale(big.arr, big.stride), RangeError);
});

test('rejects bad arguments', async () => {
  const { arr, stride } = makeImage(400, 300);
  await assert.rejects(upscale(arr, 2.5), TypeError);
  await assert.rejects(upscale(arr, stride, 0), RangeError);
  await assert.rejects(upscale('nope', stride), TypeError);
});

// ---- Contract edges (I4) ----

test('largest-side bounds: 399 and 801 rejected, 400 and 800 accepted', async () => {
  for (const [w, h] of [[399, 399], [399, 100], [100, 399], [801, 100], [100, 801]]) {
    const { arr, stride } = makeImage(w, h);
    await assert.rejects(upscale(arr, stride), RangeError, `${w}x${h}`);
  }
  assert.deepStrictEqual(await outSize(400, 100), [400, 100]);
  assert.deepStrictEqual(await outSize(100, 400), [100, 400]); // portrait: height is the largest side
  assert.deepStrictEqual(await outSize(800, 100), [800, 100]);
});

test('stride padding of 0, 1 and 2 bytes works for odd and even widths', async () => {
  for (const w of [400, 401, 402]) {
    const base = makeImage(w, 120);
    const [ref] = await upscale(base.arr, base.stride, 1);
    for (const pad of [1, 2]) {
      const p = makeImage(w, 120, pad);
      const [out, strideOut] = await upscale(p.arr, p.stride, 1);
      assert.strictEqual(strideOut, w * 3, `w=${w} pad=${pad}`);
      assert.strictEqual(out.length, w * 3 * 120);
      let maxDiff = 0;
      for (let i = 0; i < out.length; i++) maxDiff = Math.max(maxDiff, Math.abs(out[i] - ref[i]));
      assert.ok(maxDiff <= 1, `padding must not change pixels (w=${w} pad=${pad}, maxDiff=${maxDiff})`);
    }
  }
});

test('output is tightly packed: stride_out = out_width * 3', async () => {
  const { arr, stride } = makeImage(500, 333);
  const [out, strideOut] = await upscale(arr, stride, 1.3);
  assert.strictEqual(strideOut, 650 * 3); // 500 * 1.3 = 650 wide
  assert.strictEqual(out.length % strideOut, 0);
});

test('output cap: largest side never exceeds 1000px', async () => {
  assert.deepStrictEqual(await outSize(800, 400, 1.5), [1000, 500]); // 1200 -> 1000
  assert.deepStrictEqual(await outSize(800, 800, 10), [1000, 1000]);
  assert.deepStrictEqual(await outSize(400, 600, 1.5), [600, 900]); // under the cap, untouched
});

test('upscale_factor below 1 downsizes: min(round(largest * factor), 1000)', async () => {
  assert.deepStrictEqual(await outSize(800, 600, 0.5), [400, 300]);
});

test('invalid upscale_factor values are rejected', async () => {
  const { arr, stride } = makeImage(400, 300);
  for (const f of [0, -1, NaN, Infinity, '2']) {
    await assert.rejects(upscale(arr, stride, f), RangeError, String(f));
  }
});
