'use strict';
// R5: device-fallback branches not covered by device.test.js. No real GPU: the GPU session is
// a stub (as in device.test.js), so these run wherever _gpuProviders() is non-empty (win32,
// linux x64, darwin arm64 — CI and the cloud sandbox are linux x64).
const test = require('node:test');
const assert = require('node:assert');
const ort = require('onnxruntime-node');
const { _run, _reset, _MODES } = require('../src');

// Small image keeps the tiled Remacri runs cheap on CPU: largest side 400, short side 12.
const W = 400, H = 12;
const arr = new Uint8Array(W * H * 3);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 3;
  arr[i] = (x * 5 + y * 17) & 255;
  arr[i + 1] = (128 + 90 * Math.sin(x / 7) * Math.cos(y / 2)) | 0;
  arr[i + 2] = (x ^ (y * 3)) & 255;
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

// Stub InferenceSession.create: CPU sessions are real; GPU sessions either fail to load
// (gpu: 'load') or load and then fail on every run (gpu: 'run'). Records every call.
async function withStubs(gpu, fn) {
  const realCreate = ort.InferenceSession.create;
  const log = { cpuCreates: [], gpuCreates: [], gpuRuns: 0 };
  ort.InferenceSession.create = (p, o) => {
    if (o.executionProviders[0] === 'cpu') {
      log.cpuCreates.push(p);
      return realCreate.call(ort.InferenceSession, p, o);
    }
    log.gpuCreates.push(p);
    if (gpu === 'load') return Promise.reject(new Error('no GPU'));
    return Promise.resolve({
      inputNames: ['input'], outputNames: ['output'],
      run: async () => { log.gpuRuns++; throw new Error('device lost'); },
    });
  };
  const warnings = [];
  const onWarn = (w) => warnings.push(w.message);
  process.on('warning', onWarn);
  try { await fn(log, warnings); } finally {
    ort.InferenceSession.create = realCreate;
    process.off('warning', onWarn);
  }
}

// What each mode gives on CPU, computed with the bench entry point (no env involved).
const refs = {};
async function cpuRef(mode) {
  if (!refs[mode]) {
    const m = _MODES[mode];
    [refs[mode]] = await _run(arr, W * 3, 1.5, { modelPath: m.modelPath, tile: m.tile, lanczosMix: m.lanczosMix });
  }
  return refs[mode];
}

test('high + GPU failing at run time retries on CPU with the Remacri model, not the fast one',
  withEnv({ PUSHUP_QUALITY: 'high', PUSHUP_DEVICE: 'auto' }, () => withStubs('run', async (log, warnings) => {
    const [out, stride] = await _run(arr, W * 3, 1.5);
    assert.deepStrictEqual(log.gpuCreates, [_MODES.high.modelPath], 'GPU session is created for the high model');
    assert.ok(log.gpuRuns >= 1, 'the GPU session was run');
    assert.deepStrictEqual(log.cpuCreates, [_MODES.high.modelPath], 'CPU retry must load Remacri only');
    assert.ok(warnings.some((m) => /GPU inference failed .*falling back to CPU/.test(m)), 'expected a warning');
    assert.strictEqual(stride, 600 * 3);
    assert.ok(out.equals(await cpuRef('high')), 'retry output = high mode on CPU (tiled, no mix)');
    assert.ok(!out.equals(await cpuRef('fast')), 'and differs from the fast mode');
  })));

test('high: after one run-time GPU failure, later calls make no GPU create and no GPU run',
  withEnv({ PUSHUP_QUALITY: 'high', PUSHUP_DEVICE: 'auto' }, () => withStubs('run', async (log) => {
    await _run(arr, W * 3, 1.5);
    const creates = log.gpuCreates.length;
    const runs = log.gpuRuns;
    assert.strictEqual(creates, 1);
    // Even a model whose GPU session was never created stays on CPU (no new create).
    process.env.PUSHUP_QUALITY = 'fast';
    const [fastOut] = await _run(arr, W * 3, 1.5);
    process.env.PUSHUP_QUALITY = 'high';
    const [highOut] = await _run(arr, W * 3, 1.5);
    assert.strictEqual(log.gpuCreates.length, creates, 'no further GPU create call');
    assert.strictEqual(log.gpuRuns, runs, 'no further GPU run');
    assert.ok(fastOut.equals(await cpuRef('fast')));
    assert.ok(highOut.equals(await cpuRef('high')));
    // Sticky only until _reset(): then the GPU is tried again.
    _reset();
    await _run(arr, W * 3, 1.5);
    assert.strictEqual(log.gpuCreates.length, creates + 1, '_reset() clears the fallback');
  })));

test('setting values are trimmed and case-insensitive',
  withEnv({ PUSHUP_QUALITY: ' FAST ', PUSHUP_DEVICE: 'Cpu' }, () => withStubs('load', async (log) => {
  const [fastOut] = await _run(arr, W * 3, 1.5);
  assert.ok(fastOut.equals(await cpuRef('fast')), "' FAST ' + 'Cpu' = fast on CPU");
  assert.strictEqual(log.gpuCreates.length, 0, "'Cpu' must not try a GPU");

  process.env.PUSHUP_QUALITY = 'High';
  process.env.PUSHUP_DEVICE = ' CPU';
  const [highOut] = await _run(arr, W * 3, 1.5);
  assert.ok(highOut.equals(await cpuRef('high')), "'High' + ' CPU' = high on CPU");
  assert.strictEqual(log.gpuCreates.length, 0);
})));

test('an empty setting means auto', withEnv({ PUSHUP_QUALITY: '', PUSHUP_DEVICE: '' }, () => withStubs('load', async (log, warnings) => {
  const [out] = await _run(arr, W * 3, 1.5);
  // auto device: a GPU is tried (for the high model, since auto quality wants high on a GPU) ...
  assert.deepStrictEqual(log.gpuCreates, [_MODES.high.modelPath], "'' device = auto: GPU is tried");
  // ... and auto quality falls back to fast on CPU, silently (only PUSHUP_DEVICE=gpu warns).
  assert.ok(out.equals(await cpuRef('fast')), "'' quality = auto: fast on CPU");
  assert.ok(!warnings.some((m) => /no GPU provider could load/.test(m)), 'auto must not warn');
})));
