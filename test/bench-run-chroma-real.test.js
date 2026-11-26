'use strict';
// BL58: bench/chroma-real.js (docs/COLOR.md "Flat coloured backdrops (BL58)"). The real run needs bench/out/sub20, which CI lacks, so the
// run case uses a generated folder of two small images: a blue backdrop with a gentle horizontal gradient (flat enough, has regions) and a neutral grey one (none).
// Timeout 60 s per child; the two-image run takes a few seconds.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');
const { findColourBlocks, chromaNoise } = require('../bench/chroma-real.js');

const SCRIPT = path.join(__dirname, '..', 'bench', 'chroma-real.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-chromareal-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 60000, env: { ...process.env, PUSHUP_DEVICE: 'cpu' } });
const img = (w, h, f) => { const d = Buffer.alloc(w * h * 3); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(f(x, y), (y * w + x) * 3); return d; };
const noise = (x, y) => ((x * 7 + y * 13) % 5) - 2; // -2 .. 2

test('findColourBlocks keeps flat coloured blocks and rejects grey, perfectly flat, noisy and too small ones', () => {
  const w = 96, h = 96;
  // Blue backdrop with +-2 noise: mean spread about 140, deviation <= 2, luma sd about 1: every inner grid block (x, y = 16, 32, 48, 64) qualifies.
  const blue = img(w, h, (x, y) => [60 + noise(x, y), 120 + noise(y, x), 200 + noise(x, x + y)]);
  const blocks = findColourBlocks(blue, w, h);
  assert.strictEqual(blocks.length, 16);
  assert.ok(blocks.every((b) => b.x >= 16 && b.y >= 16 && b.x + 16 <= w - 16 && b.y + 16 <= h - 16));
  // Grey (spread 0): below the mean-spread floor of 20. A weak colour (blue 18 levels above red and green, mean spread about 19): below; 22 levels (about 23): kept.
  assert.strictEqual(findColourBlocks(img(w, h, (x, y) => { const v = 100 + noise(x, y); return [v, v, v]; }), w, h).length, 0);
  assert.strictEqual(findColourBlocks(img(w, h, (x, y) => [100 + noise(x, y), 100 + noise(y, x), 118]), w, h).length, 0);
  assert.strictEqual(findColourBlocks(img(w, h, (x, y) => [100 + noise(x, y), 100 + noise(y, x), 122]), w, h).length, 16);
  // Perfectly flat colour: luma sd 0 < 0.5, none.
  assert.strictEqual(findColourBlocks(img(w, h, () => [60, 120, 200]), w, h).length, 0);
  // One pixel 7 levels off its block mean rejects exactly that block (the mean moves by 0.04).
  const spike = Buffer.from(blue); spike[((20 * w) + 20) * 3 + 2] += 10;
  assert.strictEqual(findColourBlocks(spike, w, h).length, 15);
  // Noisy: deviation above 6 everywhere. Too small for any block: none.
  assert.strictEqual(findColourBlocks(img(w, h, (x, y) => ((x + y) % 2 ? [40, 100, 180] : [80, 140, 220])), w, h).length, 0);
  assert.strictEqual(findColourBlocks(img(40, 40, () => [60, 120, 200]), 40, 40).length, 0);
});

test('chromaNoise is the population standard deviation of R-G and of B-G inside the box', () => {
  // R-G = 0, 4, 0, 4 (sd 2); B-G = 0, 0, 0, 0 (sd 0).
  const row = Buffer.from([10, 10, 10, 14, 10, 10, 10, 10, 10, 14, 10, 10]);
  assert.deepStrictEqual(chromaNoise(row, 4, { x0: 0, y0: 0, x1: 4, y1: 1 }), [2, 0]);
  // Only the first two pixels: R-G = 0, 4 (sd 2).
  assert.deepStrictEqual(chromaNoise(row, 4, { x0: 0, y0: 0, x1: 2, y1: 1 }), [2, 0]);
  // B-G = -3, 3 (sd 3), R-G = 0.
  assert.deepStrictEqual(chromaNoise(Buffer.from([5, 5, 2, 5, 5, 8]), 2, { x0: 0, y0: 0, x1: 2, y1: 1 }), [0, 3]);
  // An empty box is [0, 0], not NaN.
  assert.deepStrictEqual(chromaNoise(row, 4, { x0: 2, y0: 0, x1: 2, y1: 1 }), [0, 0]);
});

test('bad flags and a missing folder exit 1 with one stderr line before any model loads', () => {
  const cases = [
    [['--limit', '0'], '--limit must be a positive integer'],
    [['--size', '399'], '--size must be an integer from 400 to 800'],
    [['--size', '801'], '--size must be an integer from 400 to 800'],
    [['--size', 'x'], '--size must be an integer from 400 to 800'],
    [['--jpeg', '49'], '--jpeg must be an integer from 50 to 100'],
    [['--jpeg', '101'], '--jpeg must be an integer from 50 to 100'],
    [['--jpeg', 'x'], '--jpeg must be an integer from 50 to 100'],
    [['--jpeg', '85.5'], '--jpeg must be an integer from 50 to 100'],
    [['--quality', 'medium'], '--quality must be fast or high'],
    [['--quality', 'HIGH'], '--quality must be fast or high'],
    [['--quality', ''], '--quality must be fast or high'],
    [['--dir', path.join(tmp, 'nope')], /does not exist; run bash bench\/fetch_testset\.sh$/],
  ];
  for (const [args, want] of cases) {
    const r = run(args);
    assert.strictEqual(r.status, 1, args.join(' '));
    assert.strictEqual(r.stdout, '');
    if (typeof want === 'string') assert.strictEqual(r.stderr.trim(), want); else assert.match(r.stderr.trim(), want);
  }
  const unknown = run(['--bogus']);
  assert.strictEqual(unknown.status, 1);
  assert.strictEqual(unknown.stdout, '');
  assert.match(unknown.stderr, /unknown flag --bogus/);
});

test('a generated folder of a blue and a grey image prints the table and lists the grey one as "no region"', async () => {
  const dir = path.join(tmp, 'imgs');
  fs.mkdirSync(dir);
  const w = 600, h = 450;
  const blue = img(w, h, (x, y) => [Math.round(40 + (x / w) * 120), Math.round(100 + (x / w) * 120), Math.round(160 + (x / w) * 60)]);
  await sharp(blue, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(dir, 'a_blue.png'));
  const grey = img(w, h, (x, y) => { const v = 140 + (((x * 31 + y * 17) % 5) - 2); return [v, v, v]; });
  await sharp(grey, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(dir, 'b_grey.png'));
  const r = run(['--dir', dir]);
  assert.strictEqual(r.status, 0, r.stderr);
  const lines = r.stdout.split('\n').filter((l) => l !== '');
  assert.match(lines[0], /^images: 2; with a region: 1; blocks: \d+; input 400 px, output 1000 px$/);
  assert.strictEqual(lines[1], 'no region: b_grey.png');
  assert.strictEqual(lines[2], '| method | blocks | mean sd of R-G | mean sd of B-G |');
  assert.match(lines[3], /^\|---\|/);
  assert.match(lines[4], /^\| `fast` \| \d+ \| \d+\.\d\d \| \d+\.\d\d \|$/);
  assert.match(lines[5], /^\| Lanczos \| \d+ \| \d+\.\d\d \| \d+\.\d\d \|$/);
  assert.match(lines[6], /^chroma noise, fast \/ Lanczos: R-G \d+\.\d\dx, B-G \d+\.\d\dx; at least twice Lanczos in both: (yes|no)$/);
});

test('--jpeg 85 equals no flag; --jpeg 60 adds the suffix and keeps the table shape (BL60)', async () => {
  const dir = path.join(tmp, 'imgs'); // written by the previous test
  const base = run(['--dir', dir]), same = run(['--dir', dir, '--jpeg', '85']), q60 = run(['--dir', dir, '--jpeg', '60']);
  assert.strictEqual(base.status, 0, base.stderr);
  assert.strictEqual(same.status, 0, same.stderr);
  assert.strictEqual(q60.status, 0, q60.stderr);
  assert.strictEqual(same.stdout, base.stdout);
  const a = base.stdout.split('\n'), b = q60.stdout.split('\n');
  assert.ok(!a[0].includes('input JPEG'));
  assert.match(b[0], /output 1000 px; input JPEG q60$/);
  assert.strictEqual(b.length, a.length);
  assert.match(b[2], /^\| method \|/);
  assert.match(b[4], /^\| `fast` \| \d+ \| \d+\.\d\d \| \d+\.\d\d \|$/);
});

test('--quality fast equals no flag (BL64); high is not run here, it takes about 15 s per image', () => {
  const dir = path.join(tmp, 'imgs'); // written by the generated-folder test above
  const base = run(['--dir', dir]), fast = run(['--dir', dir, '--quality', 'fast']);
  assert.strictEqual(base.status, 0, base.stderr);
  assert.strictEqual(fast.status, 0, fast.stderr);
  assert.strictEqual(fast.stdout, base.stdout);
  assert.ok(!base.stdout.split('\n')[0].includes('quality high'));
  assert.match(base.stdout, /\| `fast` \|/);
});
