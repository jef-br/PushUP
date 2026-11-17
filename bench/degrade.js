'use strict';
// Library, no command line: the degraded-input construction shared by bench/pad.js and bench/edges-real.js (CV4).
//   degrade(file) -> { gt, inp }, each { data, w, h } (packed 8-bit RGB):
//   gt  = the source resized so its longest side is 800 px (lanczos3, fit 'fill');
//   inp = gt downscaled by 2 with the cubic kernel, JPEG q85, decoded (as bench/bench.js degrades).
// bench/bench.js keeps its own copy by decision (it has no exports).
const sharp = require('sharp');

const raw = async (img) => { const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };

async function degrade(file) {
  const meta = await sharp(file).metadata();
  const L = Math.max(meta.width, meta.height);
  const gw = Math.round((meta.width * 800) / L), gh = Math.round((meta.height * 800) / L);
  const gt = await raw(sharp(file).resize(gw, gh, { kernel: 'lanczos3', fit: 'fill' }));
  const iw = Math.round(gw / 2), ih = Math.round(gh / 2);
  const jpg = await sharp(gt.data, { raw: { width: gw, height: gh, channels: 3 } }).resize(iw, ih, { kernel: 'cubic', fit: 'fill' }).jpeg({ quality: 85 }).toBuffer();
  const inp = await raw(sharp(jpg));
  return { gt, inp };
}

module.exports = { raw, degrade };
