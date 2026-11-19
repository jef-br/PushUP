'use strict';
// BL6: docs/PERF.md "Test suite time" lists every test file with its measured duration, so a new slow test
// shows up where people look. A new test/*.test.js file must be added to the table or this test fails.
// The durations are a record of one measurement, not a limit: only the file names are checked.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const perf = fs.readFileSync(path.join(root, 'docs', 'PERF.md'), 'utf8');
const start = perf.indexOf('\n## Test suite time');
assert.ok(start >= 0, 'docs/PERF.md has no "## Test suite time" section');
const rest = perf.slice(start + 1);
const end = rest.indexOf('\n## ', 3);
const section = end < 0 ? rest : rest.slice(0, end);

// Table rows: | `file.test.js` | seconds | share |
const rows = [...section.matchAll(/^\|\s*`([^`]+\.test\.js)`\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)%\s*\|/gm)].map((m) => ({ file: m[1], s: Number(m[2]), pct: Number(m[3]) }));
const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).sort();

test('the "Test suite time" table lists every test/*.test.js file and nothing else', () => {
  const listed = rows.map((r) => r.file).sort();
  assert.deepStrictEqual(listed.filter((f) => !files.includes(f)), [], 'listed in docs/PERF.md but no such file');
  assert.deepStrictEqual(files.filter((f) => !listed.includes(f)), [], 'test file missing from the table in docs/PERF.md "Test suite time"');
  assert.strictEqual(new Set(listed).size, listed.length, 'a file is listed twice');
});

test('the table is sorted slowest first and the shares add up to about 100%', () => {
  assert.ok(rows.length >= 60, `only ${rows.length} rows`);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].s >= rows[i].s, `${rows[i].file} is slower than the row above it`);
  const sum = rows.reduce((a, r) => a + r.pct, 0);
  assert.ok(sum > 97 && sum < 103, `shares add up to ${sum.toFixed(1)}%`);
});
