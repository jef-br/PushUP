'use strict';
// Per-stage latency profile of the upscale pipeline.
// Usage: node bench/profile.js [--runs 5] [--sizes 400,600,800] [--factor 1.5]
// Uses synthetic 4:3 images (smooth gradient + noise): latency depends on size only.
const os = require('node:os');
const path = require('node:path');
const ort = require('onnxruntime-node');
const sharp = require('sharp');
const { upscale, _copyFromTensor } = require('../src/index.js');

const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i > 0 ? process.argv[i + 1] : d;
};
const runs = Number(arg('runs', 5));
const sizes = arg('sizes', '400,600,800').split(',').map(Number);
const factor = Number(arg('factor', 1.5));

const now = () => Number(process.hrtime.bigint()) / 1e6;
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

function synth(longest) {
  const w = longest, h = Math.round(longest * 0.75);
  const b = Buffer.alloc(w * h * 3);
  let s = 12345;
  for (let i = 0; i < b.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    b[i] = ((i / 3) % w) * 255 / w + (s >> 16) % 16;
  }
  return { b, w, h };
}

// NOTE: stage code below is a copy of the helpers in src/index.js (not exported);
// update it if the pipeline changes, or timings will silently drift.
async function stages(rgb, w, h, outW, outH) {
  const t = {};
  let t0 = now();
  const plane = w * h, data = new Float32Array(3 * plane);
  for (let i = 0, j = 0; i < plane; i++, j += 3) {
    data[i] = rgb[j] / 255; data[plane + i] = rgb[j + 1] / 255; data[2 * plane + i] = rgb[j + 2] / 255;
  }
  const tensor = new ort.Tensor('float32', data, [1, 3, h, w]);
  t.toTensor = now() - t0;
  t0 = now();
  const res = await session.run({ [session.inputNames[0]]: tensor });
  t.inference = now() - t0;
  const out = res[session.outputNames[0]];
  t0 = now();
  const ow = out.dims[3], oh = out.dims[2], buf = Buffer.allocUnsafe(ow * oh * 3);
  _copyFromTensor(out, 0, 0, ow, oh, buf, ow, 0, 0); // the function src/index.js ships
  t.fromTensor = now() - t0;
  t0 = now();
  const rs = (d, sw, sh) => sharp(d, { raw: { width: sw, height: sh, channels: 3 } })
    .resize(outW, outH, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
  const o = await rs(buf, out.dims[3], out.dims[2]);
  t.resizeDown = now() - t0;
  t0 = now();
  const plain = await rs(rgb, w, h);
  for (let i = 0; i < o.length; i++) o[i] = Math.round(0.8 * o[i] + 0.2 * plain[i]);
  t.lanczosMix = now() - t0;
  return t;
}

let session;
(async () => {
  session = await ort.InferenceSession.create(
    path.join(__dirname, '..', 'models', '4xLSDIRCompactC3.onnx'),
    { graphOptimizationLevel: 'all', intraOpNumThreads: os.availableParallelism(), executionMode: 'sequential' });
  console.log(`cpus=${os.availableParallelism()} node=${process.version} factor=${factor} runs=${runs} (median ms)`);
  console.log('size      total(upscale)  toTensor  inference  fromTensor  resizeDown  lanczosMix');
  for (const L of sizes) {
    const { b, w, h } = synth(L);
    await upscale(b, w * 3, factor); // warm-up (session load, JIT)
    const tot = [];
    for (let r = 0; r < runs; r++) { const t0 = now(); await upscale(b, w * 3, factor); tot.push(now() - t0); }
    const target = Math.min(Math.round(L * factor), 1000);
    const outW = target, outH = Math.round(h * target / w);
    const st = [];
    for (let r = 0; r < runs; r++) st.push(await stages(b, w, h, outW, outH));
    const m = (k) => median(st.map((s) => s[k])).toFixed(0).padStart(8);
    console.log(`${(w + 'x' + h).padEnd(9)} ${median(tot).toFixed(0).padStart(10)}     ${m('toTensor')} ${m('inference')}  ${m('fromTensor')}  ${m('resizeDown')}  ${m('lanczosMix')}`);
  }
})();
