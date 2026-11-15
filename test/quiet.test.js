'use strict';
// EX3: a library must be quiet. A normal `upscale` call, and a rejected one, must write nothing to stdout or
// stderr. (src/ never writes to the console; its only `process.emitWarning` calls are the PushupWarning ones for a GPU
// that fails, which cannot fire with PUSHUP_DEVICE=cpu. onnxruntime-node could print warnings in some environments;
// if it does, this test must not filter them: that is a finding for the owner.)
// Measured 2026-11-15 (4 vCPU container, Node 22): 0 bytes on both streams in 10 of 10 runs, about 0.2 s per child.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SRC = path.join(__dirname, '..', 'src', 'index.js');
const LIMIT_MS = 20000;

// The child prints nothing itself. 400x4 RGB is valid (largest side 400); 399x4 is too small and rejects.
const CHILD = `
const { upscale } = require(${JSON.stringify(SRC)});
const img = (w) => new Uint8Array(w * 4 * 3).map((_, i) => (i * 7) & 255);
(async () => {
  if (process.argv[1] === 'reject') {
    await upscale(img(399), 399 * 3, 1).then(() => { process.exitCode = 3; }, (e) => { if (!(e instanceof RangeError)) process.exitCode = 4; });
  }
  await upscale(img(400), 400 * 3, 1);
})();
`;

function runChild(mode) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', CHILD, mode], {
      env: { ...process.env, PUSHUP_QUALITY: 'fast', PUSHUP_DEVICE: 'cpu' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), LIMIT_MS);
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, out, err }); });
  });
}

for (const [mode, what] of [['ok', 'a normal upscale call'], ['reject', 'a rejected call (RangeError) followed by a normal one']]) {
  test(`${what} writes nothing to stdout or stderr`, async () => {
    const r = await runChild(mode);
    assert.notStrictEqual(r.signal, 'SIGKILL', `child still running after ${LIMIT_MS} ms`);
    assert.strictEqual(r.code, 0, `exit code (stderr: ${r.err})`);
    assert.strictEqual(r.out, '', 'stdout');
    assert.strictEqual(r.err, '', 'stderr');
  });
}
