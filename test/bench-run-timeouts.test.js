'use strict';
// BL3: guard rail, not a contract. The child timeouts of test/bench-run-*.test.js must not be lowered by accident:
// docs/PERF.md ("Bench-run test timeouts") records the measured time of every case, and every timeout
// there is at least 8x it (4 vCPU, 2026-11-19). A CI runner has been seen at 6x or more slower (a ~10 s case hit 60 s, F-2026-11-19-0025), so
// a value below 20 s would leave no room. The floor is pinned here; raising a timeout is always fine.
// The opt-in `high` case of bench-run-arena-eventloop-worker.test.js passes its 120 s as a call argument, which this
// scan does not read (it is skipped by default and exempt from the floor).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const FLOOR_MS = 20000;
const dir = __dirname;
const files = fs.readdirSync(dir).filter((f) => /^bench-run-.*\.test\.js$/.test(f) && f !== path.basename(__filename));

// A `timeout` key or default parameter with a numeric literal. A file may have none; this file is not scanned.
const timeoutsOf = (file) => {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  return [...text.matchAll(/\btimeout\s*[:=]\s*(\d[\d_]*)/g)].map((m) => Number(m[1].replace(/_/g, '')));
};

test('the scan finds the bench-run test files and their timeout constants', () => {
  assert.ok(files.length >= 6, `found ${files.length} bench-run test files: ${files}`);
  const withTimeout = files.filter((f) => timeoutsOf(f).length > 0);
  assert.ok(withTimeout.length >= 6, `only ${withTimeout.length} files have a timeout constant: ${withTimeout}`);
});

test(`no bench-run test child timeout is below ${FLOOR_MS / 1000} s`, () => {
  for (const f of files) {
    for (const ms of timeoutsOf(f)) {
      assert.ok(ms >= FLOOR_MS, `${f}: child timeout ${ms} ms is below the ${FLOOR_MS} ms guard rail`);
    }
  }
});
