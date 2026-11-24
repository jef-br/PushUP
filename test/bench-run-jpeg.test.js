'use strict';
// BL42: bench/jpeg.js (README "Usage": a factor-1 call removes JPEG blocks; numbers in docs/JPEG.md). Runs the script on one
// generated 800x600 image in a temp folder (no download), checks its table, the missing-folder exit 1, and the blockiness
// helper on made-up arrays. Timeout 120 s (the one-image run takes a few seconds).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');
const { blockiness } = require('../bench/jpeg.js');

const script = path.join(__dirname, '..', 'bench', 'jpeg.js');
const run = (args) => spawnSync(process.execPath, [script, ...args], {
  encoding: 'utf8', timeout: 120000, env: { ...process.env, PUSHUP_DEVICE: 'cpu' },
});

test('blockiness: block borders that jump score above a smooth ramp; a flat image has none', () => {
  const w = 32, h = 16;
  const make = (f) => { const a = new Uint8Array(w * h * 3); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a.fill(f(x, y), (y * w + x) * 3, (y * w + x) * 3 + 3); return a; };
  const smooth = make((x) => x * 4);
  const blocky = make((x) => Math.floor(x / 8) * 32 + (x % 8)); // flat-ish inside blocks, a jump at every 8th column
  assert.ok(Math.abs(blockiness(smooth, w, h) - 1) < 0.2, `smooth ramp ${blockiness(smooth, w, h)}`);
  assert.ok(blockiness(blocky, w, h) > 3, `blocky ${blockiness(blocky, w, h)}`);
  assert.ok(Number.isNaN(blockiness(make(() => 100), w, h)));
});

test('jpeg.js exits 1 with a message when the folder is missing, and rejects a bad flag', () => {
  const r = run(['--dir', path.join(os.tmpdir(), 'pushup-no-such-folder-bl42')]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /does not exist; run bash bench\/fetch_testset\.sh/);
  assert.strictEqual(run(['--bogus', '1']).status, 1);
  assert.strictEqual(run(['--limit', '0']).status, 1);
});

test('jpeg.js prints one row per JPEG quality for one generated image', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-jpeg-'));
  try {
    const w = 800, h = 600, rgb = Buffer.alloc(w * h * 3);
    let s = 7; // seeded texture on a gradient, so the image is not flat
    for (let i = 0; i < rgb.length; i++) { s = (s * 1103515245 + 12345) >>> 0; rgb[i] = ((i / 3 % w) / 4 + ((s >>> 16) % 40)) & 255; }
    await sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(dir, 'a.png'));
    const r = run(['--dir', dir]);
    assert.strictEqual(r.status, 0, r.stderr);
    const lines = r.stdout.split('\n').filter((l) => l !== '');
    assert.match(lines[0], /^1 images from pushup-jpeg-/);
    assert.match(lines[1], /^\| JPEG quality \| images \| PSNR decoded JPEG \(dB\) \| PSNR `fast` output \(dB\) \| blockiness reference \| blockiness decoded JPEG \| blockiness `fast` output \| blockiness change \|$/);
    assert.match(lines[2], /^\|---\|/);
    assert.strictEqual(lines.length, 5, r.stdout);
    for (const [i, q] of [[3, '50'], [4, '75']]) {
      const c = lines[i].split('|').slice(1, -1).map((x) => x.trim());
      assert.strictEqual(c[0], q);
      assert.strictEqual(c[1], '1');
      assert.match(c[2], /^\d+\.\d\d$/);
      assert.match(c[7], /^-?\d+\.\d%$/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
