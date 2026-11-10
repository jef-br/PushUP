'use strict';
// R3: bench/profile.js replays the pipeline stages. The pieces that used to be copies of
// src/index.js (tensor conversion, mix share) now come from src/ exports; this test pins that.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const pushup = require('../src');

test('_toTensor puts a packed RGB image into NCHW float planes in [0, 1]', () => {
  // 2x2 image, pixels (R,G,B): (0,1,2) (3,4,5) / (6,7,8) (255,128,0)
  const rgb = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 255, 128, 0]);
  const t = pushup._toTensor(rgb, 2, 0, 0, 2, 2);
  assert.deepStrictEqual(t.dims, [1, 3, 2, 2]);
  assert.strictEqual(t.type, 'float32');
  const f = (v) => Math.fround(v / 255);
  assert.deepStrictEqual(Array.from(t.data), [
    f(0), f(3), f(6), f(255), // R plane
    f(1), f(4), f(7), f(128), // G plane
    f(2), f(5), f(8), f(0), // B plane
  ]);
  // A sub-region: the bottom-right pixel only.
  const r = pushup._toTensor(rgb, 2, 1, 1, 1, 1);
  assert.deepStrictEqual(r.dims, [1, 3, 1, 1]);
  assert.deepStrictEqual(Array.from(r.data), [f(255), f(128), f(0)]);
});

test('the fast mode exposes the mix share that profile.js uses', () => {
  assert.strictEqual(typeof pushup._MODES.fast.lanczosMix, 'number');
  assert.ok(pushup._MODES.fast.lanczosMix > 0 && pushup._MODES.fast.lanczosMix < 1);
  assert.strictEqual(typeof pushup._copyFromTensor, 'function');
});

test('profile.js uses the src exports instead of its own copies', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'bench', 'profile.js'), 'utf8');
  assert.match(src, /_toTensor/, 'profile.js should call _toTensor from src/');
  assert.match(src, /_copyFromTensor/, 'profile.js should call _copyFromTensor from src/');
  assert.match(src, /_MODES\.fast\.lanczosMix/, 'profile.js should read the mix share from _MODES');
  assert.doesNotMatch(src, /0\.8\s*\*/, 'profile.js hard-codes the 0.8 share again');
  assert.doesNotMatch(src, /new Float32Array\(3 \*/, 'profile.js copies the tensor conversion again');
});
