'use strict';
// Do near-neutral backdrops of real photos keep R = G = B through `fast`? (BL46; docs/COLOR.md "Neutral backdrops on real photos")
// Usage: node bench/neutral-real.js [--dir bench/out/sub20] [--limit 20] [--size 400] [--mix 0..1]
//   --mix (BL47): Lanczos share of the `fast` output, via the internal `_run`; without it the shipped pipeline (`upscale`) runs.
//   Inputs are built exactly as bench/colors-real.js builds them: source resized to 1000 px on its longest side
//   (lanczos3), downscaled to --size px (cubic), JPEG q85, decoded. Near-neutral flat regions of the INPUT are found:
//   16x16 blocks on a grid that starts at 16 px from the left/top edge, kept only when the block lies at least 16 px from
//   every edge, its largest per-pixel channel spread (max(R,G,B) - min(R,G,B)) is <= 2 and the luma standard deviation
//   (Rec. 601, 0.299 R + 0.587 G + 0.114 B) is between 0.5 and 8. An image with no such block is listed as "no region".
//   Outputs: the shipped `fast` pipeline at factor 1000 / longest side, and plain sharp lanczos3 of the input to the same size.
//   Box rule: a block (x0, y0, 16, 16) maps to the output box from ceil(x0 * f) up to floor((x0 + 16) * f) (same for y),
//   f = 1000 / longest side of the input, clamped to the output size, so the box lies inside the block's pixels.
//   Per method over all kept blocks: mean channel spread, 99th percentile (256-bin histogram) and the share of pixels
//   with spread >= 3, as a markdown table.
const fs = require('node:fs');
const path = require('node:path');
const { checkFlags } = require('./flags');
const { p99 } = require('./stats');

const BLOCK = 16, EDGE = 16, MAX_SPREAD = 2, STD_MIN = 0.5, STD_MAX = 8;

// Blocks [{x, y}] of a w x h RGB image (`data`, tightly packed) that are near-neutral and flat, as described above.
function findBlocks(data, w, h) {
  const out = [];
  for (let y = EDGE; y + BLOCK <= h - EDGE; y += BLOCK) {
    for (let x = EDGE; x + BLOCK <= w - EDGE; x += BLOCK) {
      let maxSpread = 0, n = 0, s = 0, s2 = 0;
      for (let j = 0; j < BLOCK && maxSpread <= MAX_SPREAD; j++) {
        for (let i = 0; i < BLOCK; i++) {
          const k = ((y + j) * w + x + i) * 3, r = data[k], g = data[k + 1], b = data[k + 2];
          const sp = Math.max(r, g, b) - Math.min(r, g, b);
          if (sp > maxSpread) maxSpread = sp;
          const l = 0.299 * r + 0.587 * g + 0.114 * b;
          n++; s += l; s2 += l * l;
        }
      }
      if (maxSpread > MAX_SPREAD) continue;
      const sd = Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2));
      if (sd >= STD_MIN && sd <= STD_MAX) out.push({ x, y });
    }
  }
  return out;
}

// Output box of a block, edges rounded inward, clamped to the output size.
function scaleBox(b, f, ow, oh) {
  const x0 = Math.ceil(b.x * f), x1 = Math.min(ow, Math.floor((b.x + BLOCK) * f));
  const y0 = Math.ceil(b.y * f), y1 = Math.min(oh, Math.floor((b.y + BLOCK) * f));
  return { x0, y0, x1, y1 };
}

const newAcc = () => ({ n: 0, sum: 0, ge3: 0, hist: new Float64Array(256) });
function addBox(acc, data, w, box) {
  for (let y = box.y0; y < box.y1; y++) for (let x = box.x0; x < box.x1; x++) {
    const k = (y * w + x) * 3, r = data[k], g = data[k + 1], b = data[k + 2];
    const sp = Math.max(r, g, b) - Math.min(r, g, b);
    acc.n++; acc.sum += sp; acc.hist[sp]++;
    if (sp >= 3) acc.ge3++;
  }
}
const summary = (a) => ({ pixels: a.n, mean: a.n ? a.sum / a.n : 0, p99: p99(a.hist, a.n), share3: a.n ? (100 * a.ge3) / a.n : 0 });

async function main(argv) {
  const sharp = require('sharp');
  const opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
  const fail = (msg) => { console.error(msg); process.exit(1); };
  const flagError = checkFlags(argv, { values: ['--dir', '--limit', '--size', '--mix'], switches: [] });
  if (flagError) fail(flagError);
  const dir = path.resolve(String(opt('--dir', path.join(__dirname, 'out', 'sub20'))));
  const limitArg = String(opt('--limit', '1000000000')), sizeArg = String(opt('--size', '400'));
  if (!/^\d+$/.test(limitArg) || Number(limitArg) < 1) fail('--limit must be a positive integer');
  if (!/^\d+$/.test(sizeArg) || Number(sizeArg) < 400 || Number(sizeArg) > 800) fail('--size must be an integer from 400 to 800');
  const size = Number(sizeArg);
  const mixArg = opt('--mix', null);
  if (mixArg !== null && !(/^(0|1|0?\.\d+|1\.0+)$/.test(String(mixArg)))) fail('--mix must be a number from 0 to 1');
  let stat = null;
  try { stat = fs.statSync(dir); } catch { /* reported below */ }
  if (!stat) fail(`${dir} does not exist; run bash bench/fetch_testset.sh`);
  if (!stat.isDirectory()) fail(`${dir} is not a directory`);
  const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort().slice(0, Number(limitArg));
  if (files.length === 0) fail(`no images in ${dir}`);

  process.env.PUSHUP_QUALITY = 'fast';
  process.env.PUSHUP_DEVICE = 'cpu';
  const { upscale, _run } = require('../src/index.js');
  const mix = mixArg === null ? null : Number(mixArg);
  const raw = async (img) => { const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };

  const acc = { fast: newAcc(), lanczos: newAcc() };
  let used = 0, blocks = 0;
  const none = [];
  for (const f of files) {
    const src = path.join(dir, f);
    const meta = await sharp(src).metadata();
    const L = Math.max(meta.width, meta.height);
    const gw = Math.round((meta.width * 1000) / L), gh = Math.round((meta.height * 1000) / L);
    const gt = await raw(sharp(src).resize(gw, gh, { kernel: 'lanczos3', fit: 'fill' }));
    const iw = Math.round((gw * size) / 1000), ih = Math.round((gh * size) / 1000);
    const jpg = await sharp(gt.data, { raw: { width: gw, height: gh, channels: 3 } }).resize(iw, ih, { kernel: 'cubic', fit: 'fill' }).jpeg({ quality: 85 }).toBuffer();
    const inp = await raw(sharp(jpg));
    const bl = findBlocks(inp.data, inp.w, inp.h);
    if (bl.length === 0) { none.push(f); process.stderr.write('.'); continue; }
    const IL = Math.max(inp.w, inp.h), ow = Math.round((inp.w * 1000) / IL), oh = Math.round((inp.h * 1000) / IL);
    const [fastOut] = mix === null ? await upscale(inp.data, inp.w * 3, 1000 / IL) : await _run(inp.data, inp.w * 3, 1000 / IL, { lanczosMix: mix });
    const lanOut = await sharp(inp.data, { raw: { width: inp.w, height: inp.h, channels: 3 } }).resize(ow, oh, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
    for (const b of bl) {
      const box = scaleBox(b, 1000 / IL, ow, oh);
      addBox(acc.fast, fastOut, ow, box);
      addBox(acc.lanczos, lanOut, ow, box);
    }
    used++; blocks += bl.length;
    process.stderr.write('.');
  }
  process.stderr.write('\n');
  console.log(`images: ${files.length}; with a region: ${used}; blocks: ${blocks}; input ${size} px, output 1000 px`);
  console.log(`no region: ${none.length ? none.join(', ') : 'none'}`);
  console.log('| method | pixels | mean spread | 99th percentile spread | share of pixels with spread >= 3 (%) |');
  console.log('|---|---|---|---|---|');
  const res = {};
  for (const m of ['fast', 'lanczos']) {
    const s = res[m] = summary(acc[m]);
    console.log(`| ${m === 'fast' ? '`fast`' : 'Lanczos'} | ${s.pixels} | ${s.mean.toFixed(2)} | ${s.p99} | ${s.share3.toFixed(2)} |`);
  }
  const diff = res.fast.share3 - res.lanczos.share3;
  console.log(`share >= 3, fast minus Lanczos: ${diff.toFixed(2)} percentage points; more than 1 point above Lanczos: ${diff > 1 ? 'yes' : 'no'}`);
}

if (require.main === module) main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
module.exports = { findBlocks, scaleBox, summary, newAcc, addBox };
