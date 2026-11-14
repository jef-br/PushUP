'use strict';
// BK1: tiled inference with the shipped `high` settings (192 px tiles, 16 px context pad) must
// match a whole-image pass on the real `fast` model. test/convert.test.js only shows that tiling
// with a huge pad equals the whole frame; this covers the shipped pad, sizes that are not a
// multiple of the tile, and the seams.
//
// Measured (CPU, 2026-11-14, factor 2.5 so the 4x output is resized to 1000 px; mean abs byte
// difference / largest difference / mean on the 4 px each side of a seam / mean elsewhere):
//   401x301: 0.00136 / 2 / 0.0512 / 0.00017      400x400: 0.00115 / 1 / 0.0363 / 0.00014
// Thresholds are about 2x the measured values. Away from the seams the two passes are almost
// identical, so a "seam <= 2x elsewhere" ratio would fail by design; the seam mean gets an
// absolute bound instead (about 2x the measured seam mean).
const test = require('node:test');
const assert = require('node:assert');
const { _run } = require('../src');

const TILE = 192;
const FACTOR = 2.5;
const MAX_MEAN = 0.003;
const MAX_PIXEL = 4;
const MAX_SEAM_MEAN = 0.1;

function image(w, h, seed) {
  let s = seed;
  const a = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      s = (s * 1103515245 + 12345) % 2147483648;
      const n = (s >>> 16) % 24;
      a[i] = Math.min(255, ((x * 255) / w + n) | 0);
      a[i + 1] = Math.min(255, ((y * 255) / h + n) | 0);
      a[i + 2] = Math.min(255, (128 + 90 * Math.sin(x / 11 + y / 17) + n) | 0);
    }
  }
  return a;
}

for (const [w, h] of [[401, 301], [400, 400]]) {
  test(`tiled (tile ${TILE}, shipped pad) matches whole-image inference, ${w}x${h}`, async () => {
    const arr = image(w, h, 7);
    const [whole, stride] = await _run(arr, w * 3, FACTOR, { lanczosMix: 0 });
    const [tiled, strideT] = await _run(arr, w * 3, FACTOR, { lanczosMix: 0, tile: TILE });
    assert.strictEqual(strideT, stride);
    assert.strictEqual(tiled.length, whole.length);

    const ow = stride / 3;
    const oh = whole.length / stride;
    const seamX = [];
    const seamY = [];
    for (let k = TILE; k < w; k += TILE) seamX.push(Math.round((k * ow) / w));
    for (let k = TILE; k < h; k += TILE) seamY.push(Math.round((k * oh) / h));
    assert.ok(seamX.length > 0 && seamY.length > 0, 'image must contain tile seams');

    let sum = 0, max = 0, seamSum = 0, seamN = 0;
    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        const near = seamX.some((c) => Math.abs(x - c) < 4) || seamY.some((c) => Math.abs(y - c) < 4);
        for (let c = 0; c < 3; c++) {
          const i = (y * ow + x) * 3 + c;
          const d = Math.abs(whole[i] - tiled[i]);
          sum += d;
          if (d > max) max = d;
          if (near) { seamSum += d; seamN++; }
        }
      }
    }
    const mean = sum / (ow * oh * 3);
    const seamMean = seamSum / seamN;
    assert.ok(mean <= MAX_MEAN, `mean abs diff ${mean} > ${MAX_MEAN}`);
    assert.ok(max <= MAX_PIXEL, `largest diff ${max} > ${MAX_PIXEL}`);
    assert.ok(seamMean <= MAX_SEAM_MEAN, `seam mean diff ${seamMean} > ${MAX_SEAM_MEAN}`);
  });
}
