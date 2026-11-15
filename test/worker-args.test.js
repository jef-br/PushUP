'use strict';
// EL2: bench/worker.js rejects bad --sizes / --calls values with a one-line message that names the flag, exits 1,
// and does so before any child process (and so any model) is started: well under 5 s.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bench', 'worker.js');
const SIZES = '--sizes must be a comma list of integers from 400 to 800';
const CALLS = '--calls must be an integer >= 1';

for (const [args, flag, text] of [
  [['--sizes', '399'], '--sizes', SIZES],
  [['--sizes', '801'], '--sizes', SIZES],
  [['--sizes', '400,abc'], '--sizes', SIZES],
  [['--sizes', '400,'], '--sizes', SIZES],
  [['--calls', '0'], '--calls', CALLS],
  [['--calls', 'x'], '--calls', CALLS],
  [['--calls', '1.5'], '--calls', CALLS],
  // Valid --sizes passes its check: this run fails on --calls (checked after --sizes), not on --sizes.
  [['--sizes', '400,800', '--calls', '0'], '--calls', CALLS],
]) {
  test(`worker.js ${args.join(' ')} exits 1 with a one-line message naming ${flag}`, () => {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 20000 });
    const elapsed = Date.now() - t0;
    assert.strictEqual(r.status, 1, `exit status (stderr: ${r.stderr})`);
    assert.strictEqual(r.stderr.split('\n')[0], text, 'first stderr line');
    assert.ok(r.stderr.split('\n')[0].includes(flag));
    assert.ok(elapsed < 5000, `took ${elapsed} ms: no child may start`);
  });
}
