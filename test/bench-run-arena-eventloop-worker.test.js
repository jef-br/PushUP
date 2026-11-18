'use strict';
// HP4: a valid run of bench/arena.js, bench/eventloop.js and bench/worker.js (all `fast`, 400 px, one run/call)
// ends with exit 0 and prints its table. Only the shape and the byte-equality claims are checked, never times,
// tick counts or memory figures. Measured 2026-11-18 on 4 vCPU: arena.js 2.4 s, eventloop.js 2.0 s, worker.js 2.2 s.
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
const cells = (l) => l.trim().split(/\s+/);
const finite = (s) => Number.isFinite(Number(s));

test('arena.js --runs 1 --cases fast:400 prints arena on and off, with identical output bytes', () => {
  const r = run('arena.js', ['--runs', '1', '--cases', 'fast:400']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(!/TypeError|Error:/.test(r.stderr), r.stderr);
  assert.match(r.lines[0], /^cpu=.* node=v\S+ onnxruntime-node=\S+ runs=1$/);
  assert.deepStrictEqual(cells(r.lines[1]), ['case', 'arena', 'median_ms', 'max_rss_MB', 'vs_on_time', 'bytes_equal_on', 'max_abs_diff']);
  assert.strictEqual(r.lines.length, 4, r.stdout);
  const on = cells(r.lines[2]);
  const off = cells(r.lines[3]);
  assert.deepStrictEqual(on.slice(0, 3), ['fast', '400x300', 'on']);
  assert.deepStrictEqual(off.slice(0, 3), ['fast', '400x300', 'off']);
  for (const c of [on, off]) {
    assert.strictEqual(c.length, 8, c.join(' '));
    assert.ok(finite(c[3]) && Number(c[3]) > 0 && finite(c[4]) && Number(c[4]) > 0, c.join(' '));
    assert.match(c[5], /^\d+(\.\d+)?x$/);
  }
  assert.deepStrictEqual(on.slice(6), ['-', '-']);
  assert.deepStrictEqual(off.slice(6), ['true', '0']); // PERF.md: the arena changes speed and memory, not the output
  assert.strictEqual(on[5], '1.00x');
});

test('eventloop.js --sizes 400 --calls 1 --quality fast prints the idle, upscale and session.run rows', () => {
  const r = run('eventloop.js', ['--sizes', '400', '--calls', '1', '--quality', 'fast']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(!/TypeError|Error:/.test(r.stderr), r.stderr);
  assert.match(r.lines[0], /^fast, CPU, factor 1\.5, probe every 2 ms, 1 call\(s\) per row; /);
  assert.deepStrictEqual(cells(r.lines[1]), ['case', 'size', 'threads', 'call_ms', 'ticks', 'max_gap_ms', 'blocked_ms']);
  const rows = r.lines.slice(2);
  assert.strictEqual(rows.length, 3, r.stdout);
  assert.match(rows[0], /^idle 300ms\s+-\s+-\s+/);
  const idle = rows[0].replace(/^idle 300ms/, '').trim().split(/\s+/);
  assert.deepStrictEqual(idle.slice(0, 2), ['-', '-']);
  for (const v of idle.slice(2)) assert.ok(finite(v), rows[0]);
  const [up, sr] = [cells(rows[1]), cells(rows[2])];
  assert.deepStrictEqual(up.slice(0, 3), ['upscale', '400', 'default']);
  assert.deepStrictEqual(sr.slice(0, 3), ['session.run', '400', 'default']);
  for (const c of [up, sr]) {
    assert.strictEqual(c.length, 7, c.join(' '));
    for (const v of c.slice(3)) assert.ok(finite(v) && Number(v) >= 0, c.join(' '));
    assert.ok(Number(c[3]) > 0, c.join(' ')); // call_ms
  }
});

test('worker.js --sizes 400 --calls 1 prints a direct and a worker row, and says the bytes are equal', () => {
  const r = run('worker.js', ['--sizes', '400', '--calls', '1']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(!/TypeError|Error:/.test(r.stderr), r.stderr);
  assert.match(r.lines[0], /^fast, CPU, factor 1\.5, 1 calls after the first; probe every 2 ms on the main thread; one fresh process per row$/);
  assert.deepStrictEqual(cells(r.lines[1]), ['mode', 'size', 'first_ms', 'median_ms', 'ticks(med)', 'max_gap_ms(med)', 'RSS_MB', 'maxRSS_MB']);
  assert.strictEqual(r.lines.length, 5, r.stdout);
  const [direct, worker] = [cells(r.lines[2]), cells(r.lines[3])];
  assert.deepStrictEqual([direct[0], direct[1]], ['direct', '400']);
  assert.deepStrictEqual([worker[0], worker[1]], ['worker', '400']);
  for (const c of [direct, worker]) {
    assert.strictEqual(c.length, 8, c.join(' '));
    for (const v of c.slice(2)) assert.ok(finite(v) && Number(v) >= 0, c.join(' '));
  }
  assert.match(r.lines[4], /^\s*400: bytes equal: yes; worker . direct: first -?\d+ ms, median -?\d+ ms, RSS -?\d+ MB$/);
});
