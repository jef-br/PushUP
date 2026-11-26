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
const { greyStep, regionStep, gate, changedStats } = require('../bench/grey-step.js');
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

// BL55: per-pixel counting of --changed on a hand-made output and ground truth (T=4).
test('changedStats counts changed pixels, removed tints and the error before and after', () => {
  // Output pixels: spread 2 (changed), grey (unchanged), spread 4 (changed), spread 20 (unchanged).
  const before = Buffer.from([10, 11, 12, 50, 50, 50, 20, 22, 24, 0, 10, 20]);
  const after = greyStep(before, 4);
  // Ground truth: grey 11 (no tint), grey 50, a real tint (20, 26, 32: spread 12 > 4), anything.
  const ref = Buffer.from([11, 11, 11, 50, 50, 50, 20, 26, 32, 0, 10, 20]);
  // Pixel 0: error 2 -> 0. Pixel 2: error 0 + 4 + 8 = 12 -> 2 + 4 + 10 = 16.
  assert.deepStrictEqual(changedStats(before, after, ref, 4), { pixels: 4, changed: 2, tinted: 1, errBefore: 14, errAfter: 16 });
  // A ground-truth spread of exactly T is not a real tint; with T=12 the same pixel is not tinted either.
  assert.strictEqual(changedStats(before, after, ref, 12).tinted, 0);
  // Nothing changed: all counts but `pixels` are zero.
  assert.deepStrictEqual(changedStats(ref, ref, ref, 4), { pixels: 4, changed: 0, tinted: 0, errBefore: 0, errAfter: 0 });
});

// BL59: regionStep changes a pixel only inside flat neutral regions of the unmodified data (5x5 window, spread <= T, luma range <= 12).
test('regionStep changes flat neutral pixels only: not near an edge, not near a coloured pixel; borders are clamped', () => {
  const w = 12, h = 12, px = (x, y) => (y * w + x) * 3;
  const get = (b, x, y) => [...b.subarray(px(x, y), px(x, y) + 3)];
  const field = (f) => { const d = Buffer.alloc(w * h * 3); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(f(x, y), px(x, y)); return d; };
  // A noisy-grey field (spread 1): every pixel is flat and neutral, so every pixel becomes its mean, 100.33 -> 100; the corner is handled by clamping.
  const flat = field(() => [100, 101, 100]);
  const flatOrig = Buffer.from(flat);
  const f = regionStep(flat, w, h, 4);
  assert.deepStrictEqual([get(f, 0, 0), get(f, 11, 11), get(f, 5, 5)], [[100, 100, 100], [100, 100, 100], [100, 100, 100]]);
  assert.ok(flat.equals(flatOrig), 'the input buffer is not changed');
  // T below the spread: nothing changes.
  assert.ok(regionStep(flat, w, h, 0).equals(flat));
  // A strong edge (luma 100 against 200) at x = 6: pixels whose 5x5 window reaches x >= 6 are kept, the others change.
  const edge = field((x) => (x < 6 ? [100, 101, 100] : [200, 201, 200]));
  const e = regionStep(edge, w, h, 4);
  assert.deepStrictEqual([get(e, 3, 5), get(e, 4, 5), get(e, 5, 5), get(e, 7, 5), get(e, 8, 5)], [[100, 100, 100], [100, 101, 100], [100, 101, 100], [200, 201, 200], [200, 200, 200]]);
  // One coloured pixel (spread 150) at (6, 6): pixels within 2 of it (and itself) keep their values, pixels farther away change.
  const spot = field((x, y) => (x === 6 && y === 6 ? [200, 50, 50] : [100, 101, 100]));
  const sp = regionStep(spot, w, h, 4);
  assert.deepStrictEqual([get(sp, 6, 6), get(sp, 4, 6), get(sp, 8, 8), get(sp, 3, 6), get(sp, 9, 9)], [[200, 50, 50], [100, 101, 100], [100, 101, 100], [100, 100, 100], [100, 100, 100]]);
  // Luma range limit: a smooth ramp of 3 levels per pixel (spread 0) has a 5x5 luma range of 12 in the interior (kept as grey, nothing to change), so use
  // spread-1 pixels on a ramp: range 12 changes, range 15 does not.
  const ramp = (step) => field((x) => { const v = 100 + step * x; return [v, v + 1, v]; });
  assert.deepStrictEqual(get(regionStep(ramp(3), w, h, 4), 5, 5), [115, 115, 115]); // window x 3..7: range 12 -> changed to the mean (115.33 -> 115)
  assert.deepStrictEqual(get(regionStep(ramp(4), w, h, 4), 5, 5), [120, 121, 120]); // window x 3..7: range 16 -> kept
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
    [['--quality', 'bogus'], '--quality must be fast or high'],
    [['--quality', 'auto'], '--quality must be fast or high'],
    [['--changed', '400'], 'unexpected argument 400 after the switch --changed'],
    [['--size', '799'], '--size must be 400 or 800'],
    [['--size', 'x'], '--size must be 400 or 800'],
    [['--size', '600'], '--size must be 400 or 800'],
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
  // --size 800 (BL53): same layout, the size shows in the first line.
  const big = run(['--dir', dir, '--size', '800']);
  assert.strictEqual(big.status, 0, big.stderr);
  const bigLines = big.stdout.split('\n').filter((l) => l !== '');
  assert.match(bigLines[0], /^images: 2; with a neutral region: \d+; blocks: \d+; input 800 px, output 1000 px$/);
  assert.deepStrictEqual(bigLines.map((l) => l.split('|')[1] && l.split('|')[1].trim()).slice(3, 8), ['Lanczos', '`fast` (no step)', '`fast` + step T=2', '`fast` + step T=3', '`fast` + step T=4']);
  assert.strictEqual(bigLines.filter((l) => l.startsWith('T=')).length, 3);
  // --quality fast (BL54) prints exactly what no flag prints (the first run's stdout, same folder, deterministic model).
  assert.strictEqual(run(['--dir', dir, '--quality', 'fast']).stdout, r.stdout);
  // --region (BL59): same layout, the first line and the row labels name the variant; the share lines stay.
  const reg = run(['--dir', dir, '--region']);
  assert.strictEqual(reg.status, 0, reg.stderr);
  const regLines = reg.stdout.split('\n').filter((l) => l !== '');
  assert.match(regLines[0], /^images: 2; with a neutral region: 1; blocks: \d+; input 400 px, output 1000 px; region-limited step$/);
  assert.deepStrictEqual(regLines.slice(3, 8).map((l) => l.split('|')[1].trim()), ['Lanczos', '`fast` (no step)', '`fast` + region step T=2', '`fast` + region step T=3', '`fast` + region step T=4']);
  assert.strictEqual(regLines.filter((l) => l.startsWith('T=')).length, 3);
  const regChg = run(['--dir', dir, '--region', '--changed']);
  assert.strictEqual(regChg.status, 0, regChg.stderr);
  assert.ok(regChg.stdout.startsWith(reg.stdout), 'with --changed the output starts with the --region output');
  // --changed (BL55): the first part is the same as without the flag; a second table follows after an empty line.
  const chg = run(['--dir', dir, '--changed']);
  assert.strictEqual(chg.status, 0, chg.stderr);
  assert.ok(chg.stdout.startsWith(r.stdout), 'output without --changed is a prefix');
  const extra = chg.stdout.slice(r.stdout.length).split('\n');
  assert.strictEqual(extra[0], '');
  assert.match(extra[1], /^\| T \| pixels changed \(% of all\) \|/);
  assert.match(extra[2], /^\|---\|/);
  const rows = extra.slice(3).filter((l) => l !== '');
  assert.strictEqual(rows.length, 3);
  rows.forEach((l, i) => assert.match(l, new RegExp(`^\\| ${i + 2} \\| \\d+\\.\\d\\d \\| \\d+\\.\\d\\d \\| \\d+\\.\\d{3} \\| \\d+\\.\\d{3} \\|$`)));
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

// BL53: docs/COLOR.md "Grey-preserving step at 800 px (BL53...)" has the same rows as the 400 px table of BL51 and one line per T;
// the gate words agree with the printed differences. Reads the file only, no model run.
test('docs/COLOR.md BL53 section: same rows as the BL51 table and gate words that agree with the differences', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'COLOR.md'), 'utf8');
  const sec = (h) => { const at = doc.indexOf(h); assert.ok(at >= 0, `${h} missing`); const e = doc.indexOf('\n### ', at + 5); return doc.slice(at, e < 0 ? undefined : e); };
  const first = (t) => t.split('\n').filter((l) => l.startsWith('|')).slice(2).map((l) => l.split('|')[1].trim());
  const s51 = sec('### Grey-preserving step, offline (BL51'), s53 = sec('### Grey-preserving step at 800 px (BL53');
  assert.deepStrictEqual(first(s53), first(s51));
  for (const t of [2, 3, 4]) {
    const line = new RegExp(`\\*\\*T=${t}:\\*\\* PSNR (-?[\\d.]+), SSIM (-?[\\d.]+), GMSD ([+-]?[\\d.]+): (passes|fails) the (?:quality )?gate`);
    for (const [name, text] of [['BL51', s51], ['BL53', s53]]) {
      const m = line.exec(text);
      assert.ok(m, `${name} T=${t} line missing`);
      const pass = Number(m[1]) >= -0.02 && Number(m[2]) >= -0.001 && Number(m[3]) <= 0.001;
      assert.strictEqual(m[4] === 'passes', pass, `${name} T=${t}: "${m[4]}" disagrees with PSNR ${m[1]}, SSIM ${m[2]}, GMSD ${m[3]}`);
    }
  }
});

// Opt-in (PUSHUP_SLOW_TESTS=1): the real `high` model (about 30x slower than `fast`) on a one-image generated folder; rows and gate
// lines carry the mode name (BL54).
test('--quality high labels the rows with the mode (BL54)',
  { skip: process.env.PUSHUP_SLOW_TESTS === '1' ? false : 'set PUSHUP_SLOW_TESTS=1', timeout: 300000 }, async () => {
  const dir = path.join(tmp, 'high');
  fs.mkdirSync(dir);
  const w = 600, h = 450;
  const grey = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = Math.round(140 + (x / w) * 20 + (((x * 31 + y * 17) % 5) - 2)); grey.fill(v, (y * w + x) * 3, (y * w + x) * 3 + 3); }
  await sharp(grey, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(dir, 'a_grey.png'));
  const r = spawnSync(process.execPath, [SCRIPT, '--dir', dir, '--quality', 'high', '--t', '4'], { encoding: 'utf8', timeout: 300000, env: { ...process.env, PUSHUP_DEVICE: 'cpu' } });
  assert.strictEqual(r.status, 0, r.stderr);
  const lines = r.stdout.split('\n').filter((l) => l !== '');
  assert.deepStrictEqual(lines.slice(3, 6).map((l) => l.split('|')[1].trim()), ['Lanczos', '`high` (no step)', '`high` + step T=4']);
  assert.match(lines[6], /^T=4: PSNR /);
});

// BL56: docs/COLOR.md "Grey-preserving step on the 60-image set (BL56...)" has a gate line per T and size; the gate words agree with the
// printed differences. Reads the file only, no model run.
test('docs/COLOR.md BL56 section: gate words agree with the printed differences, one line per T and size', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'COLOR.md'), 'utf8');
  const at = doc.indexOf('### Grey-preserving step on the 60-image set (BL56');
  assert.ok(at >= 0, 'BL56 section missing');
  const end = doc.indexOf('\n### ', at + 5), sec = doc.slice(at, end < 0 ? undefined : end);
  for (const size of [400, 800]) {
    for (const t of [2, 3, 4]) {
      const m = new RegExp(`\\*\\*T=${t} at ${size} px:\\*\\* PSNR (-?[\\d.]+), SSIM (-?[\\d.]+), GMSD ([+-]?[\\d.]+): (passes|fails) the quality gate`).exec(sec);
      assert.ok(m, `T=${t} at ${size} px line missing`);
      const pass = Number(m[1]) >= -0.02 && Number(m[2]) >= -0.001 && Number(m[3]) <= 0.001;
      assert.strictEqual(m[4] === 'passes', pass, `T=${t} at ${size} px: "${m[4]}" disagrees with PSNR ${m[1]}, SSIM ${m[2]}, GMSD ${m[3]}`);
    }
  }
});

// BL57: inputAt takes the JPEG quality as an optional third argument; the default is 85, as before.
test('inputAt: the default quality is 85 and a lower quality moves the decoded input further from the clean downscale', async () => {
  const f = path.join(tmp, 'q.png');
  const w = 700, h = 500;
  const src = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) src[(y * w + x) * 3 + c] = (x * 5 + y * 3 + c * 40 + ((x * 31 + y * 17) % 23)) & 255;
  await sharp(src, { raw: { width: w, height: h, channels: 3 } }).png().toFile(f);
  const gt = await loadGt(f);
  const dflt = await inputAt(gt, 400), q85 = await inputAt(gt, 400, 85);
  assert.ok(dflt.data.equals(q85.data));
  const clean = await sharp(gt.data, { raw: { width: gt.w, height: gt.h, channels: 3 } }).resize(dflt.w, dflt.h, { kernel: 'cubic', fit: 'fill' }).raw().toBuffer();
  const mae = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - clean[i]); return s / a.length; };
  const lo = await inputAt(gt, 400, 60), hi = await inputAt(gt, 400, 95);
  assert.ok(mae(lo.data) > mae(hi.data), `q60 ${mae(lo.data)} should be above q95 ${mae(hi.data)}`);
  assert.ok(!lo.data.equals(q85.data));
});

// BL59: docs/COLOR.md "Region-limited grey-preserving step (BL59...)" has a gate line per T and size; the gate words agree with the printed
// differences. Reads the file only, no model run.
test('docs/COLOR.md BL59 section: gate words agree with the printed differences, one line per T and size', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'COLOR.md'), 'utf8');
  const at = doc.indexOf('### Region-limited grey-preserving step (BL59');
  assert.ok(at >= 0, 'BL59 section missing');
  const end = doc.indexOf('\n### ', at + 5), sec = doc.slice(at, end < 0 ? undefined : end);
  for (const size of [400, 800]) {
    for (const t of [2, 3, 4]) {
      const m = new RegExp(`\\*\\*T=${t} at ${size} px:\\*\\* PSNR (-?[\\d.]+), SSIM (-?[\\d.]+), GMSD ([+-]?[\\d.]+): (passes|fails) the quality gate`).exec(sec);
      assert.ok(m, `T=${t} at ${size} px line missing`);
      const pass = Number(m[1]) >= -0.02 && Number(m[2]) >= -0.001 && Number(m[3]) <= 0.001;
      assert.strictEqual(m[4] === 'passes', pass, `T=${t} at ${size} px: "${m[4]}" disagrees with PSNR ${m[1]}, SSIM ${m[2]}, GMSD ${m[3]}`);
    }
  }
});

