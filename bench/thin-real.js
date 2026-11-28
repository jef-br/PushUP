'use strict';
// Does `fast` undershoot thin dark features of real photos? (BL78, docs/EDGES.md "Thin real features (BL78)")
// Usage: node bench/thin-real.js [--dir bench/out/sub20] [--limit 20] [--size 400|600|800] [--mix 0,0.2,0.4]
//   Per image: reference = bench/groundtruth.js loadGt (1000 px longest side), input = inputAt(gt, size) (cubic, JPEG q85).
//   Two factors: 1.0 (reference = gt lanczos3-resized to the input size) and 1000/size (2.5 at 400 px; reference = gt).
//   Methods: the shipped `fast` pipeline (CPU) and plain sharp lanczos3 of the input to the same size.
//   --mix a,b,c (BL80): instead of the shipped `fast`, one `fast (mix N)` row per Lanczos share N (0 to 1) through the
//   `lanczosMix` option of `_run`; the control verdict then uses the 0.2 row (the shipped share) if listed, else the first.
//   Thin feature pixel (rule, on the luma of the reference): along the horizontal or the vertical axis, a run of k = 1..3
//   consecutive pixels that are all at least 40 levels darker than BOTH pixels 2 px beyond the run's ends (the pixel
//   between a run and each of those two is not compared with the side, so the edge's own blur does not count, but it must be at least 10 levels
//   lighter than the run's brightest pixel, so a wider bar is not cut into thin runs). Each pixel of such a run is a feature pixel;
//   its dark level = the darkest value of its run. Undershoot of an output at that pixel = dark level - output luma
//   (0 when not below). Reported: feature pixels, and the share of them with undershoot > 8, > 16, > 24 levels.
//   Positive control (first image of the run): a 1 px vertical line of 40 on a 215 patch (21 x 200 px) pasted into the
//   INPUT, as bench/edges.js builds its synthetic line; `fast` at the larger factor must read at least 15 levels below 40
//   (mean over the line's rows, in the darkest of the output pixels within 6 px of the line), else the result is INCONCLUSIVE.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { checkFlags } = require('./flags');
const { loadGt, inputAt } = require('./groundtruth');

const MIN_DARKER = 40, MAX_WIDTH = 3, THRESHOLDS = [8, 16, 24], CONTROL_MIN = 15, GAP_LIGHTER = 10;

// Luma plane (Float32Array) of a packed RGB buffer.
function lumaOf(rgb, n) {
  const l = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 3) l[i] = 0.299 * rgb[j] + 0.587 * rgb[j + 1] + 0.114 * rgb[j + 2];
  return l;
}

// Feature pixels of a w x h luma plane: Map index -> dark level (the lowest level of the run, the minimum when several runs claim a pixel).
function thinFeatures(ref, w, h) {
  const found = new Map();
  const mark = (idx, level) => { const old = found.get(idx); if (old === undefined || level < old) found.set(idx, level); };
  for (const horizontal of [true, false]) {
    const len = horizontal ? w : h, lines = horizontal ? h : w;
    const at = (line, i) => ref[horizontal ? line * w + i : i * w + line];
    for (let line = 0; line < lines; line++) {
      for (let s = 2; s < len - 2; s++) {
        for (let k = 1; k <= MAX_WIDTH; k++) {
          const e = s + k - 1;
          if (e + 2 >= len) break;
          const side = Math.min(at(line, s - 2), at(line, e + 2));
          let hi = -Infinity, lo = Infinity;
          for (let i = s; i <= e; i++) { const v = at(line, i); if (v > hi) hi = v; if (v < lo) lo = v; }
          if (hi > side - MIN_DARKER) continue;
          if (at(line, s - 1) < hi + GAP_LIGHTER || at(line, e + 1) < hi + GAP_LIGHTER) continue; // the pixel next to the run must already be lighter: a wider bar is not a thin line
          for (let i = s; i <= e; i++) mark(horizontal ? line * w + i : i * w + line, lo);
        }
      }
    }
  }
  return found;
}

// Counts of feature pixels and of those whose output lies below the dark level by more than each threshold.
function score(features, out) {
  const r = { n: 0, over: THRESHOLDS.map(() => 0), max: 0 };
  for (const [idx, level] of features) {
    const u = Math.max(0, level - out[idx]);
    r.n++;
    THRESHOLDS.forEach((t, i) => { if (u > t) r.over[i]++; });
    if (u > r.max) r.max = u;
  }
  return r;
}

// Top-left w x h part of a packed RGB buffer of width sw, as a luma plane.
function clipLuma(rgb, sw, w, h) {
  const b = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) rgb.copy(b, y * w * 3, y * sw * 3, (y * sw + w) * 3);
  return lumaOf(b, w * h);
}

// Control line: a 1 px vertical line of 40 on a 215 patch of 21 columns x 200 rows pasted into an RGB input (copy returned).
function pasteLine(inp) {
  const data = Buffer.from(inp.data);
  const cx = Math.floor(inp.w / 2), y0 = Math.max(0, Math.floor((inp.h - 200) / 2)), y1 = Math.min(inp.h, y0 + 200);
  for (let y = y0; y < y1; y++) for (let x = cx - 10; x <= cx + 10; x++) data.fill(x === cx ? 40 : 215, (y * inp.w + x) * 3, (y * inp.w + x) * 3 + 3);
  return { data, w: inp.w, h: inp.h, cx, y0, y1 };
}

function main() {
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
  const flagError = checkFlags(process.argv.slice(2), { values: ['--dir', '--limit', '--size', '--mix'] });
  if (flagError) { console.error(flagError); process.exit(1); }
  for (const f of ['--dir', '--limit', '--size', '--mix']) { const i = process.argv.indexOf(f); if (i > 0 && i === process.argv.length - 1) { console.error(`${f} needs a value`); process.exit(1); } }
  const limit = Number(arg('limit', '20'));
  if (!Number.isInteger(limit) || limit < 1) { console.error('--limit must be a positive integer'); process.exit(1); }
  const size = Number(arg('size', '400'));
  if (![400, 600, 800].includes(size)) { console.error('--size must be 400, 600 or 800'); process.exit(1); }
  const mixArg = arg('mix', null);
  const mixes = mixArg === null ? null : String(mixArg).split(',').map((v) => (/^\d*\.?\d+$/.test(v.trim()) ? Number(v) : NaN));
  if (mixes && (mixes.some((m) => !(m >= 0 && m <= 1)) || new Set(mixes).size !== mixes.length)) { console.error('--mix must be a comma list of different numbers from 0 to 1'); process.exit(1); }
  const dir = path.resolve(arg('dir', path.join(__dirname, 'out', 'sub20')));
  if (!fs.existsSync(dir)) { console.error(`${dir} does not exist; run bash bench/fetch_testset.sh`); process.exit(1); }
  if (!fs.statSync(dir).isDirectory()) { console.error(`${dir} is not a directory`); process.exit(1); }
  const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort().slice(0, limit);
  if (!files.length) { console.error(`no images in ${dir}`); process.exit(1); }
  return run(dir, files, size, mixes).catch((e) => { console.error(e); process.exit(1); });
}

async function run(dir, files, size, mixes) {
  process.env.PUSHUP_QUALITY = 'fast';
  process.env.PUSHUP_DEVICE = 'cpu';
  const { _run } = require('../src/index.js');
  const big = 1000 / size;
  const factors = [1.0, big];
  // The `fast` variants: the shipped pipeline, or one per Lanczos share of --mix.
  const VARIANTS = mixes ? mixes.map((m) => ({ key: `fast${m}`, label: `\`fast\` (mix ${m})`, opts: { lanczosMix: m } })) : [{ key: 'fast', label: '`fast`', opts: undefined }];
  const METHODS = [...VARIANTS.map((v) => v.key), 'lanczos'];
  const labelOf = (k) => (k === 'lanczos' ? 'Lanczos' : VARIANTS.find((v) => v.key === k).label);
  const ctlKey = (VARIANTS.find((v) => v.opts && v.opts.lanczosMix === 0.2) || VARIANTS[0]).key;

  // Both outputs of one input at one factor, as luma planes clipped to w x h, plus their size.
  const outputs = async (inp, factor) => {
    const fas = {};
    let ow, oh;
    for (const v of VARIANTS) {
      const [fa, sa] = v.opts ? await _run(inp.data, inp.w * 3, factor, v.opts) : await _run(inp.data, inp.w * 3, factor);
      ow = sa / 3; oh = fa.length / sa;
      fas[v.key] = Buffer.from(fa.buffer, fa.byteOffset, fa.length);
    }
    const lz = await sharp(inp.data, { raw: { width: inp.w, height: inp.h, channels: 3 } }).resize(ow, oh, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
    return { ow, oh, planes: { ...fas, lanczos: lz } };
  };

  const acc = {};
  for (const f of factors) for (const m of METHODS) acc[`${f}|${m}`] = { n: 0, over: THRESHOLDS.map(() => 0), max: 0 };
  let control = null;
  for (const file of files) {
    const gt = await loadGt(path.join(dir, file));
    const inp = await inputAt(gt, size);
    for (const factor of factors) {
      const o = await outputs(inp, factor);
      // Reference at the output size: gt itself for the large factor, gt resized (lanczos3) to the input size for 1.0.
      const refRgb = factor === 1.0
        ? await sharp(gt.data, { raw: { width: gt.w, height: gt.h, channels: 3 } }).resize(inp.w, inp.h, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer()
        : gt.data;
      const rw = factor === 1.0 ? inp.w : gt.w, rh = factor === 1.0 ? inp.h : gt.h;
      const w = Math.min(o.ow, rw), h = Math.min(o.oh, rh); // 1 px differences: the area both share, top-left aligned
      const ref = clipLuma(refRgb, rw, w, h);
      const features = thinFeatures(ref, w, h);
      for (const m of METHODS) {
        const rgb = o.planes[m];
        const s = score(features, clipLuma(rgb, o.ow, w, h));
        const a = acc[`${factor}|${m}`];
        a.n += s.n; s.over.forEach((c, i) => { a.over[i] += c; }); a.max = Math.max(a.max, s.max);
      }
    }
    if (!control) {
      const p = pasteLine(inp);
      control = {};
      for (const factor of factors) {
        const o = await outputs(p, factor);
        const c = {};
        for (const m of METHODS) {
          const rgb = o.planes[m];
          const lum = lumaOf(rgb, o.ow * o.oh);
          const lx = (p.cx + 0.5) * (o.ow / p.w), y0 = Math.round(p.y0 * o.oh / p.h) + 40, y1 = Math.round(p.y1 * o.oh / p.h) - 40;
          let sum = 0, max = 0, rows = 0;
          for (let y = y0; y < y1; y++) {
            let low = Infinity;
            for (let x = Math.floor(lx - 6); x <= Math.ceil(lx + 6); x++) low = Math.min(low, lum[y * o.ow + x]);
            const u = Math.max(0, 40 - low);
            sum += u; if (u > max) max = u; rows++;
          }
          c[m] = { mean: sum / rows, max };
        }
        control[factor] = c;
      }
    }
  }

  const label = (f) => (f === 1.0 ? '1.0' : String(Number(f.toFixed(2))));
  console.log(`images: ${files.length}; input ${size} px; rule: run of 1..${MAX_WIDTH} px at least ${MIN_DARKER} levels darker than both pixels 2 px beyond it (horizontal or vertical); dark level = darkest pixel of the run`);
  console.log('| factor | method | feature pixels | undershoot > 8 | > 16 | > 24 | largest (levels) |');
  console.log('| --- | --- | --- | --- | --- | --- | --- |');
  for (const f of factors) for (const m of METHODS) {
    const a = acc[`${f}|${m}`];
    const pct = (c) => (a.n ? `${(100 * c / a.n).toFixed(2)} % (${c})` : '-');
    console.log(`| ${label(f)} | ${labelOf(m)} | ${a.n} | ${pct(a.over[0])} | ${pct(a.over[1])} | ${pct(a.over[2])} | ${a.max.toFixed(1)} |`);
  }
  console.log(`control (1 px line of 40 on 215 pasted into ${files[0]}): mean / max levels below 40 within 6 output px of the line`);
  for (const f of factors) for (const m of METHODS) console.log(`  factor ${label(f)} ${m === 'lanczos' ? m : labelOf(m).replace(/`/g, '')}: ${control[f][m].mean.toFixed(1)} / ${control[f][m].max.toFixed(1)}`);
  const c = control[big][ctlKey].mean;
  const who = ctlKey === 'fast' ? 'fast' : labelOf(ctlKey).replace(/`/g, '');
  console.log(c >= CONTROL_MIN
    ? `control: ${who} reads ${c.toFixed(1)} levels below the dark level at factor ${label(big)}, at least ${CONTROL_MIN}: the real-photo numbers are a result`
    : `control: ${who} reads ${c.toFixed(1)} levels below the dark level at factor ${label(big)}, under ${CONTROL_MIN}: the measure cannot see the undershoot of a 1 px line, so the real-photo result is INCONCLUSIVE`);
}

module.exports = { lumaOf, thinFeatures, score, pasteLine, clipLuma };
if (require.main === module) main();
