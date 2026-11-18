'use strict';
// BE3: bench/bench.js rejects a missing or bad directory and a bad --limit / --sizes with one clear line
// (before any image is read, < 5 s); accepted values still run (model-free `lanczos` method, tiny images).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');

const BENCH = path.join(__dirname, '..', 'bench', 'bench.js');
const run = (args) => spawnSync(process.execPath, [BENCH, ...args], { encoding: 'utf8' });
const LIMIT = '--limit must be a positive integer';
const SIZES = '--sizes must be a comma list of integers from 100 to 4000';
const USAGE_START = 'usage: node bench/bench.js <dir-of-HR-images>';

let dir; // a directory with one image
let emptyDir; // no images
let textDir; // only a non-image file
test.before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-bench-args-'));
  emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-bench-empty-'));
  textDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-bench-text-'));
  fs.writeFileSync(path.join(textDir, 'notes.txt'), 'not an image');
  const raw = Buffer.alloc(300 * 200 * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 31) & 255;
  await sharp(raw, { raw: { width: 300, height: 200, channels: 3 } }).png().toFile(path.join(dir, 'a_1.png'));
});
test.after(() => { for (const d of [dir, emptyDir, textDir]) fs.rmSync(d, { recursive: true, force: true }); });

function rejected(args, status, firstLine, startsWith = false) {
  const t0 = Date.now();
  const r = run(args);
  assert.ok(Date.now() - t0 < 5000, `took ${Date.now() - t0} ms`);
  assert.strictEqual(r.status, status, r.stderr);
  assert.strictEqual(r.stdout, '');
  const line = r.stderr.split('\n')[0];
  if (startsWith) assert.ok(line.startsWith(firstLine), line);
  else assert.strictEqual(line, firstLine);
}

test('no directory argument is a usage error (exit 2)', () => rejected([], 2, USAGE_START, true));
test('a first argument that is a flag is a usage error (exit 2)', () => {
  rejected(['--sizes', '400'], 2, USAGE_START, true);
  rejected(['--json'], 2, USAGE_START, true);
});
test('a directory that does not exist', () => {
  const d = path.join(os.tmpdir(), 'pushup-no-such-dir');
  rejected([d, '--methods', 'lanczos'], 1, `${d} does not exist; run bash bench/fetch_testset.sh`);
});
test('a file instead of a directory', () => {
  const f = path.join(textDir, 'notes.txt');
  rejected([f], 1, `${f} is not a directory`);
});
test('a directory without images', () => {
  rejected([emptyDir, '--methods', 'lanczos', '--sizes', '400'], 1, `no images in ${emptyDir}`);
  rejected([textDir, '--methods', 'lanczos', '--sizes', '400'], 1, `no images in ${textDir}`);
});
for (const v of ['0', '-1', 'abc', '1.5', '', '1e3']) {
  test(`--limit ${JSON.stringify(v)} is rejected`, () => rejected([dir, '--limit', v], 1, LIMIT));
}
test('--limit without a value is rejected', () => rejected([dir, '--limit'], 1, LIMIT));
for (const v of ['99', '4001', '400,', ',400', '400,abc', '400.5', '', '0', '1', '-400']) {
  test(`--sizes ${JSON.stringify(v)} is rejected`, () => rejected([dir, '--sizes', v], 1, SIZES));
}
test('--sizes without a value is rejected', () => rejected([dir, '--sizes'], 1, SIZES));

for (const sizes of ['100', '200', '4000']) {
  test(`--sizes ${sizes} with --methods lanczos runs on one image`, () => {
    const r = run([dir, '--methods', 'lanczos', '--sizes', sizes, '--json']);
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.images, 1);
    assert.deepStrictEqual(out.rows.map((x) => x.setting), [`${sizes}px lanczos`]);
  });
}
test('--limit 1 is accepted', () => {
  const r = run([dir, '--methods', 'lanczos', '--sizes', '200', '--limit', '1', '--json']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(JSON.parse(r.stdout).images, 1);
});
