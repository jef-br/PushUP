'use strict';
// Usage: node bench/bench.js <dir-of-HR-images> [--sizes 400,600,800] [--limit N] [--save outDir]
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { _run } = require('../src');
const { psnr, ssim, gmsd } = require('./metrics');

const args = process.argv.slice(2);
const dir = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const sizes = opt('--sizes', '400,600,800').split(',').map(Number);
const limit = Number(opt('--limit', 1e9));
const saveDir = opt('--save', null);
const methods = (opt('--methods', 'lanczos,sr-full,sr-500,sr-250')).split(',');

async function rawOf(img) {
  const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

// Crop a packed RGB buffer to cw x ch (top-left).
function crop(buf, w, cw, ch) {
  if (cw === w && buf.length === cw * ch * 3) return buf;
  const out = Buffer.allocUnsafe(cw * ch * 3);
  for (let y = 0; y < ch; y++) buf.copy(out, y * cw * 3, y * w * 3, y * w * 3 + cw * 3);
  return out;
}

async function method(name, inp, w, h) {
  if (name === 'lanczos') {
    const L = Math.max(w, h), ow = Math.round((w * 1000) / L), oh = Math.round((h * 1000) / L);
    return sharp(inp, { raw: { width: w, height: h, channels: 3 } }).resize(ow, oh, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
  }
  // sr-full | sr-<maxInputPx> | sr:<path/to/model.onnx>, each with optional @<lanczosMix>
  const opts = {};
  // optional #<tile> suffix, then @<lanczosMix>
  const at = name.indexOf('@');
  if (at > 0) { opts.lanczosMix = Number(name.slice(at + 1)); name = name.slice(0, at); }
  const hash = name.indexOf('#');
  if (hash > 0) { opts.tile = Number(name.slice(hash + 1)); name = name.slice(0, hash); }
  if (name.startsWith('sr:')) opts.modelPath = path.resolve(name.slice(3));
  else if (name !== 'sr-full') opts.modelInputMax = Number(name.split('-')[1]);
  const [out] = await _run(inp, w * 3, 1000 / Math.max(w, h), opts);
  return out;
}

(async () => {
  const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort().slice(0, limit);
  const agg = {};
  for (const f of files) {
    const hr = sharp(path.join(dir, f));
    const meta = await hr.metadata();
    const L = Math.max(meta.width, meta.height);
    const gw = Math.round((meta.width * 1000) / L), gh = Math.round((meta.height * 1000) / L);
    const gt = await rawOf(sharp(path.join(dir, f)).resize(gw, gh, { kernel: 'lanczos3', fit: 'fill' }));
    for (const s of sizes) {
      const iw = Math.round((gw * s) / 1000), ih = Math.round((gh * s) / 1000);
      // Degrade like a typical marketplace upload: downscale, then JPEG q85.
      const jpg = await sharp(gt.data, { raw: { width: gw, height: gh, channels: 3 } })
        .resize(iw, ih, { kernel: 'cubic', fit: 'fill' }).jpeg({ quality: 85 }).toBuffer();
      const inp = await rawOf(sharp(jpg));
      for (const m of methods) {
        const t = performance.now();
        const raw = await method(m, inp.data, inp.w, inp.h);
        const ms = performance.now() - t;
        // Output size follows the input's aspect ratio, which can differ from
        // the reference by 1px after rounding: score the shared area.
        const L = Math.max(inp.w, inp.h), ow = Math.round((inp.w * 1000) / L), oh = Math.round((inp.h * 1000) / L);
        const cw = Math.min(ow, gw), ch = Math.min(oh, gh);
        const out = crop(raw, ow, cw, ch), ref = crop(gt.data, gw, cw, ch);
        const r = { psnr: psnr(out, ref, cw, ch), ssim: ssim(out, ref, cw, ch), gmsd: gmsd(out, ref, cw, ch), ms };
        const key = `${s}px ${m}`;
        (agg[key] ||= []).push(r);
        if (saveDir) {
          fs.mkdirSync(saveDir, { recursive: true });
          await sharp(out, { raw: { width: cw, height: ch, channels: 3 } }).png().toFile(path.join(saveDir, `${path.parse(f).name}_${s}_${path.basename(m).replace(/[^\w.@-]/g, '_')}.png`));
        }
      }
    }
    process.stderr.write('.');
  }
  process.stderr.write('\n');
  const mean = (a, k) => a.reduce((x, r) => x + r[k], 0) / a.length;
  console.log(`images: ${files.length}  (input = 1000px GT downscaled + JPEG q85)`);
  console.log('setting'.padEnd(18), 'PSNR↑'.padStart(7), 'SSIM↑'.padStart(7), 'GMSD↓'.padStart(7), 'ms'.padStart(7));
  for (const [k, a] of Object.entries(agg)) {
    console.log(k.padEnd(18), mean(a, 'psnr').toFixed(2).padStart(7), mean(a, 'ssim').toFixed(4).padStart(7), mean(a, 'gmsd').toFixed(4).padStart(7), mean(a, 'ms').toFixed(0).padStart(7));
  }
})();
