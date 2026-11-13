'use strict';
// Task M4: where does `high` mode's extra memory at 800 px come from? No src/ change.
// Usage: node bench/memory-breakdown.js [--sizes 400,800]
// Per size (fresh child process each, `high` on CPU, factor 1.0, 4:3 synthetic image), reports RSS (MB)
// after `require`, after session creation (one call on a thin 400x12 image: inputs under 400 px are
// rejected), the peak during one full call (sampled every 10 ms, plus process.resourceUsage().maxRSS),
// and RSS after the call. Next to that: the sizes (MB) of the whole-image arrays that src/index.js
// holds, computed from the image size (MODEL_SCALE 4 and the 16 px tile pad mirror src/index.js, where DEFAULT_TILE_PAD is not exported, so keep them in sync by hand; the tile size comes from _MODES.high.tile),
// and the tile count. The arrays are arithmetic, not measured: infer() and getSession() are not exported.
const { spawnSync } = require('node:child_process');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const MB = (b) => b / 1048576;
const MODEL_SCALE = 4; // src/index.js
const TILE_PAD = 16; // DEFAULT_TILE_PAD in src/index.js (not exported)

function synth(w, h) {
  const b = Buffer.alloc(w * h * 3);
  let s = 12345;
  for (let i = 0; i < b.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    b[i] = ((i / 3) % w) * 255 / w + (s >> 16) % 16;
  }
  return b;
}

// Whole-image arrays and tile geometry for a w x h input, as infer() in src/index.js walks it.
function geometry(w, h, tile) {
  const step = Math.min(tile, Math.max(w, h));
  let tiles = 0, maxTw = 0, maxTh = 0;
  for (let ty = 0; ty < h; ty += step) {
    for (let tx = 0; tx < w; tx += step) {
      const tw = Math.min(tx + step + TILE_PAD, w) - Math.max(tx - TILE_PAD, 0);
      const th = Math.min(ty + step + TILE_PAD, h) - Math.max(ty - TILE_PAD, 0);
      tiles++; maxTw = Math.max(maxTw, tw); maxTh = Math.max(maxTh, th);
    }
  }
  const s = MODEL_SCALE;
  return {
    tiles, maxTw, maxTh,
    packedInput: w * h * 3, // rgb after packRows (uint8)
    srOutput: w * s * h * s * 3, // whole-image 4x output Buffer (uint8)
    packedOutput: w * h * 3, // returned image at factor 1.0 (uint8; the resize target equals the input size)
    tileInputTensor: maxTw * maxTh * 3 * 4, // float32 NCHW, largest tile
    tileOutputTensor: maxTw * s * maxTh * s * 3 * 4, // float32 NCHW, largest tile
  };
}

if (process.argv[2] === '--child') {
  const size = Number(process.argv[3]);
  process.env.PUSHUP_QUALITY = 'high';
  process.env.PUSHUP_DEVICE = 'cpu';
  (async () => {
    const { _run, _MODES } = require('../src/index.js');
    const rss = () => process.memoryUsage().rss;
    const afterRequire = rss();
    await _run(synth(400, 12), 400 * 3, 1.0); // creates the session (and runs 3 small tiles)
    const afterSession = rss();
    const w = size, h = Math.round(size * 0.75);
    const img = synth(w, h);
    let peak = rss();
    const timer = setInterval(() => { peak = Math.max(peak, rss()); }, 10);
    await _run(img, w * 3, 1.0);
    clearInterval(timer);
    peak = Math.max(peak, rss());
    const afterCall = rss();
    const maxRss = process.resourceUsage().maxRSS * 1024; // KiB on Linux
    console.log(JSON.stringify({ size, w, h, afterRequire, afterSession, peak, afterCall, maxRss, geo: geometry(w, h, _MODES.high.tile) }));
  })();
} else {
  const sizes = arg('sizes', '400,800').split(',').filter(Boolean).map(Number);
  console.log('input   rss_require  rss_session  peak_sampled  max_rss  rss_after_call  (MB)');
  const rows = [];
  for (const size of sizes) {
    const r = spawnSync(process.execPath, [__filename, '--child', size], { encoding: 'utf8' });
    if (r.status !== 0) { console.log(size, 'FAILED', r.stderr.slice(-300)); process.exitCode = 1; continue; }
    const j = JSON.parse(r.stdout.trim().split('\n').pop());
    rows.push(j);
    console.log(`${String(j.w + 'x' + j.h).padEnd(8)}${MB(j.afterRequire).toFixed(0).padStart(8)}${MB(j.afterSession).toFixed(0).padStart(13)}` +
      `${MB(j.peak).toFixed(0).padStart(14)}${MB(j.maxRss).toFixed(0).padStart(10)}${MB(j.afterCall).toFixed(0).padStart(16)}`);
  }
  console.log('\nwhole-image arrays and tiles (arithmetic, MB):');
  console.log('input   tiles  largest_tile  packed_input  sr_output(4x,u8)  packed_output  tile_in_f32  tile_out_f32');
  for (const j of rows) {
    const g = j.geo;
    console.log(`${String(j.w + 'x' + j.h).padEnd(8)}${String(g.tiles).padStart(4)}${String(g.maxTw + 'x' + g.maxTh).padStart(14)}` +
      `${MB(g.packedInput).toFixed(1).padStart(14)}${MB(g.srOutput).toFixed(1).padStart(18)}${MB(g.packedOutput).toFixed(1).padStart(14)}${MB(g.tileInputTensor).toFixed(1).padStart(13)}${MB(g.tileOutputTensor).toFixed(1).padStart(14)}`);
  }
  if (rows.length >= 2) {
    const a = rows[0], b = rows[rows.length - 1];
    const growth = MB(b.maxRss - a.maxRss);
    const arrays = MB((b.geo.packedInput + b.geo.srOutput) - (a.geo.packedInput + a.geo.srOutput));
    console.log(`\nmax_rss growth ${a.w}->${b.w}: ${growth.toFixed(0)} MB; growth of packed input + 4x output arrays: ${arrays.toFixed(0)} MB ` +
      `(${(100 * arrays / growth).toFixed(0)}% of the growth)`);
  }
}
