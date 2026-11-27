'use strict';
// Do the 192 px tiles of `high` leave visible seams on real photos? (BL71; docs/SEAMS.md)
// Usage: node bench/seams.js [--dir bench/out/sub20] [--limit 20] [--size 400|600|800]
//   Inputs are built as bench/neutral-real.js builds them (bench/groundtruth.js: 1000 px reference, cubic down to --size,
//   JPEG q85, decoded). Each runs through the `high` model (Remacri, PUSHUP_DEVICE=cpu) at factor 1, no Lanczos mix, twice via
//   the internal `_run`: tiled (the shipped 192 px tiles, 16 px pad) and whole image (tile Infinity). If the whole-image run
//   fails (memory), the image is reported with the tiled figure only.
//   Seams: the tile borders at input px k * 192 (k >= 1, below the side length), in output px round(k * 192 * out / in).
//   (a) near / far: mean absolute difference tiled vs whole, per byte, over the 8 output px each side of a seam column
//       or row ("near") and over all other pixels at least 8 px from every seam ("far").
//   (b) gradient ratio: on the tiled output, the mean absolute step across a seam (|I(s) - I(s-1)| over the seam line)
//       divided by the mean of the same step at the three lines either side (s-3..s-1 and s+1..s+3); 1.00 = no seam.
//       Horizontal and vertical seams are pooled.
//       The same ratio on the whole-image output (no seams, so it is the content baseline: a strong edge near a seam line moves
//       it far from 1.00) is printed next to it, and the summary gives the mean of tiled minus whole.
//   Prints one markdown row per image and a summary: mean gradient ratio, mean near, mean far, and the verdict
//   "seams visible: yes" when the mean gradient ratio is above 1.05 or mean near is more than twice mean far.
const fs = require('node:fs');
const path = require('node:path');
const { checkFlags } = require('./flags');

const TILE = 192, BAND = 8;

// Output positions of the tile borders along one axis: round(k * tile * out / in) for k * tile < in.
function seamPositions(inSize, outSize, tile = TILE) {
  const out = [];
  for (let k = 1; k * tile < inSize; k++) out.push(Math.round((k * tile * outSize) / inSize));
  return out;
}

// Mean absolute byte difference of two packed RGB images near seams and far from them.
// xs / ys: seam columns / rows. near = within BAND px either side of a seam (columns s-BAND .. s+BAND-1), far = the rest
// at least BAND px from every seam. Returns { near, far, nearN, farN } (means are NaN with no samples).
function seamDiffs(a, b, w, h, xs, ys) {
  const nearCol = new Uint8Array(w), nearRow = new Uint8Array(h);
  const farCol = new Uint8Array(w).fill(1), farRow = new Uint8Array(h).fill(1);
  for (const s of xs) for (let x = Math.max(0, s - BAND); x < Math.min(w, s + BAND); x++) { nearCol[x] = 1; farCol[x] = 0; }
  for (const s of ys) for (let y = Math.max(0, s - BAND); y < Math.min(h, s + BAND); y++) { nearRow[y] = 1; farRow[y] = 0; }
  let nearSum = 0, nearN = 0, farSum = 0, farN = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const near = nearCol[x] || nearRow[y], far = farCol[x] && farRow[y];
    if (!near && !far) continue;
    const k = (y * w + x) * 3;
    const d = Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]);
    if (near) { nearSum += d; nearN += 3; } else { farSum += d; farN += 3; }
  }
  return { near: nearSum / nearN, far: farSum / farN, nearN, farN };
}

// Seam gradient ratio of one packed RGB image: step across the seam divided by the mean step at the 3 lines either side.
// Seam column s: step(s) = mean over rows and channels of |I(s, y) - I(s-1, y)|. Seam rows likewise. Pooled over all seams
// (sum of seam steps / sum of neighbour steps), lines outside the image are skipped. NaN when no seam fits.
function seamGradientRatio(data, w, h, xs, ys) {
  const colStep = (x) => { let s = 0; for (let y = 0; y < h; y++) { const k = (y * w + x) * 3, j = k - 3; s += Math.abs(data[k] - data[j]) + Math.abs(data[k + 1] - data[j + 1]) + Math.abs(data[k + 2] - data[j + 2]); } return s / (3 * h); };
  const rowStep = (y) => { let s = 0; for (let x = 0; x < w; x++) { const k = (y * w + x) * 3, j = k - w * 3; s += Math.abs(data[k] - data[j]) + Math.abs(data[k + 1] - data[j + 1]) + Math.abs(data[k + 2] - data[j + 2]); } return s / (3 * w); };
  let seam = 0, neigh = 0, ns = 0, nn = 0;
  const add = (step, s, lim) => {
    if (s - 3 < 1 || s + 3 > lim - 1) return;
    seam += step(s); ns++;
    for (const d of [-3, -2, -1, 1, 2, 3]) { neigh += step(s + d); nn++; }
  };
  for (const s of xs) add(colStep, s, w);
  for (const s of ys) add(rowStep, s, h);
  return ns ? seam / ns / (neigh / nn) : NaN;
}

// Verdict rule of the summary line.
function seamsVisible(meanRatio, meanNear, meanFar) {
  return meanRatio > 1.05 || meanNear > 2 * meanFar;
}

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

  process.env.PUSHUP_QUALITY = 'high';
  process.env.PUSHUP_DEVICE = 'cpu';
  const { _run, _MODES } = require('../src/index.js');
  const { loadGt, inputAt } = require('./groundtruth');
  const HIGH = { modelPath: _MODES.high.modelPath, lanczosMix: 0 };

  console.log(`images: ${files.length}; input ${size} px, factor 1, \`high\` on CPU, tile ${TILE}, pad 16`);
  console.log('| image | output | seams x / y | gradient ratio | ratio, whole image | near diff | far diff |');
  console.log('|---|---|---|---|---|---|---|');
  const ratios = [], nears = [], fars = [], excess = [];
  let wholeFailed = 0;
  for (const f of files) {
    const gt = await loadGt(path.join(dir, f));
    const inp = await inputAt(gt, size);
    const xs = seamPositions(inp.w, inp.w), ys = seamPositions(inp.h, inp.h);
    const [tiled] = await _run(inp.data, inp.w * 3, 1, { ...HIGH, tile: TILE });
    const ratio = seamGradientRatio(tiled, inp.w, inp.h, xs, ys);
    let near = NaN, far = NaN, wholeRatio = NaN;
    try {
      const [whole] = await _run(inp.data, inp.w * 3, 1, { ...HIGH, tile: Infinity });
      ({ near, far } = seamDiffs(tiled, whole, inp.w, inp.h, xs, ys));
      wholeRatio = seamGradientRatio(whole, inp.w, inp.h, xs, ys);
    } catch (e) { wholeFailed++; process.stderr.write(`whole-image run failed for ${f}: ${e.message}\n`); }
    if (Number.isFinite(ratio)) ratios.push(ratio);
    if (Number.isFinite(near)) { nears.push(near); fars.push(far); }
    if (Number.isFinite(ratio) && Number.isFinite(wholeRatio)) excess.push(ratio - wholeRatio);
    const fmt = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');
    console.log(`| ${f} | ${inp.w}x${inp.h} | ${xs.length} / ${ys.length} | ${fmt(ratio, 3)} | ${fmt(wholeRatio, 3)} | ${fmt(near, 3)} | ${fmt(far, 3)} |`);
    process.stderr.write('.');
  }
  process.stderr.write('\n');
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
  const mr = mean(ratios), mn = mean(nears), mf = mean(fars);
  const fmt = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');
  console.log(`mean gradient ratio ${fmt(mr, 3)} (${ratios.length} images); mean near diff ${fmt(mn, 3)}, mean far diff ${fmt(mf, 3)} (${nears.length} images; whole-image run failed for ${wholeFailed}); mean of gradient ratio tiled minus whole ${fmt(mean(excess), 3)}`);
  console.log(`seams visible: ${seamsVisible(mr, mn, mf) ? 'yes' : 'no'} (gradient ratio above 1.05 or near diff more than twice far diff)`);
}

if (require.main === module) main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
module.exports = { seamPositions, seamDiffs, seamGradientRatio, seamsVisible };
