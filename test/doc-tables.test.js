'use strict';
// BL10: every markdown table in README.md, PROGRESS.md, TASKS.md and docs/*.md has as many cells in each
// row as in its header. A missing or unescaped `|` breaks the rendering on GitHub without any error.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { checkTables } = require('./helpers/tables');

const root = path.join(__dirname, '..');
const files = ['README.md', 'PROGRESS.md', 'TASKS.md', ...fs.readdirSync(path.join(root, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`)];

// Known broken rows that need an owner decision: `file:line`. Empty today.
const EXCLUDED = new Set([]);

test('every markdown table row has the same number of cells as its header', () => {
  let tables = 0, rows = 0;
  const bad = [];
  for (const rel of files) {
    const r = checkTables(rel, fs.readFileSync(path.join(root, rel), 'utf8'));
    tables += r.tables;
    rows += r.rows;
    bad.push(...r.bad.filter((b) => !EXCLUDED.has(b.split(' ')[0])));
  }
  assert.ok(tables >= 30 && rows >= 200, `expected many tables, found ${tables} tables and ${rows} rows`);
  assert.deepStrictEqual(bad, []);
});

test('the checker accepts good tables and reports short rows, long rows and skips code fences', () => {
  const good = ['| a | b |', '| --- | :-: |', '| 1 | 2 |', '| `x\\|y` | 3 |', '', 'text | with a pipe', ''].join('\n');
  assert.deepStrictEqual(checkTables('f.md', good), { tables: 1, rows: 2, bad: [] });
  const broken = ['| a | b |', '|---|---|', '| 1 |', '| 1 | 2 | 3 |'].join('\n');
  const r = checkTables('f.md', broken);
  assert.deepStrictEqual(r.bad, ['f.md:3 row has 1 cells, expected 2', 'f.md:4 row has 3 cells, expected 2']);
  // GitHub splits on an unescaped pipe even inside a code span: that row has three cells.
  assert.deepStrictEqual(checkTables('f.md', '| a | b |\n|---|---|\n| `x|y` | 2 |').bad, ['f.md:3 row has 3 cells, expected 2']);
  const fenced = ['```', '| a | b |', '|---|---|', '| 1 |', '```'].join('\n');
  assert.deepStrictEqual(checkTables('f.md', fenced), { tables: 0, rows: 0, bad: [] });
  assert.match(checkTables('f.md', '| a | b |\n|---|\n').bad[0], /f\.md:2 separator has 1 cells, header has 2/);
});
