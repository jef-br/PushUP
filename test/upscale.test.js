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
