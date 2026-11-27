'use strict';
// BL74: bench/white.js (docs/COLOR.md "White backdrops (BL74)"). The real run needs bench/out/sub20, which CI lacks, so the run
// case uses a generated folder of two small images (white page with a coloured block). Timeout 60 s.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');
const { borderRegion, erode, newAcc, addMasked, summary } = require('../bench/white.js');

const SCRIPT = path.join(__dirname, '..', 'bench', 'white.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-white-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 60000, env: { ...process.env, PUSHUP_DEVICE: 'cpu' } });

function image(w, h, f) {
  const d = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(f(x, y), (y * w + x) * 3);
  return d;
}

test('borderRegion fills near-white pixels connected to the border and not enclosed ones', () => {
  // 9x9 white page, a dark ring (x,y 2..6, hollow inside) enclosing a white island at the centre
  const w = 9, h = 9;
  const d = image(w, h, (x, y) => (Math.max(Math.abs(x - 4), Math.abs(y - 4)) === 2 ? [10, 10, 10] : [250, 250, 250]));
  const m = borderRegion(d, w, h);
  assert.strictEqual(m[0], 1);
  assert.strictEqual(m[4 * w + 4], 0, 'the enclosed island is not connected to the border');
  assert.strictEqual(m[2 * w + 2], 0, 'the dark ring is not white');
  assert.strictEqual(m[1 * w + 1], 1);
  let n = 0;
  for (const v of m) n += v;
  assert.strictEqual(n, 81 - 16 - 9); // all minus ring (16) minus the 3x3 island (9)
});

test('borderRegion needs all three channels at or above the threshold', () => {
  const d = image(3, 1, (x) => [[245, 245, 245], [245, 244, 255], [255, 255, 255]][x]);
  assert.deepStrictEqual([...borderRegion(d, 3, 1)], [1, 0, 1]); // the middle pixel (244 in one channel) is not white; both end pixels are on the border
});

test('erode removes r pixels around the region and at the frame edge', () => {
  const w = 12, h = 12, all = new Uint8Array(w * h).fill(1);
  const e = erode(all, w, h, 2);
  let n = 0;
  for (const v of e) n += v;
  assert.strictEqual(n, 8 * 8); // the frame edge erodes too
  assert.strictEqual(e[2 * w + 2], 1);
  assert.strictEqual(e[1 * w + 5], 0);
  const hole = new Uint8Array(w * h).fill(1);
  hole[6 * w + 6] = 0;
  const e2 = erode(hole, w, h, 1);
  assert.strictEqual(e2[5 * w + 5], 0);
  assert.strictEqual(e2[7 * w + 7], 0);
  assert.strictEqual(e2[4 * w + 4], 1);
});

test('addMasked counts only output pixels whose source pixel is in the mask, and summary computes the shares', () => {
  // 2x2 input, mask = left column; 4x4 output: columns 0..1 map to input column 0
  const mask = Uint8Array.from([1, 0, 1, 0]);
  const out = Buffer.alloc(4 * 4 * 3, 255);
  const set = (x, y, v) => out.set(v, (y * 4 + x) * 3);
  set(0, 0, [250, 255, 255]); // >= 252? no (250), luma deficit counts
  set(1, 0, [253, 253, 253]); // >= 252, not 255
  const a = newAcc();
  addMasked(a, out, 4, 4, mask, 2, 2);
  assert.strictEqual(a.n, 8);
  const s = summary(a);
  assert.strictEqual(s.share255, (100 * 6) / 8);
  assert.strictEqual(s.share252, (100 * 7) / 8);
  assert.strictEqual(s.min, 250);
  assert.ok(Math.abs(s.deficit - ((255 - (0.299 * 250 + 0.587 * 255 + 0.114 * 255)) + 2) / 8) < 1e-9);
  assert.deepStrictEqual(summary(newAcc()), { pixels: 0, share255: 0, share252: 0, min: 0, deficit: 0 });
});

test('bad flags exit 1 with one stderr line before any model loads', () => {
  for (const args of [['--size', '500'], ['--size', 'x'], ['--limit', '0'], ['--bogus', '1']]) {
    const r = run(args);
    assert.strictEqual(r.status, 1, `${args}: status ${r.status}`);
    assert.strictEqual(r.stderr.trim().split('\n').length, 1, `${args}: ${r.stderr}`);
    assert.strictEqual(r.stdout, '');
  }
});

test('a missing folder exits 1 with the fetch hint', () => {
  const r = run(['--dir', path.join(tmp, 'nope')]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /does not exist; run bash bench\/fetch_testset\.sh/);
});

test('a run on generated images prints the table shape; an image without a white border is skipped and counted', async () => {
  const dir = path.join(tmp, 'imgs');
  fs.mkdirSync(dir);
  const w = 500, h = 400;
  const png = (name, d) => sharp(d, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(dir, name));
  await png('a.png', image(w, h, (x, y) => (x > 150 && x < 350 && y > 120 && y < 280 ? [200, 40, 40] : [255, 255, 255])));
  await png('b.png', image(w, h, (x) => [(x * 255 / w) | 0, 90, 90])); // no white border: skipped
  const r = run(['--dir', dir]);
  assert.strictEqual(r.status, 0, r.stderr);
  const lines = r.stdout.trim().split('\n');
  assert.match(lines[0], /^images: 2; used: 1; skipped \(white region under 20% of the frame\): 1; input 400 px, output 1000 px$/);
  assert.match(lines[1], /^\| method \| pixels \| share exactly 255 \(%\) \| share >= 252 \(%\) \| lowest channel value \| mean luma deficit \|$/);
  assert.match(lines[3], /^\| `fast` \| \d+ \| \d+\.\d\d \| \d+\.\d\d \| \d+ \| \d+\.\d\d\d \|$/);
  assert.match(lines[4], /^\| Lanczos \| \d+ \| \d+\.\d\d \| \d+\.\d\d \| \d+ \| \d+\.\d\d\d \|$/);
  assert.match(lines[5], /^share exactly 255, Lanczos minus fast: -?\d+\.\d\d percentage points; fast more than 1 point below Lanczos: (yes|no)$/);
});
