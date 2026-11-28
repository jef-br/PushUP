'use strict';
// Does mirror-padding the model input remove the border band on real images? (BK11)
// Usage: node bench/pad.js [--dir bench/out/sub20] [--limit 20]
//   Per image: reference = the source resized to 800 px on its longest side (lanczos3), input = that reference
//   downscaled to 400 px (cubic), JPEG q85, decoded (as bench/bench.js degrades). Two runs of the shipped `fast`
//   pipeline at factor 2.0: as is (400 px in, 800 px out), and with the input mirror-padded by 16 px on every
//   side (432 px in, 864 px out, under the 1000 px cap), then cropped by 32 px on every side: 2 * (n + 32) - 64
//   = 2n, so the crop equals the as-is output for any aspect ratio. Scores: whole image, interior (32 px left
//   out on every side), border band (four 32 px strips; PSNR from the pooled squared error). Results: docs/PAD.md.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { ssim, gmsd } = require('./metrics.js');

process.env.PUSHUP_QUALITY = 'fast';
process.env.PUSHUP_DEVICE = 'cpu';
const { _run } = require('../src/index.js');
const { checkFlags } = require('./flags');
const { degrade } = require('./degrade');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const flagError = checkFlags(process.argv.slice(2), { values: ['--dir', '--limit'] });
if (flagError) { console.error(flagError); process.exit(1); }
for (const f of ['--dir', '--limit']) { if (process.argv.indexOf(f) === process.argv.length - 1) { console.error(`${f} needs a value`); process.exit(1); } } // a value flag with nothing after it (checkFlags leaves that to the script)
const dir = path.resolve(arg('dir', path.join(__dirname, 'out', 'sub20')));
const limit = Number(arg('limit', '20'));
if (!Number.isInteger(limit) || limit < 1) { console.error('--limit must be a positive integer'); process.exit(1); }
if (!fs.existsSync(dir)) { console.error(`${dir} does not exist; run bash bench/fetch_testset.sh`); process.exit(1); }
if (!fs.statSync(dir).isDirectory()) { console.error(`${dir} is not a directory`); process.exit(1); }

const FACTOR = 2.0, PAD = 16, CUT = 2 * PAD; // pad in input px, border width in output px

function crop(buf, w, x0, y0, cw, ch) {
  const out = Buffer.alloc(cw * ch * 3);
  for (let y = 0; y < ch; y++) buf.copy(out, y * cw * 3, ((y0 + y) * w + x0) * 3, ((y0 + y) * w + x0 + cw) * 3);
  return out;
}

function lumaSe(a, b, n) { // sum of squared luma differences, as bench/metrics.js psnr computes them
  let se = 0;
  for (let i = 0, j = 0; i < n; i++, j += 3) {
    const d = (0.299 * (a[j] - b[j])) + (0.587 * (a[j + 1] - b[j + 1])) + (0.114 * (a[j + 2] - b[j + 2]));
    se += d * d;
  }
  return se;
}
const psnrOf = (se, n) => Math.min(100, 10 * Math.log10((255 * 255) / Math.max(se / n, 1e-10)));

// Scores of one output against the reference (both w x h): whole, interior, border band.
function score(out, ref, w, h) {
  const whole = { psnr: psnrOf(lumaSe(out, ref, w * h), w * h), ssim: ssim(out, ref, w, h), gmsd: gmsd(out, ref, w, h) };
  const iw = w - 2 * CUT, ih = h - 2 * CUT;
  const io = crop(out, w, CUT, CUT, iw, ih), ir = crop(ref, w, CUT, CUT, iw, ih);
  const interior = { psnr: psnrOf(lumaSe(io, ir, iw * ih), iw * ih), ssim: ssim(io, ir, iw, ih), gmsd: gmsd(io, ir, iw, ih) };
  const strips = [[0, 0, w, CUT], [0, h - CUT, w, CUT], [0, CUT, CUT, h - 2 * CUT], [w - CUT, CUT, CUT, h - 2 * CUT]];
  let se = 0, n = 0, s = 0, g = 0;
  for (const [x, y, cw, ch] of strips) {
    const so = crop(out, w, x, y, cw, ch), sr = crop(ref, w, x, y, cw, ch), m = cw * ch;
    se += lumaSe(so, sr, m); n += m; s += ssim(so, sr, cw, ch) * m; g += gmsd(so, sr, cw, ch) * m;
  }
  return { whole, interior, border: { psnr: psnrOf(se, n), ssim: s / n, gmsd: g / n } };
}

async function variants(inp) {
  const t0 = performance.now();
  const [a, sa] = await _run(inp.data, inp.w * 3, FACTOR);
  const t1 = performance.now();
  const padded = await sharp(inp.data, { raw: { width: inp.w, height: inp.h, channels: 3 } })
    .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, extendWith: 'mirror' }).raw().toBuffer({ resolveWithObject: true });
  const [p, sp] = await _run(padded.data, padded.info.width * 3, FACTOR);
  const pw = sp / 3, ph = p.length / sp;
  const c = crop(Buffer.from(p.buffer, p.byteOffset, p.length), pw, CUT, CUT, pw - 2 * CUT, ph - 2 * CUT);
  const t2 = performance.now();
  return { asis: { data: Buffer.from(a.buffer, a.byteOffset, a.length), w: sa / 3, h: a.length / sa }, padded: { data: c, w: pw - 2 * CUT, h: ph - 2 * CUT }, msAsis: t1 - t0, msPadded: t2 - t1 };
}

(async () => {
  const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort().slice(0, limit);
  if (!files.length) { console.error(`no images in ${dir}`); process.exit(1); }
  const acc = { asis: [], padded: [] };
  const skipped = [];
  let small = 0, first = null;
  for (const f of files) {
    const meta = await sharp(path.join(dir, f)).metadata();
    const L = Math.max(meta.width, meta.height);
    if (L < 800) small++;
    const { gt, inp } = await degrade(path.join(dir, f));
    if (Math.max(inp.w, inp.h) < 400) { skipped.push(`${f} (input ${inp.w}x${inp.h})`); continue; }
    const v = await variants(inp);
    if (!first) first = inp;
    if (v.asis.w !== v.padded.w || v.asis.h !== v.padded.h) throw new Error(`${f}: cropped padded output ${v.padded.w}x${v.padded.h} differs from as-is ${v.asis.w}x${v.asis.h}`);
    const w = Math.min(v.asis.w, gt.w), h = Math.min(v.asis.h, gt.h); // 1 px differences: clip to the shared area
    if (Math.min(w, h) < 100) { skipped.push(`${f} (output ${w}x${h})`); continue; }
    const ref = crop(gt.data, gt.w, 0, 0, w, h);
    for (const k of ['asis', 'padded']) {
      const o = k === 'asis' ? v.asis : v.padded;
      acc[k].push(score(crop(o.data, o.w, 0, 0, w, h), ref, w, h));
    }
  }
  const mean = (k, region, m) => acc[k].reduce((s, r) => s + r[region][m], 0) / acc[k].length;
  const N = acc.asis.length;
  console.log(`images scored: ${N} of ${files.length}; sources under 800 px on the longest side: ${small}; skipped: ${skipped.length ? skipped.join(', ') : 'none'}`);
  console.log('| variant | whole PSNR | whole SSIM | whole GMSD | interior PSNR | interior SSIM | interior GMSD | border PSNR | border SSIM | border GMSD |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  const rows = {};
  for (const k of ['asis', 'padded']) {
    rows[k] = ['whole', 'interior', 'border'].flatMap((r) => ['psnr', 'ssim', 'gmsd'].map((m) => mean(k, r, m)));
    console.log(`| ${k === 'asis' ? 'as is' : 'padded 16 px'} | ${rows[k].map((v, i) => v.toFixed(i % 3 === 0 ? 3 : 5)).join(' | ')} |`);
  }
  console.log(`| padded - as is | ${rows.padded.map((v, i) => (v - rows.asis[i]).toFixed(i % 3 === 0 ? 3 : 5)).join(' | ')} |`);
  // Gate (playbook section 2) on the whole image, and the border-band rule of BK11.
  const d = rows.padded.map((v, i) => v - rows.asis[i]);
  const gate = d[0] >= -0.02 && d[1] >= -0.001 && d[2] <= 0.001;
  const improve = [d[6] > 0, d[7] > 0, d[8] < 0].filter(Boolean).length;
  const worse = [d[6] < 0, d[7] < 0, d[8] > 0].filter(Boolean).length;
  console.log(`whole-image gate (PSNR drop <= 0.02 dB, SSIM drop <= 0.001, GMSD rise <= 0.001): ${gate ? 'PASS' : 'FAIL'}`);
  console.log(`border band: better on ${improve} of 3 metrics, worse on ${worse}`);
  console.log(`rule: ${gate && improve >= 2 && worse === 0 ? 'propose to the owner' : 'drop'}`);
  // Runtime: median of 5 runs per variant on the first image, after a warm-up.
  await variants(first);
  const a = [], p = [];
  for (let i = 0; i < 5; i++) { const v = await variants(first); a.push(v.msAsis); p.push(v.msPadded); }
  const med = (x) => [...x].sort((u, v) => u - v)[2];
  console.log(`runtime at 400 px in (median of 5): as is ${med(a).toFixed(0)} ms, padded ${med(p).toFixed(0)} ms (ratio ${(med(p) / med(a)).toFixed(2)}, includes pad and crop)`);
})().catch((e) => { console.error(e); process.exit(1); });
