'use strict';
// R15 + Q9: bench/memory-creep.js rejects bad --arena / --calls / --size values with a one-line message that names
// the flag, exits 1, and does so before any model is loaded (so it ends in well under 5 s).
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bench', 'memory-creep.js');

for (const [args, flag, text] of [
  [['--arena', 'bogus'], '--arena', '--arena must be on or off'],
  [['--calls', '3'], '--calls', '--calls must be an integer >= 6'],
  [['--calls', 'abc'], '--calls', '--calls must be an integer >= 6'],
  [['--size', '399'], '--size', '--size must be an integer from 400 to 800'],
  [['--size', '801'], '--size', '--size must be an integer from 400 to 800'],
  [['--size', 'abc'], '--size', '--size must be an integer from 400 to 800'],
  // A valid size passes its check: this run fails on --calls (checked after --size), not on --size.
  [['--size', '400', '--calls', '3'], '--calls', '--calls must be an integer >= 6'],
]) {
  test(`memory-creep.js ${args.join(' ')} exits 1 with a one-line message naming ${flag}`, () => {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 20000 });
    const elapsed = Date.now() - t0;
    assert.strictEqual(r.status, 1, `exit status (stderr: ${r.stderr})`);
    assert.strictEqual(r.stderr.split('\n')[0], text, 'first stderr line');
    assert.ok(r.stderr.split('\n')[0].includes(flag));
    assert.ok(elapsed < 5000, `took ${elapsed} ms: the model must not start`);
  });
}
