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

// BM2: edge names. These pin what parseMethod does TODAY for names that are typos or odd input, so that a
// refactor cannot change them silently. They are the current behaviour of a benchmark tool, not a contract.
test('edge names: only the exact name `lanczos` is the plain resize', () => {
  // `lanczos@0.2` is not plain Lanczos: it goes down the model path (a mutation to
  // name.startsWith('lanczos') would turn it into { kind: 'lanczos' }).
  const m = parseMethod('lanczos@0.2');
  assert.strictEqual(m.kind, 'sr');
  assert.deepStrictEqual(Object.keys(m.opts).sort(), ['lanczosMix', 'modelInputMax']);
  assert.strictEqual(m.opts.lanczosMix, 0.2);
  assert.ok(Number.isNaN(m.opts.modelInputMax), `modelInputMax ${m.opts.modelInputMax}`);
});

test('edge names: a suffix marker at index 0 is not a suffix', () => {
  // A mutation of `at > 0` / `hash > 0` to `>= 0` would give these a lanczosMix / tile key.
  for (const name of ['@0.2', '#192']) {
    const { kind, opts } = parseMethod(name);
    assert.strictEqual(kind, 'sr', name);
    assert.deepStrictEqual(Object.keys(opts), ['modelInputMax'], name);
    assert.ok(Number.isNaN(opts.modelInputMax), `${name}: modelInputMax ${opts.modelInputMax}`);
  }
});

test('edge names: `sr-` is modelInputMax 0 (Number("")), the empty string is NaN', () => {
  assert.deepStrictEqual(parseMethod('sr-'), { kind: 'sr', opts: { modelInputMax: 0 } });
  const e = parseMethod('');
  assert.strictEqual(e.kind, 'sr');
  assert.deepStrictEqual(Object.keys(e.opts), ['modelInputMax']);
  assert.ok(Number.isNaN(e.opts.modelInputMax), `modelInputMax ${e.opts.modelInputMax}`);
});

test('edge names: an empty `@` suffix is a mix of 0 (Number(""))', () => {
  assert.deepStrictEqual(parseMethod('sr-full@'), { kind: 'sr', opts: { lanczosMix: 0 } });
});
