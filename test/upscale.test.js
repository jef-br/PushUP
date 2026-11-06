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

test('landscape 800x600 -> 1000x750', async () => {
  const { arr, stride } = makeImage(800, 600);
  const [out, strideOut] = await upscale(arr, stride);
  assert.strictEqual(strideOut, 1000 * 3);
  assert.strictEqual(out.length, 1000 * 750 * 3);
});

test('portrait 300x400 -> 750x1000', async () => {
  const { arr, stride } = makeImage(300, 400);
  const [out, strideOut] = await upscale(arr, stride, 1.0);
  assert.strictEqual(strideOut, 750 * 3);
  assert.strictEqual(out.length, 750 * 1000 * 3);
});

test('upscale_factor scales the 1000px target', async () => {
  const { arr, stride } = makeImage(500, 500);
  const [out, strideOut] = await upscale(arr, stride, 1.5);
  assert.strictEqual(strideOut, 1500 * 3);
  assert.strictEqual(out.length, 1500 * 1500 * 3);
});

test('row padding in stride is handled', async () => {
  const { arr, stride } = makeImage(401, 300, 5);
  const [out, strideOut] = await upscale(arr, stride);
  assert.strictEqual(strideOut, 1000 * 3);
  assert.strictEqual(out.length, 1000 * Math.round((300 * 1000) / 401) * 3);
});

test('output colours stay close to input (no shift)', async () => {
  const { arr, stride } = makeImage(400, 400);
  const [out] = await upscale(arr, stride);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  assert.ok(Math.abs(mean(arr) - mean(out)) < 2);
});

test('concurrent calls resolve', async () => {
  const a = makeImage(400, 300), b = makeImage(600, 450);
  const [r1, r2] = await Promise.all([upscale(a.arr, a.stride), upscale(b.arr, b.stride)]);
  assert.strictEqual(r1[1], 3000);
  assert.strictEqual(r2[1], 3000);
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
