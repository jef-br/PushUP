'use strict';
// Q2: upscale() must not modify its input, and must accept views into bigger buffers.
const test = require('node:test');
const assert = require('node:assert');
const { upscale } = require('../src');

const W = 401, H = 300; // odd width: rows are not a multiple of 4 bytes

function pixels(pad) {
  const stride = W * 3 + pad;
  const arr = new Uint8Array(stride * H).fill(77); // padding bytes get a recognisable value
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * stride + x * 3;
    arr[i] = (x * 3 + y) & 255;
    arr[i + 1] = (x ^ (y * 5)) & 255;
    arr[i + 2] = (128 + 100 * Math.sin(x / 9) * Math.cos(y / 13)) | 0;
  }
  return { arr, stride };
}

for (const pad of [0, 2]) {
  test(`input is not modified (padding ${pad})`, async () => {
    const { arr, stride } = pixels(pad);
    const before = Buffer.from(arr);
    await upscale(arr, stride, 1.5);
    assert.ok(Buffer.from(arr).equals(before), 'input bytes changed');
  });

  test(`Buffer slice with byteOffset and Uint8Array give identical output (padding ${pad})`, async () => {
    const { arr, stride } = pixels(pad);
    const [ref] = await upscale(Uint8Array.from(arr), stride, 1);

    // A Buffer that is a slice of a bigger one (like pooled allocations), at an odd offset.
    const big = Buffer.alloc(arr.length + 37, 0xee);
    big.set(arr, 13);
    const slice = big.subarray(13, 13 + arr.length);
    assert.strictEqual(slice.byteOffset - big.byteOffset, 13);
    const bigBefore = Buffer.from(big);
    const [fromSlice, s1] = await upscale(slice, stride, 1);
    assert.strictEqual(s1, W * 3);
    assert.ok(fromSlice.equals(ref), 'Buffer slice output differs');
    assert.ok(big.equals(bigBefore), 'bytes around the slice changed');

    // A Uint8Array view with a non-zero byteOffset on an ArrayBuffer.
    const ab = new ArrayBuffer(arr.length + 8);
    new Uint8Array(ab).set(arr, 8);
    const view = new Uint8Array(ab, 8, arr.length);
    const [fromView] = await upscale(view, stride, 1);
    assert.ok(fromView.equals(ref), 'Uint8Array view output differs');
  });
}
