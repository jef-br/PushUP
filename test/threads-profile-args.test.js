'use strict';
// BA2: bench/threads.js and bench/profile.js reject bad --runs / --sizes / --threads / --factor values with a
// one-line message that names the flag, exit 1, and do so before any model is loaded (well under 5 s).
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RUNS = '--runs must be an integer >= 1';
const SIZES = '--sizes must be a comma list of integers from 400 to 800';
const THREADS = '--threads must be a comma list of integers >= 1';
const FACTOR = '--factor must be a positive number';

const CASES = {
  'threads.js': [
    [['--runs', '0'], '--runs', RUNS],
    [['--runs', 'abc'], '--runs', RUNS],
    [['--runs', '1.5'], '--runs', RUNS],
    [['--runs'], '--runs', RUNS], // flag without a value
    [['--sizes', '399'], '--sizes', SIZES],
    [['--sizes', '801'], '--sizes', SIZES],
    [['--sizes', '400,abc'], '--sizes', SIZES],
    [['--sizes', '400,'], '--sizes', SIZES],
    [['--threads', '0'], '--threads', THREADS],
    [['--threads', '1,x'], '--threads', THREADS],
    [['--threads', '1,'], '--threads', THREADS],
    [['--threads', '2.5'], '--threads', THREADS],
    [['--threads', ''], '--threads', THREADS],
    [['--threads'], '--threads', THREADS],
    // Valid --runs and --sizes pass their checks: this run is stopped by --threads, not by them.
    [['--runs', '3', '--sizes', '400,800', '--threads', '0'], '--threads', THREADS],
  ],
  'profile.js': [
    [['--runs', '0'], '--runs', RUNS],
    [['--runs', 'abc'], '--runs', RUNS],
    [['--runs', '1.5'], '--runs', RUNS],
    [['--runs'], '--runs', RUNS],
    [['--sizes', '399'], '--sizes', SIZES],
    [['--sizes', '801'], '--sizes', SIZES],
    [['--sizes', '400,abc'], '--sizes', SIZES],
    [['--sizes', '400,'], '--sizes', SIZES],
    [['--factor', '0'], '--factor', FACTOR],
    [['--factor', '-1'], '--factor', FACTOR],
    [['--factor', 'abc'], '--factor', FACTOR],
    [['--factor', ''], '--factor', FACTOR],
    [['--factor', 'Infinity'], '--factor', FACTOR],
    [['--factor'], '--factor', FACTOR],
    // Valid --runs and --sizes pass their checks: this run is stopped by --factor, not by them.
    [['--runs', '3', '--sizes', '400,600,800', '--factor', '0'], '--factor', FACTOR],
  ],
};

for (const [script, cases] of Object.entries(CASES)) {
  for (const [args, flag, text] of cases) {
    test(`${script} ${args.map((a) => a || "''").join(' ')} exits 1 with a one-line message naming ${flag}`, () => {
      const t0 = Date.now();
      const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bench', script), ...args], { encoding: 'utf8', timeout: 20000 });
      const elapsed = Date.now() - t0;
      assert.strictEqual(r.status, 1, `exit status (stderr: ${r.stderr})`);
      assert.strictEqual(r.stderr.split('\n')[0], text, 'first stderr line');
      assert.ok(r.stderr.split('\n')[0].includes(flag));
      assert.strictEqual(r.stdout, '', 'no output: no model run started');
      assert.ok(elapsed < 5000, `took ${elapsed} ms: the model must not start`);
    });
  }
}
