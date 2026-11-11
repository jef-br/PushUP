'use strict';
// Task P3: ONNX Runtime intra-op thread count vs inference latency, `fast` model, CPU.
// Usage: node bench/threads.js [--runs 5] [--sizes 400,800] [--threads 1,2,4]
// Default thread counts: {1, 2, N/2, N} with N = os.availableParallelism(), duplicates removed.
// For each count it creates one CPU session and times session.run on a deterministic synthetic
// whole-image input (4:3, gradient + noise; latency depends on size, not content): median of
// --runs runs after 1 warm-up. It also converts each output to bytes with the function
// src/index.js ships and compares them with the bytes at N threads.
const os = require('node:os');
const ort = require('onnxruntime-node');
const { _toTensor, _copyFromTensor, _MODES, _sessionOptions } = require('../src/index.js');

const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i > 0 ? process.argv[i + 1] : d;
};
const N = os.availableParallelism();
const runs = Number(arg('runs', 5));
const sizes = arg('sizes', '400,800').split(',').map(Number);
const threads = arg('threads', null)
  ? arg('threads').split(',').map(Number)
  : [...new Set([1, 2, Math.max(1, Math.floor(N / 2)), N])].sort((a, b) => a - b);
if (!threads.includes(N)) threads.push(N); // N is the reference for the byte comparison

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

// The CPU session options src/index.js ships (_sessionOptions); only intraOpNumThreads varies here.
const options = (n) => ({ ..._sessionOptions(['cpu']), intraOpNumThreads: n });

function toBytes(t) {
  const [, , oh, ow] = t.dims;
  const buf = Buffer.allocUnsafe(ow * oh * 3);
  _copyFromTensor(t, 0, 0, ow, oh, buf, ow, 0, 0);
  return buf;
}

(async () => {
  const ver = require('onnxruntime-node/package.json').version;
  console.log(`cpu="${os.cpus()[0].model}" N=${N} node=${process.version} onnxruntime-node=${ver} ` +
    `runs=${runs} model=${require('node:path').basename(_MODES.fast.modelPath)}`);
  console.log('input     threads  median_ms  vs_N   bytes_equal_N  max_abs_diff');
  for (const L of sizes) {
    const { b, w, h } = synth(L);
    const rows = [];
    for (const n of threads) {
      const session = await ort.InferenceSession.create(_MODES.fast.modelPath, options(n));
      const feed = () => ({ [session.inputNames[0]]: _toTensor(b, w, 0, 0, w, h) });
      const first = await session.run(feed()); // warm-up
      const bytes = toBytes(first[session.outputNames[0]]);
      const times = [];
      for (let r = 0; r < runs; r++) {
        const f = feed();
        const t0 = now();
        await session.run(f);
        times.push(now() - t0);
      }
      await session.release();
      rows.push({ n, ms: median(times), bytes });
    }
    const ref = rows.find((r) => r.n === N);
    for (const r of rows) {
      let maxd = 0;
      for (let i = 0; i < r.bytes.length; i++) {
        const d = Math.abs(r.bytes[i] - ref.bytes[i]);
        if (d > maxd) maxd = d;
      }
      console.log(`${(w + 'x' + h).padEnd(9)} ${String(r.n).padStart(7)}  ${r.ms.toFixed(0).padStart(9)}  ` +
        `${(r.ms / ref.ms).toFixed(2).padStart(4)}x  ${String(r.bytes.equals(ref.bytes)).padStart(13)}  ${String(maxd).padStart(12)}`);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
