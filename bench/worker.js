'use strict';
// Task EL2: what does it cost to run upscale() in a worker_threads worker instead of on the main thread?
// For each size, `fast` on CPU, factor 1.5, two fresh processes: "direct" (upscale() on the main thread) and
// "worker" (a Worker requires src/index.js; input and output travel as transferred ArrayBuffers). Each prints the
// first call (worker start + session creation, i.e. cold), the median of the next --calls calls as the main thread
// sees them, the main-thread timer probe (EL1: 2 ms setInterval) during each call, and RSS of the process after
// the last call (main thread + worker share one process). The sha256 of the output of the first call must be equal
// in both modes (printed as "bytes equal"; exit status 1 if not).
// Usage: node bench/worker.js [--sizes 400,800] [--calls 5]   (--sizes: integers 400-800, the contract range)
// The input copy for each call is made before its timer starts (a transfer detaches the buffer); the output copy
// into a transferable ArrayBuffer is inside the timed call.
const { Worker, isMainThread, parentPort } = require('node:worker_threads');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const FACTOR = 1.5;
const TICK_MS = 2;
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const fail = (msg) => { console.error(msg); process.exit(1); };
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const MB = (b) => b / 1048576;

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

// ---- worker side: answer {buf, stride, factor} messages with upscale() results.
if (!isMainThread) {
  const { upscale } = require('../src/index.js');
  parentPort.on('message', async ({ buf, stride, factor }) => {
    const [out, outStride] = await upscale(new Uint8Array(buf), stride, factor);
    const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    parentPort.postMessage({ ab, outStride }, [ab]);
  });
  return;
}

// ---- child side: one mode, one size, one fresh process; prints one JSON line.
async function child(mode, size, calls) {
  process.env.PUSHUP_QUALITY = 'fast';
  process.env.PUSHUP_DEVICE = 'cpu';
  const { b, w } = synth(size);
  const stride = w * 3;
  let call;
  let worker;
  if (mode === 'worker') {
    worker = new Worker(__filename);
    // One persistent set of handlers (no listener per call): one call is in flight at a time.
    let pending = null;
    const settle = (fn) => { const p = pending; pending = null; if (p) fn(p); };
    worker.on('message', ({ ab, outStride }) => settle((p) => p.resolve([Buffer.from(ab), outStride])));
    worker.on('error', (e) => settle((p) => p.reject(e)));
    worker.on('exit', (code) => settle((p) => p.reject(new Error(`worker exited with code ${code}`))));
    call = (copy) => new Promise((resolve, reject) => {
      pending = { resolve, reject };
      worker.postMessage({ buf: copy.buffer, stride, factor: FACTOR }, [copy.buffer]);
    });
  } else {
    const { upscale } = require('../src/index.js');
    call = (copy) => upscale(copy, stride, FACTOR);
  }
  const probed = async () => {
    const copy = new Uint8Array(b); // fresh copy, made before the timer starts
    const ticks = [];
    const t0 = performance.now();
    const timer = setInterval(() => ticks.push(performance.now() - t0), TICK_MS);
    let result;
    try { result = await call(copy); } finally { clearInterval(timer); }
    const total = performance.now() - t0;
    const marks = [0, ...ticks, total];
    let maxGap = 0;
    for (let i = 1; i < marks.length; i++) maxGap = Math.max(maxGap, marks[i] - marks[i - 1]);
    return { ms: total, ticks: ticks.length, maxGap, result };
  };
  const first = await probed();
  const [out, outStride] = first.result;
  const digest = `${out.length}/${outStride}/${crypto.createHash('sha256').update(out).digest('hex')}`;
  const rest = [];
  for (let i = 0; i < calls; i++) rest.push(await probed());
  const rssMB = MB(process.memoryUsage().rss);
  const maxRssMB = MB(process.resourceUsage().maxRSS * 1024);
  console.log(JSON.stringify({
    mode, size, digest, rssMB, maxRssMB,
    firstMs: first.ms, firstTicks: first.ticks, firstMaxGap: first.maxGap,
    medMs: median(rest.map((r) => r.ms)), medTicks: median(rest.map((r) => r.ticks)), medMaxGap: median(rest.map((r) => r.maxGap)),
  }));
  if (worker) await worker.terminate();
}

if (process.argv[2] === '--child') {
  child(process.argv[3], Number(process.argv[4]), Number(process.argv[5])).catch((e) => { console.error(e); process.exit(2); });
} else {
  // ---- parent side: validate, then one fresh child process per (size, mode).
  const sizes = String(arg('sizes', '400,800')).split(',').map((s) => (/^\d+$/.test(s) ? Number(s) : NaN));
  const callsArg = String(arg('calls', '5'));
  if (sizes.length === 0 || sizes.some((s) => !(s >= 400 && s <= 800))) fail('--sizes must be a comma list of integers from 400 to 800');
  if (!/^\d+$/.test(callsArg) || Number(callsArg) < 1) fail('--calls must be an integer >= 1');
  const calls = Number(callsArg);
  const f = (v, d = 0) => v.toFixed(d);
  console.log(`fast, CPU, factor ${FACTOR}, ${calls} calls after the first; probe every ${TICK_MS} ms on the main thread; one fresh process per row`);
  console.log(['mode'.padEnd(7), 'size'.padStart(5), 'first_ms'.padStart(9), 'median_ms'.padStart(10), 'ticks(med)'.padStart(11),
    'max_gap_ms(med)'.padStart(16), 'RSS_MB'.padStart(7), 'maxRSS_MB'.padStart(10)].join(' '));
  let ok = true;
  for (const size of sizes) {
    const rows = {};
    for (const mode of ['direct', 'worker']) {
      const r = spawnSync(process.execPath, [__filename, '--child', mode, String(size), String(calls)], { encoding: 'utf8', timeout: 300000 });
      if (r.status !== 0) fail(`child ${mode} ${size} failed: ${r.stderr}`);
      const o = JSON.parse(r.stdout.trim().split('\n').pop());
      rows[mode] = o;
      console.log([mode.padEnd(7), String(size).padStart(5), f(o.firstMs).padStart(9), f(o.medMs).padStart(10), String(o.medTicks).padStart(11),
        f(o.medMaxGap).padStart(16), f(o.rssMB).padStart(7), f(o.maxRssMB).padStart(10)].join(' '));
    }
    const equal = rows.direct.digest === rows.worker.digest;
    if (!equal) ok = false;
    console.log(`  ${size}: bytes equal: ${equal ? 'yes' : 'NO'}; worker − direct: first ${f(rows.worker.firstMs - rows.direct.firstMs)} ms, ` +
      `median ${f(rows.worker.medMs - rows.direct.medMs)} ms, RSS ${f(rows.worker.rssMB - rows.direct.rssMB)} MB`);
  }
  if (!ok) process.exitCode = 1;
}
