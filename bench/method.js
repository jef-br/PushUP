'use strict';
// Parse a `bench/bench.js --methods` name. Pure, so a test can require it.
//   lanczos                      plain Lanczos resize
//   sr-full | sr-<maxInputPx>    the model, on the whole input / an input shrunk to <maxInputPx>
//   sr:<path/to/model.onnx>      a model file (resolved to an absolute path)
// Each sr name takes an optional `#<tile>` suffix, then an optional `@<lanczosMix>`:
//   sr-full#192@0.2. The `@` part is cut first, so `sr-full@0.2#192` is NOT the same: its mix is
//   Number('0.2#192') = NaN and the tile is lost (kept as it was; see test/bench-method.test.js).
// Returns { kind: 'lanczos' } or { kind: 'sr', opts } where opts is the options object for `_run`.
const path = require('node:path');

function parseMethod(name) {
  if (name === 'lanczos') return { kind: 'lanczos' };
  const opts = {};
  const at = name.indexOf('@');
  if (at > 0) { opts.lanczosMix = Number(name.slice(at + 1)); name = name.slice(0, at); }
  const hash = name.indexOf('#');
  if (hash > 0) { opts.tile = Number(name.slice(hash + 1)); name = name.slice(0, hash); }
  if (name.startsWith('sr:')) opts.modelPath = path.resolve(name.slice(3));
  else if (name !== 'sr-full') opts.modelInputMax = Number(name.split('-')[1]);
  return { kind: 'sr', opts };
}

module.exports = { parseMethod };
