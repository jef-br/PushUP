'use strict';
// Does a factor-1 call remove JPEG blocking (BL42; docs/JPEG.md)? README "Usage" says it does.
// Usage: node bench/jpeg.js [--dir bench/out/set] [--limit 60]
//   Per image: reference = the set image resized to 1000 px on its longest side (lanczos3, as bench/bench.js builds
//   its references), then to 600 px (lanczos3). That 600 px image is encoded as JPEG at quality 50 and 75 and decoded
//   (the input). The shipped `fast` pipeline (CPU) runs on the decoded input at factor 1 (same size out). Per quality,
//   mean over the images of: PSNR (luma) against the 600 px reference for the decoded JPEG and for the `fast` output,
//   and a blockiness figure for the reference, the decoded JPEG and the output (blockiness() below). Prints markdown.
const fs = require('node:fs');
const path = require('node:path');

// Mean absolute luma step across 8-pixel block borders (column x or row y a multiple of 8, step to the previous
// pixel) divided by the mean absolute step inside blocks (all other positions), horizontal and vertical steps
// together. About 1 for an image without block structure; above 1 when the block borders show.
// Returns NaN when the image has no steps inside blocks (a flat image).
function blockiness(rgb, w, h) {
  const y = new Float64Array(w * h);
  for (let i = 0, j = 0; i < y.length; i++, j += 3) y[i] = 0.299 * rgb[j] + 0.587 * rgb[j + 1] + 0.114 * rgb[j + 2];
  let bSum = 0, bN = 0, iSum = 0, iN = 0;
  for (let r = 0; r < h; r++) for (let x = 0; x < w; x++) {
    const v = y[r * w + x];
    if (x > 0) { const d = Math.abs(v - y[r * w + x - 1]); if (x % 8 === 0) { bSum += d; bN++; } else { iSum += d; iN++; } }
    if (r > 0) { const d = Math.abs(v - y[(r - 1) * w + x]); if (r % 8 === 0) { bSum += d; bN++; } else { iSum += d; iN++; } }
  }
  if (iN === 0 || iSum === 0) return NaN;
  return (bSum / bN) / (iSum / iN);
}

const QUALITIES = [50, 75];

async function main(argv) {
  const sharp = require('sharp');
  const { checkFlags } = require('./flags');
  const { psnr } = require('./metrics');
  const fail = (msg) => { console.error(msg); process.exit(1); };
  const opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
  const flagError = checkFlags(argv, { values: ['--dir', '--limit'], switches: [] });
  if (flagError) fail(flagError);
  const dir = path.resolve(String(opt('--dir', path.join(__dirname, 'out', 'set'))));
  const limitArg = String(opt('--limit', '1000000000'));
  if (!/^\d+$/.test(limitArg) || Number(limitArg) < 1) fail('--limit must be a positive integer');
  let stat = null;
  try { stat = fs.statSync(dir); } catch { /* reported below */ }
  if (!stat) fail(`${dir} does not exist; run bash bench/fetch_testset.sh`);
  if (!stat.isDirectory()) fail(`${dir} is not a directory`);
  const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort().slice(0, Number(limitArg));
  if (files.length === 0) fail(`no images in ${dir}`);

  process.env.PUSHUP_QUALITY = 'fast';
  process.env.PUSHUP_DEVICE = 'cpu';
  const { upscale } = require('../src/index.js');
  const raw = async (img) => { const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };

  const acc = QUALITIES.map(() => ({ n: 0, pJpeg: 0, pOut: 0, bRef: 0, bJpeg: 0, bOut: 0, skipped: 0 }));
  for (const f of files) {
    const big = await sharp(path.join(dir, f)).removeAlpha()
      .resize(1000, 1000, { fit: 'inside', kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
    const ref = await raw(sharp(big.data, { raw: { width: big.info.width, height: big.info.height, channels: 3 } })
      .resize(600, 600, { fit: 'inside', kernel: 'lanczos3' }));
    for (let q = 0; q < QUALITIES.length; q++) {
      const jpg = await sharp(ref.data, { raw: { width: ref.w, height: ref.h, channels: 3 } }).jpeg({ quality: QUALITIES[q] }).toBuffer();
      const dec = await raw(sharp(jpg));
      const [out, stride] = await upscale(new Uint8Array(dec.data), dec.w * 3, 1);
      if (stride !== dec.w * 3 || out.length !== dec.data.length) fail(`${f}: factor 1 changed the size`);
      const bRef = blockiness(ref.data, ref.w, ref.h), bJpeg = blockiness(dec.data, dec.w, dec.h), bOut = blockiness(out, dec.w, dec.h);
      const a = acc[q];
      if (![bRef, bJpeg, bOut].every(Number.isFinite)) { a.skipped++; continue; } // a flat image has no blockiness
      a.n++;
      a.pJpeg += psnr(dec.data, ref.data, ref.w, ref.h);
      a.pOut += psnr(out, ref.data, ref.w, ref.h);
      a.bRef += bRef; a.bJpeg += bJpeg; a.bOut += bOut;
    }
  }
  console.log(`${files.length} images from ${path.basename(dir)}, 600 px, factor 1, fast mode on CPU. Means over the images that are not flat.\n`);
  console.log('| JPEG quality | images | PSNR decoded JPEG (dB) | PSNR `fast` output (dB) | blockiness reference | blockiness decoded JPEG | blockiness `fast` output | blockiness change |');
  console.log('|---|---|---|---|---|---|---|---|');
  QUALITIES.forEach((qual, q) => {
    const a = acc[q];
    if (a.n === 0) return console.log(`| ${qual} | 0 | n/a | n/a | n/a | n/a | n/a | n/a |`);
    const m = (v) => v / a.n;
    const change = (m(a.bOut) / m(a.bJpeg) - 1) * 100;
    console.log(`| ${qual} | ${a.n} | ${m(a.pJpeg).toFixed(2)} | ${m(a.pOut).toFixed(2)} | ${m(a.bRef).toFixed(3)} | ${m(a.bJpeg).toFixed(3)} | ${m(a.bOut).toFixed(3)} | ${change.toFixed(1)}% |`);
  });
}

if (require.main === module) main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
module.exports = { blockiness };
