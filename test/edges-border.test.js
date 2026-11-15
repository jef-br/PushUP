'use strict';
// BK12: bench/edges.js leaves out the 40 output rows at the top and bottom of the image for the step
// and the line (where the feature meets the image border) unless --include-border is given. Without
// this test, deleting that skip failed nothing (BK8 reviewer's mutation check).
//
// Measured 2026-11-15 at --factors 1.5 (rows: overshoot, default / --include-border):
//   step fast 12 / 14; step lanczos 10 / 10 (the Lanczos step is the same either way);
//   line fast 13 / 13 and line lanczos 11 / 11 (the border adds nothing at factor 1.5);
//   disc rows identical (the disc never reaches the border).
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bench', 'edges.js');

function run(extra) {
  const r = spawnSync(process.execPath, [SCRIPT, '--factors', '1.5', ...extra], { encoding: 'utf8', timeout: 120000 });
  assert.strictEqual(r.status, 0, `exit status ${r.status} (stderr: ${r.stderr.slice(-300)})`);
  const rows = new Map();
  for (const line of r.stdout.split('\n')) {
    const c = line.split('|').map((x) => x.trim());
    if (c.length < 9 || !/^(step|line|disc)$/.test(c[1])) continue;
    rows.set(`${c[1]} ${c[2]} ${c[3]}`, { below: Number(c[4]), above: Number(c[5]), overshoot: Number(c[6]), width: Number(c[7]) });
  }
  return rows;
}

let byDefault, withBorder;
test.before(() => {
  byDefault = run([]);
  withBorder = run(['--include-border']);
});

test('both runs print the six rows (step, line, disc × fast, lanczos) with finite numbers', () => {
  for (const rows of [byDefault, withBorder]) {
    assert.strictEqual(rows.size, 6, `rows: ${[...rows.keys()]}`);
    for (const [k, v] of rows) {
      for (const f of ['below', 'above', 'overshoot', 'width']) assert.ok(Number.isFinite(v[f]), `${k}: ${f} = ${v[f]}`);
    }
  }
});

test('the disc rows are identical with and without --include-border', () => {
  for (const m of ['fast', 'lanczos']) {
    assert.deepStrictEqual(byDefault.get(`disc 1.5 ${m}`), withBorder.get(`disc 1.5 ${m}`));
  }
});

test('the step overshoot of fast is lower by default than with --include-border', () => {
  const d = byDefault.get('step 1.5 fast').overshoot;
  const b = withBorder.get('step 1.5 fast').overshoot;
  assert.ok(d < b, `default ${d} should be below --include-border ${b}`);
});

test('the Lanczos step rows are the same either way', () => {
  assert.deepStrictEqual(byDefault.get('step 1.5 lanczos'), withBorder.get('step 1.5 lanczos'));
});
