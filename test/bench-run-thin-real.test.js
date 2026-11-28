'use strict';
// BL78: bench/thin-real.js (docs/EDGES.md "Thin real features (BL78)"). The real run needs bench/out/sub20, which CI lacks,
// so the run case uses a generated folder with one small image (white page with dark 1 px and 3 px lines). Timeout 120 s.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');
const { thinFeatures, score, lumaOf, pasteLine } = require('../bench/thin-real.js');

const SCRIPT = path.join(__dirname, '..', 'bench', 'thin-real.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-thin-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 120000, env: { ...process.env, PUSHUP_DEVICE: 'cpu' } });

test('thinFeatures finds runs of 1 to 3 dark pixels and not a 4 px run, an edge or a low-contrast line', () => {
  const w = 40, h = 12, ref = new Float32Array(w * h).fill(200);
  const col = (x, v) => { for (let y = 0; y < h; y++) ref[y * w + x] = v; };
  col(5, 100); // 1 px line: 100 darker than both sides
  col(12, 60); col(13, 60); col(14, 60); // 3 px line
  for (const x of [20, 21, 22, 23]) col(x, 60); // 4 px: too wide
  col(30, 180); // 20 darker only: below the 40 rule
  const f = thinFeatures(ref, w, h);
  assert.strictEqual(f.get(3 * w + 5), 100);
  assert.strictEqual(f.get(3 * w + 12), 60);
  assert.strictEqual(f.get(3 * w + 14), 60);
  assert.ok(!f.has(3 * w + 20), '4 px run is not thin');
  assert.ok(!f.has(3 * w + 30), 'low contrast');
  assert.ok(!f.has(3 * w + 8), 'flat');
  const flatRow = new Float32Array(w * h).fill(200);
  for (let x = 20; x < w; x++) for (let y = 0; y < h; y++) flatRow[y * w + x] = 20; // a step edge
  assert.strictEqual(thinFeatures(flatRow, w, h).size, 0);
});

test('score counts the feature pixels whose output lies below the dark level by more than 8, 16 and 24', () => {
  const feats = new Map([[0, 100], [1, 100], [2, 100], [3, 100]]);
  const out = Float32Array.from([100, 90, 80, 60]); // undershoot 0, 10, 20, 40
  const s = score(feats, out);
  assert.deepStrictEqual([s.n, ...s.over, s.max], [4, 3, 2, 1, 40]);
});

test('pasteLine puts a 1 px line of 40 on a 215 patch and leaves the input untouched', () => {
  const inp = { data: Buffer.alloc(100 * 300 * 3, 128), w: 100, h: 300 };
  const p = pasteLine(inp);
  assert.strictEqual(inp.data[0], 128);
  const l = lumaOf(p.data, 100 * 300);
  assert.ok(Math.abs(l[p.y0 * 100 + p.cx] - 40) < 0.01);
  assert.ok(Math.abs(l[p.y0 * 100 + p.cx + 1] - 215) < 0.01);
  assert.strictEqual(l[0], 128);
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

test('a run on a generated image prints the table shape and the control verdict', async () => {
  const dir = path.join(tmp, 'imgs');
  fs.mkdirSync(dir);
  const w = 500, h = 400, d = Buffer.alloc(w * h * 3, 235);
  for (let y = 0; y < h; y++) for (const x of [100, 101, 250, 251, 252]) d.fill(30, (y * w + x) * 3, (y * w + x) * 3 + 3);
  await sharp(d, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(dir, 'a.png'));
  const r = run(['--dir', dir, '--limit', '1']);
  assert.strictEqual(r.status, 0, r.stderr);
  const lines = r.stdout.trim().split('\n');
  assert.match(lines[0], /^images: 1; input 400 px; rule: /);
  assert.match(lines[1], /^\| factor \| method \| feature pixels \| undershoot > 8 \| > 16 \| > 24 \| largest \(levels\) \|$/);
  assert.match(lines[3], /^\| 1\.0 \| `fast` \| \d+ \| [\d.]+ % \(\d+\) \| [\d.]+ % \(\d+\) \| [\d.]+ % \(\d+\) \| \d+\.\d \|$/);
  assert.match(lines[4], /^\| 1\.0 \| Lanczos \| \d+ /);
  assert.match(lines[5], /^\| 2\.5 \| `fast` \| \d+ /);
  assert.match(lines[7], /^control \(1 px line of 40 on 215 pasted into a\.png\)/);
  assert.match(lines[8], /^ {2}factor 1\.0 fast: \d+\.\d \/ \d+\.\d$/);
  assert.match(lines[lines.length - 1], /^control: fast reads \d+\.\d levels below the dark level at factor 2\.5, (at least 15: the real-photo numbers are a result|under 15: .*INCONCLUSIVE)$/);
  const fastRow = lines[5].split('|').map((c) => c.trim());
  assert.ok(Number(fastRow[3]) > 0, 'the generated lines are found as feature pixels');
});
