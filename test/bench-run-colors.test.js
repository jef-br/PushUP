'use strict';
// BL7: a valid run of bench/colors.js (flat-colour fidelity of `fast`, BK10). Opt-in: PUSHUP_SLOW_TESTS=1.
// No other test runs this script, and the README "Known limits" (flat saturated colours: largest single-channel
// shift 29 bytes, the blue channel of 255,0,255; 26 on saturated green) and docs/COLOR.md rest on its output.
//
// Measured 2026-11-19 on 4 vCPU, PUSHUP_DEVICE=cpu, 3 runs: 25.2 s, 24.2 s, 23.7 s, exit 0, empty stderr, and the
// three outputs were byte-identical. Timeout 150 s (about 6x the longest run; above the 60 s floor). It is skipped
// by default, so it is exempt from the 5x headroom rule of test/bench-run-timeouts.test.js.
//
// The figures are compared with `===` on purpose: a deliberate change of the model or the Lanczos mix must update
// the README, docs/COLOR.md and this test together.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('colors.js prints 27 colours and the shifts the README and docs/COLOR.md quote',
  { skip: process.env.PUSHUP_SLOW_TESTS === '1' ? false : 'set PUSHUP_SLOW_TESTS=1' }, () => {
    const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bench', 'colors.js')], {
      encoding: 'utf8',
      timeout: 150000,
      env: { ...process.env, PUSHUP_DEVICE: 'cpu' },
    });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(!/Error/.test(r.stderr), r.stderr);
    const lines = r.stdout.split('\n').filter((l) => l !== '');
    assert.match(lines[0], /^\| colour \(R,G,B\) \| shipped max dev R\/G\/B \| model-only max dev R\/G\/B \| model-only mean shift R\/G\/B \| model-only max dev away from the border R\/G\/B \| lanczos max dev \| shipped \/ model-only \(largest channel\) \|$/);
    assert.match(lines[1], /^\|---\|/);
    const rows = lines.slice(2).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
    assert.strictEqual(rows.length, 27, r.stdout);
    for (const c of rows) assert.strictEqual(c.length, 7, c.join(' | '));
    const expected = [];
    for (const R of [0, 128, 255]) for (const G of [0, 128, 255]) for (const B of [0, 128, 255]) expected.push(`${R},${G},${B}`);
    assert.deepStrictEqual(rows.map((c) => c[0]), expected);
    const byColour = new Map(rows.map((c) => [c[0], c]));
    const shipped = (colour) => byColour.get(colour)[1].split('/').map(Number);
    // README "Known limits": largest shift of the shipped pipeline 29 bytes (blue of 255,0,255), 26 on saturated green.
    assert.deepStrictEqual(shipped('255,0,255'), [5, 5, 29]);
    assert.deepStrictEqual(shipped('0,255,0'), [22, 16, 26]);
    assert.strictEqual(Math.max(...rows.flatMap((c) => c[1].split('/').map(Number))), 29);
    // Plain Lanczos returns every colour exactly (the "lanczos max dev" column).
    for (const c of rows) assert.strictEqual(c[5], '0', c.join(' | '));
    // Black and grey stay (almost) put.
    assert.ok(Math.max(...shipped('0,0,0')) <= 1);
  });
