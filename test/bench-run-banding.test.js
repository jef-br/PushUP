'use strict';
// BL41: bench/banding.js runs (one small case) and its helpers measure what they claim. The full table is in
// docs/BANDING.md. Measured 2026-11-24 on 4 vCPU, CPU: the single case below takes about 3 s; timeout 120 s.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeImage, lineStats, middleRow, segment, parseArgs } = require('../bench/banding.js');

test('banding.js prints the table header and one row for one case', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bench', 'banding.js'),
    '--sizes', '400x300', '--factors', '1', '--grads', 'hramp', '--noise', '0'], {
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, PUSHUP_DEVICE: 'cpu' },
  });
  assert.strictEqual(r.status, 0, r.stderr);
  const lines = r.stdout.split('\n').filter((l) => l !== '');
  assert.match(lines[0], /^\| size \| factor \| gradient \| noise \| out \| levels \(model\/lanczos\) \| longest run px \(model\/lanczos\) \| roughness \(model\/lanczos\) \| banded \|$/);
  assert.match(lines[1], /^\|---\|/);
  assert.strictEqual(lines.length, 3, r.stdout);
  const c = lines[2].split('|').slice(1, -1).map((x) => x.trim());
  assert.deepStrictEqual(c.slice(0, 5), ['400x300', '1', 'hramp', 'none', '400x300']);
  assert.match(c[5], /^\d+\/\d+$/);
  assert.match(c[6], /^\d+\/\d+$/);
  assert.match(c[7], /^\d+\.\d\d\/\d+\.\d\d$/);
  assert.match(c[8], /^(yes|no)$/);
});

test('lineStats counts levels, the longest run and the roughness', () => {
  const s = lineStats([5, 5, 5, 6, 6, 7]);
  assert.strictEqual(s.levels, 3);
  assert.strictEqual(s.longest, 3);
  assert.strictEqual(s.rough, 0.75); // |5-10+5|, |5-10+6|, |5-12+6|, |6-12+7| = 0,1,1,1 over 4
  const smooth = lineStats([10, 11, 12, 13, 14, 15]);
  const stepped = lineStats([10, 10, 10, 14, 14, 14]);
  assert.strictEqual(smooth.longest, 1);
  assert.strictEqual(smooth.rough, 0);
  assert.strictEqual(stepped.longest, 3);
  assert.ok(stepped.rough > smooth.rough, 'a step has a larger second difference than a straight ramp');
});

test('makeImage is grey, seeded and spans the gradient', () => {
  const a = makeImage('hramp', 400, 10, 1), b = makeImage('hramp', 400, 10, 1);
  assert.deepStrictEqual(a, b);
  for (let i = 0; i < a.length; i += 3) assert.ok(a[i] === a[i + 1] && a[i] === a[i + 2]);
  const flat = makeImage('hramp', 400, 10, 0);
  assert.strictEqual(flat[0], 255);
  assert.strictEqual(flat[399 * 3], 200);
  assert.strictEqual(makeImage('radial', 400, 300, 0)[(150 * 400 + 200) * 3], 150);
  assert.throws(() => makeImage('nope', 4, 4, 0), /unknown gradient/);
});

test('middleRow, segment and parseArgs', () => {
  const img = Uint8Array.from([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6]); // 3x2
  assert.deepStrictEqual(middleRow(img, 3, 2), [4, 5, 6]);
  assert.deepStrictEqual(middleRow(img, 3, 2, 1, 3), [5, 6]);
  assert.deepStrictEqual(segment('hramp', 400, 600, 1.5), [0, 600]);
  assert.deepStrictEqual(segment('radial', 400, 600, 1.5), [120, 300]);
  assert.deepStrictEqual(parseArgs(['--sizes', '400x300', '--factors', '1,1.5']).factors, [1, 1.5]);
  assert.throws(() => parseArgs(['--bogus', '1']), /usage/);
});
