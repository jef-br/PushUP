'use strict';
// Does the synthetic hard-edge overshoot of `fast` (docs/EDGES.md) also show on real photos? (CV2)
// Usage: node bench/edges-real.js [--dir bench/out/sub20] [--limit 20]
//   Per image: reference = the source resized to 800 px on its longest side (lanczos3), input = that reference
//   downscaled to 400 px (cubic), JPEG q85, decoded (as bench/pad.js and bench/bench.js degrade). Outputs: the shipped
//   `fast` pipeline at factor 2.0 (800 px out) and plain sharp lanczos3 of the input to the same size. On the luma of
//   the reference, the 200 pixels with the largest Sobel gradient whose 9x9 neighbourhood spans at least 80 levels
//   (dark to light) are the edge pixels. Overshoot of an output at such a pixel = how far its luma lies beyond the
//   min/max of the reference's 9x9 neighbourhood, in levels (0 inside). Results: docs/EDGES.md "Real photos (CV2)".
//   CV3: the same edge pixels are also scored 2 px to each side along the gradient (where ringing lobes sit), each
//   against the 13x13 window of the reference centred on the EDGE pixel (so the window still spans dark to light);
//   a sample whose window leaves the image is skipped and counted. A positive control runs first: an 800x600 ideal
//   step (40 | 215, edge between x = 399 and 400) degraded like the photos; if `fast` reads < 4 levels beside the
//   edge there, the real-photo result is "inconclusive" (bench/edges.js shows 12 to 17 on a clean step).
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { checkFlags } = require('./flags');
const { raw, degrade } = require('./degrade');

const HALF = 4, N_EDGE = 200, MIN_CONTRAST = 80, HIT = 4; // 9x9 window, edge pixels per image, levels, "overshoot > 4"

// Overshoot of `out` at (x, y) against the min/max of the window of `ref` centred on (cx, cy) (default: on (x, y)) with
// half-width `half` (default 4: 9x9), both luma planes of width w. 0 when inside the window's range.
function overshoot9(out, ref, w, x, y, { half = HALF, cx = x, cy = y } = {}) {
  let lo = Infinity, hi = -Infinity;
  for (let j = cy - half; j <= cy + half; j++) {
    for (let i = cx - half; i <= cx + half; i++) {
      const v = ref[j * w + i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  const o = out[y * w + x];
  return Math.max(0, o - hi, lo - o);
}

// Sobel gradient [gx, gy] of the luma plane at pixel index p (not on the border).
function sobel(ref, w, p) {
  const gx = ref[p - w + 1] + 2 * ref[p + 1] + ref[p + w + 1] - ref[p - w - 1] - 2 * ref[p - 1] - ref[p + w - 1];
  const gy = ref[p + w - 1] + 2 * ref[p + w] + ref[p + w + 1] - ref[p - w - 1] - 2 * ref[p - w] - ref[p - w + 1];
  return [gx, gy];
}

// Direction of the gradient rounded to one of the 8 steps: each component of (gx, gy) / max(|gx|, |gy|) rounded to -1, 0, 1.
function stepOf(gx, gy) {
  const m = Math.max(Math.abs(gx), Math.abs(gy));
  if (m === 0) return [0, 0];
  return [Math.round(gx / m) || 0, Math.round(gy / m) || 0];
}

// The pixels 2 px to each side of edge pixel p along the gradient, as { x, y } with the window centre { cx, cy } = p.
// Empty when the 13x13 window around p (half-width 6) would leave the w x h image: `skipped` is then 2.
const BESIDE = 2, BHALF = 6;
function besideSamples(ref, w, h, p) {
  const x = p % w, y = (p - x) / w;
  if (x < BHALF || y < BHALF || x >= w - BHALF || y >= h - BHALF) return { samples: [], skipped: 2 };
  const [sx, sy] = stepOf(...sobel(ref, w, p));
  if (sx === 0 && sy === 0) return { samples: [], skipped: 2 };
  return { samples: [-1, 1].map((d) => ({ x: x + d * BESIDE * sx, y: y + d * BESIDE * sy, cx: x, cy: y })), skipped: 0 };
}

// Up to n pixels (index = y * w + x) with the largest Sobel gradient whose 9x9 window spans >= MIN_CONTRAST,
// at least HALF px from the border, ties broken by index.
function pickEdges(ref, w, h, n) {
  const cand = [];
  for (let y = HALF; y < h - HALF; y++) {
    for (let x = HALF; x < w - HALF; x++) {
      const p = y * w + x;
      const [gx, gy] = sobel(ref, w, p);
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
  const METHODS = ['fast', 'lanczos'];

  // Scores of both outputs on one image: `picks` = edge pixel indices into the w x h planes. `rowOff` is added to the
  // row of each pick before reading the planes (the control picks on a cropped plane).
  const scoreImage = (ref, outs, w, h, picks, rowOff = 0) => {
    const r = {};
    for (const k of METHODS) {
      const on = { sum: 0, hits: 0, any: 0, max: 0, n: 0 };
      const be = { sum: 0, hits: 0, any: 0, max: 0, n: 0, skipped: 0 };
      const add = (t, o) => { t.sum += o; t.n++; if (o > HIT) t.hits++; if (o > 0) t.any++; if (o > t.max) t.max = o; };
      for (const p0 of picks) {
        const p = p0 + rowOff * w, x = p % w, y = (p - x) / w;
        add(on, overshoot9(outs[k], ref, w, x, y));
        const b = besideSamples(ref, w, h, p);
        be.skipped += b.skipped;
        for (const q of b.samples) add(be, overshoot9(outs[k], ref, w, q.x, q.y, { half: BHALF, cx: q.cx, cy: q.cy }));
      }
      r[k] = { on, beside: be };
    }
    return r;
  };
  // Mean over images of the per-image means (and shares); sums for counts; max of maxima.
  const pool = (list, set) => {
    const ok = list.map((r) => r[set]).filter((t) => t.n > 0);
    const m = (f) => ok.reduce((s, t) => s + f(t), 0) / (ok.length || 1);
    return { mean: m((t) => t.sum / t.n), share: m((t) => t.hits / t.n), any: ok.reduce((s, t) => s + t.any, 0), n: ok.reduce((s, t) => s + t.n, 0),
      max: Math.max(0, ...ok.map((t) => t.max)), skipped: list.reduce((s, r) => s + (r[set].skipped || 0), 0) };
  };
  const row = (label, k, set, t) => `| ${label} | ${set} | ${k === 'fast' ? '`fast`' : 'Lanczos'} | ${t.mean.toFixed(3)} | ${(100 * t.share).toFixed(1)} % | ${t.any} of ${t.n} | ${t.max.toFixed(2)} | ${set === 'beside the edge' ? t.skipped : '-'} |`;
  const header = ['| data | samples | method | mean overshoot (levels) | share with overshoot > 4 | samples with any overshoot | largest overshoot (levels) | samples skipped |', '| --- | --- | --- | --- | --- | --- | --- | --- |'];

  // Positive control: 800x600 ideal step, 40 | 215, edge between x = 399 and 400, degraded as the photos are
  // (cubic halving, JPEG q85, decode), then the same two methods. Edge pixels only from rows 100-499.
  const CW = 800, CH = 600, CROP0 = 100, CROP_H = 400;
  const cref = Buffer.alloc(CW * CH * 3);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) cref.fill(x < CW / 2 ? 40 : 215, (y * CW + x) * 3, (y * CW + x) * 3 + 3);
  const cjpg = await sharp(cref, { raw: { width: CW, height: CH, channels: 3 } }).resize(CW / 2, CH / 2, { kernel: 'cubic', fit: 'fill' }).jpeg({ quality: 85 }).toBuffer();
  const cinp = await raw(sharp(cjpg));
  const [cfa, csa] = await _run(cinp.data, cinp.w * 3, 2.0);
  const clz = await sharp(cinp.data, { raw: { width: cinp.w, height: cinp.h, channels: 3 } }).resize(CW, CH, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
  if (csa / 3 !== CW || cfa.length / csa !== CH) throw new Error(`control output is ${csa / 3}x${cfa.length / csa}, expected ${CW}x${CH}`);
  const cl = luma(cref, CW * CH);
  const cpicks = pickEdges(cl.subarray(CROP0 * CW, (CROP0 + CROP_H) * CW), CW, CROP_H, N_EDGE); // indices in the cropped plane
  const couts = { fast: luma(Buffer.from(cfa.buffer, cfa.byteOffset, cfa.length), CW * CH), lanczos: luma(clz, CW * CH) };
  const control = scoreImage(cl, couts, CW, CH, cpicks, CROP0);
  const controlPool = (k, set) => pool([control[k]], set);

  const acc = { fast: [], lanczos: [] };
  const used = [];
  const short = [];
  for (const f of files) {
    const { gt, inp } = await degrade(path.join(dir, f));
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
    const r = scoreImage(ref, outs, w, h, edges);
    for (const k of METHODS) acc[k].push(r[k]);
  }
  console.log(`images used: ${used.length} of ${files.length}; edge pixels per image: min ${Math.min(...used.map((u) => u.n))}, max ${Math.max(...used.map((u) => u.n))}; skipped (no edge pixels or input under 400 px): ${short.length ? short.join(', ') : 'none'}`);
  console.log(header.join('\n'));
  for (const k of METHODS) for (const set of ['on', 'beside']) console.log(row('control', k, set === 'on' ? 'on the edge' : 'beside the edge', controlPool(k, set)));
  for (const k of METHODS) for (const set of ['on', 'beside']) console.log(row('real photos', k, set === 'on' ? 'on the edge' : 'beside the edge', pool(acc[k], set)));
  const ctl = controlPool('fast', 'beside').mean;
  console.log(ctl < 4
    ? `control: fast reads ${ctl.toFixed(2)} levels beside the edge, below 4: the measure cannot see the overshoot bench/edges.js shows (12 to 17); the real-photo result is INCONCLUSIVE`
    : `control: fast reads ${ctl.toFixed(2)} levels beside the edge, at least 4: the real-photo beside-edge numbers are a result`);
}

module.exports = { overshoot9, pickEdges, sobel, stepOf, besideSamples };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
