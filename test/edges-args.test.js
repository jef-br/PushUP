'use strict';
// BK8: bench/edges.js rejects bad --factors values with a one-line message, exits 1, and does so
// before any model run starts (so it ends in well under 2 s).
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bench', 'edges.js');
const MSG = '--factors must be a comma-separated list of numbers > 0';

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
