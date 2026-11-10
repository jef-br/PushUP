'use strict';
// R4: how upscale() reads the image height from arr.length (readDims in src/index.js).
const test = require('node:test');
const assert = require('node:assert');
const { upscale } = require('../src');

// Small images keep this file fast: largest side 400 (the minimum), short side 12.
const W = 400, H = 12;
const ROW = W * 3;

// Pixels with every row padded by `pad` bytes (padding filled with a recognisable value).
function padded(pad, w = W, h = H) {
  const stride = w * 3 + pad;
  const arr = new Uint8Array(stride * h).fill(0xab);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * stride + x * 3;
    arr[i] = (x * 7 + y * 13) & 255;
    arr[i + 1] = (x ^ (y * 29)) & 255;
    arr[i + 2] = (128 + 100 * Math.sin(x / 11) * Math.cos(y / 3)) | 0;
  }
  return { arr, stride };
}

const same = (a, b, msg) => assert.ok(Buffer.from(a).equals(Buffer.from(b)), msg);

for (const pad of [1, 2]) {
  test(`last row without its padding gives the same output (padding ${pad})`, async () => {
    const { arr, stride } = padded(pad);
    const [ref, refStride] = await upscale(arr, stride, 1.5);
    const short = arr.subarray(0, (H - 1) * stride + ROW);
    assert.strictEqual(short.length, arr.length - pad);
    const [out, outStride] = await upscale(short, stride, 1.5);
    assert.strictEqual(outStride, refStride);
    assert.strictEqual(out.length, ref.length, 'height must be read as the full H rows');
    same(out, ref, 'output differs when the last row skips its padding');
  });
}

for (const pad of [0, 2]) {
  test(`trailing bytes shorter than one row are ignored (padding ${pad})`, async () => {
    const { arr, stride } = padded(pad);
    const [ref] = await upscale(arr, stride, 1.5);
    for (const k of [1, ROW - pad - 1]) {
      const longer = new Uint8Array(arr.length + k).fill(0xcd);
      longer.set(arr);
      // With padding, the bytes already present in the last row's padding plus k must stay
      // below one full row, or they would be read as an extra row.
      assert.ok(pad + k < ROW);
      const [out] = await upscale(longer, stride, 1.5);
      assert.strictEqual(out.length, ref.length, `k=${k}: height changed`);
      same(out, ref, `k=${k}: trailing bytes changed the output`);
    }
  });
}

test('arr shorter than one row rejects with RangeError', async () => {
  for (const pad of [0, 2]) {
    const stride = ROW + pad;
    await assert.rejects(upscale(new Uint8Array(ROW - 1), stride), RangeError);
    await assert.rejects(upscale(new Uint8Array(0), stride), RangeError);
    // The boundary: exactly width * 3 bytes is one row (the last row may skip its padding).
    const [out, outStride] = await upscale(new Uint8Array(ROW).fill(90), stride, 1);
    assert.strictEqual(outStride, ROW);
    assert.strictEqual(out.length, ROW, `padding ${pad}: expected a 400x1 output`);
  }
});

test('a plain number[] gives the same output as a Uint8Array of the same pixels', async () => {
  const { arr, stride } = padded(0);
  const [ref, refStride] = await upscale(arr, stride, 1.5);
  const [out, outStride] = await upscale(Array.from(arr), stride, 1.5);
  assert.strictEqual(outStride, refStride);
  same(out, ref, 'number[] input changed the output');
});
