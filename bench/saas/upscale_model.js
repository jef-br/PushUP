'use strict';
// Upscale one image to a 1000 px longest side with one ONNX model (CPU, tiled), no Lanczos mix.
// Usage: node bench/saas/upscale_model.js <image> <out.png> <model.onnx> [tile=192]
// One model per process so the caller can measure wall time and peak memory (/usr/bin/time -v).
const sharp = require('sharp');
const { _run } = require('../../src');
(async () => {
  const [inp, out, modelPath, tileArg] = process.argv.slice(2);
  const tile = tileArg === undefined ? 192 : Number(tileArg);
  const { data, info } = await sharp(inp).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const f = 1000 / Math.max(info.width, info.height);
  const t = performance.now();
  const [o, stride] = await _run(data, info.width * 3, f, { modelPath, tile: tile || Infinity, lanczosMix: 0 });
  const w = stride / 3, h = o.length / stride;
  await sharp(o, { raw: { width: w, height: h, channels: 3 } }).png().toFile(out);
  console.log(`${w}x${h} ${((performance.now() - t) / 1000).toFixed(1)} s, peak RSS ${Math.round(process.resourceUsage().maxRSS / 1024)} MB`);
})();
