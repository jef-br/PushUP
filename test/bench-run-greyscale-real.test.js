'use strict';
// BL72: bench/greyscale-real.js (docs/COLOR.md "Greyscale photos (BL72)"). The real run needs bench/out/sub20, which CI lacks, so the run
// case uses a generated folder of two small images. Measured 2026-11-27, 4 vCPU, CPU: the 20-image sub20 run takes about 13 s at 400 px;
// the generated two-image run about 2 s. Timeout 60 s.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');
const { toGrey, newAcc, addInterior, summary } = require('../bench/greyscale-real.js');

const SCRIPT = path.join(__dirname, '..', 'bench', 'greyscale-real.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-greyreal-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 60000, env: { ...process.env, PUSHUP_DEVICE: 'cpu' } });

test('toGrey sets every channel to the rounded Rec. 601 luma', () => {
  const g = toGrey(Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 10, 10, 10, 255, 255, 255]));
  assert.deepStrictEqual([...g], [76, 76, 76, 150, 150, 150, 29, 29, 29, 10, 10, 10, 255, 255, 255]); // 0.299*255 = 76.2, 0.587*255 = 149.7, 0.114*255 = 29.07
});

test('addInterior counts the spread of pixels more than 16 px from every edge only', () => {
  const w = 40, h = 40, data = Buffer.alloc(w * h * 3, 100);
  const set = (x, y, r, g, b) => data.set([r, g, b], (y * w + x) * 3);
  set(20, 20, 100, 103, 100); // interior, spread 3
  set(21, 20, 100, 100, 190); // interior, spread 90
  set(5, 5, 0, 0, 255); // inside the border band: ignored
  const a = newAcc();
  addInterior(a, data, w, h);
  assert.strictEqual(a.n, (40 - 32) * (40 - 32));
  const s = summary(a);
  assert.strictEqual(s.max, 90);
  assert.strictEqual(s.share3, (100 * 2) / a.n);
  assert.ok(Math.abs(s.mean - 93 / a.n) < 1e-12);
  assert.strictEqual(s.p99, 90); // 64 pixels: the 99th percentile needs all 64, so it is the largest spread
});

test('bad flags exit 1 with one stderr line before any model loads', () => {
  for (const args of [['--size', '399'], ['--size', 'x'], ['--limit', '0'], ['--jpeg', '49'], ['--jpeg', '101'], ['--jpeg', '85.5'], ['--bogus', '1']]) {
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

test('a run on two generated images prints the table; Lanczos stays exactly neutral', async () => {
  const dir = path.join(tmp, 'imgs');
  fs.mkdirSync(dir);
  const mk = (name, f) => { const w = 500, h = 400, d = Buffer.alloc(w * h * 3); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(f(x, y), (y * w + x) * 3); return sharp(d, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(dir, name)); };
  await mk('a.png', (x, y) => [(x * 255 / 500) | 0, (y * 255 / 400) | 0, 128]);
  await mk('b.png', (x, y) => ((x >> 4) + (y >> 4)) % 2 ? [220, 40, 40] : [30, 30, 200]);
  const r = run(['--dir', dir]);
  assert.strictEqual(r.status, 0, r.stderr);
  const lines = r.stdout.trim().split('\n');
  assert.match(lines[0], /^images: 2; input 400 px, output 1000 px; greyscale inputs \(R = G = B\)$/);
  assert.match(lines[1], /^\| method \| pixels \| mean spread \| 99th percentile spread \| share of pixels with spread >= 3 \(%\) \| largest spread \|$/);
  assert.match(lines[3], /^\| `fast` \| \d+ \| \d+\.\d\d \| \d+ \| \d+\.\d\d \| \d+ \|$/);
  assert.match(lines[4], /^\| Lanczos \| \d+ \| 0\.00 \| 0 \| 0\.00 \| 0 \|$/);
  assert.match(lines[5], /^share >= 3, fast minus Lanczos: -?\d+\.\d\d percentage points; more than 1 point above Lanczos: (yes|no)$/);
  const q = run(['--dir', dir, '--jpeg', '70']);
  assert.strictEqual(q.status, 0, q.stderr);
  assert.match(q.stdout.split('\n')[0], /; input JPEG q70; greyscale inputs/);
});
