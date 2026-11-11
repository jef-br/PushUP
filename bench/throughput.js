'use strict';
// Task P4: throughput of one process using all N cores vs several processes with fewer threads
// each, `fast` model, CPU.
// Usage: node bench/throughput.js [--seconds 30] [--sizes 400,800]
// Configurations (N = os.availableParallelism()): 1 process x N threads, N processes x 1 thread,
// and N/2 processes x 2 threads when N >= 4. Each process creates one CPU session
// (_sessionOptions from src/index.js, only intraOpNumThreads changed), does 1 warm-up run, waits
// until every process is ready, then calls session.run on a deterministic synthetic whole-image
// input in a loop for --seconds of wall time. Only session.run is timed. Reported: images/s for
// the configuration (all processes together), and the median per-image latency.
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');

const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i > 0 ? process.argv[i + 1] : d;
};
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

async function child() {
  const ort = require('onnxruntime-node');
  const { _toTensor, _MODES, _sessionOptions } = require('../src/index.js');
  const threads = Number(process.env.P4_THREADS);
  const { b, w, h } = synth(Number(process.env.P4_SIZE));
  const session = await ort.InferenceSession.create(_MODES.fast.modelPath,
    { ..._sessionOptions(['cpu']), intraOpNumThreads: threads });
  const feed = () => ({ [session.inputNames[0]]: _toTensor(b, w, 0, 0, w, h) });
  await session.run(feed()); // warm-up
  process.send({ ready: true });
  const { endAt } = await new Promise((resolve) => process.once('message', resolve));
  const lat = [];
  // endAt is a wall-clock time (Date.now) shared by all processes; a run that starts before it counts.
  while (Date.now() < endAt) {
    const f = feed();
    const t0 = now();
    await session.run(f);
    lat.push(now() - t0);
  }
  const finishedAt = Date.now();
  process.send({ lat, finishedAt });
  await session.release();
  process.exit(0);
}

async function runConfig(procs, threads, size, seconds) {
  const kids = [];
  for (let i = 0; i < procs; i++) {
    kids.push(fork(__filename, ['--child'], {
      env: { ...process.env, P4_THREADS: String(threads), P4_SIZE: String(size) },
    }));
  }
  await Promise.all(kids.map((k) => new Promise((resolve, reject) => {
    k.once('message', resolve);
    k.once('error', reject);
  })));
  const startAt = Date.now();
  const endAt = startAt + seconds * 1000;
  const results = kids.map((k) => new Promise((resolve, reject) => {
    k.once('message', resolve);
    k.once('exit', (code) => { if (code) reject(new Error(`child exited ${code}`)); });
  }));
  for (const k of kids) k.send({ endAt });
  const res = await Promise.all(results);
  const lat = res.flatMap((r) => r.lat);
  const wall = (Math.max(...res.map((r) => r.finishedAt)) - startAt) / 1000; // includes the last run
  return { images: lat.length, wall, ips: lat.length / wall, med: median(lat) };
}

async function main() {
  const seconds = Number(arg('seconds', 30));
  const sizes = arg('sizes', '400,800').split(',').map(Number);
  const N = os.availableParallelism();
  const configs = [[1, N], [N, 1]];
  if (N >= 4) configs.splice(1, 0, [Math.floor(N / 2), 2]);
  const ver = require('onnxruntime-node/package.json').version;
  console.log(`cpu="${os.cpus()[0].model}" N=${N} node=${process.version} onnxruntime-node=${ver} ` +
    `seconds=${seconds} model=${path.basename(require('../src/index.js')._MODES.fast.modelPath)}`);
  console.log('input     procs x threads  images  wall_s  images/s  vs_1xN  median_ms');
  for (const L of sizes) {
    const h = Math.round(L * 0.75);
    let base;
    for (const [p, t] of configs) {
      const r = await runConfig(p, t, L, seconds);
      if (!base) base = r.ips;
      console.log(`${(L + 'x' + h).padEnd(9)} ${(p + ' x ' + t).padStart(15)}  ${String(r.images).padStart(6)}  ` +
        `${r.wall.toFixed(1).padStart(6)}  ${r.ips.toFixed(2).padStart(8)}  ${(r.ips / base).toFixed(2).padStart(5)}x  ` +
        `${r.med.toFixed(0).padStart(9)}`);
    }
  }
}

(process.argv.includes('--child') ? child() : main()).catch((e) => { console.error(e); process.exit(1); });
