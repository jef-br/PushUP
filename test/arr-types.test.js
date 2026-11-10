'use strict';
// R6: which `arr` types upscale() accepts, rejects or converts (README "Errors" row 1).
// Pins today's behaviour; the cases already in input.test.js (Buffer slices, byteOffset views)
// and length.test.js (number[] = Uint8Array) are not repeated here.
const test = require('node:test');
const assert = require('node:assert');
const { upscale } = require('../src');

const W = 400, H = 4, STRIDE = W * 3, N = W * H * 3; // tiny: each call is cheap

function pixels() {
  const a = new Uint8Array(N);
  for (let i = 0; i < N; i++) a[i] = (i * 7 + (i / STRIDE | 0) * 13) & 255;
  return a;
}

test('a whole Buffer is accepted and gives the same output as a Uint8Array', async () => {
  const px = pixels();
  const [ref] = await upscale(px, STRIDE, 1);
  const [out, stride] = await upscale(Buffer.from(px), STRIDE, 1);
  assert.strictEqual(stride, STRIDE);
  assert.ok(Buffer.from(out).equals(Buffer.from(ref)));
});

test('other typed arrays, DataView, ArrayBuffer and strings reject with TypeError', async () => {
  const px = pixels();
  const cases = {
    Uint8ClampedArray: new Uint8ClampedArray(px),
    Int8Array: new Int8Array(px.buffer.slice(0)),
    Uint16Array: new Uint16Array(px),
    Float32Array: new Float32Array(px),
    DataView: new DataView(px.buffer.slice(0)),
    ArrayBuffer: px.buffer.slice(0),
    string: 'x'.repeat(N),
  };
  for (const [name, arr] of Object.entries(cases)) {
    await assert.rejects(upscale(arr, STRIDE, 1), (err) => {
      assert.ok(err instanceof TypeError, `${name}: expected TypeError, got ${err}`);
      assert.match(err.message, /arr must be a byte array/, name);
      return true;
    });
  }
});

test('a plain Array is converted like Uint8Array.from: 300 -> 44, \'x\' -> 0', async () => {
  const px = pixels();
  const arr = Array.from(px);
  const expected = Uint8Array.from(px);
  // Put the odd values in a few places across the image.
  for (const i of [0, 5, N / 2, N - 1]) { arr[i] = 300; expected[i] = 44; }
  for (const i of [1, 7, N / 2 + 3, N - 2]) { arr[i] = 'x'; expected[i] = 0; }
  assert.deepStrictEqual(Uint8Array.from(arr), expected, 'sanity: the conversion this test pins');
  const [ref] = await upscale(expected, STRIDE, 1);
  const [out] = await upscale(arr, STRIDE, 1);
  assert.ok(Buffer.from(out).equals(Buffer.from(ref)), 'Array output differs from its Uint8Array.from copy');
});

test('a plain Array holding a Symbol or a BigInt rejects with TypeError', async () => {
  for (const [name, v] of [['Symbol', Symbol('s')], ['BigInt', 10n]]) {
    const arr = Array.from(pixels());
    arr[N / 2] = v;
    await assert.rejects(upscale(arr, STRIDE, 1), TypeError, name);
  }
});
