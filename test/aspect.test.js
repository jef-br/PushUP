'use strict';
// R1: the contract bounds only the largest side (400-800 px). Thin and square inputs must
// resolve with the shape given by the size rule, never crash or return a wrong shape.
const test = require('node:test');
const assert = require('node:assert');
const { upscale } = require('../src');

function image(w, h) {
  const arr = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    arr[i] = (x * 3 + y * 7) & 255;
    arr[i + 1] = (x ^ (y * 5)) & 255;
    arr[i + 2] = (128 + 100 * Math.sin(x / 11 + y)) | 0;
  }
  return arr;
}

// Expected size from the rule: target = min(round(longest * factor), 1000);
// each side = max(1, round(side * target / longest)).
function expected(w, h, factor) {
  const longest = Math.max(w, h);
  const target = Math.max(1, Math.min(Math.round(longest * factor), 1000));
  return [Math.max(1, Math.round((w * target) / longest)), Math.max(1, Math.round((h * target) / longest))];
}

const cases = [[800, 4], [800, 1], [4, 800], [1, 800], [400, 400], [800, 800], [800, 3], [799, 401], [3, 800], [401, 799]];
for (const [w, h] of cases) {
  for (const factor of [1, 1.5]) {
    test(`${w}x${h} at factor ${factor} has the shape the size rule gives`, async () => {
      const [ow, oh] = expected(w, h, factor);
      const [out, stride] = await upscale(image(w, h), w * 3, factor);
      assert.strictEqual(stride, ow * 3, 'stride_out = out_width * 3');
      assert.strictEqual(out.length, stride * oh, 'length = stride_out * out_height');
      assert.strictEqual(out.length / stride, oh);
    });
  }
}

test('literal expected shapes for thin inputs (guards the formula in this file)', async () => {
  const shape = async (w, h, f) => {
    const [out, s] = await upscale(image(w, h), w * 3, f);
    return [s / 3, out.length / s];
  };
  assert.deepStrictEqual(await shape(800, 4, 1.5), [1000, 5]);
  assert.deepStrictEqual(await shape(800, 1, 1.5), [1000, 1]);
  assert.deepStrictEqual(await shape(4, 800, 1), [4, 800]);
  assert.deepStrictEqual(await shape(1, 800, 1.5), [1, 1000]);
  // Fractional ratios: rounding is exercised (3.75 -> 4, 501.9 -> 502).
  assert.deepStrictEqual(await shape(800, 3, 1.5), [1000, 4]);
  assert.deepStrictEqual(await shape(799, 401, 1.5), [1000, 502]);
  assert.deepStrictEqual(await shape(3, 800, 1.5), [4, 1000]);
  assert.deepStrictEqual(await shape(401, 799, 1.5), [502, 1000]);
});
