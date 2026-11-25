'use strict';
// BL46: bench/neutral-real.js (docs/COLOR.md "Neutral backdrops on real photos (BL46)"). The real run needs bench/out/sub20,
// which CI lacks, so the run case uses a generated folder of two small images: a neutral gradient with noise (has regions)
// and a saturated red one (none). Measured 2026-11-24, 4 vCPU, CPU: the 20-image sub20 run takes about 11 s; the generated
// two-image run about 2 s. Timeout 60 s.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');
const { findBlocks, scaleBox, summary, newAcc, addBox } = require('../bench/neutral-real.js');

const SCRIPT = path.join(__dirname, '..', 'bench', 'neutral-real.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-neutralreal-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 60000, env: { ...process.env, PUSHUP_DEVICE: 'cpu' } });

const img = (w, h, f) => { const d = Buffer.alloc(w * h * 3); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(f(x, y), (y * w + x) * 3); return d; };

test('findBlocks keeps flat neutral blocks away from the edges and rejects the rest', () => {
  const w = 96, h = 96;
  // Grey 100 with a deterministic +-1 pattern (luma sd about 1): every inner 16x16 grid block qualifies (grid x, y = 16, 32, 48, 64).
  const grey = img(w, h, (x, y) => { const v = 100 + ((x * 7 + y * 13) % 3) - 1; return [v, v, v]; });
  const blocks = findBlocks(grey, w, h);
  assert.strictEqual(blocks.length, 16);
  assert.ok(blocks.every((b) => b.x >= 16 && b.y >= 16 && b.x + 16 <= w - 16 && b.y + 16 <= h - 16));
  // Perfectly flat: luma sd 0 < 0.5, no block.
  assert.strictEqual(findBlocks(img(w, h, () => [100, 100, 100]), w, h).length, 0);
  // Too noisy: luma sd above 8.
  assert.strictEqual(findBlocks(img(w, h, (x, y) => { const v = (x + y) % 2 ? 80 : 120; return [v, v, v]; }), w, h).length, 0);
  // Colour cast above 2 in one pixel of one block rejects exactly that block.
  const cast = Buffer.from(grey); cast[((20 * w) + 20) * 3] += 5;
  assert.strictEqual(findBlocks(cast, w, h).length, 15);
  // Saturated: none. Too small for any block: none.
  assert.strictEqual(findBlocks(img(w, h, () => [255, 0, 0]), w, h).length, 0);
  assert.strictEqual(findBlocks(img(40, 40, () => [100, 101, 100]), 40, 40).length, 0);
});

test('scaleBox rounds the edges inward and clamps to the output', () => {
  assert.deepStrictEqual(scaleBox({ x: 16, y: 16 }, 2.5, 1000, 750), { x0: 40, y0: 40, x1: 80, y1: 80 });
  assert.deepStrictEqual(scaleBox({ x: 17, y: 16 }, 2.5, 1000, 750), { x0: 43, y0: 40, x1: 82, y1: 80 });
  assert.deepStrictEqual(scaleBox({ x: 100, y: 100 }, 2.5, 280, 270), { x0: 250, y0: 250, x1: 280, y1: 270 });
});

test('summary counts mean, 99th percentile and the share of spread >= 3', () => {
  const a = newAcc();
  const data = Buffer.from([10, 10, 10, 10, 13, 10, 0, 0, 0, 0, 0, 0]); // spreads 0, 3, 0, 0
  addBox(a, data, 4, { x0: 0, y0: 0, x1: 4, y1: 1 });
  const s = summary(a);
  assert.deepStrictEqual([s.pixels, s.mean, s.p99, s.share3], [4, 0.75, 3, 25]);
});

test('missing folder: exit 1 with the fetch hint; bad usage: exit 1', () => {
  const r = run(['--dir', path.join(tmp, 'nope')]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr.trim(), /does not exist; run bash bench\/fetch_testset\.sh$/);
  assert.strictEqual(r.stdout, '');
  assert.strictEqual(run(['--size', '399']).status, 1);
});

test('--mix rejects bad values with exit 1 and --mix 0 on a generated folder prints the table (BL47)', async () => {
  for (const bad of ['1.5', 'x', '-0.1']) {
    const r = run(['--dir', tmp, '--mix', bad]);
    assert.strictEqual(r.status, 1, bad);
    assert.strictEqual(r.stderr.trim(), '--mix must be a number from 0 to 1');
    assert.strictEqual(r.stdout, '');
  }
  const dir = path.join(tmp, 'mix');
  fs.mkdirSync(dir);
  const w = 600, h = 450;
  const grey = img(w, h, (x, y) => { const v = Math.round(140 + (x / w) * 20 + (((x * 31 + y * 17) % 5) - 2)); return [v, v, v]; });
  await sharp(grey, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(dir, 'a_grey.png'));
  const r0 = run(['--dir', dir, '--mix', '0']);
  assert.strictEqual(r0.status, 0, r0.stderr);
  const lines = r0.stdout.split('\n').filter((l) => l !== '');
  assert.match(lines[0], /^images: 1; with a region: 1;/);
  assert.match(lines[4], /^\| `fast` \| \d+ \| \d+\.\d\d \| \d+ \| \d+\.\d\d \|$/);
  // --mix 0.2 is the shipped mix: same output as no flag.
  assert.strictEqual(run(['--dir', dir, '--mix', '0.2']).stdout, run(['--dir', dir]).stdout);
});

test('--quality rejects bad values with exit 1; --quality fast prints the same table as no flag (BL49)', async () => {
  for (const bad of ['bogus', 'auto', '']) {
    const r = run(['--dir', tmp, '--quality', bad]);
    assert.strictEqual(r.status, 1, bad);
    assert.strictEqual(r.stderr.trim(), '--quality must be fast or high');
    assert.strictEqual(r.stdout, '');
  }
  const dir = path.join(tmp, 'quality');
  fs.mkdirSync(dir);
  const w = 600, h = 450;
  const grey = img(w, h, (x, y) => { const v = Math.round(140 + (x / w) * 20 + (((x * 31 + y * 17) % 5) - 2)); return [v, v, v]; });
  await sharp(grey, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(dir, 'a_grey.png'));
  assert.strictEqual(run(['--dir', dir, '--quality', 'fast']).stdout, run(['--dir', dir]).stdout);
});

// Opt-in (PUSHUP_SLOW_TESTS=1): runs the real `high` model (about 30x slower than `fast`) on a generated one-image folder.
test('--quality high labels the row and the result line with the mode (BL49)',
  { skip: process.env.PUSHUP_SLOW_TESTS === '1' ? false : 'set PUSHUP_SLOW_TESTS=1', timeout: 300000 }, async () => {
  const dir = path.join(tmp, 'quality-high');
  fs.mkdirSync(dir);
  const w = 600, h = 450;
  const grey = img(w, h, (x, y) => { const v = Math.round(140 + (x / w) * 20 + (((x * 31 + y * 17) % 5) - 2)); return [v, v, v]; });
  await sharp(grey, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(dir, 'a_grey.png'));
  const h1 = spawnSync(process.execPath, [SCRIPT, '--dir', dir, '--quality', 'high'], { encoding: 'utf8', timeout: 300000, env: { ...process.env, PUSHUP_DEVICE: 'cpu' } });
  assert.strictEqual(h1.status, 0, h1.stderr);
  assert.match(h1.stdout.split('\n')[4], /^\| `high` \|/);
  assert.match(h1.stdout, /\nshare >= 3, high minus Lanczos:/);
});

test('a generated folder of two images prints the table and lists the saturated one as "no region"', async () => {
  const dir = path.join(tmp, 'imgs');
  fs.mkdirSync(dir);
  const w = 600, h = 450;
  const grey = img(w, h, (x, y) => { const v = Math.round(140 + (x / w) * 20 + (((x * 31 + y * 17) % 5) - 2)); return [v, v, v]; });
  await sharp(grey, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(dir, 'a_grey.png'));
  await sharp(img(w, h, () => [255, 0, 0]), { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(dir, 'b_red.png'));
  const r = run(['--dir', dir]);
  assert.strictEqual(r.status, 0, r.stderr);
  const lines = r.stdout.split('\n').filter((l) => l !== '');
  assert.match(lines[0], /^images: 2; with a region: 1; blocks: \d+; input 400 px, output 1000 px$/);
  assert.strictEqual(lines[1], 'no region: b_red.png');
  assert.strictEqual(lines[2], '| method | pixels | mean spread | 99th percentile spread | share of pixels with spread >= 3 (%) |');
  assert.match(lines[3], /^\|---\|/);
  assert.match(lines[4], /^\| `fast` \| \d+ \| \d+\.\d\d \| \d+ \| \d+\.\d\d \|$/);
  assert.match(lines[5], /^\| Lanczos \| \d+ \| \d+\.\d\d \| \d+ \| \d+\.\d\d \|$/);
  assert.match(lines[6], /^share >= 3, fast minus Lanczos: -?\d+\.\d\d percentage points; more than 1 point above Lanczos: (yes|no)$/);
});

// BL48: docs/COLOR.md "800 px and 600 px input (BL48...)" keeps its table shape: three input sizes, `fast` and Lanczos rows, and the
// yes/no result sentence agrees with the table. Reads the file only, no model run.
test('docs/COLOR.md BL48 table: rows for 400, 600 and 800 px, and the result sentence matches the shares', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'COLOR.md'), 'utf8');
  const at = doc.indexOf('### 800 px and 600 px input (BL48');
  assert.ok(at >= 0, 'section missing');
  const end = doc.indexOf('\n### ', at + 5);
  const rows = doc.slice(at, end < 0 ? undefined : end).split('\n').filter((l) => l.startsWith('|')).slice(2).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
  assert.deepStrictEqual(rows.map((r) => `${r[0].split(' ')[0]} ${r[4]}`), ['400 `fast`', '400 Lanczos', '600 `fast`', '600 Lanczos', '800 `fast`', '800 Lanczos']);
  for (const r of rows) assert.strictEqual(r.length, 8, r.join(' | '));
  for (const px of ['600', '800']) {
    const share = (m) => Number(rows.find((r) => r[0].startsWith(px) && r[4] === m)[7]);
    const diff = share('`fast`') - share('Lanczos');
    assert.ok(diff > 1, `${px} px: difference ${diff} should be above 1 point`);
    // The sentence quotes the script's unrounded difference; the table cells are rounded, so allow 0.011.
    const quoted = Number(doc.match(new RegExp(`${px} px yes \\(([0-9.]+) points above\\)`))[1]);
    assert.ok(Math.abs(quoted - diff) <= 0.011, `${px} px: sentence says ${quoted}, table gives ${diff}`);
  }
});
