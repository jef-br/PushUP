'use strict';
// Flat-colour fidelity of `fast` mode (BK10): how far do uniform colours move through the pipeline?
// Usage: node bench/colors.js
//   27 uniform 400x300 images, each channel in {0, 128, 255}, factor 1, three settings: the shipped `fast`
//   pipeline (upscale), the model only (the 20 % Lanczos mix off, via _run), and a plain sharp lanczos3 resize
//   (reference). Per setting: the largest absolute byte deviation per channel (R/G/B); for the model only also
//   the mean signed shift per channel, and the largest deviation away from the image border (more than
//   16 px from every edge: the model's padding makes the border worse). Prints a markdown table; results are in docs/COLOR.md.
const sharp = require('sharp');

process.env.PUSHUP_QUALITY = 'fast';
process.env.PUSHUP_DEVICE = 'cpu';
const { upscale, _run } = require('../src/index.js');

const W = 400, H = 300, LEVELS = [0, 128, 255];

const EDGE = 16; // px from the image border counted as border

function stats(out, color) {
  const max = [0, 0, 0];
  const inner = [0, 0, 0]; // max deviation more than EDGE px from every border
  const sum = [0, 0, 0];
  const n = out.length / 3;
  for (let i = 0; i < out.length; i++) {
    const k = i % 3;
    const p = (i - k) / 3, x = p % W, y = (p - x) / W;
    const d = out[i] - color[k];
    if (Math.abs(d) > max[k]) max[k] = Math.abs(d);
    if (x >= EDGE && y >= EDGE && x < W - EDGE && y < H - EDGE && Math.abs(d) > inner[k]) inner[k] = Math.abs(d);
    sum[k] += d;
  }
  return { max, inner, mean: sum.map((v) => v / n) };
}

(async () => {
  console.log('| colour (R,G,B) | shipped max dev R/G/B | model-only max dev R/G/B | model-only mean shift R/G/B | model-only max dev away from the border R/G/B | lanczos max dev | shipped / model-only (largest channel) |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of LEVELS) for (const g of LEVELS) for (const b of LEVELS) {
    const color = [r, g, b];
    const input = Buffer.alloc(W * H * 3);
    for (let i = 0; i < input.length; i++) input[i] = color[i % 3];
    const [shipped] = await upscale(new Uint8Array(input), W * 3, 1);
    const [model] = await _run(new Uint8Array(input), W * 3, 1, { lanczosMix: 0 });
    const lanczos = await sharp(input, { raw: { width: W, height: H, channels: 3 } })
      .resize(W, H, { kernel: 'lanczos3' }).raw().toBuffer();
    const s = stats(shipped, color), m = stats(model, color), l = stats(lanczos, color);
    const ms = Math.max(...m.max), ss = Math.max(...s.max);
    console.log(`| ${color.join(',')} | ${s.max.join('/')} | ${m.max.join('/')} | ${m.mean.map((v) => v.toFixed(1)).join('/')} | ${m.inner.join('/')} | ${Math.max(...l.max)} | ${ms === 0 ? 'n/a' : (ss / ms).toFixed(2)} |`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
