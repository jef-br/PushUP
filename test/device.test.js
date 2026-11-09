'use strict';
// T6: device + quality selection. This machine may have no GPU; GPU paths are exercised
// through their fallback, and a run-time GPU failure is simulated with a stub session.
const test = require('node:test');
const assert = require('node:assert');
const ort = require('onnxruntime-node');
const pushup = require('../src');

const { _run, _reset, _MODES, _gpuProviders } = pushup;

function image(w, h) {
  const arr = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    arr[i] = (x * 5 + y) & 255;
    arr[i + 1] = (128 + 90 * Math.sin(x / 7) * Math.cos(y / 11)) | 0;
    arr[i + 2] = (x ^ (y * 3)) & 255;
  }
  return arr;
}

function withEnv(vars, fn) {
  return async () => {
    const saved = {};
    for (const k of Object.keys(vars)) { saved[k] = process.env[k]; process.env[k] = vars[k]; }
    _reset();
    try { await fn(); } finally {
      for (const k of Object.keys(vars)) {
        if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
      }
      _reset();
    }
  };
}

const W = 400, H = 300, arr = image(W, H);
let fastReference;
async function fastRef() {
  if (!fastReference) {
    [fastReference] = await _run(arr, W * 3, 2, { modelPath: _MODES.fast.modelPath, lanczosMix: 0.2 });
  }
  return fastReference;
}

test('GPU providers per platform', () => {
  assert.deepStrictEqual(_gpuProviders('win32', 'x64'), ['dml']);
  assert.deepStrictEqual(_gpuProviders('linux', 'x64'), ['cuda']);
  assert.deepStrictEqual(_gpuProviders('darwin', 'arm64'), ['coreml']);
  assert.deepStrictEqual(_gpuProviders('linux', 'arm64'), []);
});

test('invalid settings throw a clear error', withEnv({ PUSHUP_QUALITY: 'ultra' }, async () => {
  await assert.rejects(_run(arr, W * 3, 2), /PUSHUP_QUALITY must be one of auto, fast, high/);
}));

test('invalid device throws a clear error', withEnv({ PUSHUP_DEVICE: 'tpu' }, async () => {
  await assert.rejects(_run(arr, W * 3, 2), /PUSHUP_DEVICE must be one of auto, cpu, gpu/);
}));

test('CPU-only: default output is the fast model, byte-identical', withEnv({ PUSHUP_DEVICE: 'cpu' }, async () => {
  const [out] = await _run(arr, W * 3, 2);
  assert.ok(out.equals(await fastRef()));
}));

test('a GPU that fails to load falls back to CPU (auto)', withEnv({ PUSHUP_QUALITY: 'auto' }, async () => {
  const realCreate = ort.InferenceSession.create;
  ort.InferenceSession.create = (p, o) =>
    o.executionProviders[0] === 'cpu' ? realCreate.call(ort.InferenceSession, p, o) : Promise.reject(new Error('no GPU'));
  try {
    const [out] = await _run(arr, W * 3, 2);
    assert.ok(out.equals(await fastRef()), 'auto without a GPU must be the fast model on CPU');
  } finally {
    ort.InferenceSession.create = realCreate;
  }
}));

test('PUSHUP_DEVICE=gpu without a GPU warns and still runs on CPU', withEnv({ PUSHUP_DEVICE: 'gpu', PUSHUP_QUALITY: 'fast' }, async () => {
  const realCreate = ort.InferenceSession.create;
  ort.InferenceSession.create = (p, o) =>
    o.executionProviders[0] === 'cpu' ? realCreate.call(ort.InferenceSession, p, o) : Promise.reject(new Error('no GPU'));
  const warnings = [];
  const onWarn = (w) => warnings.push(w.message);
  process.on('warning', onWarn);
  try {
    const [out] = await _run(arr, W * 3, 2);
    await new Promise((r) => setImmediate(r));
    assert.ok(out.equals(await fastRef()));
    assert.ok(warnings.some((m) => /no GPU provider could load/.test(m)), 'expected a warning');
  } finally {
    ort.InferenceSession.create = realCreate;
    process.off('warning', onWarn);
  }
}));

test('a GPU that fails while running falls back to CPU and retries', withEnv({ PUSHUP_QUALITY: 'auto' }, async () => {
  const realCreate = ort.InferenceSession.create;
  let gpuRuns = 0;
  ort.InferenceSession.create = (p, o) => {
    if (o.executionProviders[0] === 'cpu') return realCreate.call(ort.InferenceSession, p, o);
    return Promise.resolve({
      inputNames: ['input'], outputNames: ['output'],
      run: async () => { gpuRuns++; throw new Error('device lost'); },
    });
  };
  const onWarn = () => {};
  process.on('warning', onWarn);
  try {
    const [out] = await _run(arr, W * 3, 2);
    assert.ok(gpuRuns >= 1, 'GPU session should have been tried');
    assert.ok(out.equals(await fastRef()), 'auto falls back to the fast model on CPU');
    // Later calls stay on CPU without touching the GPU again.
    const before = gpuRuns;
    await _run(arr, W * 3, 2);
    assert.strictEqual(gpuRuns, before);
  } finally {
    ort.InferenceSession.create = realCreate;
    process.off('warning', onWarn);
  }
}));

test('PUSHUP_QUALITY=high runs on CPU (Remacri, tiled)', withEnv({ PUSHUP_QUALITY: 'high', PUSHUP_DEVICE: 'cpu' }, async () => {
  const [out, stride] = await _run(arr, W * 3, 2);
  assert.strictEqual(stride, 800 * 3);
  assert.strictEqual(out.length, 800 * 600 * 3);
  assert.ok(!out.equals(await fastRef()), 'high mode must use a different model');
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  assert.ok(Math.abs(mean(out) - mean(arr)) < 3, 'colours preserved');
}));
