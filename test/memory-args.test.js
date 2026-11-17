'use strict';
// BA5: bench/memory.js rejects bad --sizes / --factors / --high-sizes values with a one-line message that
// names the flag, exit 1, empty stdout, before any child starts (< 5 s). `--high-sizes ''` stays valid.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SIZES = '--sizes must be a comma list of integers from 400 to 800';
const FACTORS = '--factors must be a comma list of positive numbers';
const HIGH = '--high-sizes must be empty or a comma list of integers from 400 to 800';

const CASES = [
  [['--sizes', '399'], SIZES],
  [['--sizes', '801'], SIZES],
  [['--sizes', '400,abc'], SIZES],
  [['--sizes', '400,'], SIZES],
  [['--sizes', ''], SIZES],
  [['--sizes', '400.5'], SIZES],
  [['--sizes'], SIZES], // flag without a value
  [['--factors', '0'], FACTORS],
  [['--factors', '-1'], FACTORS],
  [['--factors', 'abc'], FACTORS],
  [['--factors', '1,'], FACTORS],
  [['--factors', ''], FACTORS],
  [['--factors', 'Infinity'], FACTORS],
  [['--factors'], FACTORS],
  [['--high-sizes', '399'], HIGH],
  [['--high-sizes', '801'], HIGH],
  [['--high-sizes', '400,'], HIGH],
  [['--high-sizes', 'x'], HIGH],
  [['--high-sizes'], HIGH],
  // Valid earlier flags pass their checks: each run is stopped by the later bad flag, so no model starts.
  [['--sizes', '400,800', '--factors', 'x'], FACTORS],
  [['--sizes', '400', '--high-sizes', '', '--factors', 'x'], FACTORS], // an empty --high-sizes is allowed
  [['--factors', '1,1.5', '--high-sizes', '800,'], HIGH],
  [['--high-sizes', '400,800', '--factors', 'x'], FACTORS],
];

for (const [args, msg] of CASES) {
  test(`memory.js ${args.map((a) => a || "''").join(' ')}: ${msg}`, () => {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bench', 'memory.js'), ...args], { encoding: 'utf8' });
    assert.ok(Date.now() - t0 < 5000, `took ${Date.now() - t0} ms`);
    assert.strictEqual(r.status, 1, r.stderr);
    assert.strictEqual(r.stdout, '');
    assert.strictEqual(r.stderr.split('\n')[0], msg);
  });
}
