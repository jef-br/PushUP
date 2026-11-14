'use strict';
// Task P6: ONNX Runtime CPU memory arena on vs off: latency, peak memory, output bytes. Bench-only:
// src/ is not changed and no default is proposed here (an owner decision).
// Usage: node bench/arena.js [--runs 5] [--cases fast:400,fast:800,high:400]
// Each case is <mode>:<longest side> on a deterministic synthetic 4:3 image. For every case and for
// arena = on / off it starts a fresh child process (so max RSS is not shared) that creates one CPU
// session with _sessionOptions(['cpu']) (off adds enableCpuMemArena=false and enableMemPattern=false),
// does 1 warm-up and --runs timed runs of the model call only (like bench/threads.js), and reports the
// median ms and process.resourceUsage().maxRSS. `fast` = one whole-image session.run; `high` = one run
// of the 192 px tile loop (the tile geometry and 16 px pad mirror infer() in src/index.js, where the pad
// is not exported: keep in sync by hand, as in bench/memory-breakdown.js). Output bytes of the warm-up
// run are converted with the shipped _copyFromTensor, written to a temp file and compared by the parent
// (byte-identical?, max absolute byte difference).
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const TILE_PAD = 16; // DEFAULT_TILE_PAD in src/index.js (not exported)
const MB = (b) => b / 1048576;

function synth(w, h) {
  const b = Buffer.alloc(w * h * 3);
  let s = 12345;
  for (let i = 0; i < b.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    b[i] = ((i / 3) % w) * 255 / w + (s >> 16) % 16;
  }
  return b;
}

if (process.argv[2] === '--child') {
  const [mode, sizeStr, arenaStr, runsStr, outFile] = process.argv.slice(3);
  const size = Number(sizeStr), arena = arenaStr === 'on', runs = Number(runsStr);
  (async () => {
    const ort = require('onnxruntime-node');
    const { _toTensor, _copyFromTensor, _MODES, _sessionOptions } = require('../src/index.js');
    const opts = _sessionOptions(['cpu']);
    if (!arena) { opts.enableCpuMemArena = false; opts.enableMemPattern = false; }
    const session = await ort.InferenceSession.create(_MODES[mode].modelPath, opts);
    const w = size, h = Math.round(size * 0.75), rgb = synth(w, h);
    const toBytes = (t) => {
      const [, , oh, ow] = t.dims;
      const buf = Buffer.allocUnsafe(ow * oh * 3);
      _copyFromTensor(t, 0, 0, ow, oh, buf, ow, 0, 0);
      return buf;
    };
    // One model pass over the image; collect = keep the converted bytes (warm-up run only).
    const pass = async (collect) => {
      const out = [];
      if (mode === 'fast') {
        const r = await session.run({ [session.inputNames[0]]: _toTensor(rgb, w, 0, 0, w, h) });
        if (collect) out.push(toBytes(r[session.outputNames[0]]));
      } else {
        const step = Math.min(_MODES.high.tile, Math.max(w, h));
        for (let ty = 0; ty < h; ty += step) {
          for (let tx = 0; tx < w; tx += step) {
            const px0 = Math.max(tx - TILE_PAD, 0), py0 = Math.max(ty - TILE_PAD, 0);
            const px1 = Math.min(tx + step + TILE_PAD, w), py1 = Math.min(ty + step + TILE_PAD, h);
            const r = await session.run({ [session.inputNames[0]]: _toTensor(rgb, w, px0, py0, px1 - px0, py1 - py0) });
            if (collect) out.push(toBytes(r[session.outputNames[0]]));
          }
        }
      }
      return out;
    };
    fs.writeFileSync(outFile, Buffer.concat(await pass(true))); // warm-up
    const times = [];
    for (let i = 0; i < runs; i++) {
      const t0 = Number(process.hrtime.bigint()) / 1e6;
      await pass(false);
      times.push(Number(process.hrtime.bigint()) / 1e6 - t0);
    }
    times.sort((a, b) => a - b);
    console.log(JSON.stringify({ mode, w, h, arena, medianMs: times[Math.floor(times.length / 2)], maxRss: process.resourceUsage().maxRSS * 1024 }));
  })().catch((e) => { console.error(e); process.exit(1); });
} else {
  const runs = Number(arg('runs', 5));
  const cases = arg('cases', 'fast:400,fast:800,high:400').split(',').filter(Boolean).map((c) => c.split(':'));
  const ver = require('onnxruntime-node/package.json').version;
  console.log(`cpu="${os.cpus()[0].model}" N=${os.availableParallelism()} node=${process.version} onnxruntime-node=${ver} runs=${runs}`);
  console.log('case        arena  median_ms  max_rss_MB  vs_on_time  bytes_equal_on  max_abs_diff');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-arena-'));
  try {
    for (const [mode, size] of cases) {
      const res = {};
      for (const arena of ['on', 'off']) {
        const file = path.join(dir, `${mode}-${size}-${arena}.bin`);
        const r = spawnSync(process.execPath, [__filename, '--child', mode, size, arena, String(runs), file], { encoding: 'utf8' });
        if (r.status !== 0) { console.log(mode, size, arena, 'FAILED', r.stderr.slice(-300)); process.exitCode = 1; continue; }
        res[arena] = { ...JSON.parse(r.stdout.trim().split('\n').pop()), file };
      }
      if (!res.on || !res.off) continue;
      const a = fs.readFileSync(res.on.file), b = fs.readFileSync(res.off.file);
      let maxd = a.length === b.length ? 0 : 255;
      if (a.length === b.length) for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > maxd) maxd = d; }
      for (const arena of ['on', 'off']) {
        const x = res[arena];
        console.log(`${(mode + ' ' + x.w + 'x' + x.h).padEnd(11)} ${arena.padStart(5)}  ${x.medianMs.toFixed(0).padStart(9)}  ${MB(x.maxRss).toFixed(0).padStart(10)}  ` +
          `${(x.medianMs / res.on.medianMs).toFixed(2).padStart(9)}x  ${(arena === 'on' ? '-' : String(a.equals(b))).padStart(14)}  ${(arena === 'on' ? '-' : String(maxd)).padStart(12)}`);
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
