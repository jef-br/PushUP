'use strict';
// BM1: the `bench/bench.js --methods` names are parsed by bench/method.js; a wrong parse would
// silently benchmark the wrong setting.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { parseMethod } = require('../bench/method.js');

test('lanczos is the plain resize, not a model run', () => {
  assert.deepStrictEqual(parseMethod('lanczos'), { kind: 'lanczos' });
});

test('sr-full runs the model on the whole input with no options', () => {
  assert.deepStrictEqual(parseMethod('sr-full'), { kind: 'sr', opts: {} });
});

test('sr-<px> sets modelInputMax', () => {
  assert.deepStrictEqual(parseMethod('sr-600'), { kind: 'sr', opts: { modelInputMax: 600 } });
  assert.deepStrictEqual(parseMethod('sr-250'), { kind: 'sr', opts: { modelInputMax: 250 } });
});

test('@<mix> sets lanczosMix and #<tile> sets tile', () => {
  assert.deepStrictEqual(parseMethod('sr-full@0.2'), { kind: 'sr', opts: { lanczosMix: 0.2 } });
  assert.deepStrictEqual(parseMethod('sr-full@0'), { kind: 'sr', opts: { lanczosMix: 0 } });
  assert.deepStrictEqual(parseMethod('sr-full#192'), { kind: 'sr', opts: { tile: 192 } });
  assert.deepStrictEqual(parseMethod('sr-600@0.5'), { kind: 'sr', opts: { modelInputMax: 600, lanczosMix: 0.5 } });
});

test('the supported order is #tile then @mix', () => {
  assert.deepStrictEqual(parseMethod('sr-full#192@0.2'), { kind: 'sr', opts: { lanczosMix: 0.2, tile: 192 } });
});

test('known quirk: @mix before #tile loses the tile and gives a NaN mix', () => {
  // `@` is cut first, so the mix is Number('0.2#192'). Pinned as it is today; do not "fix" the
  // parse without a task (it would change what existing benchmark commands measure).
  const { kind, opts } = parseMethod('sr-full@0.2#192');
  assert.strictEqual(kind, 'sr');
  assert.deepStrictEqual(Object.keys(opts), ['lanczosMix']);
  assert.ok(Number.isNaN(opts.lanczosMix), `lanczosMix ${opts.lanczosMix}`);
  assert.ok(!('tile' in opts) && !('modelInputMax' in opts));
});

test('sr:<path> resolves the model path to an absolute path', () => {
  const m = parseMethod('sr:models/4xLSDIRCompactC3.onnx');
  assert.strictEqual(m.kind, 'sr');
  assert.strictEqual(m.opts.modelPath, path.resolve('models/4xLSDIRCompactC3.onnx'));
  assert.ok(path.isAbsolute(m.opts.modelPath));
  assert.ok(!('modelInputMax' in m.opts));
  const withMix = parseMethod('sr:models/x.onnx#192@0.1');
  assert.deepStrictEqual(withMix.opts, { lanczosMix: 0.1, tile: 192, modelPath: path.resolve('models/x.onnx') });
});
