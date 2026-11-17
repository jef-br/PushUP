'use strict';
// Does the synthetic hard-edge overshoot of `fast` (docs/EDGES.md) also show on real photos? (CV2)
// Usage: node bench/edges-real.js [--dir bench/out/sub20] [--limit 20]
//   Per image: reference = the source resized to 800 px on its longest side (lanczos3), input = that reference
//   downscaled to 400 px (cubic), JPEG q85, decoded (as bench/pad.js and bench/bench.js degrade). Outputs: the shipped
//   `fast` pipeline at factor 2.0 (800 px out) and plain sharp lanczos3 of the input to the same size. On the luma of
//   the reference, the 200 pixels with the largest Sobel gradient whose 9x9 neighbourhood spans at least 80 levels
//   (dark to light) are the edge pixels. Overshoot of an output at such a pixel = how far its luma lies beyond the
//   min/max of the reference's 9x9 neighbourhood, in levels (0 inside). Results: docs/EDGES.md "Real photos (CV2)".
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { checkFlags } = require('./flags');

const HALF = 4, N_EDGE = 200, MIN_CONTRAST = 80, HIT = 4; // 9x9 window, edge pixels per image, levels, "overshoot > 4"

// Overshoot of `out` at (x, y) against the min/max of the 9x9 window of `ref` around it (both luma planes of width w).
function overshoot9(out, ref, w, x, y) {
  let lo = Infinity, hi = -Infinity;
  for (let j = y - HALF; j <= y + HALF; j++) {
    for (let i = x - HALF; i <= x + HALF; i++) {
      const v = ref[j * w + i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  const o = out[y * w + x];
  return Math.max(0, o - hi, lo - o);
}

// Up to n pixels (index = y * w + x) with the largest Sobel gradient whose 9x9 window spans >= MIN_CONTRAST,
// at least HALF px from the border, ties broken by index.
function pickEdges(ref, w, h, n) {
  const cand = [];
  for (let y = HALF; y < h - HALF; y++) {
    for (let x = HALF; x < w - HALF; x++) {
      const p = y * w + x;
      const gx = ref[p - w + 1] + 2 * ref[p + 1] + ref[p + w + 1] - ref[p - w - 1] - 2 * ref[p - 1] - ref[p + w - 1];
      const gy = ref[p + w - 1] + 2 * ref[p + w] + ref[p + w + 1] - ref[p - w - 1] - 2 * ref[p - w] - ref[p - w + 1];
      const g = gx * gx + gy * gy;
      if (g > 0) cand.push([g, p]);
    }
  }
  cand.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const picked = [];
  for (const [, p] of cand) {
    if (picked.length >= n) break;
    const x = p % w, y = (p - x) / w;
    let lo = Infinity, hi = -Infinity;
    for (let j = y - HALF; j <= y + HALF; j++) for (let i = x - HALF; i <= x + HALF; i++) { const v = ref[j * w + i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi - lo >= MIN_CONTRAST) picked.push(p);
  }
  return picked;
}

const luma = (rgb, n) => { const l = new Float32Array(n); for (let i = 0, j = 0; i < n; i++, j += 3) l[i] = 0.299 * rgb[j] + 0.587 * rgb[j + 1] + 0.114 * rgb[j + 2]; return l; };
const raw = async (img) => { const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };

async function main() {
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
  const flagError = checkFlags(process.argv.slice(2), { values: ['--dir', '--limit'] });
  if (flagError) { console.error(flagError); process.exit(1); }
  const dir = path.resolve(arg('dir', path.join(__dirname, 'out', 'sub20')));
  const limit = Number(arg('limit', '20'));
  if (!Number.isInteger(limit) || limit < 1) { console.error('--limit must be a positive integer'); process.exit(1); }
  if (!fs.existsSync(dir)) { console.error(`${dir} does not exist; run bash bench/fetch_testset.sh`); process.exit(1); }
  if (!fs.statSync(dir).isDirectory()) { console.error(`${dir} is not a directory`); process.exit(1); }
  const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort().slice(0, limit);
  if (!files.length) { console.error(`no images in ${dir}`); process.exit(1); }

  process.env.PUSHUP_QUALITY = 'fast';
  process.env.PUSHUP_DEVICE = 'cpu';
  const { _run } = require('../src/index.js');
  const acc = { fast: [], lanczos: [] };
  const used = [];
  const short = [];
  for (const f of files) {
    const meta = await sharp(path.join(dir, f)).metadata();
    const L = Math.max(meta.width, meta.height);
    const gw = Math.round((meta.width * 800) / L), gh = Math.round((meta.height * 800) / L);
    const gt = await raw(sharp(path.join(dir, f)).resize(gw, gh, { kernel: 'lanczos3', fit: 'fill' }));
    const iw = Math.round(gw / 2), ih = Math.round(gh / 2);
    const jpg = await sharp(gt.data, { raw: { width: gw, height: gh, channels: 3 } }).resize(iw, ih, { kernel: 'cubic', fit: 'fill' }).jpeg({ quality: 85 }).toBuffer();
    const inp = await raw(sharp(jpg));
    if (Math.max(inp.w, inp.h) < 400) { short.push(f); continue; }
    const [fa, sa] = await _run(inp.data, inp.w * 3, 2.0);
    const ow = sa / 3, oh = fa.length / sa;
    const lz = await sharp(inp.data, { raw: { width: inp.w, height: inp.h, channels: 3 } }).resize(ow, oh, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
    // Clip reference and outputs to the area they share (1 px differences), top-left aligned.
    const w = Math.min(ow, gt.w), h = Math.min(oh, gt.h);
    const clip = (rgb, sw) => { const b = Buffer.alloc(w * h * 3); for (let y = 0; y < h; y++) rgb.copy(b, y * w * 3, y * sw * 3, (y * sw + w) * 3); return luma(b, w * h); };
    const ref = clip(gt.data, gt.w), outs = { fast: clip(Buffer.from(fa.buffer, fa.byteOffset, fa.length), ow), lanczos: clip(lz, ow) };
    const edges = pickEdges(ref, w, h, N_EDGE);
    if (!edges.length) { short.push(f); continue; }
    used.push({ f, n: edges.length });
    for (const k of ['fast', 'lanczos']) {
      let sum = 0, hits = 0, any = 0, max = 0;
      for (const p of edges) { const x = p % w, y = (p - x) / w, o = overshoot9(outs[k], ref, w, x, y); sum += o; if (o > HIT) hits++; if (o > 0) any++; if (o > max) max = o; }
      acc[k].push({ mean: sum / edges.length, share: hits / edges.length, any, max, n: edges.length });
    }
  }
  const mean = (k, m) => acc[k].reduce((s, r) => s + r[m], 0) / acc[k].length;
  console.log(`images used: ${used.length} of ${files.length}; edge pixels per image: min ${Math.min(...used.map((u) => u.n))}, max ${Math.max(...used.map((u) => u.n))}; skipped (no edge pixels or input under 400 px): ${short.length ? short.join(', ') : 'none'}`);
  console.log('| method | mean overshoot (levels) | share with overshoot > 4 | edge pixels with any overshoot | largest overshoot (levels) |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const k of ['fast', 'lanczos']) {
    const any = acc[k].reduce((s, r) => s + r.any, 0), tot = acc[k].reduce((s, r) => s + r.n, 0);
    console.log(`| ${k === 'fast' ? '`fast`' : 'Lanczos'} | ${mean(k, 'mean').toFixed(3)} | ${(100 * mean(k, 'share')).toFixed(1)} % | ${any} of ${tot} | ${Math.max(...acc[k].map((r) => r.max)).toFixed(2)} |`);
  }
}

module.exports = { overshoot9, pickEdges };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
