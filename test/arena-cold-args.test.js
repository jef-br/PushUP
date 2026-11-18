'use strict';
// BA3: bench/arena.js and bench/cold.js reject bad flag values in the parent process, with a one-line message that
// names the flag, exit 1, no output, and before any child process (and so any model) is started: well under 5 s.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RUNS = '--runs must be an integer >= 1';
const CASES = '--cases must be a comma list of <fast|high>:<integer from 400 to 800>';
const SIZES = '--sizes must be a comma list of integers from 400 to 800';
const MODES = '--modes must be a comma list of fast and/or high';
const WARM = '--warm must be an integer >= 1';
const FACTOR = '--factor must be a positive number';

const CASE_LIST = {
  'arena.js': [
    [['--runs', '0'], '--runs', RUNS],
    [['--runs', 'abc'], '--runs', RUNS],
    [['--runs', '1.5'], '--runs', RUNS],
    [['--runs'], '--runs', RUNS], // flag without a value
    [['--cases', 'fast:399'], '--cases', CASES],
    [['--cases', 'fast:801'], '--cases', CASES],
    [['--cases', 'fast:400.5'], '--cases', CASES],
    [['--cases', 'fast:abc'], '--cases', CASES],
    [['--cases', 'fast'], '--cases', CASES],
    [['--cases', 'slow:400'], '--cases', CASES],
    [['--cases', 'fast:400,'], '--cases', CASES], // trailing comma
    [['--cases', ''], '--cases', CASES], // empty: would silently run zero cases
    [['--cases'], '--cases', CASES],
    // Valid --runs passes its check: this run is stopped by --cases, not by --runs.
    [['--runs', '3', '--cases', 'fast:400,high:801'], '--cases', CASES],
  ],
  'cold.js': [
    [['--sizes', '399'], '--sizes', SIZES],
    [['--sizes', '801'], '--sizes', SIZES],
    [['--sizes', '400,abc'], '--sizes', SIZES],
    [['--sizes', '400,'], '--sizes', SIZES],
    [['--sizes'], '--sizes', SIZES],
    [['--modes', 'fast,slow'], '--modes', MODES],
    [['--modes', ''], '--modes', MODES],
    [['--modes', 'fast,'], '--modes', MODES],
    [['--modes', 'FAST'], '--modes', MODES],
    [['--warm', '0'], '--warm', WARM], // today it crashes in the table row: median([]) is undefined
    [['--warm', '-1'], '--warm', WARM],
    [['--warm', '1.5'], '--warm', WARM],
    [['--warm', 'abc'], '--warm', WARM],
    [['--factor', '0'], '--factor', FACTOR],
    [['--factor', '-1'], '--factor', FACTOR],
    [['--factor', 'abc'], '--factor', FACTOR],
    [['--factor', ''], '--factor', FACTOR],
    [['--factor', 'Infinity'], '--factor', FACTOR],
    // Valid --sizes, --modes and --warm pass their checks: this run is stopped by --factor, not by them.
    [['--sizes', '400,800', '--modes', 'fast,high', '--warm', '1', '--factor', '0'], '--factor', FACTOR],
  ],
};

for (const [script, cases] of Object.entries(CASE_LIST)) {
  for (const [args, flag, text] of cases) {
    test(`${script} ${args.map((a) => a || "''").join(' ')} exits 1 with a one-line message naming ${flag}`, () => {
      const t0 = Date.now();
      const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bench', script), ...args], { encoding: 'utf8', timeout: 20000 });
      const elapsed = Date.now() - t0;
      assert.strictEqual(r.status, 1, `exit status (stderr: ${r.stderr})`);
      assert.strictEqual(r.stderr.split('\n')[0], text, 'first stderr line');
      assert.ok(r.stderr.split('\n')[0].includes(flag));
      assert.strictEqual(r.stdout, '', 'no output: no header, no child started');
      assert.ok(elapsed < 5000, `took ${elapsed} ms: no child may start`);
    });
  }
}

// BU2: an unknown or `--name=value` flag is rejected by bench/flags.js before any model loads.
for (const [args, line] of [
  [['--bogus', '1'], `unknown flag --bogus; allowed: --runs, --cases`],
  [['--sizes=400'], `unknown flag --sizes=400; use "--sizes value"; allowed: --runs, --cases`],
]) {
  test(`arena.js ${args.join(' ')} is rejected as an unknown flag`, () => {
      const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bench', 'arena.js'), ...args], { encoding: 'utf8', timeout: 20000 });
      assert.strictEqual(r.status, 1, `exit status (stderr: ${r.stderr})`);
      assert.strictEqual(r.stderr.split('\n')[0], line, 'first stderr line');
      assert.strictEqual(r.stdout, '', 'no output: no model or child started');
  });
}
for (const [args, line] of [
  [['--bogus', '1'], `unknown flag --bogus; allowed: --sizes, --modes, --warm, --factor`],
  [['--sizes=400'], `unknown flag --sizes=400; use "--sizes value"; allowed: --sizes, --modes, --warm, --factor`],
]) {
  test(`cold.js ${args.join(' ')} is rejected as an unknown flag`, () => {
      const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bench', 'cold.js'), ...args], { encoding: 'utf8', timeout: 20000 });
      assert.strictEqual(r.status, 1, `exit status (stderr: ${r.stderr})`);
      assert.strictEqual(r.stderr.split('\n')[0], line, 'first stderr line');
      assert.strictEqual(r.stdout, '', 'no output: no model or child started');
  });
}
