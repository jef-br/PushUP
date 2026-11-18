'use strict';
// EL1: bench/eventloop.js rejects bad --sizes / --calls / --threads values with a one-line message that names the
// flag, exits 1, and does so before any model is loaded (so it ends in well under 5 s).
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bench', 'eventloop.js');
const SIZES = '--sizes must be a comma list of integers from 400 to 800';
const CALLS = '--calls must be an integer >= 1';
const QUALITY = '--quality must be fast or high';
const THREADS = '--threads must be a comma list of integers >= 1 or "default"';

for (const [args, flag, text] of [
  [['--sizes', '399'], '--sizes', SIZES],
  [['--sizes', '801'], '--sizes', SIZES],
  [['--sizes', '400,abc'], '--sizes', SIZES],
  [['--sizes', '400,'], '--sizes', SIZES],
  [['--calls', '0'], '--calls', CALLS],
  [['--calls', 'x'], '--calls', CALLS],
  [['--threads', '0'], '--threads', THREADS],
  [['--threads', '1,two'], '--threads', THREADS],
  [['--quality', 'ultra'], '--quality', QUALITY],
  [['--quality', 'High'], '--quality', QUALITY],
  [['--quality', 'high', '--calls', '0'], '--calls', CALLS],
  // Valid --sizes passes its check: this run fails on --calls (checked after --sizes), not on --sizes.
  [['--sizes', '400,800', '--calls', '0'], '--calls', CALLS],
]) {
  test(`eventloop.js ${args.join(' ')} exits 1 with a one-line message naming ${flag}`, () => {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 20000 });
    const elapsed = Date.now() - t0;
    assert.strictEqual(r.status, 1, `exit status (stderr: ${r.stderr})`);
    assert.strictEqual(r.stderr.split('\n')[0], text, 'first stderr line');
    assert.ok(r.stderr.split('\n')[0].includes(flag));
    assert.ok(elapsed < 5000, `took ${elapsed} ms: the model must not start`);
  });
}

// BU2: an unknown or `--name=value` flag is rejected by bench/flags.js before any model loads.
for (const [args, line] of [
  [['--bogus', '1'], `unknown flag --bogus; allowed: --sizes, --calls, --threads, --quality`],
  [['--sizes=400'], `unknown flag --sizes=400; use "--sizes value"; allowed: --sizes, --calls, --threads, --quality`],
]) {
  test(`eventloop.js ${args.join(' ')} is rejected as an unknown flag`, () => {
      const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 20000 });
      assert.strictEqual(r.status, 1, `exit status (stderr: ${r.stderr})`);
      assert.strictEqual(r.stderr.split('\n')[0], line, 'first stderr line');
      assert.strictEqual(r.stdout, '', 'no output: no model or child started');
  });
}
