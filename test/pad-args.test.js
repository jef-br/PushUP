'use strict';
// PD1: bench/pad.js rejects a bad --limit, a missing directory, an empty directory and a directory with no
// images, with exit 1 and a one-line message, before any image is read and before the model is loaded
// (no stdout, well under 5 s).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bench', 'pad.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-pad-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const emptyDir = path.join(tmp, 'empty');
fs.mkdirSync(emptyDir);
const textDir = path.join(tmp, 'text-only');
fs.mkdirSync(textDir);
fs.writeFileSync(path.join(textDir, 'notes.txt'), 'not an image');
fs.writeFileSync(path.join(textDir, 'photo.png.bak'), 'not an image either');
const missingDir = path.join(tmp, 'does-not-exist');

function run(args) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 20000 });
  return { status: r.status, out: r.stdout, firstErr: r.stderr.split('\n')[0], elapsed: Date.now() - t0 };
}

const LIMIT = '--limit must be a positive integer';
for (const limit of ['0', '-1', '1.5', 'abc']) {
  test(`pad.js --limit ${limit} exits 1 naming --limit`, () => {
    // A directory that exists, so only --limit can be the reason. (The order of the --limit and the
    // directory checks is not pinned: no case gives both a bad value and a bad directory.)
    const r = run(['--dir', emptyDir, '--limit', limit]);
    assert.strictEqual(r.status, 1);
    assert.strictEqual(r.firstErr, LIMIT);
    assert.strictEqual(r.out, '', 'nothing on stdout: the model was not loaded');
    assert.ok(r.elapsed < 5000, `took ${r.elapsed} ms`);
  });
}

test('pad.js --dir that does not exist exits 1 and names the path', () => {
  const r = run(['--dir', missingDir]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.firstErr, `${missingDir} does not exist; run bash bench/fetch_testset.sh`);
  assert.strictEqual(r.out, '');
  assert.ok(r.elapsed < 5000, `took ${r.elapsed} ms`);
});

test('pad.js --dir that is empty exits 1 with "no images in <dir>"', () => {
  const r = run(['--dir', emptyDir]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.firstErr, `no images in ${emptyDir}`);
  assert.strictEqual(r.out, '');
  assert.ok(r.elapsed < 5000, `took ${r.elapsed} ms`);
});

test('pad.js --dir with only non-image files exits 1 with "no images in <dir>"', () => {
  const r = run(['--dir', textDir]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.firstErr, `no images in ${textDir}`);
  assert.strictEqual(r.out, '');
  assert.ok(r.elapsed < 5000, `took ${r.elapsed} ms`);
});
