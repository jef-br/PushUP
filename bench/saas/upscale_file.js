'use strict';
// Upscale one image file to a 1000 px longest side with PushUP fast and high (CPU) and with
// plain Lanczos, writing pushup_fast.png, pushup_high.png and lanczos.png to <outDir>.
// Usage: node bench/saas/upscale_file.js <image> <outDir>
const sharp = require('sharp');
const { _run, _reset } = require('../../src');
(async () => {
  const [inp, outDir] = process.argv.slice(2);
  const { data, info } = await sharp(inp).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const f = 1000 / Math.max(info.width, info.height);
  for (const q of ['fast', 'high']) {
    process.env.PUSHUP_QUALITY = q; process.env.PUSHUP_DEVICE = 'cpu'; _reset();
    const t = performance.now();
    const [out, stride] = await _run(data, info.width * 3, f);
    const w = stride / 3, h = out.length / stride;
    await sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toFile(`${outDir}/pushup_${q}.png`);
    console.log(q, w + 'x' + h, ((performance.now() - t) / 1000).toFixed(1) + ' s');
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).resize(Math.round(info.width * f), Math.round(info.height * f), { kernel: 'lanczos3' }).png().toFile(`${outDir}/lanczos.png`);
})();
