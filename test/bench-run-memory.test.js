'use strict';
// HP3: a valid run of bench/memory.js and bench/memory-creep.js ends with exit 0 and prints its table.
// Only the shape is checked: RSS cells are finite, > 0 and below a generous 4000 MB, never a tight memory figure.
//
// Opt-in (BL5): bench/memory-breakdown.js. It always loads the `high` model, and HP3 says `high` runs are never
// part of the default suite, so its valid run only happens with PUSHUP_SLOW_TESTS=1 (measured 2026-11-19 on 4 vCPU,
// PUSHUP_DEVICE=cpu, `--sizes 400`, 3 runs: 15.2 s, 15.8 s, 15.5 s; 882 MB peak). `--arena` (BL33) is a second opt-in case: it
// runs the model again twice per size (measured 2026-11-22, 4 vCPU: 47.3 s and 47.2 s in total). Its argument checks are in
// test/throughput-breakdown-args.test.js.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const run = (script, args, timeout = 30000) => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bench', script), ...args], {
    encoding: 'utf8',
    timeout,
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

// Own timeout of 90 s (about 5.7x the longest measured run, above the 60 s floor); every other case keeps its 30 s.
test('memory-breakdown.js --sizes 400 prints the RSS table and the arithmetic table',
  { skip: process.env.PUSHUP_SLOW_TESTS === '1' ? false : 'set PUSHUP_SLOW_TESTS=1' }, () => {
    const r = run('memory-breakdown.js', ['--sizes', '400'], 90000);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(!/TypeError|Error:/.test(r.stderr), r.stderr);
    assert.deepStrictEqual(r.lines[0], 'input   rss_require  rss_session  peak_sampled  max_rss  rss_after_call  (MB)');
    const row = r.lines[1].trim().split(/\s+/);
    assert.strictEqual(row.length, 6, r.lines[1]);
    assert.strictEqual(row[0], '400x300');
    for (const v of row.slice(1)) assert.ok(mb(v), `cell ${v} in ${r.lines[1]}`);
    assert.ok(Number(row[2]) >= Number(row[1]), 'rss_session >= rss_require');
    assert.match(r.lines[2], /^whole-image arrays and tiles/);
    assert.deepStrictEqual(r.lines[3].trim().split(/\s+/).slice(0, 3), ['input', 'tiles', 'largest_tile']);
    const geo = r.lines[4].trim().split(/\s+/);
    assert.strictEqual(geo[0], '400x300');
    assert.ok(Number(geo[1]) > 0, r.lines[4]);
    assert.strictEqual(r.lines.length, 5, r.stdout); // one size: no "max_rss growth" line
    assert.ok(!r.stdout.includes('max_rss growth'));
  });

// BL33: `--arena` adds the ORT-only comparison (two child processes per size, `--tiles <size> arena|noarena`). Own timeout of
// 240 s (about 5x the 47 s measured alone). Only the shape is checked: no RSS figure is compared with another (arena off is not
// asserted to be lower), and the numbers of the arithmetic table are not asserted either.
test('memory-breakdown.js --sizes 400 --arena prints the ORT-only arena comparison',
  { skip: process.env.PUSHUP_SLOW_TESTS === '1' ? false : 'set PUSHUP_SLOW_TESTS=1' }, () => {
    const r = run('memory-breakdown.js', ['--sizes', '400', '--arena'], 240000);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(!/TypeError|Error:|FAILED/.test(r.stderr + r.stdout), r.stderr + r.stdout);
    const i = r.lines.indexOf('ORT-only tile loop on the Remacri model, max RSS (MB), shipped session options vs CPU arena off:');
    assert.ok(i >= 0, r.stdout);
    assert.strictEqual(r.lines[i + 1], 'input   arena_on  arena_off');
    const row = r.lines[i + 2].trim().split(/\s+/);
    assert.strictEqual(row[0], '400x300', r.lines[i + 2]);
    assert.ok(mb(row[1]), `arena_on cell ${row[1]}`);
    assert.ok(mb(row[2]), `arena_off cell ${row[2]}`);
    assert.match(r.lines[i + 2], /\(\d+ tiles\)$/);
    assert.strictEqual(r.lines.length, i + 3, r.stdout); // one size: one row, nothing after it
  });
