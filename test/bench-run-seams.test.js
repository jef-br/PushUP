'use strict';
// BL71: bench/seams.js (docs/SEAMS.md). The real run needs bench/out/sub20 and the 67 MB `high` model (about 45 s per image
// on 4 vCPU, tiled plus whole-image), so it is not run here; this file tests the seam-position rule, the two statistics on
// hand-made arrays, and the flag / missing-folder exits (no model is loaded before them). Timeout 60 s (cases take under 1 s).
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { seamPositions, seamDiffs, seamGradientRatio, seamsVisible } = require('../bench/seams.js');

const SCRIPT = path.join(__dirname, '..', 'bench', 'seams.js');
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 60000 });
const img = (w, h, f) => { const d = Buffer.alloc(w * h * 3); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.fill(f(x, y), (y * w + x) * 3, (y * w + x) * 3 + 3); return d; };

test('seamPositions: tile borders at k * 192 input px, scaled to the output', () => {
  assert.deepStrictEqual(seamPositions(400, 400), [192, 384]);
  assert.deepStrictEqual(seamPositions(300, 300), [192]);
  assert.deepStrictEqual(seamPositions(192, 192), []); // one tile exactly: no seam
  assert.deepStrictEqual(seamPositions(400, 1000), [480, 960]); // factor 2.5
  assert.deepStrictEqual(seamPositions(100, 100), []);
});

test('seamGradientRatio: a step at the seam scores above 1, a smooth ramp scores 1.00', () => {
  const w = 40, h = 10;
  const ramp = img(w, h, (x) => x * 4);
  assert.ok(Math.abs(seamGradientRatio(ramp, w, h, [20], []) - 1) < 1e-9);
  const step = img(w, h, (x) => x * 4 + (x >= 20 ? 20 : 0));
  assert.ok(seamGradientRatio(step, w, h, [20], []) > 5);
  // rows work the same way
  const w2 = 10, h2 = 40;
  const rstep = img(w2, h2, (x, y) => y * 4 + (y >= 20 ? 20 : 0));
  assert.ok(seamGradientRatio(rstep, w2, h2, [], [20]) > 5);
  assert.ok(Math.abs(seamGradientRatio(img(w2, h2, (x, y) => y * 4), w2, h2, [], [20]) - 1) < 1e-9);
  // pooled over columns and rows; a seam too close to the border is skipped; no seam at all is NaN
  assert.ok(Number.isNaN(seamGradientRatio(ramp, w, h, [2], [])));
  assert.ok(Number.isNaN(seamGradientRatio(ramp, w, h, [], [])));
});

test('seamDiffs: near and far means of the tiled-vs-whole difference', () => {
  const w = 60, h = 20;
  const a = img(w, h, () => 100);
  const b = Buffer.from(a);
  // Differ by 3 in every channel of columns 22..37 (the 8 px either side of a seam at 30), nowhere else.
  for (let y = 0; y < h; y++) for (let x = 22; x < 38; x++) for (let c = 0; c < 3; c++) b[(y * w + x) * 3 + c] += 3;
  const d = seamDiffs(a, b, w, h, [30], []);
  assert.strictEqual(d.near, 3);
  assert.strictEqual(d.far, 0);
  assert.strictEqual(d.nearN, 16 * h * 3);
  assert.strictEqual(d.farN, (60 - 16) * h * 3);
  // no seams: everything is far, near has no samples
  const none = seamDiffs(a, b, w, h, [], []);
  assert.ok(Number.isNaN(none.near));
  assert.strictEqual(none.farN, w * h * 3);
  // a seam row counts for the rows' band, and a pixel in both bands is near once
  const e = seamDiffs(a, a, w, h, [30], [10]);
  assert.strictEqual(e.near, 0);
  assert.strictEqual(e.nearN + e.farN <= w * h * 3, true);
});

test('seamsVisible applies the stated rule', () => {
  assert.strictEqual(seamsVisible(1.06, 0.01, 0.01), true);
  assert.strictEqual(seamsVisible(1.0, 0.021, 0.01), true);
  assert.strictEqual(seamsVisible(1.05, 0.02, 0.01), false);
  assert.strictEqual(seamsVisible(1.01, 0.01, 0.01), false);
});

test('bad flags exit 1 with one stderr line before any model loads', () => {
  for (const args of [['--size', '500'], ['--size', 'x'], ['--limit', '0'], ['--limit', 'x'], ['--bogus', '1'], ['--dir']]) {
    const r = run(args);
    assert.strictEqual(r.status, 1, `${args}: status ${r.status}`);
    assert.strictEqual(r.stderr.trim().split('\n').length, 1, `${args}: ${r.stderr}`);
    assert.strictEqual(r.stdout, '');
  }
});

test('a missing folder exits 1 with the fetch hint', () => {
  const r = run(['--dir', path.join(os.tmpdir(), 'pushup-no-such-folder-seams')]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /does not exist; run bash bench\/fetch_testset\.sh/);
});
