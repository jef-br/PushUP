'use strict';
// R9: calls of different sizes and factors queued together each get the output for their own
// input (no swapped or shared buffers), byte-identical to the same call made alone afterwards.
const test = require('node:test');
const assert = require('node:assert');
const { upscale, _reset } = require('../src');

// Thin images (short side 12) keep the `fast` model cheap; the contract bounds the largest side.
function image(w, h, tag) {
  const arr = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    arr[i] = (x * 3 + tag * 17) & 255;
    arr[i + 1] = (y * 40 + x + tag * 5) & 255;
    arr[i + 2] = (x * y + tag * 29) & 255;
  }
  return arr;
}

test('four queued calls of mixed sizes and factors return their own result, equal to a solo call', async () => {
  const saved = { q: process.env.PUSHUP_QUALITY, d: process.env.PUSHUP_DEVICE };
  process.env.PUSHUP_QUALITY = 'fast';
  process.env.PUSHUP_DEVICE = 'cpu';
  _reset();
  try {
    const calls = [
      { w: 400, h: 12, tag: 1, f: 1.0 },
      { w: 500, h: 12, tag: 2, f: 1.5 },
      { w: 600, h: 12, tag: 3, f: 1.0 },
      { w: 400, h: 12, tag: 4, f: 2.0 },
    ];
    const inputs = calls.map((c) => image(c.w, c.h, c.tag));
    const together = await Promise.all(calls.map((c, i) => upscale(inputs[i], c.w * 3, c.f)));

    for (let i = 0; i < calls.length; i++) {
      const { w, h, f } = calls[i];
      const longest = Math.max(w, h);
      const target = Math.min(Math.round(longest * f), 1000);
      const ow = Math.max(1, Math.round((w * target) / longest));
      const oh = Math.max(1, Math.round((h * target) / longest));
      const [out, stride] = together[i];
      assert.strictEqual(stride, ow * 3, `call ${i}: stride_out`);
      assert.strictEqual(out.length, stride * oh, `call ${i}: output length`);

      const [solo, soloStride] = await upscale(inputs[i], w * 3, f);
      assert.strictEqual(soloStride, stride, `call ${i}: solo stride`);
      assert.ok(Buffer.from(out).equals(Buffer.from(solo)), `call ${i}: queued output differs from the solo call`);
    }
    // The four outputs are really different from each other (distinct inputs/sizes).
    const lens = new Set(together.map(([o]) => o.length));
    assert.ok(lens.size >= 3, 'expected mixed output sizes');
    assert.ok(!Buffer.from(together[0][0]).equals(Buffer.from(together[3][0].subarray(0, together[0][0].length))), 'distinct inputs gave equal outputs');
  } finally {
    if (saved.q === undefined) delete process.env.PUSHUP_QUALITY; else process.env.PUSHUP_QUALITY = saved.q;
    if (saved.d === undefined) delete process.env.PUSHUP_DEVICE; else process.env.PUSHUP_DEVICE = saved.d;
    _reset();
  }
});
