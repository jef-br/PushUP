'use strict';
// Library, no command line: the reference and degraded-input construction of bench/bench.js, shared with bench/grey-step.js (BL51).
//   loadGt(file) -> { data, w, h }: the source resized so its longest side is 1000 px (lanczos3, fit 'fill'), packed 8-bit RGB;
//   inputAt(gt, size, quality = 85) -> { data, w, h }: gt downscaled to `size` px on its longest side (cubic), JPEG at `quality` (BL57; default 85), decoded (a marketplace upload);
//   crop(buf, w, cw, ch): the top-left cw x ch part of a packed RGB buffer of width w.
// bench/bench.js output is unchanged by moving this code here (checked by a before/after comparison of `--json` rows, and the helpers by test/bench-run-grey-step.test.js).
const sharp = require('sharp');

async function raw(img) {
  const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

async function loadGt(file) {
  const meta = await sharp(file).metadata();
  const L = Math.max(meta.width, meta.height);
  const gw = Math.round((meta.width * 1000) / L), gh = Math.round((meta.height * 1000) / L);
  return raw(sharp(file).resize(gw, gh, { kernel: 'lanczos3', fit: 'fill' }));
}

async function inputAt(gt, size, quality = 85) {
  const iw = Math.round((gt.w * size) / 1000), ih = Math.round((gt.h * size) / 1000);
  const jpg = await sharp(gt.data, { raw: { width: gt.w, height: gt.h, channels: 3 } })
    .resize(iw, ih, { kernel: 'cubic', fit: 'fill' }).jpeg({ quality }).toBuffer();
  return raw(sharp(jpg));
}

// Crop a packed RGB buffer to cw x ch (top-left).
function crop(buf, w, cw, ch) {
  if (cw === w && buf.length === cw * ch * 3) return buf;
  const out = Buffer.allocUnsafe(cw * ch * 3);
  for (let y = 0; y < ch; y++) buf.copy(out, y * cw * 3, y * w * 3, y * w * 3 + cw * 3);
  return out;
}

module.exports = { raw, loadGt, inputAt, crop };
