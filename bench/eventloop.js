'use strict';
// Task EL1: does a call block the event loop? A timer probe (setInterval, 2 ms) runs during (a) a full
// public upscale() call and (b) a bare ONNX Runtime session.run on a same-sized input, `fast` model, CPU.
// Usage: node bench/eventloop.js [--sizes 400,800] [--calls 3] [--threads default] [--quality fast|high]   (--sizes: contract range 400-800; --threads: comma list of integers >= 1 or "default", applies to the bare session.run rows only; --quality high: the `high` model, Remacri, 192 px tiles; about 15 s per upscale() call at 400 px on 4 vCPU)
// Prints one row per call: call time, number of probe ticks, longest gap between ticks (start of the call and its
// end count as ticks) and the time spent in gaps above 10 ms ("blocked"). A free loop shows about call_ms / 2 ticks
// and a longest gap of a few ms; a blocked loop shows few ticks and a longest gap close to the call time.
// The probe runs on the main thread, so it shows how long the main thread cannot serve timers, not CPU use.
process.env.PUSHUP_DEVICE = 'cpu';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
// A rejected flag prints one line naming it and exits 1 (tested by test/eventloop-args.test.js).
const fail = (msg) => { console.error(msg); process.exit(1); };

const TICK_MS = 2;
const BLOCKED_GAP_MS = 10;

const sizesArg = String(arg('sizes', '400,800'));
const callsArg = String(arg('calls', '3'));
const threadsArg = String(arg('threads', 'default'));
const quality = String(arg('quality', 'fast'));
const sizes = sizesArg.split(',').map((s) => (/^\d+$/.test(s) ? Number(s) : NaN));
if (sizes.length === 0 || sizes.some((s) => !(s >= 400 && s <= 800))) fail('--sizes must be a comma list of integers from 400 to 800');
if (!/^\d+$/.test(callsArg) || Number(callsArg) < 1) fail('--calls must be an integer >= 1');
const calls = Number(callsArg);
const threadList = threadsArg.split(',').map((s) => (s === 'default' ? 'default' : /^\d+$/.test(s) && Number(s) >= 1 ? Number(s) : NaN));
if (threadList.some((t) => Number.isNaN(t))) fail('--threads must be a comma list of integers >= 1 or "default"');
if (quality !== 'fast' && quality !== 'high') fail('--quality must be fast or high');
process.env.PUSHUP_QUALITY = quality;
// The tile `high` mode feeds the model: 192 px plus 16 px context each side (DEFAULT_TILE_PAD in src/index.js, not exported).
const TILE = 192, TILE_PAD = 16, TILE_IN = TILE + 2 * TILE_PAD;

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

// Run `fn` (returns a promise) with the timer probe on; resolve with the numbers.
async function probe(fn) {
  const ticks = [];
  const t0 = performance.now();
  const timer = setInterval(() => ticks.push(performance.now() - t0), TICK_MS);
  try { await fn(); } finally { clearInterval(timer); }
  const total = performance.now() - t0;
  const marks = [0, ...ticks, total];
  let maxGap = 0, blocked = 0;
  for (let i = 1; i < marks.length; i++) {
    const g = marks[i] - marks[i - 1];
    if (g > maxGap) maxGap = g;
    if (g > BLOCKED_GAP_MS) blocked += g;
  }
  return { total, ticks: ticks.length, maxGap, blocked };
}

function row(label, size, threads, r) {
  console.log([label.padEnd(12), `${size}`.padStart(5), String(threads).padStart(8), r.total.toFixed(0).padStart(9),
    String(r.ticks).padStart(6), r.maxGap.toFixed(0).padStart(12), r.blocked.toFixed(0).padStart(11)].join(' '));
}

(async () => {
  const ort = require('onnxruntime-node');
  const { upscale, _sessionOptions, _MODES } = require('../src/index.js');
  console.log(`${quality}, CPU, factor 1.5, probe every ${TICK_MS} ms, ${calls} call(s) per row; "blocked" = time in gaps above ${BLOCKED_GAP_MS} ms (ms)`);
  console.log(['case'.padEnd(12), 'size'.padStart(5), 'threads'.padStart(8), 'call_ms'.padStart(9), 'ticks'.padStart(6),
    'max_gap_ms'.padStart(12), 'blocked_ms'.padStart(11)].join(' '));
  // Control: an idle loop (a 300 ms sleep) must show about 150 ticks and a longest gap of a few ms, else the probe itself is off.
  row('idle 300ms', '-', '-', await probe(() => new Promise((r) => setTimeout(r, 300))));
  for (const size of sizes) {
    const { b, w, h } = synth(size);
    await upscale(b, w * 3, 1.5); // warm-up: creates the session
    for (let i = 0; i < calls; i++) row('upscale', size, 'default', await probe(() => upscale(b, w * 3, 1.5)));
    for (const threads of threadList) {
      const opts = _sessionOptions(['cpu']);
      if (threads !== 'default') opts.intraOpNumThreads = threads;
      const session = await ort.InferenceSession.create(_MODES[quality].modelPath, opts);
      // fast: the whole image in one run; high: one tile (what one of its many runs feeds).
      const [iw, ih] = quality === 'high' ? [TILE_IN, TILE_IN] : [w, h];
      const feeds = { [session.inputNames[0]]: new ort.Tensor('float32', new Float32Array(3 * iw * ih).fill(0.5), [1, 3, ih, iw]) };
      await session.run(feeds); // warm-up
      for (let i = 0; i < calls; i++) row(quality === 'high' ? 'tile.run' : 'session.run', size, threads, await probe(() => session.run(feeds)));
    }
  }
})();
