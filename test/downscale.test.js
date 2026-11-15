'use strict';
// BK5: factor < 1 must give a picture close to a plain Lanczos downscale (content, not only the
// size, which test/upscale.test.js and test/aspect.test.js already pin). A wrong kernel, a shift
// by a pixel or a bad crop in the 4x-then-down path would keep the size right.
//
// The mean absolute difference is over all bytes and channels. The 1 px shift assertion is the
// real guard: a bound at ~2x the measured value would let a shifted output through. The
// hard-edged rectangles are what make the shift visible, so keep them.
const test = require('node:test');
const assert = require('node:assert');
const sharp = require('sharp');
const { upscale } = require('../src');

const W = 800;
const H = 600;

function image() {
  const a = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      a[i] = (x * 255) / W;
      a[i + 1] = (y * 255) / H;
      a[i + 2] = 128 + 60 * Math.sin(x / 40) * Math.cos(y / 50);
    }
  }
  // Hard-edged rectangles (fixed positions): [x0, y0, x1, y1, r, g, b]
  for (const [x0, y0, x1, y1, r, g, b] of [
    [100, 80, 260, 200, 230, 30, 30],
    [400, 300, 620, 380, 20, 20, 20],
    [550, 60, 700, 240, 245, 245, 245],
  ]) {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) a.set([r, g, b], (y * W + x) * 3);
    }
  }
  return a;
}

// Mean |a - b| over all bytes; b is read `dx` output px to the left (dx = 1 compares a(x) with
// b(x - 1)), over the columns both share.
function meanDiff(a, b, ow, oh, dx = 0) {
  let sum = 0;
  let n = 0;
  for (let y = 0; y < oh; y++) {
    for (let x = dx; x < ow; x++) {
      for (let k = 0; k < 3; k++) {
        sum += Math.abs(a[(y * ow + x) * 3 + k] - b[(y * ow + x - dx) * 3 + k]);
        n++;
      }
    }
  }
  return sum / n;
}

// factor -> bound on the unshifted mean difference, about 2x the measured value.
// Measured 2026-11-15 (fast model, this image): unshifted / shifted by 1 px =
//   factor 0.5: 2.150 / 2.610,  factor 0.9: 2.164 / 2.393 (margin ~10% at 0.9).
const CASES = [
  [0.5, 4.4],
  [0.9, 4.4],
];

for (const [factor, bound] of CASES) {
  test(`factor ${factor}: content matches a plain Lanczos downscale, and is not shifted by 1 px`, async () => {
    const input = image();
    const ow = Math.round(W * factor);
    const oh = Math.round(H * factor);
    const [out, strideOut] = await upscale(input, W * 3, factor);
    assert.strictEqual(strideOut, ow * 3);
    assert.strictEqual(out.length, ow * oh * 3);
    const ref = await sharp(Buffer.from(input), { raw: { width: W, height: H, channels: 3 } })
      .resize(ow, oh, { kernel: 'lanczos3' })
      .raw()
      .toBuffer();
    const d0 = meanDiff(out, ref, ow, oh, 0);
    const dShift = meanDiff(out, ref, ow, oh, 1);
    assert.ok(d0 < bound, `mean diff ${d0} not below ${bound}`);
    assert.ok(dShift > d0, `shifted reference (${dShift}) is not worse than unshifted (${d0})`);
  });
}
