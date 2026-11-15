'use strict';
// EX2: the package is CommonJS, but ES-module projects import it. `import { upscale }` must keep working
// and give the same bytes as `require`. The child is a real ES-module process (`--input-type=module`).
//
// What `default` is (checked 2026-11-15): in the ES namespace of a CommonJS module, `default` is the whole
// `module.exports` object, so `import pushup from ...` gives that object (`pushup.upscale === upscale`).
// `pushup.default` is the `upscale` alias set by `module.exports.default = upscale` in src/index.js. It is
// deliberately NOT asserted here: pinning it would make that alias a public promise.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');

const SRC = path.join(__dirname, '..', 'src', 'index.js');
const LIMIT_MS = 20000;
const W = 400, H = 4;

function image() {
  return new Uint8Array(W * H * 3).map((_, i) => (i * 7 + ((i / (W * 3)) | 0) * 13) & 255);
}
const digest = (out, stride) => `${out.length}/${stride}/${crypto.createHash('sha256').update(out).digest('hex')}`;

const CHILD = `
import { upscale } from ${JSON.stringify(pathToFileURL(SRC).href)};
import pushup from ${JSON.stringify(pathToFileURL(SRC).href)};
import crypto from 'node:crypto';
const arr = new Uint8Array(${W} * ${H} * 3).map((_, i) => (i * 7 + ((i / (${W} * 3)) | 0) * 13) & 255);
const [out, stride] = await upscale(arr, ${W} * 3, 1);
console.log(JSON.stringify({
  named: typeof upscale,
  same: pushup.upscale === upscale,
  digest: out.length + '/' + stride + '/' + crypto.createHash('sha256').update(out).digest('hex'),
}));
`;

function runChild() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', CHILD], {
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

test('import { upscale } from an ES module works and gives the same bytes as require', async () => {
  const saved = { q: process.env.PUSHUP_QUALITY, d: process.env.PUSHUP_DEVICE };
  process.env.PUSHUP_QUALITY = 'fast';
  process.env.PUSHUP_DEVICE = 'cpu';
  let expected;
  try {
    const { upscale } = require(SRC);
    const [out, stride] = await upscale(image(), W * 3, 1);
    expected = digest(out, stride);
  } finally {
    for (const [k, v] of [['PUSHUP_QUALITY', saved.q], ['PUSHUP_DEVICE', saved.d]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }

  const r = await runChild();
  assert.notStrictEqual(r.signal, 'SIGKILL', `child still running after ${LIMIT_MS} ms\n${r.out}${r.err}`);
  assert.strictEqual(r.code, 0, r.err);
  const got = JSON.parse(r.out.trim().split('\n').pop());
  assert.strictEqual(got.named, 'function', 'import { upscale } is a function');
  assert.strictEqual(got.same, true, 'the default import is the module object: pushup.upscale === upscale');
  assert.strictEqual(got.digest, expected, 'bytes from the ES module child equal bytes from require');
});
