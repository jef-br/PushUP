'use strict';
// BM4: validateMethod (bench/method.js) says which `--methods` names are well-formed, and bench/bench.js
// rejects the others with one line before any image is read. parseMethod itself is unchanged and pinned
// by test/bench-method.test.js (a typo parses to NaN there: that is why bench.js checks the names first).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');
const { parseMethod, validateMethod } = require('../bench/method.js');

const VALID = [
  'lanczos', 'sr-full', 'sr-500', 'sr-250', 'sr-1', 'sr-full#192', 'sr-full@0', 'sr-full@1', 'sr-full@1.0',
  'sr-full#192@0.2', 'sr-600#96@0.5', 'sr:models/x.onnx', 'sr:models/x.onnx#192@0', 'sr:path/remacri.onnx#192@0',
  'sr:models/4xLSDIRCompactC3.onnx@0.1',
];
// [name, what parseMethod makes of it: 'NaN' = some option is NaN, 'number' = it parses to numbers or a path]
const INVALID = [
  ['sr-ful', 'NaN'], ['sr-full2', 'NaN'], ['sr-600x', 'NaN'], ['sr-full#192x', 'NaN'], ['sr-full@0.2x', 'NaN'],
  ['lanczos@0.2', 'NaN'], ['', 'NaN'], ['@0.2', 'NaN'], ['#192', 'NaN'], ['sr-full@0.2#192', 'NaN'],
  ['sr-', 'number'], ['sr:', 'number'], ['sr-full@2', 'number'], ['sr-full@', 'number'], ['sr-full#', 'number'],
  ['sr:@0.1', 'number'], ['sr-600-1', 'number'], ['sr-full@1e-1', 'number'], ['sr-full@0x1', 'number'],
  ['sr-full@ 0.5', 'number'], ['sr-full@.5', 'number'], ['sr-full@1.', 'number'], ['sr-full@00.5', 'number'],
  ['sr-full#0', 'number'], ['sr-full#01', 'number'], ['sr-01', 'number'],
];

test('validateMethod accepts every well-formed name', () => {
  for (const n of VALID) assert.strictEqual(validateMethod(n), null, n);
});
test('validateMethod rejects every malformed name with the one-line message', () => {
  for (const [n] of INVALID) {
    assert.strictEqual(validateMethod(n),
      `unknown method ${n}; use lanczos, sr-full, sr-<max input px>, sr:<model path>, each with optional #<tile> and @<mix 0-1>`, JSON.stringify(n));
  }
});
test('the NaN / number split in the task is what parseMethod really does (parseMethod is unchanged)', () => {
  for (const [n, kind] of INVALID) {
    const opts = parseMethod(n).opts || {};
    const nan = Object.values(opts).some((v) => typeof v === 'number' && Number.isNaN(v));
    assert.strictEqual(nan ? 'NaN' : 'number', kind, JSON.stringify(n));
  }
});

let dir;
test.before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-methods-'));
  const raw = Buffer.alloc(300 * 200 * 3, 9);
  await sharp(raw, { raw: { width: 300, height: 200, channels: 3 } }).png().toFile(path.join(dir, 'a_1.png'));
});
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const BENCH = path.join(__dirname, '..', 'bench', 'bench.js');
function reject(methodsArgs, line) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [BENCH, dir, '--sizes', '200', ...methodsArgs], { encoding: 'utf8' });
  assert.ok(Date.now() - t0 < 5000, `took ${Date.now() - t0} ms`);
  assert.strictEqual(r.status, 1, r.stderr);
  assert.strictEqual(r.stdout, '');
  assert.strictEqual(r.stderr.split('\n')[0], line);
}
test('bench.js --methods sr-ful is rejected with the exact line', () => {
  reject(['--methods', 'sr-ful'], 'unknown method sr-ful; use lanczos, sr-full, sr-<max input px>, sr:<model path>, each with optional #<tile> and @<mix 0-1>');
});
test('bench.js --methods lanczos,sr-full@2 is rejected at the bad entry (before the model runs)', () => {
  reject(['--methods', 'lanczos,sr-full@2'], 'unknown method sr-full@2; use lanczos, sr-full, sr-<max input px>, sr:<model path>, each with optional #<tile> and @<mix 0-1>');
});
test('bench.js --methods without a value or with an empty entry gets the comma-list message', () => {
  const LINE = '--methods must be a comma list of method names';
  const r = spawnSync(process.execPath, [BENCH, dir, '--sizes', '200', '--methods'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, '');
  assert.strictEqual(r.stderr.split('\n')[0], LINE);
  reject(['--methods', 'lanczos,'], LINE);
  reject(['--methods', ''], LINE);
});
test('bench.js still runs the valid default-style names (lanczos)', () => {
  const r = spawnSync(process.execPath, [BENCH, dir, '--sizes', '200', '--methods', 'lanczos', '--json'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(JSON.parse(r.stdout).rows.map((x) => x.setting), ['200px lanczos']);
});
