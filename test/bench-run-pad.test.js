'use strict';
// HP5: a valid run of bench/pad.js on generated images (the real run needs bench/out/sub20, which CI lacks).
// Asserts the shape of the output and that every metric is finite; no absolute quality number (it depends on
// the sharp build). Argument checks are in test/pad-args.test.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');

const SCRIPT = path.join(__dirname, '..', 'bench', 'pad.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-padrun-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// A gradient with a few hard edges (blocks), RGB.
async function writeImage(file, w, h) {
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const block = ((x >> 6) + (y >> 6)) & 1;
      buf[i] = block ? 220 : (x * 255 / w) | 0;
      buf[i + 1] = block ? 30 : (y * 255 / h) | 0;
      buf[i + 2] = ((x + y) * 255 / (w + h)) | 0;
    }
  }
  await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toFile(file);
}

function run(args) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8', timeout: 300000, // ~10 s alone; CI runs test files in parallel on 4 vCPU and the 60 s limit was hit (F-2026-11-19-0025)
    env: { ...process.env, PUSHUP_DEVICE: 'cpu' },
  });
  return { status: r.status, out: r.stdout, err: r.stderr, elapsed: Date.now() - t0 };
}

function cells(line) { return line.split('|').slice(1, -1).map((c) => c.trim()); }

test('bench/pad.js on two generated images prints the header and the three variant rows', async () => {
  const dir = path.join(tmp, 'two');
  fs.mkdirSync(dir);
  await writeImage(path.join(dir, 'a.png'), 900, 600);
  await writeImage(path.join(dir, 'b.png'), 600, 900);
  const r = run(['--dir', dir, '--limit', '2']);
  assert.strictEqual(r.status, 0, r.err);
  assert.strictEqual(r.err, '');
  const lines = r.out.split('\n');
  assert.match(lines[0], /^images scored: 2 of 2; /);
  const rows = lines.filter((l) => /^\| (as is|padded 16 px|padded - as is) \|/.test(l));
  assert.deepStrictEqual(rows.map((l) => cells(l)[0]), ['as is', 'padded 16 px', 'padded - as is']);
  for (const row of rows) {
    const c = cells(row).slice(1); // nine metric columns: whole, interior, border x PSNR, SSIM, GMSD
    assert.strictEqual(c.length, 9);
    for (const v of c) assert.ok(Number.isFinite(Number(v)), `non-finite cell "${v}" in ${row}`);
  }
  assert.match(r.out, /whole-image gate .*: (PASS|FAIL)/);
  console.log(`bench/pad.js two-image run: ${r.elapsed} ms`);
});

test('--limit 1 scores one image', async () => {
  const dir = path.join(tmp, 'one');
  fs.mkdirSync(dir);
  await writeImage(path.join(dir, 'a.png'), 900, 600);
  await writeImage(path.join(dir, 'b.png'), 600, 900);
  const r = run(['--dir', dir, '--limit', '1']);
  assert.strictEqual(r.status, 0, r.err);
  assert.match(r.out.split('\n')[0], /^images scored: 1 of 1; /);
});
