'use strict';
// Colour shift of the shipped `fast` pipeline on real photos, against plain Lanczos (BL13; docs/COLOR.md "Real photos").
// Usage: node bench/colors-real.js [--dir bench/out/sub20] [--limit 20] [--size 400] [--json]
//   Per image (as bench/bench.js degrades at `--sizes 400`): reference = the source resized to 1000 px on its longest
//   side (lanczos3), input = that reference downscaled to --size px (cubic), JPEG q85, decoded. Outputs: the shipped
//   `fast` pipeline at factor 1000 / longest side (1000 px out) and plain sharp lanczos3 of the input to the same size.
//   Per method and channel (R, G, B), over (a) every pixel and (b) the pixels more than 16 px from every border:
//   bias = mean(out - ref), mean |out - ref|, and the 99th percentile of |out - ref| (from a 256-bin histogram of
//   all pixels of all images). Then the three images with the largest |bias| of `fast` on any channel.
//   Output sizes can differ from the reference by 1 px after rounding: the shared top-left area is scored.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { checkFlags } = require('./flags');
const { p99 } = require('./stats');

const EDGE = 16, CH = ['R', 'G', 'B'];

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const fail = (msg, code = 1) => { console.error(msg); process.exit(code); };
const flagError = checkFlags(args, { values: ['--dir', '--limit', '--size'], switches: ['--json'] });
if (flagError) fail(flagError);
const dir = path.resolve(String(opt('--dir', path.join(__dirname, 'out', 'sub20'))));
const limitArg = String(opt('--limit', '1000000000'));
const sizeArg = String(opt('--size', '400'));
if (!/^\d+$/.test(limitArg) || Number(limitArg) < 1) fail('--limit must be a positive integer');
if (!/^\d+$/.test(sizeArg) || Number(sizeArg) < 400 || Number(sizeArg) > 800) fail('--size must be an integer from 400 to 800');
const limit = Number(limitArg), size = Number(sizeArg);
let stat = null;
try { stat = fs.statSync(dir); } catch { /* reported below */ }
if (!stat) fail(`${dir} does not exist; run bash bench/fetch_testset.sh`);
if (!stat.isDirectory()) fail(`${dir} is not a directory`);
const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort().slice(0, limit);
if (files.length === 0) fail(`no images in ${dir}`);

process.env.PUSHUP_QUALITY = 'fast';
process.env.PUSHUP_DEVICE = 'cpu';
const { upscale } = require('../src/index.js');

const raw = async (img) => { const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };

// Accumulator per method, region (all / inner) and channel.
const acc = () => ({ n: 0, sum: 0, abs: 0, hist: new Float64Array(256) });
const newAcc = () => ({ all: [acc(), acc(), acc()], inner: [acc(), acc(), acc()] });

function score(a, out, ref, w, h, perImage) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inner = x >= EDGE && y >= EDGE && x < w - EDGE && y < h - EDGE;
    for (let c = 0; c < 3; c++) {
      const k = (y * w + x) * 3 + c, d = out[k] - ref[k], ad = Math.abs(d);
      for (const t of inner ? [a.all[c], a.inner[c]] : [a.all[c]]) { t.n++; t.sum += d; t.abs += ad; t.hist[ad]++; }
      if (perImage) { perImage.sum[c] += d; perImage.n++; }
    }
  }
}

const summary = (t) => ({ bias: t.sum / t.n, mean_abs: t.abs / t.n, p99_abs: p99(t.hist, t.n) });

(async () => {
  const res = { fast: newAcc(), lanczos: newAcc() };
  const perImg = [];
  for (const f of files) {
    const src = path.join(dir, f);
    const meta = await sharp(src).metadata();
    const L = Math.max(meta.width, meta.height);
    const gw = Math.round((meta.width * 1000) / L), gh = Math.round((meta.height * 1000) / L);
    const gt = await raw(sharp(src).resize(gw, gh, { kernel: 'lanczos3', fit: 'fill' }));
    const iw = Math.round((gw * size) / 1000), ih = Math.round((gh * size) / 1000);
    const jpg = await sharp(gt.data, { raw: { width: gw, height: gh, channels: 3 } }).resize(iw, ih, { kernel: 'cubic', fit: 'fill' }).jpeg({ quality: 85 }).toBuffer();
    const inp = await raw(sharp(jpg));
    const IL = Math.max(inp.w, inp.h), ow = Math.round((inp.w * 1000) / IL), oh = Math.round((inp.h * 1000) / IL);
    const cw = Math.min(ow, gw), ch = Math.min(oh, gh);
    const crop = (buf, w) => { if (w === cw && buf.length === cw * ch * 3) return buf; const o = Buffer.allocUnsafe(cw * ch * 3); for (let y = 0; y < ch; y++) buf.copy(o, y * cw * 3, y * w * 3, y * w * 3 + cw * 3); return o; };
    const ref = crop(gt.data, gw);
    const [fastOut] = await upscale(inp.data, inp.w * 3, 1000 / IL);
    const lanOut = await sharp(inp.data, { raw: { width: inp.w, height: inp.h, channels: 3 } }).resize(ow, oh, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
    const per = { file: f, sum: [0, 0, 0], n: 0 };
    score(res.fast, crop(fastOut, ow), ref, cw, ch, per);
    score(res.lanczos, crop(lanOut, ow), ref, cw, ch, null);
    per.bias = per.sum.map((s) => s / (per.n / 3));
    perImg.push(per);
    process.stderr.write('.');
  }
  process.stderr.write('\n');
  const out = { images: files.length, size, methods: {}, largest_fast_bias: [] };
  for (const m of ['fast', 'lanczos']) {
    out.methods[m] = {};
    for (const region of ['all', 'inner']) out.methods[m][region] = CH.map((name, c) => ({ channel: name, ...summary(res[m][region][c]) }));
  }
  out.largest_fast_bias = perImg
    .map((p) => ({ file: p.file, bias: p.bias, max_abs_bias: Math.max(...p.bias.map(Math.abs)) }))
    .sort((a, b) => b.max_abs_bias - a.max_abs_bias || a.file.localeCompare(b.file)).slice(0, 3);
  if (args.includes('--json')) { console.log(JSON.stringify(out)); return; }
  const f2 = (v) => v.toFixed(2);
  console.log(`images: ${out.images}; input ${size} px, output 1000 px; reference = source at 1000 px (lanczos3)`);
  console.log('| region | method | channel | bias (mean out - ref) | mean abs diff | 99th percentile abs diff |');
  console.log('|---|---|---|---|---|---|');
  for (const region of ['all', 'inner']) for (const m of ['fast', 'lanczos']) for (const r of out.methods[m][region]) {
    console.log(`| ${region === 'all' ? 'whole image' : 'more than 16 px from the border'} | ${m === 'fast' ? '`fast`' : 'Lanczos'} | ${r.channel} | ${f2(r.bias)} | ${f2(r.mean_abs)} | ${r.p99_abs} |`);
  }
  console.log('largest `fast` bias (R/G/B, bytes): ' + out.largest_fast_bias.map((x) => `${x.file} ${x.bias.map(f2).join('/')}`).join('; '));
})();
