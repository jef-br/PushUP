'use strict';
// S3: bench/bench.js --json prints exactly one JSON object and nothing else on stdout.
// Uses tiny synthetic images and the model-free `lanczos` method so it runs anywhere, fast.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');

test('bench.js --json prints one JSON object with overall and per-source rows', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-bench-'));
  try {
    for (const name of ['abo_a.png', 'abo_b.png', 'lamoda_c.png']) {
      const raw = Buffer.alloc(1000 * 750 * 3);
      for (let i = 0; i < raw.length; i++) raw[i] = (i * 31 + name.length * 7) & 255;
      await sharp(raw, { raw: { width: 1000, height: 750, channels: 3 } }).png().toFile(path.join(dir, name));
    }
    const r = spawnSync(process.execPath,
      [path.join(__dirname, '..', 'bench', 'bench.js'), dir, '--sizes', '400', '--methods', 'lanczos', '--by-source', '--json'],
      { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout); // throws if anything but one JSON document is on stdout
    assert.strictEqual(out.images, 3);
    assert.deepStrictEqual(out.rows.map((x) => x.setting),
      ['400px lanczos', '400px lanczos [abo]', '400px lanczos [lamoda]']);
    for (const row of out.rows) {
      for (const k of ['psnr', 'ssim', 'gmsd', 'ms']) assert.ok(Number.isFinite(row[k]), `${row.setting}: ${k} is not a number`);
    }
    // Without --json the table is printed (not JSON).
    const t = spawnSync(process.execPath,
      [path.join(__dirname, '..', 'bench', 'bench.js'), dir, '--sizes', '400', '--methods', 'lanczos'], { encoding: 'utf8' });
    assert.match(t.stdout, /^images: 3 /);
    assert.match(t.stdout, /400px lanczos/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
