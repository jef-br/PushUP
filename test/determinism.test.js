'use strict';
// R8: results must not depend on call history (session cache, call queue, stride padding).
const test = require('node:test');
const assert = require('node:assert');
const { upscale, _reset } = require('../src');

const W = 400, H = 300;

function synth(stridePad) {
  const stride = W * 3 + stridePad;
  const b = Buffer.alloc(stride * H);
  let s = 2024;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W * 3; x++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      b[y * stride + x] = ((x / 3) * 255 / W + y / 4 + ((s >> 16) % 24)) & 255;
    }
  }
  return { b, stride };
}

const withFast = (fn) => async () => {
  const saved = { q: process.env.PUSHUP_QUALITY, d: process.env.PUSHUP_DEVICE };
  process.env.PUSHUP_QUALITY = 'fast';
  process.env.PUSHUP_DEVICE = 'cpu';
  _reset();
  try { await fn(); } finally {
    for (const [k, v] of [['PUSHUP_QUALITY', saved.q], ['PUSHUP_DEVICE', saved.d]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    _reset();
  }
};

for (const factor of [1.0, 1.5]) {
  test(`fast, ${W}px, factor ${factor}: repeated calls and a fresh session give equal bytes`, withFast(async () => {
    const { b, stride } = synth(0);
    const [a1, s1] = await upscale(b, stride, factor);
    const [a2, s2] = await upscale(b, stride, factor);
    _reset();
    const [a3, s3] = await upscale(b, stride, factor);
    assert.ok(a1.equals(a2), 'second call differs from first');
    assert.ok(a1.equals(a3), 'call after _reset() differs from first');
    assert.strictEqual(s2, s1);
    assert.strictEqual(s3, s1);
  }));

  test(`fast, ${W}px, factor ${factor}: +2 bytes of stride padding gives the same output`, withFast(async () => {
    const tight = synth(0);
    const padded = synth(2); // same pixel values, rows 2 bytes longer
    for (let y = 0; y < H; y++) {
      tight.b.copy(padded.b, y * padded.stride, y * tight.stride, y * tight.stride + W * 3);
    }
    const [a1, s1] = await upscale(tight.b, tight.stride, factor);
    const [a2, s2] = await upscale(padded.b, padded.stride, factor);
    assert.strictEqual(s2, s1);
    assert.ok(a1.equals(a2), 'padded input gives different output');
  }));
}
