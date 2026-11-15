'use strict';
// EX1: a script that awaits `upscale()` must end on its own. If a session, timer or the queue
// kept the event loop alive, a batch job would hang after its last image.
// The child never calls process.exit; it must simply run out of work.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SRC = path.join(__dirname, '..', 'src', 'index.js');
// Measured 2026-11-15 (4 vCPU container): about 0.15 s per child; the limit is far above that.
const LIMIT_MS = 20000;

// 400x4 RGB image: largest side 400 (valid).
const CHILD = `
const { upscale } = require(${JSON.stringify(SRC)});
const arr = new Uint8Array(400 * 4 * 3).map((_, i) => (i * 7) & 255);
const n = Number(process.argv[1]);
Promise.all(Array.from({ length: n }, () => upscale(arr, 400 * 3))).then((rs) => {
  console.log('sizes ' + rs.map(([a, s]) => a.length + '/' + s).join(','));
});
`;

function runChild(calls) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', CHILD, String(calls)], {
      env: { ...process.env, PUSHUP_QUALITY: 'fast', PUSHUP_DEVICE: 'cpu' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const t0 = Date.now();
    const timer = setTimeout(() => child.kill('SIGKILL'), LIMIT_MS);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, out, err, ms: Date.now() - t0 });
    });
  });
}

// 400x4 at factor 1.0 -> 400x4, tightly packed: 4800 bytes, stride 1200.
const EXPECT = '4800/1200';

for (const calls of [1, 2]) {
  test(`a process that made ${calls} upscale call(s) exits by itself`, async () => {
    const r = await runChild(calls);
    assert.notStrictEqual(r.signal, 'SIGKILL',
      `child still running after ${LIMIT_MS} ms: something keeps the event loop alive\n${r.out}${r.err}`);
    assert.strictEqual(r.code, 0, r.err);
    assert.strictEqual(r.out.trim(), 'sizes ' + Array(calls).fill(EXPECT).join(','));
  });
}
