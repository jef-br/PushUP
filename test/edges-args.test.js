'use strict';
// BK8: bench/edges.js rejects bad --factors values with a one-line message, exits 1, and does so
// before any model run starts (so it ends in well under 2 s).
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bench', 'edges.js');
const MSG = '--factors must be a comma-separated list of numbers > 0';

const QMSG = '--quality must be fast or high';

for (const args of [['--quality', 'bogus'], ['--quality'], ['--quality', ''], ['--quality', 'auto']]) {
  test(`edges.js ${args.join(' ')} exits 1 with the --quality message`, () => {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 20000 });
    const elapsed = Date.now() - t0;
    assert.strictEqual(r.status, 1, `exit status (stderr: ${r.stderr})`);
    assert.strictEqual(r.stderr.split('\n')[0], QMSG, 'first stderr line');
    assert.ok(elapsed < 2000, `took ${elapsed} ms: the model must not start`);
  });
}

for (const args of [['--factors', '0'], ['--factors', 'abc'], ['--factors', '1.5,-1'], ['--factors'], ['--factors', '']]) {
  test(`edges.js ${args.join(' ') || '(no args)'} exits 1 with the --factors message`, () => {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 20000 });
    const elapsed = Date.now() - t0;
    assert.strictEqual(r.status, 1, `exit status (stderr: ${r.stderr})`);
    assert.strictEqual(r.stderr.split('\n')[0], MSG, 'first stderr line');
    assert.ok(elapsed < 2000, `took ${elapsed} ms: the model must not start`);
  });
}

// BU2: an unknown or `--name=value` flag is rejected by bench/flags.js before any model loads.
for (const [args, line] of [
  [['--bogus', '1'], `unknown flag --bogus; allowed: --factors, --quality, --include-border`],
  [['--sizes=400'], `unknown flag --sizes=400; use "--sizes value"; allowed: --factors, --quality, --include-border`],
]) {
  test(`edges.js ${args.join(' ')} is rejected as an unknown flag`, () => {
      const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 20000 });
      assert.strictEqual(r.status, 1, `exit status (stderr: ${r.stderr})`);
      assert.strictEqual(r.stderr.split('\n')[0], line, 'first stderr line');
      assert.strictEqual(r.stdout, '', 'no output: no model or child started');
  });
}

// BL22: crossing lives in bench/stats.js (bench/edges.js runs on load), so a test can require it.
test('crossing: null without a crossing, interpolated index for a rising and a falling profile', () => {
  const { crossing } = require('../bench/stats');
  assert.strictEqual(crossing([5, 5, 5, 5], 10, +1, 1), null); // flat
  assert.strictEqual(crossing([5, 5, 5, 5], 10, -1, 1), null);
  assert.strictEqual(crossing([0, 10, 20], 15, +1, 1), 1.5); // rising
  assert.strictEqual(crossing([20, 10, 0], 15, -1, 1), 0.5); // falling
  assert.strictEqual(crossing([20, 10, 0], 15, +1, 1), null); // wrong direction
  assert.strictEqual(crossing([0, 10, 20, 10, 0, 10, 20], 15, +1, 3), 5.5); // `from` skips the first crossing
  assert.strictEqual(crossing([0, 10, 20], 15, +1, 0), 1.5); // from 0 is treated as 1 (needs a previous sample)
});
