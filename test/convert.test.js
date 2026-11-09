'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { _copyFromTensor } = require('../src');

// Reference: the original conversion (Math.round, then clamp to 0-255).
function reference(v) {
  const x = Math.round(v * 255);
  return x < 0 ? 0 : x > 255 ? 255 : x;
}

test('tensor-to-bytes conversion matches Math.round + clamp exactly', () => {
  const vals = [];
  for (let k = -2; k <= 258; k++) {
    for (const d of [-0.5, -1e-7, 0, 1e-7, 0.5, 0.49999997, 0.50000003]) vals.push((k + d) / 255);
  }
  vals.push(NaN, Infinity, -Infinity, -0, 1e-45, 0.5 / 255, 1 - 0.5 / 255);
  let seed = 1;
  while (vals.length < 30000) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    vals.push((seed / 2147483648) * 1.2 - 0.1);
  }
  const n = vals.length;
  // One-row "image", 3 planes; rotate values between planes so each sees every case.
  const data = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    data[i] = vals[i];
    data[n + i] = vals[(i + 1) % n];
    data[2 * n + i] = vals[(i + 2) % n];
  }
  const tensor = { dims: [1, 3, 1, n], data };
  const out = Buffer.alloc(3 * n);
  _copyFromTensor(tensor, 0, 0, n, 1, out, n, 0, 0);
  // Build the expected bytes exactly as the original code did: store reference() into a Buffer
  // (that store maps -0 and NaN to 0, like the old implementation).
  const want = Buffer.alloc(3 * n);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) want[3 * i + c] = reference(data[c * n + i]);
  }
  for (let k = 0; k < want.length; k++) {
    if (out[k] !== want[k]) {
      assert.fail(`byte ${k}: got ${out[k]}, want ${want[k]} for value ${data[(k % 3) * n + Math.floor(k / 3)]}`);
    }
  }
});

test('copies a sub-region to the right place', () => {
  // 4x3 tensor; copy the 2x2 block at (1,1) to (0,0) of a 2-wide output.
  const tw = 4, th = 3, plane = tw * th;
  const data = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) { data[i] = i / 255; data[plane + i] = (100 + i) / 255; data[2 * plane + i] = (200 + i) / 255; }
  const out = Buffer.alloc(2 * 2 * 3);
  _copyFromTensor({ dims: [1, 3, th, tw], data }, 1, 1, 2, 2, out, 2, 0, 0);
  const idx = [5, 6, 9, 10];
  assert.deepStrictEqual([...out], idx.flatMap((i) => [i, 100 + i, 200 + i]));
});

test('tiled inference places every tile correctly (byte-identical to whole-frame)', async () => {
  // With padding larger than the image, every tile's model input is the whole image, so
  // each tile's output region must equal the whole-frame output exactly. Any offset error
  // in tiling would show up as a mismatch.
  const { _run } = require('../src');
  const w = 400, h = 300, arr = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    arr[i] = (x * 7 + y * 3) & 255; arr[i + 1] = (x ^ y) & 255; arr[i + 2] = (128 + 100 * Math.sin(x / 9 + y / 13)) | 0;
  }
  const opts = { lanczosMix: 0 };
  const [whole] = await _run(arr, w * 3, 2, opts);
  const [tiled] = await _run(arr, w * 3, 2, { ...opts, tile: 128, tilePad: 1000 });
  assert.ok(whole.equals(tiled), 'tiled output differs from whole-frame output');
});
