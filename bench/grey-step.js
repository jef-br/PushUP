'use strict';
// Would a grey-preserving post-step pass the quality gate? (BL51; docs/COLOR.md "Grey-preserving step, offline (BL51)")
// Usage: node bench/grey-step.js [--dir bench/out/sub20] [--limit 20] [--t 2|3|4] [--size 400|800] [--quality fast|high]
//   --quality (BL54): model mode, sets PUSHUP_QUALITY for the run (default fast); rows are labelled with it. `high` takes about 3 min on CPU.
//   --size (BL53): input size in px, 400 (default) or 800; the output is always 1000 px on its longest side.
//   Offline only: nothing here is part of the shipped pipeline (src/ is untouched).
//   Per image: ground truth and the degraded input (400 px unless --size) as bench/bench.js builds them (bench/groundtruth.js); the shipped `fast`
//   output (`upscale`, factor 1000 / longest side, CPU); then the step "every pixel whose channel spread (max - min of R, G, B)
//   is at most T becomes its channel mean, rounded" for T = 2, 3 and 4 (--t picks one value). Rows: Lanczos, `fast` (no step), `fast` + step.
//   Columns: whole-image PSNR, SSIM, GMSD against the ground truth (means over all images, scored as bench/bench.js scores);
//   and, over the near-neutral flat blocks of the input found as bench/neutral-real.js finds them (same box rule), the mean channel
//   spread and the share of pixels with spread >= 3. Then one line per T: the quality gate (docs/OVERNIGHT_RUN.md: PSNR down at most
//   0.02 dB, SSIM down at most 0.001, GMSD up at most 0.001, against `fast`) and whether the share is within 1 point of Lanczos's.
const fs = require('node:fs');
const path = require('node:path');
const { checkFlags } = require('./flags');
const { psnr, ssim, gmsd } = require('./metrics');
const { findBlocks, scaleBox, summary, newAcc, addBox } = require('./neutral-real');

const MAX_PSNR_DROP = 0.02, MAX_SSIM_DROP = 0.001, MAX_GMSD_RISE = 0.001, EPS = 1e-9;

// New buffer: pixels of a packed RGB buffer with channel spread <= t become their channel mean (rounded half up); others copied.
function greyStep(data, t) {
  const out = Buffer.from(data);
  for (let k = 0; k + 2 < data.length; k += 3) {
    const r = data[k], g = data[k + 1], b = data[k + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) <= t) out.fill(Math.floor((r + g + b) / 3 + 0.5), k, k + 3);
  }
  return out;
}

// Gate verdict of `row` against `base` ({psnr, ssim, gmsd}); `pass` is true when all three are within the limits.
function gate(base, row) {
  const dPsnr = row.psnr - base.psnr, dSsim = row.ssim - base.ssim, dGmsd = row.gmsd - base.gmsd;
  return { dPsnr, dSsim, dGmsd, pass: dPsnr >= -MAX_PSNR_DROP - EPS && dSsim >= -MAX_SSIM_DROP - EPS && dGmsd <= MAX_GMSD_RISE + EPS };
}

async function main(argv) {
  const sharp = require('sharp');
  const opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
  const fail = (msg) => { console.error(msg); process.exit(1); };
  const flagError = checkFlags(argv, { values: ['--dir', '--limit', '--t', '--size', '--quality'], switches: [] });
  if (flagError) fail(flagError);
  const dir = path.resolve(String(opt('--dir', path.join(__dirname, 'out', 'sub20'))));
  const limitArg = String(opt('--limit', '1000000000')), tArg = opt('--t', null);
  if (!/^\d+$/.test(limitArg) || Number(limitArg) < 1) fail('--limit must be a positive integer');
  if (tArg !== null && !/^[0-9]+$/.test(String(tArg))) fail('--t must be a non-negative integer');
  const sizeArg = String(opt('--size', '400'));
  if (sizeArg !== '400' && sizeArg !== '800') fail('--size must be 400 or 800');
  const SIZE = Number(sizeArg);
  const quality = String(opt('--quality', 'fast'));
  if (quality !== 'fast' && quality !== 'high') fail('--quality must be fast or high');
  const ts = tArg === null ? [2, 3, 4] : [Number(tArg)];
  let stat = null;
  try { stat = fs.statSync(dir); } catch { /* reported below */ }
  if (!stat) fail(`${dir} does not exist; run bash bench/fetch_testset.sh`);
  if (!stat.isDirectory()) fail(`${dir} is not a directory`);
  const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort().slice(0, Number(limitArg));
  if (files.length === 0) fail(`no images in ${dir}`);

  process.env.PUSHUP_QUALITY = quality;
  process.env.PUSHUP_DEVICE = 'cpu';
  const { upscale } = require('../src/index.js');
  const { loadGt, inputAt, crop } = require('./groundtruth');

  const names = ['lanczos', 'fast', ...ts.map((t) => `t${t}`)];
  const score = Object.fromEntries(names.map((n) => [n, { psnr: 0, ssim: 0, gmsd: 0 }]));
  const neutral = Object.fromEntries(names.map((n) => [n, newAcc()]));
  let used = 0, blocks = 0;
  for (const f of files) {
    const gt = await loadGt(path.join(dir, f));
    const inp = await inputAt(gt, SIZE);
    const IL = Math.max(inp.w, inp.h), ow = Math.round((inp.w * 1000) / IL), oh = Math.round((inp.h * 1000) / IL);
    const [fastOut] = await upscale(inp.data, inp.w * 3, 1000 / IL);
    const lanOut = await sharp(inp.data, { raw: { width: inp.w, height: inp.h, channels: 3 } }).resize(ow, oh, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
    const outs = { lanczos: lanOut, fast: fastOut };
    for (const t of ts) outs[`t${t}`] = greyStep(fastOut, t);
    const cw = Math.min(ow, gt.w), ch = Math.min(oh, gt.h), ref = crop(gt.data, gt.w, cw, ch);
    for (const n of names) {
      const o = crop(outs[n], ow, cw, ch);
      score[n].psnr += psnr(o, ref, cw, ch); score[n].ssim += ssim(o, ref, cw, ch); score[n].gmsd += gmsd(o, ref, cw, ch);
    }
    const bl = findBlocks(inp.data, inp.w, inp.h);
    if (bl.length > 0) {
      used++; blocks += bl.length;
      for (const b of bl) { const box = scaleBox(b, 1000 / IL, ow, oh); for (const n of names) addBox(neutral[n], outs[n], ow, box); }
    }
    process.stderr.write('.');
  }
  process.stderr.write('\n');
  const res = {};
  for (const n of names) {
    const s = summary(neutral[n]);
    res[n] = { psnr: score[n].psnr / files.length, ssim: score[n].ssim / files.length, gmsd: score[n].gmsd / files.length, mean: s.mean, share3: s.share3 };
  }
  const label = (n) => (n === 'lanczos' ? 'Lanczos' : n === 'fast' ? `\`${quality}\` (no step)` : `\`${quality}\` + step T=${n.slice(1)}`);
  console.log(`images: ${files.length}; with a neutral region: ${used}; blocks: ${blocks}; input ${SIZE} px, output 1000 px`);
  console.log('| method | PSNR | SSIM | GMSD | mean spread (neutral blocks) | share of pixels with spread >= 3 (%) |');
  console.log('|---|---|---|---|---|---|');
  for (const n of names) {
    const r = res[n];
    console.log(`| ${label(n)} | ${r.psnr.toFixed(2)} | ${r.ssim.toFixed(4)} | ${r.gmsd.toFixed(4)} | ${r.mean.toFixed(2)} | ${r.share3.toFixed(2)} |`);
  }
  for (const t of ts) {
    const r = res[`t${t}`], g = gate(res.fast, r), gap = r.share3 - res.lanczos.share3;
    console.log(`T=${t}: PSNR ${g.dPsnr.toFixed(3)}, SSIM ${g.dSsim.toFixed(5)}, GMSD ${g.dGmsd.toFixed(5)}; quality gate: ${g.pass ? 'pass' : 'fail'}; share ${gap.toFixed(2)} points above Lanczos: ${gap <= 1 ? 'within 1 point' : 'not within 1 point'}`);
  }
}

if (require.main === module) main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
module.exports = { greyStep, gate };
