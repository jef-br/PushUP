'use strict';
// R14: a tiny upscale_factor. The CLAUDE.md formula min(round(largest * factor), 1000) gives 0
// when the largest side * factor rounds to 0; the code floors the target at 1, so the result is a
// 1x1 image, never an empty one. This pins today's behaviour (see the note on task R14).
const test = require('node:test');
const assert = require('node:assert');
const { upscale } = require('../src');

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

test('a factor that rounds the largest side to 0 or 1 gives a 1x1 image with a consistent stride', async () => {
  const saved = { q: process.env.PUSHUP_QUALITY, d: process.env.PUSHUP_DEVICE };
  process.env.PUSHUP_QUALITY = 'fast';
  process.env.PUSHUP_DEVICE = 'cpu';
  try {
    // round(400 * f): 0.4 -> 0, 0.496 -> 0, ~0 -> 0, 1.0 -> 1
    for (const factor of [0.001, 0.00124, Number.MIN_VALUE, 0.0025]) {
      const [out, strideOut] = await upscale(image(), STRIDE, factor);
      assert.strictEqual(strideOut, 1 * 3, `factor ${factor}: stride_out = out_width * 3 with out_width 1`);
      assert.strictEqual(out.length, strideOut * 1, `factor ${factor}: length = stride_out * out_height with out_height 1`);
    }
  } finally {
    if (saved.q === undefined) delete process.env.PUSHUP_QUALITY; else process.env.PUSHUP_QUALITY = saved.q;
    if (saved.d === undefined) delete process.env.PUSHUP_DEVICE; else process.env.PUSHUP_DEVICE = saved.d;
  }
});
