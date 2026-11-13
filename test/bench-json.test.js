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
    // Values are unrounded (the table rounds to 2/4/4 decimals; JSON must keep full precision).
    assert.ok(out.rows.some((x) => x.ssim !== Number(x.ssim.toFixed(4)) && x.gmsd !== Number(x.gmsd.toFixed(4))),
      'psnr/ssim/gmsd look rounded; --json should print full precision');
    assert.ok(out.rows.some((x) => x.psnr !== Number(x.psnr.toFixed(2))), 'psnr looks rounded');
    // Without --json the table is printed (not JSON).
    const t = spawnSync(process.execPath,
      [path.join(__dirname, '..', 'bench', 'bench.js'), dir, '--sizes', '400', '--methods', 'lanczos'], { encoding: 'utf8' });
    assert.match(t.stdout, /^images: 3 /);
    assert.match(t.stdout, /400px lanczos/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('aspectGroup: portrait, landscape and square by size', () => {
  const { aspectGroup } = require('../bench/aspect');
  assert.strictEqual(aspectGroup(750, 1000), 'portrait');
  assert.strictEqual(aspectGroup(1000, 750), 'landscape');
  assert.strictEqual(aspectGroup(1000, 1000), 'square');
  assert.strictEqual(aspectGroup(999, 1000), 'portrait');
  assert.strictEqual(aspectGroup(1000, 999), 'landscape');
  assert.strictEqual(aspectGroup(1, 1), 'square');
});

test('bench.js --by-aspect adds portrait/landscape/square rows after overall and per-source rows (json and table)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-bench-aspect-'));
  try {
    const shapes = { 'abo_land.png': [1000, 750], 'abo_port.png': [750, 1000], 'lamoda_sq.png': [1000, 1000] };
    for (const [name, [w, h]] of Object.entries(shapes)) {
      const raw = Buffer.alloc(w * h * 3);
      for (let i = 0; i < raw.length; i++) raw[i] = (i * 29 + name.length * 5) & 255;
      await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(dir, name));
    }
    const bench = path.join(__dirname, '..', 'bench', 'bench.js');
    const base = [bench, dir, '--sizes', '400', '--methods', 'lanczos'];
    const r = spawnSync(process.execPath, [...base, '--by-source', '--by-aspect', '--json'], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepStrictEqual(out.rows.map((x) => x.setting), [
      '400px lanczos', '400px lanczos [abo]', '400px lanczos [lamoda]',
      '400px lanczos [landscape]', '400px lanczos [portrait]', '400px lanczos [square]',
    ]); // order: overall, per-source, per-aspect (first-seen order within a group)
    // --by-aspect alone: overall row, then aspect rows only.
    const a = JSON.parse(spawnSync(process.execPath, [...base, '--by-aspect', '--json'], { encoding: 'utf8' }).stdout);
    assert.deepStrictEqual(a.rows.map((x) => x.setting).sort(),
      ['400px lanczos', '400px lanczos [landscape]', '400px lanczos [portrait]', '400px lanczos [square]'].sort());
    assert.strictEqual(a.rows[0].setting, '400px lanczos');
    // Overall numbers do not change with the flag.
    const plain = JSON.parse(spawnSync(process.execPath, [...base, '--json'], { encoding: 'utf8' }).stdout);
    assert.strictEqual(plain.rows.length, 1);
    for (const k of ['psnr', 'ssim', 'gmsd']) assert.strictEqual(a.rows[0][k], plain.rows[0][k]);
    // Table output has the rows too.
    const t = spawnSync(process.execPath, [...base, '--by-aspect'], { encoding: 'utf8' });
    for (const g of ['portrait', 'landscape', 'square']) assert.match(t.stdout, new RegExp(`400px lanczos \\[${g}\\]`));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
