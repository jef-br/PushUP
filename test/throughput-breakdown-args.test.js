'use strict';
// BA4: bench/throughput.js and bench/memory-breakdown.js reject bad --seconds / --sizes values with a
// one-line message that names the flag, exit 1, empty stdout, before any child or model starts (< 5 s).
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SECONDS = '--seconds must be a number >= 0.5';
const TSIZES = '--sizes must be a comma list of integers from 100 to 800';
const MSIZES = '--sizes must be a comma list of integers from 400 to 800';

const CASES = {
  'throughput.js': [
    [['--seconds', 'abc'], SECONDS],
    [['--seconds', '0'], SECONDS],
    [['--seconds', '0.4'], SECONDS],
    [['--seconds', '0.0001'], SECONDS],
    [['--seconds', '-1'], SECONDS],
    [['--seconds', ''], SECONDS],
    [['--seconds'], SECONDS], // flag without a value
    [['--sizes', '99'], TSIZES],
    [['--sizes', '801'], TSIZES],
    [['--sizes', '1'], TSIZES],
    [['--sizes', '400,abc'], TSIZES],
    [['--sizes', '400,'], TSIZES],
    [['--sizes', '400.5'], TSIZES],
    [['--sizes', ''], TSIZES],
    [['--sizes'], TSIZES],
    // Valid values pass their checks: each run is stopped by the later bad flag, so no model starts.
    [['--sizes', '400', '--seconds', 'x'], SECONDS],
    [['--seconds', '0.5', '--sizes', 'x'], TSIZES],
    [['--sizes', '100', '--seconds', 'x'], SECONDS],
    [['--sizes', '200', '--seconds', 'x'], SECONDS],
    [['--sizes', '800', '--seconds', 'x'], SECONDS],
  ],
  'memory-breakdown.js': [
    [['--sizes', '399'], MSIZES],
    [['--sizes', '801'], MSIZES],
    [['--sizes', '400,abc'], MSIZES],
    [['--sizes', '400,'], MSIZES],
    [['--sizes', ',400'], MSIZES],
    [['--sizes', ''], MSIZES],
    [['--sizes', '400.5'], MSIZES],
    [['--sizes'], MSIZES],
  ],
};

for (const [script, cases] of Object.entries(CASES)) {
  for (const [args, msg] of cases) {
    test(`${script} ${args.join(' ') || '(none)'}: ${msg}`, () => {
      const t0 = Date.now();
      const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bench', script), ...args], { encoding: 'utf8' });
      assert.ok(Date.now() - t0 < 5000, `took ${Date.now() - t0} ms`);
      assert.strictEqual(r.status, 1, r.stderr);
      assert.strictEqual(r.stdout, '');
      assert.strictEqual(r.stderr.split('\n')[0], msg);
    });
  }
}
