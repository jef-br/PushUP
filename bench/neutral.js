'use strict';
// Do neutral greys stay neutral through `fast` mode (BL43; docs/COLOR.md "Neutral greys (BL43)")?
// Usage: node bench/neutral.js [--cases flat64,flat128,flat192,flat240,ramp,noise] [--factors 1,1.5]
//   Synthetic 400x300 images with R = G = B everywhere: flat grey at 64, 128, 192 and 240, a horizontal ramp 16 -> 240,
//   and seeded grey noise (128 +- 8). Each goes through the shipped `fast` pipeline on CPU at the given factors. Per case
//   and factor: the largest and the mean per-pixel channel spread max(R,G,B) - min(R,G,B) of the output, over the whole image
//   and away from the border (more than 16 px from every edge, as bench/colors.js). Prints a markdown table.
process.env.PUSHUP_QUALITY = 'fast';
process.env.PUSHUP_DEVICE = 'cpu';

const W = 400, H = 300, EDGE = 16;
const CASES = ['flat64', 'flat128', 'flat192', 'flat240', 'ramp', 'noise'];

// Grey RGB image (tightly packed Uint8Array), every pixel R = G = B.
function makeNeutral(kind, w = W, h = H) {
  const out = new Uint8Array(w * h * 3);
  let s = 99; // seeded LCG, so the image is the same on every run
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v;
    const flat = /^flat(\d+)$/.exec(kind);
    if (flat) v = Number(flat[1]);
    else if (kind === 'ramp') v = Math.round(16 + (224 * x) / (w - 1));
    else if (kind === 'noise') { s = (Math.imul(s, 1103515245) + 12345) >>> 0; v = 128 + ((s >>> 16) % 17) - 8; }
    else throw new Error(`unknown case ${kind}`);
    out.fill(v, (y * w + x) * 3, (y * w + x) * 3 + 3);
  }
  return out;
}

// Largest and mean channel spread of a packed RGB image, whole image and away from the border.
function spread(rgb, w, h, edge = EDGE) {
  const acc = { allMax: 0, allSum: 0, allN: 0, inMax: 0, inSum: 0, inN: 0 };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 3, r = rgb[o], g = rgb[o + 1], b = rgb[o + 2];
    const d = Math.max(r, g, b) - Math.min(r, g, b);
    acc.allMax = Math.max(acc.allMax, d); acc.allSum += d; acc.allN++;
    if (x >= edge && y >= edge && x < w - edge && y < h - edge) { acc.inMax = Math.max(acc.inMax, d); acc.inSum += d; acc.inN++; }
  }
  return { allMax: acc.allMax, allMean: acc.allSum / acc.allN, inMax: acc.inMax, inMean: acc.inN ? acc.inSum / acc.inN : 0 };
}

function parseArgs(argv) {
  const o = { cases: CASES, factors: [1, 1.5] };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i], v = argv[i + 1];
    if (v === undefined || !['--cases', '--factors'].includes(k)) throw new Error('usage: node bench/neutral.js [--cases flat64,..,ramp,noise] [--factors f,..]');
    if (k === '--cases') o.cases = v.split(',');
    else o.factors = v.split(',').map(Number);
  }
  return o;
}

async function main(argv) {
  const { upscale } = require('../src/index.js');
  const o = parseArgs(argv);
  console.log('| case | factor | out | max spread (whole image) | mean spread (whole image) | max spread (away from the border) | mean spread (away from the border) |');
  console.log('|---|---|---|---|---|---|---|');
  for (const kind of o.cases) for (const factor of o.factors) {
    const input = makeNeutral(kind);
    const [out, stride] = await upscale(input, W * 3, factor);
    const ow = stride / 3, oh = out.length / stride;
    const s = spread(out, ow, oh);
    console.log(`| ${kind} | ${factor} | ${ow}x${oh} | ${s.allMax} | ${s.allMean.toFixed(3)} | ${s.inMax} | ${s.inMean.toFixed(3)} |`);
  }
}

if (require.main === module) main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
module.exports = { makeNeutral, spread, parseArgs, CASES };
