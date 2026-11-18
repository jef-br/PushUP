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

// BU2: an unknown or `--name=value` flag is rejected by bench/flags.js before any model loads.
for (const [args, line] of [
  [['--bogus', '1'], `unknown flag --bogus; allowed: --runs, --sizes, --threads`],
  [['--sizes=400'], `unknown flag --sizes=400; use "--sizes value"; allowed: --runs, --sizes, --threads`],
]) {
  test(`threads.js ${args.join(' ')} is rejected as an unknown flag`, () => {
      const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bench', 'threads.js'), ...args], { encoding: 'utf8', timeout: 20000 });
      assert.strictEqual(r.status, 1, `exit status (stderr: ${r.stderr})`);
      assert.strictEqual(r.stderr.split('\n')[0], line, 'first stderr line');
      assert.strictEqual(r.stdout, '', 'no output: no model or child started');
  });
}
for (const [args, line] of [
  [['--bogus', '1'], `unknown flag --bogus; allowed: --runs, --sizes, --factor`],
  [['--sizes=400'], `unknown flag --sizes=400; use "--sizes value"; allowed: --runs, --sizes, --factor`],
]) {
  test(`profile.js ${args.join(' ')} is rejected as an unknown flag`, () => {
      const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bench', 'profile.js'), ...args], { encoding: 'utf8', timeout: 20000 });
      assert.strictEqual(r.status, 1, `exit status (stderr: ${r.stderr})`);
      assert.strictEqual(r.stderr.split('\n')[0], line, 'first stderr line');
      assert.strictEqual(r.stdout, '', 'no output: no model or child started');
  });
}
