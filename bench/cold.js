'use strict';
// First-call (cold) vs warm latency of upscale(), each measurement in a fresh process
// (sessions are cached per model, so a second size in the same process would not be cold).
// Usage: node bench/cold.js [--sizes 400,800] [--modes fast,high] [--warm 3] [--factor 1.5]
//   Parent mode spawns one child per (mode, size); child mode: node bench/cold.js --child <mode> <size> <warm> <factor>
const { spawnSync } = require('node:child_process');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
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

if (process.argv[2] === '--child') {
  const [mode, size, warm, factor] = [process.argv[3], Number(process.argv[4]), Number(process.argv[5]), Number(process.argv[6])];
  process.env.PUSHUP_QUALITY = mode;
  process.env.PUSHUP_DEVICE = 'cpu';
  (async () => {
    const t0 = now();
    const { upscale } = require('../src/index.js'); // module load (onnxruntime, sharp) counts as cold cost
    const tLoad = now() - t0;
    const { b, w, h } = synth(size);
    let t = now();
    await upscale(b, w * 3, factor);
    const cold = now() - t;
    const warmMs = [];
    for (let i = 0; i < warm; i++) { t = now(); await upscale(b, w * 3, factor); warmMs.push(now() - t); }
    console.log(JSON.stringify({ mode, size, requireMs: tLoad, coldMs: cold, warmMs }));
  })();
} else {
  const sizes = arg('sizes', '400,800').split(',').map(Number);
  const modes = arg('modes', 'fast,high').split(',');
  const warm = Number(arg('warm', 3));
  const factor = arg('factor', '1.5');
  console.log('mode  input  require  cold(1st call)  warm median  cold-warm  (ms)');
  for (const mode of modes) for (const size of sizes) {
    const r = spawnSync(process.execPath, [__filename, '--child', mode, size, mode === 'high' ? Math.min(warm, 1) : warm, factor], { encoding: 'utf8' });
    if (r.status !== 0) { console.log(mode, size, 'FAILED', r.stderr.slice(-300)); continue; }
    const j = JSON.parse(r.stdout.trim().split('\n').pop());
    const wm = median(j.warmMs);
    console.log(`${mode.padEnd(5)} ${String(size).padStart(5)} ${j.requireMs.toFixed(0).padStart(8)} ${j.coldMs.toFixed(0).padStart(14)} ${wm.toFixed(0).padStart(12)} ${(j.coldMs - wm).toFixed(0).padStart(10)}   warm n=${j.warmMs.length}`);
  }
}
