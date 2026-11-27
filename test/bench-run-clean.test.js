'use strict';
// BL73: bench/clean.js (docs/JPEG.md "Clean input at factor 1.0"). The real run needs bench/out/sub20, which CI lacks, so the run case
// uses a generated one-image folder. Measured 2026-11-27, 4 vCPU, CPU: the 20-image sub20 run takes about 29 s at 600 px; the generated
// one-image run about 1.5 s. Timeout 60 s.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');
const { meanAbsDiff } = require('../bench/clean.js');

const SCRIPT = path.join(__dirname, '..', 'bench', 'clean.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-clean-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 60000, env: { ...process.env, PUSHUP_DEVICE: 'cpu' } });

test('meanAbsDiff is the mean absolute byte difference', () => {
  assert.strictEqual(meanAbsDiff(Buffer.from([10, 20, 30, 40]), Buffer.from([12, 20, 27, 40])), 1.25);
  assert.strictEqual(meanAbsDiff(Buffer.from([5, 5, 5]), Buffer.from([5, 5, 5])), 0);
  assert.strictEqual(meanAbsDiff(Buffer.alloc(0), Buffer.alloc(0)), 0);
  assert.throws(() => meanAbsDiff(Buffer.alloc(3), Buffer.alloc(6)), RangeError);
});

test('bad flags exit 1 with one stderr line before any model loads', () => {
  for (const args of [['--size', '399'], ['--size', '801'], ['--size', 'x'], ['--limit', '0'], ['--bogus', '1']]) {
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

test('a run on one generated image prints the table shape', async () => {
  const dir = path.join(tmp, 'imgs');
  fs.mkdirSync(dir);
  const w = 500, h = 400, d = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set([(x * 255 / w) | 0, (y * 255 / h) | 0, ((x >> 4) + (y >> 4)) % 2 ? 200 : 60], (y * w + x) * 3);
  await sharp(d, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(dir, 'a.png'));
  const r = run(['--dir', dir, '--size', '400']);
  assert.strictEqual(r.status, 0, r.stderr);
  const lines = r.stdout.trim().split('\n');
  assert.match(lines[0], /^images: 1; input 400 px \(lanczos3, no JPEG\), factor 1, `fast` on CPU$/);
  assert.match(lines[1], /^\| input \| images \| PSNR \(dB\) \| SSIM \| GMSD \| mean abs diff per channel \| lowest PSNR \(dB\) \| lowest-PSNR image \|$/);
  assert.match(lines[3], /^\| 400 px \| 1 \| \d+\.\d\d \| \d\.\d{4} \| \d\.\d{4} \| \d+\.\d\d \| \d+\.\d\d \| a\.png \|$/);
  assert.match(lines[4], /^images below 30 dB: (none|a\.png)$/);
});

test('docs/JPEG.md has the BL73 section with the table row and the sentence agreeing with it', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'JPEG.md'), 'utf8');
  const at = doc.indexOf('## Clean input at factor 1.0 (BL73');
  assert.ok(at >= 0, 'no BL73 section');
  const sec = doc.slice(at);
  const row = sec.split('\n').find((l) => /^\| 600 px \|/.test(l));
  assert.ok(row, 'no 600 px row');
  const c = row.split('|').slice(1, -1).map((x) => x.trim());
  assert.strictEqual(c.length, 8);
  const [psnr, , , , lowest, name] = [c[2], c[3], c[4], c[5], c[6], c[7]];
  assert.ok(sec.includes(`mean PSNR between the output and the clean input is ${psnr} dB`), 'mean PSNR in the Result sentence differs from the table');
  const below = Number(lowest) < 30;
  assert.ok(sec.includes(below ? `${name}` : `no image falls below 30 dB (the lowest is \`${name}\` at ${lowest} dB)`), 'the below-30 dB statement disagrees with the table');
  // README quotes the mean PSNR rounded to one decimal.
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  assert.ok(readme.includes(`mean PSNR ${Number(psnr).toFixed(1)} dB against it`), 'README sentence differs from the table');
});
