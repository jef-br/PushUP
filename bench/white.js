'use strict';
// Does `fast` keep a pure white (255) backdrop pure white? (BL74; docs/COLOR.md "White backdrops (BL74)")
// Usage: node bench/white.js [--dir bench/out/sub20] [--limit 20] [--size 400|600|800]
//   Input per image: the 1000 px reference of bench/groundtruth.js, cubic down to --size and JPEG q85 (inputAt), decoded. On that
//   decoded input the white backdrop is the near-white region connected to the image border (4-connected flood fill from the border
//   over pixels with R, G and B all >= 245); its pixels are set to exactly 255, as a packshot with a pure white page background
//   has them. An image whose region covers under 20% of the frame is skipped and counted. Outputs: the shipped `fast` pipeline
//   (`upscale`, CPU) at factor 1000 / longest side, and plain sharp lanczos3 of the input to the same size. The region is eroded by
//   4 input pixels (square) so product edges are excluded; an output pixel counts when the input pixel it maps to
//   (floor((x + 0.5) * input width / output width)) is inside the eroded region. Per method: pixels counted, share exactly 255
//   (all channels), the share of 255 in each channel (R, G, B), share with all channels >= 252, lowest channel value seen, mean luma deficit
//   255 - luma (Rec. 601).
const fs = require('node:fs');
const path = require('node:path');
const { checkFlags } = require('./flags');

const MIN_COVER = 0.2, ERODE = 4, NEAR_WHITE = 245;

// Near-white pixels connected (4-neighbours) to the image border: Uint8Array of w*h, 1 inside the region.
function borderRegion(data, w, h, thr = NEAR_WHITE) {
  const mask = new Uint8Array(w * h), stack = [];
  const white = (i) => data[i * 3] >= thr && data[i * 3 + 1] >= thr && data[i * 3 + 2] >= thr;
  const push = (x, y) => { const i = y * w + x; if (!mask[i] && white(i)) { mask[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  return mask;
}

// Square erosion by r: a pixel stays 1 only if every pixel within r in x and y exists and is 1 (the frame edge erodes too).
function erode(mask, w, h, r) {
  const pass = (src, horizontal) => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let ok = 1;
      for (let d = -r; d <= r && ok; d++) {
        const xx = horizontal ? x + d : x, yy = horizontal ? y : y + d;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h || !src[yy * w + xx]) ok = 0;
      }
      out[y * w + x] = ok;
    }
    return out;
  };
  return pass(pass(mask, true), false);
}

const newAcc = () => ({ n: 0, is255: 0, ch255: [0, 0, 0], ge252: 0, min: 255, deficit: 0 });

// Add every output pixel (w x h) whose source input pixel (iw x ih) lies inside the mask.
function addMasked(acc, out, w, h, mask, iw, ih) {
  for (let y = 0; y < h; y++) {
    const sy = Math.min(ih - 1, Math.floor(((y + 0.5) * ih) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(iw - 1, Math.floor(((x + 0.5) * iw) / w));
      if (!mask[sy * iw + sx]) continue;
      const k = (y * w + x) * 3, r = out[k], g = out[k + 1], b = out[k + 2], lo = Math.min(r, g, b);
      acc.n++;
      if (lo === 255) acc.is255++;
      if (r === 255) acc.ch255[0]++;
      if (g === 255) acc.ch255[1]++;
      if (b === 255) acc.ch255[2]++;
      if (lo >= 252) acc.ge252++;
      if (lo < acc.min) acc.min = lo;
      acc.deficit += 255 - (0.299 * r + 0.587 * g + 0.114 * b);
    }
  }
}
const summary = (a) => ({ pixels: a.n, share255: a.n ? (100 * a.is255) / a.n : 0, ch255: a.ch255.map((c) => (a.n ? (100 * c) / a.n : 0)), share252: a.n ? (100 * a.ge252) / a.n : 0, min: a.n ? a.min : 0, deficit: a.n ? a.deficit / a.n : 0 });

async function main(argv) {
  const sharp = require('sharp');
  const opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
  const fail = (msg) => { console.error(msg); process.exit(1); };
  const flagError = checkFlags(argv, { values: ['--dir', '--limit', '--size'], switches: [] });
  if (flagError) fail(flagError);
  const dir = path.resolve(String(opt('--dir', path.join(__dirname, 'out', 'sub20'))));
  const limitArg = String(opt('--limit', '1000000000')), sizeArg = String(opt('--size', '400'));
  if (!/^\d+$/.test(limitArg) || Number(limitArg) < 1) fail('--limit must be a positive integer');
  if (!['400', '600', '800'].includes(sizeArg)) fail('--size must be 400, 600 or 800');
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
  const { loadGt, inputAt } = require('./groundtruth');

  const acc = { fast: newAcc(), lanczos: newAcc() };
  let used = 0, skipped = 0;
  for (const f of files) {
    const gt = await loadGt(path.join(dir, f));
    const inp = await inputAt(gt, size, 85);
    const region = borderRegion(inp.data, inp.w, inp.h);
    let cover = 0;
    for (let i = 0; i < region.length; i++) cover += region[i];
    if (cover < MIN_COVER * inp.w * inp.h) { skipped++; process.stderr.write('s'); continue; }
    for (let i = 0; i < region.length; i++) if (region[i]) inp.data.fill(255, i * 3, i * 3 + 3);
    const mask = erode(region, inp.w, inp.h, ERODE);
    const IL = Math.max(inp.w, inp.h), ow = Math.round((inp.w * 1000) / IL), oh = Math.round((inp.h * 1000) / IL);
    const [fastOut] = await upscale(inp.data, inp.w * 3, 1000 / IL);
    const lanOut = await sharp(inp.data, { raw: { width: inp.w, height: inp.h, channels: 3 } }).resize(ow, oh, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
    addMasked(acc.fast, fastOut, ow, oh, mask, inp.w, inp.h);
    addMasked(acc.lanczos, lanOut, ow, oh, mask, inp.w, inp.h);
    used++;
    process.stderr.write('.');
  }
  process.stderr.write('\n');
  console.log(`images: ${files.length}; used: ${used}; skipped (white region under 20% of the frame): ${skipped}; input ${size} px, output 1000 px`);
  console.log('| method | pixels | share exactly 255 (%) | share 255 in R / G / B (%) | share >= 252 (%) | lowest channel value | mean luma deficit |');
  console.log('|---|---|---|---|---|---|---|');
  const res = {};
  for (const m of ['fast', 'lanczos']) {
    const s = res[m] = summary(acc[m]);
    console.log(`| ${m === 'fast' ? '`fast`' : 'Lanczos'} | ${s.pixels} | ${s.share255.toFixed(2)} | ${s.ch255.map((c) => c.toFixed(2)).join(' / ')} | ${s.share252.toFixed(2)} | ${s.min} | ${s.deficit.toFixed(3)} |`);
  }
  const diff = res.lanczos.share255 - res.fast.share255;
  console.log(`share exactly 255, Lanczos minus fast: ${diff.toFixed(2)} percentage points; fast more than 1 point below Lanczos: ${diff > 1 ? 'yes' : 'no'}`);
}

if (require.main === module) main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
module.exports = { borderRegion, erode, newAcc, addMasked, summary };
