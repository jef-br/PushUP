'use strict';
// HP2: a valid run of bench/throughput.js and bench/cold.js ends with exit 0 and prints its table.
// Only the shape is checked, never absolute times. The configuration rows follow bench/throughput.js:
// [1 x N], [floor(N/2) x 2] when N >= 4, [N x 1], with N = os.availableParallelism().
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const run = (script, args) => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bench', script), ...args], {
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, PUSHUP_DEVICE: 'cpu' },
  });
  return { ...r, lines: r.stdout.split('\n').filter((l) => l !== '') };
};
const finite = (s) => Number.isFinite(Number(s));

test('throughput.js --seconds 0.5 --sizes 100 prints one row per configuration', () => {
  const N = os.availableParallelism();
  const expected = [[1, N], [N, 1]];
  if (N >= 4) expected.splice(1, 0, [Math.floor(N / 2), 2]);
  const r = run('throughput.js', ['--seconds', '0.5', '--sizes', '100']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(!/TypeError|Error:/.test(r.stderr), r.stderr);
  assert.match(r.lines[0], /^cpu=.* N=\d+ node=v\S+ .*seconds=0\.5 /);
  assert.deepStrictEqual(r.lines[1].trim().split(/\s+/), ['input', 'procs', 'x', 'threads', 'images', 'wall_s', 'images/s', 'vs_1xN', 'median_ms']);
  const rows = r.lines.slice(2).map((l) => l.trim().split(/\s+/));
  assert.strictEqual(rows.length, expected.length, r.stdout);
  rows.forEach((c, i) => {
    assert.strictEqual(c.length, 9, c.join(' '));
    assert.strictEqual(c[0], '100x75');
    assert.deepStrictEqual([Number(c[1]), c[2], Number(c[3])], [expected[i][0], 'x', expected[i][1]]);
    assert.ok(/^\d+$/.test(c[4]) && Number(c[4]) >= 1, `images ${c[4]}`);
    assert.ok(finite(c[5]) && finite(c[6]) && finite(c[8]), c.join(' '));
    assert.match(c[7], /^\d+(\.\d+)?x$/);
  });
  assert.strictEqual(rows[0][7], '1.00x');
});

test('cold.js --modes fast --sizes 400 --warm 1 prints one row with finite cold and warm times', () => {
  const r = run('cold.js', ['--modes', 'fast', '--sizes', '400', '--warm', '1']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(!/TypeError|Error:/.test(r.stderr), r.stderr);
  assert.strictEqual(r.lines.length, 2, r.stdout);
  assert.deepStrictEqual(r.lines[0].trim().split(/\s+/), ['mode', 'input', 'require', 'cold(1st', 'call)', 'warm', 'median', 'cold-warm', '(ms)']);
  const c = r.lines[1].trim().split(/\s+/);
  assert.deepStrictEqual(c.slice(0, 2), ['fast', '400']);
  for (const v of c.slice(2, 6)) assert.ok(finite(v), `cell ${v} in ${r.lines[1]}`);
  assert.ok(Number(c[3]) > 0 && Number(c[4]) > 0, r.lines[1]);
  assert.strictEqual(c.slice(6).join(' '), 'warm n=1');
});
