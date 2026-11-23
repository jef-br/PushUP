'use strict';
// BL1: docs/OWNER_DECISIONS.md is kept by hand and is the owner's one list of open decisions.
// Every task ID a row names must still exist as a heading in TASKS.md, so a renamed or removed
// task cannot leave a row pointing at nothing.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const decisions = fs.readFileSync(path.join(root, 'docs', 'OWNER_DECISIONS.md'), 'utf8');
// BL40: finished tasks are in docs/TASKS_DONE.md, so the headings of both files are read.
const tasks = fs.readFileSync(path.join(root, 'TASKS.md'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'docs', 'TASKS_DONE.md'), 'utf8');

// Table rows: lines starting with "| <number> |".
const rows = decisions.split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l)).map((l) => {
  const cells = l.replace(/^\||\|\s*$/g, '').split('|').map((c) => c.trim());
  return { line: l, cells };
});

// Task headings: `### [status] ID ...`; the status of each ID is kept for (c).
const headings = new Map();
for (const m of tasks.matchAll(/^### \[([^\]]+)\] (\S+)/gm)) headings.set(m[2], m[1]);

// Matches that look like an ID but are not a task: decision numbers in DECISIONS.md.
const notTasks = (id) => /^D\d+$/.test(id);
const idsOf = (text) => [...new Set(text.match(/\b[A-Z]{1,4}\d+[a-z]?\b/g) || [])].filter((id) => !notTasks(id));

// (c) exceptions: rows whose Decision column names a finished task on purpose.
// Row 10 names DOC20 (done: it only fixed the README quote) next to GP1, the open decision.
const ALLOWED_DONE_IN_DECISION = new Map([[10, new Set(['DOC20'])]]);

test('OWNER_DECISIONS.md has a table with four non-empty cells per row', () => {
  assert.ok(rows.length >= 10, `expected at least 10 rows, found ${rows.length}`);
  for (const r of rows) {
    assert.strictEqual(r.cells.length, 4, `row does not have 4 cells: ${r.line.slice(0, 80)}`);
    r.cells.forEach((c, i) => assert.ok(c.length > 0, `empty cell ${i + 1} in row ${r.cells[0]}`));
  }
});

test('every task ID named in a row is a heading in TASKS.md', () => {
  assert.ok(headings.size > 50, `TASKS.md headings not parsed (${headings.size})`);
  for (const r of rows) {
    for (const id of idsOf(r.line)) {
      assert.ok(headings.has(id), `row ${r.cells[0]} names ${id}, which is not a task heading in TASKS.md`);
    }
  }
});

test('a task named in the Decision column is not done, unless the row says so', () => {
  for (const r of rows) {
    const n = Number(r.cells[0]);
    const says = /dropped|done|closed/i.test(r.line);
    for (const id of idsOf(r.cells[1])) {
      if (headings.get(id) !== 'x') continue;
      const allowed = ALLOWED_DONE_IN_DECISION.get(n);
      assert.ok(says || (allowed && allowed.has(id)),
        `row ${n}: Decision names ${id}, which is [x] in TASKS.md; say dropped/done/closed or list it as an exception`);
    }
  }
});
