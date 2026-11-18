'use strict';
// R7: run() can shrink the input before the model (opts.modelInputMax, used by bench/bench.js
// methods like `sr-300`), but never below ceil(target / 4), what a 4x model needs to reach the
// target size. These tests pin that path with the `fast` model on CPU and small images.
const test = require('node:test');
const assert = require('node:assert');
const ort = require('onnxruntime-node');
const { _run, _reset, _MODES } = require('../src');

const modelPath = _MODES.fast.modelPath; // tile = Infinity by default: one session.run per call

function image(w, h) {
  const arr = new Uint8Array(w * h * 3);
  for (let i = 0; i < arr.length; i++) arr[i] = (i * 37 + (i >> 5)) & 255;
  return arr;
}

// Wrap the real sessions so each session.run records the input tensor's dims [1, 3, h, w].
async function withRecordedRuns(fn) {
  const orig = ort.InferenceSession.create;
  const dims = [];
  ort.InferenceSession.create = async (...args) => {
    const s = await orig.apply(ort.InferenceSession, args);
    return {
      inputNames: s.inputNames,
      outputNames: s.outputNames,
      run: (feeds) => {
        dims.push(feeds[s.inputNames[0]].dims);
        return s.run(feeds);
      },
    };
  };
  _reset(); // forget cached sessions, so the wrapped create is used
  try {
    await fn(dims);
  } finally {
    ort.InferenceSession.create = orig;
    _reset();
  }
}

const W = 400, H = 12;
const arr = image(W, H);

test('(a) modelInputMax 200 at factor 1.0: output keeps the contract size and stride', () =>
  withRecordedRuns(async (dims) => {
    const [out, stride] = await _run(arr, W * 3, 1.0, { modelPath, modelInputMax: 200 });
    // target = 400 -> output 400 x 12, tightly packed
    assert.strictEqual(stride, 400 * 3);
    assert.strictEqual(out.length, 400 * 12 * 3);
    // floor ceil(400 / 4) = 100 < 200, so the model saw the 200 px version
    assert.strictEqual(dims.length, 1);
    assert.strictEqual(Math.max(dims[0][2], dims[0][3]), 200);
  }));

test('(b) the model input is max(ceil(target / 4), modelInputMax)', () =>
  withRecordedRuns(async (dims) => {
    // factor 2.5 -> target 1000; ceil(1000 / 4) = 250 > modelInputMax 100, so 250 wins
    const [out, stride] = await _run(arr, W * 3, 2.5, { modelPath, modelInputMax: 100 });
    assert.strictEqual(dims.length, 1);
    const [, c, h, w] = dims[0];
    assert.strictEqual(c, 3);
    assert.strictEqual(Math.max(h, w), 250);
    assert.strictEqual(w, 250);
    assert.strictEqual(h, Math.round((H * 250) / W)); // aspect kept: round(7.5) = 8
    assert.strictEqual(stride, 1000 * 3);
    assert.strictEqual(out.length, 1000 * 30 * 3);
  }));

test('(c) modelInputMax >= the largest input side leaves the model input at full size', () =>
  withRecordedRuns(async (dims) => {
    for (const modelInputMax of [400, 800, Infinity]) {
      dims.length = 0;
      await _run(arr, W * 3, 1.5, { modelPath, modelInputMax });
      assert.strictEqual(dims.length, 1, `modelInputMax ${modelInputMax}`);
      assert.deepStrictEqual(dims[0], [1, 3, H, W], `modelInputMax ${modelInputMax}`);
    }
  }));
