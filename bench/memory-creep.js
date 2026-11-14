'use strict';
// Task M5: does memory creep up over repeated calls? One fresh process, `fast` on CPU, the public
// upscale() on a synthetic 800x600 image at factor 1.0, `--calls` sequential calls.
// Usage: node bench/memory-creep.js [--calls 30] [--size 800] [--arena on|off]   (--size: integer 400-800, the contract range)
// Task M7: `--arena off` wraps ort.InferenceSession.create in this process so every session also gets
// enableCpuMemArena=false and enableMemPattern=false (bench-only, like bench/arena.js; src/ unchanged).
// Prints the RSS (MB, process.memoryUsage().rss) after calls 1, 2, 5, 10, 20 and the last, the
// OS-reported max RSS (process.resourceUsage().maxRSS), and the change from call 5 to the last call.
// Run it as `node bench/memory-creep.js` (it is its own fresh process; no child is spawned).
process.env.PUSHUP_QUALITY = 'fast';
process.env.PUSHUP_DEVICE = 'cpu';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const MB = (b) => b / 1048576;
const arena = arg('arena', 'on');
// A rejected flag prints one line naming it and exits 1 (R15: tested by test/memory-creep-args.test.js).
const fail = (msg) => { console.error(msg); process.exit(1); };
if (arena !== 'on' && arena !== 'off') fail('--arena must be on or off');

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

(async () => {
  const calls = Number(arg('calls', '30'));
  const sizeArg = String(arg('size', '800'));
  const size = Number(sizeArg);
  if (!Number.isInteger(calls) || calls < 6) fail('--calls must be an integer >= 6');
  if (!/^\d+$/.test(sizeArg) || size < 400 || size > 800) fail('--size must be an integer from 400 to 800');
  if (arena === 'off') {
    const ort = require('onnxruntime-node');
    const create = ort.InferenceSession.create.bind(ort.InferenceSession);
    ort.InferenceSession.create = (path, o) => create(path, { ...o, enableCpuMemArena: false, enableMemPattern: false });
  }
  const { upscale } = require('../src/index.js');
  const { b, w, h } = synth(size);
  const rss = [];
  const ms = [];
  for (let i = 1; i <= calls; i++) {
    const t0 = process.hrtime.bigint();
    await upscale(b, w * 3, 1.0);
    ms.push(Number(process.hrtime.bigint() - t0) / 1e6);
    rss.push(process.memoryUsage().rss);
  }
  const at = (n) => MB(rss[n - 1]);
  const marks = [...new Set([1, 2, 5, 10, 20, calls].filter((n) => n <= calls))];
  console.log(`fast, CPU, ${w}x${h}, factor 1.0, ${calls} sequential calls, arena ${arena} (MB)`);
  console.log('after call   ' + marks.map((n) => String(n).padStart(7)).join(''));
  console.log('RSS          ' + marks.map((n) => at(n).toFixed(0).padStart(7)).join(''));
  const maxRss = MB(process.resourceUsage().maxRSS * 1024);
  const delta = at(calls) - at(5);
  console.log(`max RSS ${maxRss.toFixed(0)} MB; RSS last vs call 5: ${delta >= 0 ? '+' : ''}${delta.toFixed(0)} MB ` +
    `(${((delta / at(5)) * 100).toFixed(1)}%), ${(delta / (calls - 5)).toFixed(2)} MB per call`);
  const sorted = [...ms].sort((a, c) => a - c);
  console.log(`median call ${sorted[Math.floor(sorted.length / 2)].toFixed(0)} ms`);
})().catch((e) => { console.error(e); process.exit(1); });
