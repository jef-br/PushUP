'use strict';
// How much does `fast` change a clean (never JPEG-compressed) input at factor 1.0? (BL73; docs/JPEG.md "Clean input at factor 1.0")
// Usage: node bench/clean.js [--dir bench/out/sub20] [--limit 20] [--size 400..800]
//   Per image: the 1000 px reference of bench/groundtruth.js (lanczos3, fit 'fill'), resized to --size px on its longest side
//   (lanczos3, fit 'fill'), WITHOUT JPEG degradation: the input. `upscale(input, stride, 1)` (shipped `fast`, CPU) gives the output at
//   the same size. Compared with the input: PSNR, SSIM and GMSD (bench/metrics.js, luma) and the mean absolute difference per
//   channel byte (0-255). Prints one markdown row (means over the images, plus the lowest PSNR and its image) and the names of
//   images whose PSNR is below 30 dB.
const fs = require('node:fs');
const path = require('node:path');
const { checkFlags } = require('./flags');

// Mean absolute difference per channel byte of two equally long packed RGB buffers.
function meanAbsDiff(a, b) {
  if (a.length !== b.length) throw new RangeError('buffers differ in length');
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return a.length ? s / a.length : 0;
}

async function main(argv) {
  const sharp = require('sharp');
  const opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
  const fail = (msg) => { console.error(msg); process.exit(1); };
  const flagError = checkFlags(argv, { values: ['--dir', '--limit', '--size'], switches: [] });
  if (flagError) fail(flagError);
  const dir = path.resolve(String(opt('--dir', path.join(__dirname, 'out', 'sub20'))));
  const limitArg = String(opt('--limit', '1000000000')), sizeArg = String(opt('--size', '600'));
  if (!/^\d+$/.test(limitArg) || Number(limitArg) < 1) fail('--limit must be a positive integer');
  if (!/^\d+$/.test(sizeArg) || Number(sizeArg) < 400 || Number(sizeArg) > 800) fail('--size must be an integer from 400 to 800');
  const size = Number(sizeArg);
  let stat = null;
  try { stat = fs.statSync(dir); } catch { /* reported below */ }
  if (!stat) fail(`${dir} does not exist; run bash bench/fetch_testset.sh`);
  if (!stat.isDirectory()) fail(`${dir} is not a directory`);
  const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort().slice(0, Number(limitArg));
  if (files.length === 0) fail(`no images in ${dir}`);

  process.env.PUSHUP_QUALITY = 'fast';
  process.env.PUSHUP_DEVICE = 'cpu';
  const { upscale } = require('../src/index.js');
  const { loadGt, raw } = require('./groundtruth');
  const { psnr, ssim, gmsd } = require('./metrics');

  const rows = [];
  for (const f of files) {
    const gt = await loadGt(path.join(dir, f));
    const iw = Math.round((gt.w * size) / 1000), ih = Math.round((gt.h * size) / 1000);
    const inp = await raw(sharp(gt.data, { raw: { width: gt.w, height: gt.h, channels: 3 } }).resize(iw, ih, { kernel: 'lanczos3', fit: 'fill' }));
    const [out, stride] = await upscale(new Uint8Array(inp.data), inp.w * 3, 1);
    if (stride !== inp.w * 3 || out.length !== inp.data.length) fail(`${f}: factor 1 changed the size`);
    rows.push({ f, psnr: psnr(out, inp.data, inp.w, inp.h), ssim: ssim(out, inp.data, inp.w, inp.h), gmsd: gmsd(out, inp.data, inp.w, inp.h), mad: meanAbsDiff(out, inp.data) });
    process.stderr.write('.');
  }
  process.stderr.write('\n');
  const mean = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
  const lowest = rows.reduce((a, r) => (r.psnr < a.psnr ? r : a));
  const below = rows.filter((r) => r.psnr < 30).map((r) => r.f);
  console.log(`images: ${rows.length}; input ${size} px (lanczos3, no JPEG), factor 1, \`fast\` on CPU`);
  console.log('| input | images | PSNR (dB) | SSIM | GMSD | mean abs diff per channel | lowest PSNR (dB) | lowest-PSNR image |');
  console.log('|---|---|---|---|---|---|---|---|');
  console.log(`| ${size} px | ${rows.length} | ${mean('psnr').toFixed(2)} | ${mean('ssim').toFixed(4)} | ${mean('gmsd').toFixed(4)} | ${mean('mad').toFixed(2)} | ${lowest.psnr.toFixed(2)} | ${lowest.f} |`);
  console.log(`images below 30 dB: ${below.length ? below.join(', ') : 'none'}`);
}

if (require.main === module) main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
module.exports = { meanAbsDiff };
