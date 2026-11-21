'use strict';
// BL13: bench/colors-real.js rejects bad usage in one line before any model is loaded, and a valid run on
// generated images prints the table (the real run needs bench/out/sub20, which CI lacks).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');

const SCRIPT = path.join(__dirname, '..', 'bench', 'colors-real.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-colorsreal-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const run = (args, extra = {}) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 60000, env: { ...process.env, PUSHUP_DEVICE: 'cpu' }, ...extra });

test('bad usage ends with exit 1, one stderr line, no stdout, and returns fast', () => {
  const empty = path.join(tmp, 'empty');
  fs.mkdirSync(empty);
  const cases = [
    [['--limit', '0'], /^--limit must be a positive integer$/],
    [['--limit', '1.5'], /^--limit must be a positive integer$/],
    [['--size', '399'], /^--size must be an integer from 400 to 800$/],
    [['--size', '801'], /^--size must be an integer from 400 to 800$/],
    [['--size', 'abc'], /^--size must be an integer from 400 to 800$/],
    [['--dir', path.join(tmp, 'nope')], /does not exist; run bash bench\/fetch_testset\.sh$/],
    [['--dir', empty], /^no images in /],
    [['--bogus'], /^unknown flag --bogus/],
    [['--dir', empty, 'stray'], /^unexpected argument stray/],
  ];
  for (const [args, re] of cases) {
    const t0 = Date.now();
    const r = run(args);
    assert.strictEqual(r.status, 1, `${args.join(' ')}: ${r.stderr}`);
    assert.strictEqual(r.stdout, '', `${args.join(' ')} printed to stdout`);
    const lines = r.stderr.trimEnd().split('\n');
    assert.strictEqual(lines.length, 1, `${args.join(' ')}: ${r.stderr}`);
    assert.match(lines[0], re);
    assert.ok(Date.now() - t0 < 5000, `${args.join(' ')} took too long`);
  }
});

test('a valid run on two generated images prints the table and --json prints one object', { timeout: 120000 }, async () => {
  const dir = path.join(tmp, 'two');
  fs.mkdirSync(dir);
  for (const [name, w, h] of [['a.png', 1000, 800], ['b.png', 800, 1000]]) {
    const buf = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 3, c = ((x >> 6) + (y >> 6)) & 1 ? 60 : 0;
      buf[k] = (x * 255 / w + c) & 255; buf[k + 1] = (y * 255 / h) & 255; buf[k + 2] = (200 - c) & 255;
    }
    await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(dir, name));
  }
  const t = run(['--dir', dir]);
  assert.strictEqual(t.status, 0, t.stderr);
  const lines = t.stdout.trimEnd().split('\n');
  assert.match(lines[0], /^images: 2; input 400 px, output 1000 px;/);
  const rows = lines.filter((l) => /^\| (whole image|more than 16 px)/.test(l));
  assert.strictEqual(rows.length, 12); // 2 regions x 2 methods x 3 channels
  for (const row of rows) {
    const c = row.split('|').slice(1, -1).map((s) => s.trim());
    assert.strictEqual(c.length, 6);
    for (const v of c.slice(3)) assert.ok(Number.isFinite(Number(v)), `"${v}" in ${row}`);
  }
  assert.match(lines[lines.length - 1], /^largest `fast` bias \(R\/G\/B, bytes\): /);

  const j = run(['--dir', dir, '--json']);
  assert.strictEqual(j.status, 0, j.stderr);
  const o = JSON.parse(j.stdout);
  assert.strictEqual(o.images, 2);
  assert.deepStrictEqual(Object.keys(o.methods), ['fast', 'lanczos']);
  for (const m of ['fast', 'lanczos']) for (const region of ['all', 'inner']) {
    assert.deepStrictEqual(o.methods[m][region].map((r) => r.channel), ['R', 'G', 'B']);
    for (const r of o.methods[m][region]) for (const k of ['bias', 'mean_abs', 'p99_abs']) assert.ok(Number.isFinite(r[k]), `${m} ${region} ${r.channel} ${k}`);
  }
  assert.strictEqual(o.largest_fast_bias.length, 2);
});

// BL22: p99 lives in bench/stats.js (the script runs on load), so a test can require it.
test('p99 of a 256-bin histogram: normal case, counts below the wanted count give 255, n = 0 gives 0', () => {
  const { p99 } = require('../bench/stats');
  const hist = (counts) => { const h = new Array(256).fill(0); for (const [v, c] of Object.entries(counts)) h[v] = c; return h; };
  assert.strictEqual(p99(hist({ 7: 10 }), 10), 7);
  assert.strictEqual(p99(hist({ 0: 98, 40: 1, 200: 1 }), 100), 40); // want = ceil(99) = 99: reached at bin 40
  assert.strictEqual(p99(hist({ 0: 98, 40: 1, 200: 1 }), 101), 200); // want = ceil(99.99) = 100: reached at bin 200
  // n > 0 but the bins add up to less than want = ceil(10 * 0.99) = 10: never reached, falls through to 255
  assert.strictEqual(p99(hist({}), 10), 255);
  assert.strictEqual(p99(hist({ 3: 9 }), 10), 255);
  // n = 0: want is 0, reached at bin 0 (current behaviour, pinned)
  assert.strictEqual(p99(hist({}), 0), 0);
});
