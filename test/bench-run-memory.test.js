'use strict';
// HP3: a valid run of bench/memory.js and bench/memory-creep.js ends with exit 0 and prints its table.
// Only the shape is checked: RSS cells are finite, > 0 and below a generous 4000 MB, never a tight memory figure.
//
// Left out on purpose: bench/memory-breakdown.js. It always loads the `high` model (measured 2026-11-18 on 4 vCPU:
// 12.4 s and 882 MB peak for `--sizes 400`), and HP3 says `high` runs are never part of the test suite.
// Its argument checks are in test/throughput-breakdown-args.test.js.
const test = require('node:test');
const assert = require('node:assert');
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
const mb = (s) => /^\d+$/.test(s) && Number(s) > 0 && Number(s) < 4000;

test('memory.js --sizes 400 --high-sizes "" prints one fast row per factor', () => {
  const r = run('memory.js', ['--sizes', '400', '--high-sizes', '']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(!/TypeError|Error:/.test(r.stderr), r.stderr);
  assert.deepStrictEqual(r.lines[0].trim().split(/\s+/), ['mode', 'input', 'factor', 'rss_require', 'rss_after_call', 'peak_sampled', 'max_rss', '(MB)']);
  const rows = r.lines.slice(1).map((l) => l.trim().split(/\s+/));
  assert.deepStrictEqual(rows.map((c) => c[2]), ['1', '1.5'], r.stdout);
  for (const c of rows) {
    assert.strictEqual(c.length, 7, c.join(' '));
    assert.deepStrictEqual(c.slice(0, 2), ['fast', '400']);
    for (const v of c.slice(3)) assert.ok(mb(v), `cell ${v} in ${c.join(' ')}`);
  }
});

test('memory-creep.js --calls 6 --size 400 prints the per-call RSS and a summary', () => {
  const r = run('memory-creep.js', ['--calls', '6', '--size', '400']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(!/TypeError|Error:/.test(r.stderr), r.stderr);
  assert.strictEqual(r.lines.length, 5, r.stdout);
  assert.match(r.lines[0], /^fast, CPU, 400x300, factor 1\.0, 6 sequential calls, arena on \(MB\)$/);
  assert.match(r.lines[1], /^after call(\s+\d+)+$/);
  const rss = r.lines[2].trim().split(/\s+/);
  assert.strictEqual(rss[0], 'RSS');
  assert.ok(rss.length > 2, r.lines[2]);
  for (const v of rss.slice(1)) assert.ok(mb(v), `RSS cell ${v}`);
  assert.match(r.lines[3], /^max RSS \d+ MB; RSS last vs call 5: [+-]\d+ MB \(-?\d+(\.\d+)?%\), -?\d+(\.\d+)? MB per call$/);
  assert.match(r.lines[4], /^median call \d+ ms$/);
});
