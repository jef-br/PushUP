'use strict';
// BL51: bench/grey-step.js (offline grey-preserving step, docs/COLOR.md "Grey-preserving step, offline (BL51)") and the shared
// ground-truth helper bench/groundtruth.js that bench/bench.js and the script use. The real run needs bench/out/sub20, which CI lacks,
// so the run case uses a generated folder of two small images (a noisy neutral gradient with regions, a saturated red one).
// Timeout 60 s per child; the two-image run takes a few seconds.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');
const { greyStep, gate } = require('../bench/grey-step.js');
const { loadGt, inputAt, crop } = require('../bench/groundtruth.js');

const SCRIPT = path.join(__dirname, '..', 'bench', 'grey-step.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-greystep-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 60000, env: { ...process.env, PUSHUP_DEVICE: 'cpu' } });

test('greyStep sets pixels with spread <= T to their rounded channel mean and copies the rest', () => {
  // spreads: 0, 2, 3, 4, 20
  const px = Buffer.from([50, 50, 50, 10, 11, 12, 10, 10, 13, 20, 22, 24, 0, 10, 20]);
  const orig = Buffer.from(px);
  assert.deepStrictEqual([...greyStep(px, 2)], [50, 50, 50, 11, 11, 11, 10, 10, 13, 20, 22, 24, 0, 10, 20]);
  assert.deepStrictEqual([...greyStep(px, 3)], [50, 50, 50, 11, 11, 11, 11, 11, 11, 20, 22, 24, 0, 10, 20]);
  assert.deepStrictEqual([...greyStep(px, 4)], [50, 50, 50, 11, 11, 11, 11, 11, 11, 22, 22, 22, 0, 10, 20]);
  assert.deepStrictEqual([...px], [...orig], 'the input buffer is not changed');
  // Rounding of the mean: 10, 10, 11 -> 10.33 -> 10; 10, 11, 11 -> 10.67 -> 11.
  assert.deepStrictEqual([...greyStep(Buffer.from([10, 10, 11, 10, 11, 11]), 2)], [10, 10, 10, 11, 11, 11]);
});

test('gate: at the thresholds passes, beyond them fails, one limit is enough to fail', () => {
  const base = { psnr: 30, ssim: 0.9, gmsd: 0.1 };
  assert.strictEqual(gate(base, { psnr: 29.98, ssim: 0.899, gmsd: 0.101 }).pass, true);
  assert.strictEqual(gate(base, { psnr: 29.97, ssim: 0.9, gmsd: 0.1 }).pass, false);
  assert.strictEqual(gate(base, { psnr: 30, ssim: 0.8989, gmsd: 0.1 }).pass, false);
  assert.strictEqual(gate(base, { psnr: 30, ssim: 0.9, gmsd: 0.1011 }).pass, false);
  assert.strictEqual(gate(base, { psnr: 31, ssim: 0.95, gmsd: 0.05 }).pass, true);
});

test('bad flags and a missing folder exit 1 with one stderr line before any model loads', () => {
  const cases = [
    [['--t', 'x'], '--t must be a non-negative integer'],
    [['--t', '-1'], '--t must be a non-negative integer'],
    [['--limit', '0'], '--limit must be a positive integer'],
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
});

test('a generated folder of two images prints the table and one gate line per T', async () => {
  const dir = path.join(tmp, 'imgs');
  fs.mkdirSync(dir);
  const w = 600, h = 450;
  const grey = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = Math.round(140 + (x / w) * 20 + (((x * 31 + y * 17) % 5) - 2)); grey.fill(v, (y * w + x) * 3, (y * w + x) * 3 + 3); }
  await sharp(grey, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(dir, 'a_grey.png'));
  const red = Buffer.alloc(w * h * 3); for (let i = 0; i < red.length; i += 3) red[i] = 255;
  await sharp(red, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(dir, 'b_red.png'));
  const r = run(['--dir', dir]);
  assert.strictEqual(r.status, 0, r.stderr);
  const lines = r.stdout.split('\n').filter((l) => l !== '');
  assert.match(lines[0], /^images: 2; with a neutral region: 1; blocks: \d+; input 400 px, output 1000 px$/);
  assert.match(lines[1], /^\| method \| PSNR \|/);
  assert.match(lines[2], /^\|---\|/);
  const names = lines.slice(3, 8).map((l) => l.split('|')[1].trim());
  assert.deepStrictEqual(names, ['Lanczos', '`fast` (no step)', '`fast` + step T=2', '`fast` + step T=3', '`fast` + step T=4']);
  for (const l of lines.slice(3, 8)) assert.match(l, /^\| .* \| \d+\.\d\d \| \d\.\d{4} \| \d\.\d{4} \| \d+\.\d\d \| \d+\.\d\d \|$/);
  const gates = lines.slice(8);
  assert.strictEqual(gates.length, 3);
  gates.forEach((l, i) => assert.match(l, new RegExp(`^T=${i + 2}: PSNR -?\\d+\\.\\d{3}, SSIM -?\\d+\\.\\d{5}, GMSD -?\\d+\\.\\d{5}; quality gate: (pass|fail); share -?\\d+\\.\\d\\d points above Lanczos: (within 1 point|not within 1 point)$`)));
  // --t picks one value.
  const one = run(['--dir', dir, '--t', '3']);
  assert.strictEqual(one.status, 0, one.stderr);
  assert.strictEqual(one.stdout.split('\n').filter((l) => l.startsWith('T=')).length, 1);
});

test('groundtruth: loadGt, inputAt and crop build what bench/bench.js used to build inline', async () => {
  const f = path.join(tmp, 'gt.png');
  const w = 700, h = 500;
  const src = Buffer.alloc(w * h * 3);
  for (let i = 0; i < src.length; i++) src[i] = (i * 7 + (i >> 5)) & 255;
  await sharp(src, { raw: { width: w, height: h, channels: 3 } }).png().toFile(f);
  const gt = await loadGt(f);
  const refGt = await sharp(f).resize(1000, 714, { kernel: 'lanczos3', fit: 'fill' }).removeAlpha().raw().toBuffer();
  assert.deepStrictEqual([gt.w, gt.h], [1000, 714]);
  assert.ok(gt.data.equals(refGt));
  const inp = await inputAt(gt, 400);
  assert.deepStrictEqual([inp.w, inp.h], [400, 286]);
  const jpg = await sharp(refGt, { raw: { width: 1000, height: 714, channels: 3 } }).resize(400, 286, { kernel: 'cubic', fit: 'fill' }).jpeg({ quality: 85 }).toBuffer();
  const refInp = await sharp(jpg).removeAlpha().raw().toBuffer();
  assert.ok(inp.data.equals(refInp));
  // crop: same buffer when nothing to cut, top-left part otherwise.
  assert.strictEqual(crop(gt.data, 1000, 1000, 714), gt.data);
  const c = crop(gt.data, 1000, 998, 713);
  assert.strictEqual(c.length, 998 * 713 * 3);
  assert.ok(c.subarray(0, 998 * 3).equals(gt.data.subarray(0, 998 * 3)));
  assert.ok(c.subarray(998 * 3, 998 * 6).equals(gt.data.subarray(1000 * 3, 1000 * 3 + 998 * 3)));
});
