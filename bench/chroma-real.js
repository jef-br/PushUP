'use strict';
// Does `fast` add chroma noise to flat COLOURED backdrops of real photos, as it does to grey ones? (BL58; docs/COLOR.md "Flat coloured backdrops (BL58)")
// Usage: node bench/chroma-real.js [--dir bench/out/sub20] [--limit 20] [--size 400]
//   Inputs are built as bench/neutral-real.js builds them (source resized to 1000 px on its longest side (lanczos3), downscaled to --size px
//   (cubic), JPEG q85, decoded). Flat coloured blocks of the INPUT: 16x16 blocks on the grid and edge rule of bench/neutral-real.js (grid
//   starts 16 px from the left/top edge, block at least 16 px from every edge), kept when (1) the mean channel spread (max(R,G,B) - min(R,G,B))
//   over the block is at least 20, (2) no channel of any pixel deviates from that channel's block mean by more than 6 levels, and (3) the luma
//   standard deviation (Rec. 601) is between 0.5 and 8. An image with no such block is listed as "no region".
//   Outputs: the shipped `fast` pipeline (`upscale`, factor 1000 / longest side, CPU) and plain sharp lanczos3 of the input to the same size.
//   Box rule: as bench/neutral-real.js (scaleBox). Chroma noise of a box = standard deviation (population) of R-G and of B-G inside the box,
//   in levels; per method the mean over all kept blocks (each block counts once), as a markdown table.
const fs = require('node:fs');
const path = require('node:path');
const { checkFlags } = require('./flags');
const { scaleBox } = require('./neutral-real');

const BLOCK = 16, EDGE = 16, MIN_MEAN_SPREAD = 20, MAX_DEV = 6, STD_MIN = 0.5, STD_MAX = 8;

// Blocks [{x, y}] of a w x h packed RGB image that are flat and coloured, as described above.
function findColourBlocks(data, w, h) {
  const out = [];
  for (let y = EDGE; y + BLOCK <= h - EDGE; y += BLOCK) {
    for (let x = EDGE; x + BLOCK <= w - EDGE; x += BLOCK) {
      const sum = [0, 0, 0];
      let spread = 0, l = 0, l2 = 0;
      for (let j = 0; j < BLOCK; j++) {
        for (let i = 0; i < BLOCK; i++) {
          const k = ((y + j) * w + x + i) * 3, r = data[k], g = data[k + 1], b = data[k + 2];
          sum[0] += r; sum[1] += g; sum[2] += b;
          spread += Math.max(r, g, b) - Math.min(r, g, b);
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          l += lum; l2 += lum * lum;
        }
      }
      const n = BLOCK * BLOCK;
      if (spread / n < MIN_MEAN_SPREAD) continue;
      const mean = sum.map((v) => v / n);
      let dev = 0;
      for (let j = 0; j < BLOCK && dev <= MAX_DEV; j++) {
        for (let i = 0; i < BLOCK; i++) {
          const k = ((y + j) * w + x + i) * 3;
          for (let c = 0; c < 3; c++) dev = Math.max(dev, Math.abs(data[k + c] - mean[c]));
        }
      }
      if (dev > MAX_DEV) continue;
      const sd = Math.sqrt(Math.max(0, l2 / n - (l / n) ** 2));
      if (sd >= STD_MIN && sd <= STD_MAX) out.push({ x, y });
    }
  }
  return out;
}

// Population standard deviation of R-G and of B-G inside `box` ({x0, y0, x1, y1}) of a packed RGB buffer of width w: [sdRG, sdBG].
function chromaNoise(data, w, box) {
  let n = 0, a = 0, a2 = 0, b = 0, b2 = 0;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const k = (y * w + x) * 3, rg = data[k] - data[k + 1], bg = data[k + 2] - data[k + 1];
      n++; a += rg; a2 += rg * rg; b += bg; b2 += bg * bg;
    }
  }
  if (n === 0) return [0, 0];
  return [Math.sqrt(Math.max(0, a2 / n - (a / n) ** 2)), Math.sqrt(Math.max(0, b2 / n - (b / n) ** 2))];
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
  const { loadGt, inputAt } = require('./groundtruth');

  const acc = { fast: { rg: 0, bg: 0 }, lanczos: { rg: 0, bg: 0 } };
  let used = 0, blocks = 0;
  const none = [];
  for (const f of files) {
    const gt = await loadGt(path.join(dir, f));
    const inp = await inputAt(gt, size);
    const bl = findColourBlocks(inp.data, inp.w, inp.h);
    if (bl.length === 0) { none.push(f); process.stderr.write('.'); continue; }
    const IL = Math.max(inp.w, inp.h), ow = Math.round((inp.w * 1000) / IL), oh = Math.round((inp.h * 1000) / IL);
    const [fastOut] = await upscale(inp.data, inp.w * 3, 1000 / IL);
    const lanOut = await sharp(inp.data, { raw: { width: inp.w, height: inp.h, channels: 3 } }).resize(ow, oh, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
    for (const b of bl) {
      const box = scaleBox(b, 1000 / IL, ow, oh);
      for (const [m, out] of [['fast', fastOut], ['lanczos', lanOut]]) { const [rg, bg] = chromaNoise(out, ow, box); acc[m].rg += rg; acc[m].bg += bg; }
    }
    used++; blocks += bl.length;
    process.stderr.write('.');
  }
  process.stderr.write('\n');
  console.log(`images: ${files.length}; with a region: ${used}; blocks: ${blocks}; input ${size} px, output 1000 px`);
  console.log(`no region: ${none.length ? none.join(', ') : 'none'}`);
  console.log('| method | blocks | mean sd of R-G | mean sd of B-G |');
  console.log('|---|---|---|---|');
  const mean = (v) => (blocks ? v / blocks : 0);
  for (const m of ['fast', 'lanczos']) console.log(`| ${m === 'fast' ? '`fast`' : 'Lanczos'} | ${blocks} | ${mean(acc[m].rg).toFixed(2)} | ${mean(acc[m].bg).toFixed(2)} |`);
  const ratio = (m) => (acc.lanczos[m] > 0 ? acc.fast[m] / acc.lanczos[m] : Infinity);
  const twice = ratio('rg') >= 2 && ratio('bg') >= 2;
  console.log(`chroma noise, fast / Lanczos: R-G ${ratio('rg').toFixed(2)}x, B-G ${ratio('bg').toFixed(2)}x; at least twice Lanczos in both: ${twice ? 'yes' : 'no'}`);
}

if (require.main === module) main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
module.exports = { findColourBlocks, chromaNoise };
