'use strict';
// Task M1: peak memory (RSS) of upscale(), each measurement in a fresh process, CPU only.
// Usage: node bench/memory.js [--sizes 400,800] [--factors 1,1.5] [--high-sizes 400]
//   Parent mode spawns one child per (mode, size, factor);
//   child mode: node bench/memory.js --child <mode> <size> <factor>
// Reported per row (MB): rss after `require`, rss after the first call, peak sampled RSS
// (process.memoryUsage().rss every 10 ms during the call) and the OS-reported max RSS
// (process.resourceUsage().maxRSS, the authoritative peak for the whole process). Input is a
// deterministic synthetic 4:3 image, like bench/cold.js.
const { spawnSync } = require('node:child_process');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
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

if (process.argv[2] === '--child') {
  const [mode, size, factor] = [process.argv[3], Number(process.argv[4]), Number(process.argv[5])];
  process.env.PUSHUP_QUALITY = mode;
  process.env.PUSHUP_DEVICE = 'cpu';
  (async () => {
    const { upscale } = require('../src/index.js');
    const afterRequire = process.memoryUsage().rss;
    const { b, w } = synth(size);
    let peak = process.memoryUsage().rss;
    const timer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 10);
    await upscale(b, w * 3, factor);
    clearInterval(timer);
    peak = Math.max(peak, process.memoryUsage().rss);
    const afterCall = process.memoryUsage().rss;
    // maxRSS is in KiB on Linux.
    const maxRss = process.resourceUsage().maxRSS * 1024;
    console.log(JSON.stringify({ mode, size, factor, afterRequire, afterCall, peak, maxRss }));
  })();
} else {
  const sizes = arg('sizes', '400,800').split(',').map(Number);
  const factors = arg('factors', '1,1.5').split(',');
  const highSizes = arg('high-sizes', '400').split(',').filter(Boolean).map(Number);
  const jobs = [];
  for (const s of sizes) for (const f of factors) jobs.push(['fast', s, f]);
  for (const s of highSizes) for (const f of factors) jobs.push(['high', s, f]);
  console.log('mode  input  factor  rss_require  rss_after_call  peak_sampled  max_rss   (MB)');
  for (const [mode, size, factor] of jobs) {
    const r = spawnSync(process.execPath, [__filename, '--child', mode, size, factor], { encoding: 'utf8' });
    if (r.status !== 0) { console.log(mode, size, factor, 'FAILED', r.stderr.slice(-300)); process.exitCode = 1; continue; }
    const j = JSON.parse(r.stdout.trim().split('\n').pop());
    console.log(`${mode.padEnd(5)} ${String(size).padStart(5)} ${String(factor).padStart(7)} ` +
      `${MB(j.afterRequire).toFixed(0).padStart(12)} ${MB(j.afterCall).toFixed(0).padStart(15)} ` +
      `${MB(j.peak).toFixed(0).padStart(13)} ${MB(j.maxRss).toFixed(0).padStart(9)}`);
  }
}
