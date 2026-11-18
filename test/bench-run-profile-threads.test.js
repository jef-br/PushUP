'use strict';
// HP1: a valid run of bench/profile.js and bench/threads.js ends with exit 0 and prints its table:
// one info line, one header line, then one row per size. Only the shape is checked, never absolute times,
// and the CPU count is not assumed (the N-thread row uses os.availableParallelism()).
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

test('profile.js --runs 1 --sizes 400 prints the info line, the header and one 400x300 row', () => {
  const r = run('profile.js', ['--runs', '1', '--sizes', '400']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(!/TypeError|Error:/.test(r.stderr), r.stderr);
  assert.strictEqual(r.lines.length, 3, r.stdout);
  assert.match(r.lines[0], /^cpus=\d+ node=v\S+ factor=1\.5 runs=1 /);
  assert.deepStrictEqual(r.lines[1].trim().split(/\s+/), ['size', 'total(upscale)', 'toTensor', 'inference', 'fromTensor', 'resizeDown', 'lanczosMix']);
  const cells = r.lines[2].trim().split(/\s+/);
  assert.strictEqual(cells.length, 7, r.lines[2]);
  assert.strictEqual(cells[0], '400x300');
  for (const c of cells.slice(1)) assert.ok(finite(c) && Number(c) >= 0, `cell ${c}`);
});

test('threads.js --runs 1 --sizes 400 --threads 1 prints rows for 1 and N threads with identical bytes', () => {
  const N = os.availableParallelism();
  const r = run('threads.js', ['--runs', '1', '--sizes', '400', '--threads', '1']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(!/TypeError|Error:/.test(r.stderr), r.stderr);
  assert.match(r.lines[0], /^cpu=/);
  assert.deepStrictEqual(r.lines[1].trim().split(/\s+/), ['input', 'threads', 'median_ms', 'vs_N', 'bytes_equal_N', 'max_abs_diff']);
  const rows = r.lines.slice(2).map((l) => l.trim().split(/\s+/));
  const threads = rows.map((c) => Number(c[1]));
  assert.deepStrictEqual(threads, N === 1 ? [1] : [1, N], r.stdout);
  for (const c of rows) {
    assert.strictEqual(c.length, 6, c.join(' '));
    assert.strictEqual(c[0], '400x300');
    assert.ok(finite(c[2]) && Number(c[2]) > 0, `median_ms ${c[2]}`);
    assert.match(c[3], /^\d+(\.\d+)?x$/);
    assert.strictEqual(c[4], 'true');
    assert.strictEqual(c[5], '0');
  }
});
