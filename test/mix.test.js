'use strict';
// P2: the Lanczos mix uses (v + 0.5) | 0 instead of Math.round(v). Same bytes, checked here.
const test = require('node:test');
const assert = require('node:assert');
const { upscale, _run, _mixLanczos, _MODES } = require('../src');

// The old loop, kept as the reference.
function refMix(out, plain, mix) {
  const a = 1 - mix;
  for (let i = 0; i < out.length; i++) out[i] = Math.round(a * out[i] + mix * plain[i]);
}

// All 256 x 256 (out, plain) byte pairs.
function allPairs() {
  const out = new Uint8Array(65536), plain = new Uint8Array(65536);
  for (let o = 0; o < 256; o++) for (let p = 0; p < 256; p++) { out[o * 256 + p] = o; plain[o * 256 + p] = p; }
  return { out, plain };
}

function firstDiff(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

test('_mixLanczos equals Math.round over all byte pairs for the shipped mix share', () => {
  const mix = _MODES.fast.lanczosMix;
  const { out, plain } = allPairs();
  const ref = Uint8Array.from(out);
  refMix(ref, plain, mix);
  _mixLanczos(out, plain, mix);
  const i = firstDiff(out, ref);
  assert.strictEqual(i, -1, i < 0 ? '' : `mix ${mix}: out=${i >> 8} plain=${i & 255} gives ${out[i]}, Math.round gives ${ref[i]}`);
});

test('_mixLanczos equals Math.round over all byte pairs for shares 0, 0.05 .. 0.95, 1', () => {
  for (let k = 0; k <= 20; k++) {
    const mix = k / 20;
    const { out, plain } = allPairs();
    const ref = Uint8Array.from(out);
    refMix(ref, plain, mix);
    _mixLanczos(out, plain, mix);
    const i = firstDiff(out, ref);
    assert.strictEqual(i, -1, i < 0 ? '' : `mix ${mix}: out=${i >> 8} plain=${i & 255} gives ${out[i]}, Math.round gives ${ref[i]}`);
  }
});

test('a real upscale output: shipped mix = model output mixed with Math.round', async () => {
  const saved = { q: process.env.PUSHUP_QUALITY, d: process.env.PUSHUP_DEVICE };
  process.env.PUSHUP_QUALITY = 'fast';
  process.env.PUSHUP_DEVICE = 'cpu';
  try {
    const W = 400, H = 300, arr = new Uint8Array(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      arr[i] = (x * 3 + y) & 255;
      arr[i + 1] = (x ^ (y * 5)) & 255;
      arr[i + 2] = (128 + 100 * Math.sin(x / 9) * Math.cos(y / 13)) | 0;
    }
    const m = _MODES.fast;
    // Model output at the target size with no mix, and the plain Lanczos upscale (mix = 1).
    const [model] = await _run(arr, W * 3, 1.25, { modelPath: m.modelPath, tile: m.tile, lanczosMix: 0 });
    const [plain] = await _run(arr, W * 3, 1.25, { modelPath: m.modelPath, tile: m.tile, lanczosMix: 1 });
    const ref = Buffer.from(model);
    refMix(ref, plain, m.lanczosMix);
    const [out] = await upscale(arr, W * 3, 1.25);
    const i = firstDiff(out, ref);
    assert.strictEqual(i, -1, `byte ${i} differs: ${out[i]} vs Math.round reference ${ref[i]}`);
  } finally {
    if (saved.q === undefined) delete process.env.PUSHUP_QUALITY; else process.env.PUSHUP_QUALITY = saved.q;
    if (saved.d === undefined) delete process.env.PUSHUP_DEVICE; else process.env.PUSHUP_DEVICE = saved.d;
  }
});
