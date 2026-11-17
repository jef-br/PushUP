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

// validateMethod(name): null when `name` is a well-formed method name, else a one-line message.
// parseMethod accepts anything (a typo gives NaN, `sr-` gives 0, `sr-full@2` an out-of-range mix) and its
// results are pinned by test/bench-method.test.js, so bench.js checks the names with this first.
// Valid: lanczos | sr-full | sr-<n> | sr:<path>, the sr forms with an optional #<tile> and then @<mix 0-1>.
// The split is the same as parseMethod's (`@` first, then `#`), so a model path with `@` or `#` is not usable.
const SIZE = /^[1-9]\d*$/;
const MIX = /^(0(\.\d+)?|1(\.0+)?)$/;
function validateMethod(name) {
  const msg = `unknown method ${name}; use lanczos, sr-full, sr-<max input px>, sr:<model path>, each with optional #<tile> and @<mix 0-1>`;
  if (name === 'lanczos') return null;
  let base = name;
  const at = base.indexOf('@');
  if (at > 0) { if (!MIX.test(base.slice(at + 1))) return msg; base = base.slice(0, at); }
  const hash = base.indexOf('#');
  if (hash > 0) { if (!SIZE.test(base.slice(hash + 1))) return msg; base = base.slice(0, hash); }
  if (base === 'sr-full' || /^sr-[1-9]\d*$/.test(base) || (base.startsWith('sr:') && base.length > 3)) return null;
  return msg;
}

module.exports = { parseMethod, validateMethod };
