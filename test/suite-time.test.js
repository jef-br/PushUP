'use strict';
// BL6: docs/PERF.md "Test suite time" lists every test file with its measured duration, so a new slow test
// shows up where people look. A new test/*.test.js file must be added to the table or this test fails.
// The durations are a record of one measurement, not a limit: the file names and their order are checked, and (BL16) that the Total row and the
// shares are consistent with the rows.
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

// BL16: the **Total** row equals the sum of the rows, and every share matches seconds / that sum.
// Returns a list of problems (empty when the table is consistent).
function totalProblems(sectionText) {
  const rs = [...sectionText.matchAll(/^\|\s*`([^`]+\.test\.js)`\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)%\s*\|/gm)].map((m) => ({ file: m[1], s: Number(m[2]), pct: Number(m[3]) }));
  const t = /^\|\s*\*\*Total\*\*\s*\|\s*\*\*([\d.]+)\*\*\s*\|/m.exec(sectionText);
  if (!t) return ['no "| **Total** | **N** |" row'];
  const total = Number(t[1]);
  const sum = rs.reduce((a, r) => a + r.s, 0);
  const problems = [];
  if (Math.abs(total - sum) > 0.5) problems.push(`Total row says ${total} s but the rows add up to ${sum.toFixed(1)} s`);
  for (const r of rs) {
    const want = (r.s / sum) * 100;
    if (Math.abs(r.pct - want) > 0.1) { problems.push(`${r.file}: share ${r.pct}% but ${r.s} s of ${sum.toFixed(1)} s is ${want.toFixed(1)}%`); break; }
  }
  return problems;
}

test('the Total row equals the sum of the rows and every share matches its seconds', () => {
  assert.deepStrictEqual(totalProblems(section), []);
});

test('the Total check reports a wrong total and a wrong share and accepts a good table', () => {
  const table = (total, pctA) => ['| Test file | Seconds | Share |', '| --- | ---: | ---: |', `| \`a.test.js\` | 3.0 | ${pctA}% |`, '| `b.test.js` | 1.0 | 25.0% |', `| **Total** | **${total}** | |`].join('\n');
  assert.deepStrictEqual(totalProblems(table(4.0, 75.0)), []);
  assert.deepStrictEqual(totalProblems(table(3.0, 75.0)), ['Total row says 3 s but the rows add up to 4.0 s']);
  assert.deepStrictEqual(totalProblems(table(4.0, 70.0)), ['a.test.js: share 70% but 3 s of 4.0 s is 75.0%']);
  assert.deepStrictEqual(totalProblems('| `a.test.js` | 1.0 | 100.0% |'), ['no "| **Total** | **N** |" row']);
});
