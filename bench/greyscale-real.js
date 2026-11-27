'use strict';
// Do real greyscale photos stay neutral through `fast`? (BL72; docs/COLOR.md "Greyscale photos (BL72)")
// Usage: node bench/greyscale-real.js [--dir bench/out/sub20] [--limit 20] [--size 400..800] [--jpeg 50..100]
//   Each image is turned into a greyscale reference: the 1000 px reference of bench/groundtruth.js with every pixel set to its
//   Rec. 601 luma, round(0.299 R + 0.587 G + 0.114 B), in all three channels. The input is built as bench/neutral-real.js builds
//   it (cubic down to --size, JPEG at --jpeg, default 85, decoded); the decoded JPEG is then made exactly neutral again by
//   taking its luma in all three channels (JPEG decoding can leave a spread of 1), so R = G = B holds for every input pixel.
//   Outputs: the shipped `fast` pipeline (`upscale`, CPU) at factor 1000 / longest side, and plain sharp lanczos3 of the input to the
//   same size. Per method, over all output pixels more than 16 px from every edge: mean and 99th percentile of the channel spread
//   max(R,G,B) - min(R,G,B), the share of pixels with spread >= 3, and the largest spread. Prints a markdown table.
const fs = require('node:fs');
const path = require('node:path');
const { checkFlags } = require('./flags');
const { p99 } = require('./stats');

const EDGE = 16;

// Set every pixel of a packed RGB buffer to its Rec. 601 luma, rounded, in all three channels (new buffer).
function toGrey(data) {
  const out = Buffer.alloc(data.length);
  for (let k = 0; k < data.length; k += 3) {
    const v = Math.round(0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2]);
    out[k] = out[k + 1] = out[k + 2] = v;
  }
  return out;
}

const newAcc = () => ({ n: 0, sum: 0, ge3: 0, max: 0, hist: new Float64Array(256) });

// Add the channel spread of every pixel of a w x h packed RGB image more than EDGE px from every edge.
function addInterior(acc, data, w, h) {
  for (let y = EDGE; y < h - EDGE; y++) for (let x = EDGE; x < w - EDGE; x++) {
    const k = (y * w + x) * 3, r = data[k], g = data[k + 1], b = data[k + 2];
    const sp = Math.max(r, g, b) - Math.min(r, g, b);
    acc.n++; acc.sum += sp; acc.hist[sp]++;
    if (sp >= 3) acc.ge3++;
    if (sp > acc.max) acc.max = sp;
  }
}
const summary = (a) => ({ pixels: a.n, mean: a.n ? a.sum / a.n : 0, p99: p99(a.hist, a.n), share3: a.n ? (100 * a.ge3) / a.n : 0, max: a.max });

async function main(argv) {
  const sharp = require('sharp');
  const opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
  const fail = (msg) => { console.error(msg); process.exit(1); };
  const flagError = checkFlags(argv, { values: ['--dir', '--limit', '--size', '--jpeg'], switches: [] });
  if (flagError) fail(flagError);
  const dir = path.resolve(String(opt('--dir', path.join(__dirname, 'out', 'sub20'))));
  const limitArg = String(opt('--limit', '1000000000')), sizeArg = String(opt('--size', '400'));
  if (!/^\d+$/.test(limitArg) || Number(limitArg) < 1) fail('--limit must be a positive integer');
  if (!/^\d+$/.test(sizeArg) || Number(sizeArg) < 400 || Number(sizeArg) > 800) fail('--size must be an integer from 400 to 800');
  const jpegArg = String(opt('--jpeg', '85'));
  if (!/^\d+$/.test(jpegArg) || Number(jpegArg) < 50 || Number(jpegArg) > 100) fail('--jpeg must be an integer from 50 to 100');
  const size = Number(sizeArg), jpegQuality = Number(jpegArg);
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
  for (const f of files) {
    const gt = await loadGt(path.join(dir, f));
    const grey = { data: toGrey(gt.data), w: gt.w, h: gt.h };
    const dec = await inputAt(grey, size, jpegQuality);
    const inp = { data: toGrey(dec.data), w: dec.w, h: dec.h };
    const IL = Math.max(inp.w, inp.h), ow = Math.round((inp.w * 1000) / IL), oh = Math.round((inp.h * 1000) / IL);
    const [fastOut] = await upscale(inp.data, inp.w * 3, 1000 / IL);
    const lanOut = await sharp(inp.data, { raw: { width: inp.w, height: inp.h, channels: 3 } }).resize(ow, oh, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
    addInterior(acc.fast, fastOut, ow, oh);
    addInterior(acc.lanczos, lanOut, ow, oh);
    process.stderr.write('.');
  }
  process.stderr.write('\n');
  console.log(`images: ${files.length}; input ${size} px, output 1000 px${jpegQuality === 85 ? '' : `; input JPEG q${jpegQuality}`}; greyscale inputs (R = G = B)`);
  console.log('| method | pixels | mean spread | 99th percentile spread | share of pixels with spread >= 3 (%) | largest spread |');
  console.log('|---|---|---|---|---|---|');
  const res = {};
  for (const m of ['fast', 'lanczos']) {
    const s = res[m] = summary(acc[m]);
    console.log(`| ${m === 'fast' ? '`fast`' : 'Lanczos'} | ${s.pixels} | ${s.mean.toFixed(2)} | ${s.p99} | ${s.share3.toFixed(2)} | ${s.max} |`);
  }
  const diff = res.fast.share3 - res.lanczos.share3;
  console.log(`share >= 3, fast minus Lanczos: ${diff.toFixed(2)} percentage points; more than 1 point above Lanczos: ${diff > 1 ? 'yes' : 'no'}`);
}

if (require.main === module) main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
module.exports = { toGrey, newAcc, addInterior, summary };
