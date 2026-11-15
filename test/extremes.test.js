'use strict';
// BK4: flat extremes and channel order survive. White-background product shots are the main
// e-commerce case; test/upscale.test.js only compares the mean of a mid-tone image, so a white
// haze, clipped blacks or swapped R/B channels would pass there.
//
// Tolerances are per (colour, factor): 2x the maximum per-byte deviation measured on the real
// `fast` model (2026-11-15, 400x300 uniform images), but at least 2. Measured (factor 1 / 1.5):
//   white 3/3, black 1/2, red 7/10, green 26/29, blue 19/24,
//   half white / half black, columns > 20 output px from the seam: 3/3.
// White and black stay tight on purpose (a white haze is what this test is for).
// Green and blue move by 20-30 bytes on flat saturated colours: a colour-fidelity finding of the
// model, recorded here, not a failure of this test.
const test = require('node:test');
const assert = require('node:assert');
const { upscale } = require('../src');

// Measured on the `fast` model on CPU; pin it so a GPU or an env override cannot change the model.
const saved = { q: process.env.PUSHUP_QUALITY, d: process.env.PUSHUP_DEVICE };
process.env.PUSHUP_QUALITY = 'fast';
process.env.PUSHUP_DEVICE = 'cpu';
test.after(() => {
  for (const [k, v] of [['PUSHUP_QUALITY', saved.q], ['PUSHUP_DEVICE', saved.d]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

const W = 400;
const H = 300;

// colour -> tolerance at factor 1, 1.5
const CASES = [
  ['white', [255, 255, 255], { 1: 6, 1.5: 6 }],
  ['black', [0, 0, 0], { 1: 2, 1.5: 4 }],
  ['red', [255, 0, 0], { 1: 14, 1.5: 20 }],
  ['green', [0, 255, 0], { 1: 52, 1.5: 58 }],
  ['blue', [0, 0, 255], { 1: 38, 1.5: 48 }],
];

function flat(color) {
  const a = new Uint8Array(W * H * 3);
  for (let i = 0; i < a.length; i++) a[i] = color[i % 3];
  return a;
}

function maxDev(out, strideOut, color, skip = () => false) {
  const ow = strideOut / 3;
  const oh = out.length / strideOut;
  let worst = 0;
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      if (skip(x)) continue;
      const c = typeof color === 'function' ? color(x) : color;
      for (let k = 0; k < 3; k++) {
        worst = Math.max(worst, Math.abs(out[(y * ow + x) * 3 + k] - c[k]));
      }
    }
  }
  return worst;
}

for (const [name, color, tol] of CASES) {
  for (const factor of [1, 1.5]) {
    test(`flat ${name} stays ${name} at factor ${factor} (R, G, B stay in their slots)`, async () => {
      const [out, strideOut] = await upscale(flat(color), W * 3, factor);
      const ow = Math.round(W * factor);
      assert.strictEqual(strideOut, ow * 3);
      assert.strictEqual(out.length, strideOut * Math.round(H * factor));
      const dev = maxDev(out, strideOut, color);
      assert.ok(dev <= tol[factor], `max deviation ${dev} exceeds ${tol[factor]}`);
    });
  }
}

for (const factor of [1, 1.5]) {
  test(`half white / half black: far-from-seam columns stay white and black at factor ${factor}`, async () => {
    const a = new Uint8Array(W * H * 3);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) a.fill(x < W / 2 ? 255 : 0, (y * W + x) * 3, (y * W + x) * 3 + 3);
    }
    const [out, strideOut] = await upscale(a, W * 3, factor);
    const seam = (W * factor) / 2;
    const dev = maxDev(
      out,
      strideOut,
      (x) => (x < seam ? [255, 255, 255] : [0, 0, 0]),
      (x) => Math.abs(x - seam) <= 20 * factor,
    );
    assert.ok(dev <= 6, `max deviation ${dev} exceeds 6`);
  });
}
