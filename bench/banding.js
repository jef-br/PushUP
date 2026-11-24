'use strict';
// Banding of smooth gradients through `fast` mode (BL41): do soft shadows and backdrop gradients stay smooth?
// Usage: node bench/banding.js [--sizes 400x300,800x600] [--factors 1,1.5] [--grads hramp,dramp,radial] [--noise 0,1]
//   Synthetic grey images (no downloads): a horizontal ramp 255 -> 200, a diagonal ramp 255 -> 200 and a radial
//   "shadow" (white to grey 150 over 120 px), each without noise and with seeded +-1 level noise. Each is upscaled by
//   the shipped `fast` pipeline on CPU and, as reference, resized by sharp Lanczos to the same size. On the middle row
//   of each output (on the gradient only: for the radial shadow its left half) the table gives: distinct grey levels, the longest run of equal values
//   (px) and the mean absolute second difference (roughness). `banded` = the model's longest run is longer than
//   Lanczos's. Prints a markdown table; results are in docs/BANDING.md.
const sharp = require('sharp');

process.env.PUSHUP_QUALITY = 'fast';
process.env.PUSHUP_DEVICE = 'cpu';

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Grey RGB image (Uint8Array, tightly packed) for one gradient kind.
function makeImage(kind, w, h, noise) {
  const out = new Uint8Array(w * h * 3);
  const rand = rng(12345);
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let t; // 0..1 along the gradient
    if (kind === 'hramp') t = x / (w - 1);
    else if (kind === 'dramp') t = (x / (w - 1) + y / (h - 1)) / 2;
    else if (kind === 'radial') t = Math.min(1, Math.hypot(x - cx, y - cy) / 120);
    else throw new Error(`unknown gradient ${kind}`);
    const top = kind === 'radial' ? 150 : 255, bottom = kind === 'radial' ? 255 : 200;
    let v = Math.round(top + (bottom - top) * t);
    if (noise) v += Math.round(rand() * 2 - 1) * noise; // -noise, 0 or +noise
    v = Math.max(0, Math.min(255, v));
    const o = (y * w + x) * 3;
    out[o] = out[o + 1] = out[o + 2] = v;
  }
  return out;
}

// Figures for one row of grey values.
function lineStats(values) {
  const levels = new Set(values).size;
  let run = 1, longest = 1;
  for (let i = 1; i < values.length; i++) {
    run = values[i] === values[i - 1] ? run + 1 : 1;
    if (run > longest) longest = run;
  }
  let sum = 0;
  for (let i = 1; i < values.length - 1; i++) sum += Math.abs(values[i - 1] - 2 * values[i] + values[i + 1]);
  return { levels, longest, rough: sum / Math.max(1, values.length - 2) };
}

// Middle row (red channel) of a tightly packed RGB image, from column x0 to x1 (exclusive).
function middleRow(rgb, w, h, x0 = 0, x1 = w) {
  const y = Math.floor(h / 2), row = [];
  for (let x = x0; x < x1; x++) row.push(rgb[(y * w + x) * 3]);
  return row;
}

// Columns of the middle row that lie on the gradient: all of them for the ramps; for the radial shadow only the left
// half of the shadow (centre to 120 px out; the flat white beyond it would count as one huge "step").
function segment(kind, inW, outW, factor) {
  if (kind !== 'radial') return [0, outW];
  const cx = inW / 2;
  return [Math.max(0, Math.round((cx - 120) * factor)), Math.min(outW, Math.round(cx * factor))];
}

function parseArgs(argv) {
  const o = { sizes: ['400x300', '800x600'], factors: [1, 1.5], grads: ['hramp', 'dramp', 'radial'], noise: [0, 1] };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i], v = argv[i + 1];
    if (v === undefined || !['--sizes', '--factors', '--grads', '--noise'].includes(k)) {
      throw new Error(`usage: node bench/banding.js [--sizes WxH,..] [--factors f,..] [--grads hramp,dramp,radial] [--noise 0,1]`);
    }
    const list = v.split(',');
    if (k === '--sizes') o.sizes = list;
    else if (k === '--grads') o.grads = list;
    else o[k.slice(2)] = list.map(Number);
  }
  return o;
}

async function main(argv) {
  const { upscale } = require('../src/index.js');
  const o = parseArgs(argv);
  console.log('| size | factor | gradient | noise | out | levels (model/lanczos) | longest run px (model/lanczos) | roughness (model/lanczos) | banded |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const size of o.sizes) {
    const [w, h] = size.split('x').map(Number);
    for (const kind of o.grads) for (const noise of o.noise) for (const factor of o.factors) {
      const input = makeImage(kind, w, h, noise);
      const [model, stride] = await upscale(input, w * 3, factor);
      const ow = stride / 3, oh = model.length / stride;
      const ref = await sharp(Buffer.from(input), { raw: { width: w, height: h, channels: 3 } })
        .resize(ow, oh, { kernel: 'lanczos3' }).raw().toBuffer();
      const seg = segment(kind, w, ow, factor);
      const m = lineStats(middleRow(model, ow, oh, ...seg)), l = lineStats(middleRow(ref, ow, oh, ...seg));
      console.log(`| ${size} | ${factor} | ${kind} | ${noise ? `±${noise}` : 'none'} | ${ow}x${oh} | ${m.levels}/${l.levels} | ${m.longest}/${l.longest} | ${m.rough.toFixed(2)}/${l.rough.toFixed(2)} | ${m.longest > l.longest ? 'yes' : 'no'} |`);
    }
  }
}

if (require.main === module) main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
module.exports = { makeImage, lineStats, middleRow, segment, parseArgs };
