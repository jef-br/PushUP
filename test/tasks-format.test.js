'use strict';
// BL9: TASKS.md is read by the overnight playbook (claims are the `[~]` tasks, finished tasks carry a done
// note) and by other tests (owner-decisions, decision-refs). Check that it keeps its own conventions.
// `check(text)` returns the list of problems; the first test runs it on the real file, the others on small
// made-up files, which is how a mutation of the rules is caught without editing TASKS.md.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Finished tasks that have neither a "(done" marker in the heading nor a "**Done" line, measured 2026-11-19.
// Legacy: a new task must not join this set. T4 was closed with a negative result and says "(closed ...".
const LEGACY_NO_DONE_MARKER = new Set(['T4']);

function check(text) {
  const problems = [];
  const parts = text.split(/^(?=### )/m).filter((p) => p.startsWith('### '));
  const seen = new Set();
  for (const part of parts) {
    const heading = part.split('\n', 1)[0];
    const m = heading.match(/^### \[( |~|x|blocked|split)\] (\S+)/);
    if (!m) { problems.push(`heading with no valid status and ID: ${heading.slice(0, 60)}`); continue; }
    const [, status, id] = m;
    if (seen.has(id)) problems.push(`${id}: ID appears twice`);
    seen.add(id);
    const body = part.slice(heading.length);
    if (status === 'x' && !/\(done/.test(heading) && !/\*\*Done/.test(body) && !LEGACY_NO_DONE_MARKER.has(id)) {
      problems.push(`${id}: finished task has no "(done" in the heading and no "**Done" line`);
    }
    if (status === '~' && !/\b\d{4}-\d{2}-\d{2}\b/.test(heading)) problems.push(`${id}: claimed task has no YYYY-MM-DD date in the heading`);
    if (status === 'blocked' && !/blocked/i.test(body)) problems.push(`${id}: blocked task does not say why (no "blocked" in its text)`);
  }
  return problems;
}

// BL40: finished tasks are in docs/TASKS_DONE.md, open ones in TASKS.md. Every rule applies to both files together
// (so a finished task that has not been moved yet still needs its done note, and an ID used in one file cannot be
// reused in the other).
const root = path.join(__dirname, '..');
const tasksText = fs.readFileSync(path.join(root, 'TASKS.md'), 'utf8');
const doneText = fs.readFileSync(path.join(root, 'docs', 'TASKS_DONE.md'), 'utf8');
const checkFiles = (...texts) => check(texts.join('\n'));

// TASKS.md must stay readable in one call (a single file read is refused above 256 KB).
const TASKS_MAX_BYTES = 200000;
function sizeProblems(bytes) {
  return bytes < TASKS_MAX_BYTES ? []
    : [`TASKS.md is ${bytes} bytes, over ${TASKS_MAX_BYTES}: move its [x] tasks to docs/TASKS_DONE.md`];
}

test('TASKS.md and docs/TASKS_DONE.md follow the conventions', () => {
  const count = (t, s) => (t.match(new RegExp(`^### \\[${s}\\] `, 'gm')) || []).length;
  assert.ok(count(doneText, 'x') >= 100, `only ${count(doneText, 'x')} finished tasks found in docs/TASKS_DONE.md; is the scan broken?`);
  assert.deepStrictEqual(checkFiles(tasksText, doneText), []);
});

test('TASKS.md is small enough to read in one call', () => {
  assert.deepStrictEqual(sizeProblems(Buffer.byteLength(tasksText)), []);
});

test('the size check reports an oversized file', () => {
  assert.deepStrictEqual(sizeProblems(199999), []);
  assert.deepStrictEqual(sizeProblems(316990),
    ['TASKS.md is 316990 bytes, over 200000: move its [x] tasks to docs/TASKS_DONE.md']);
});

test('the legacy set is still needed: T4 really has no done marker', () => {
  const t4 = doneText.split(/^(?=### )/m).find((p) => p.startsWith('### [x] T4 '));
  assert.ok(t4, 'T4 not found in docs/TASKS_DONE.md');
  assert.ok(!/\(done/.test(t4.split('\n', 1)[0]) && !/\*\*Done/.test(t4));
});

test('an ID used in both files is reported', () => {
  const open = '### [ ] A4 — ready\n';
  const done = '### [x] A1 — (done 2026-11-19) fine\n';
  assert.deepStrictEqual(checkFiles(open, done), []);
  assert.deepStrictEqual(checkFiles(open, done.replace('A1', 'A4')), ['A4: ID appears twice']);
  assert.match(checkFiles(open, '### [x] A1 — no note\n')[0], /A1: finished task has no/);
});

test('the rules catch what they are meant to catch', () => {
  const ok = '### [x] A1 — (done 2026-11-19) fine\n- body\n\n### [~] A2 — (claimed 2026-11-19) fine\n\n### [blocked] A3 — waits\n- blocked on an owner\n\n### [ ] A4 — ready\n\n### [split] A5 — see A4\n';
  assert.deepStrictEqual(check(ok), []);
  assert.match(check(ok.replace('[blocked]', '[blockd]'))[0], /no valid status/);
  assert.match(check(ok.replace('A4 —', 'A1 —'))[0], /A1: ID appears twice/);
  assert.match(check(ok.replace('(done 2026-11-19) ', ''))[0], /A1: finished task has no/);
  assert.deepStrictEqual(check(ok.replace('(done 2026-11-19) fine\n- body', 'fine\n- **Done (2026-11-19):** yes')), []);
  assert.match(check(ok.replace('(claimed 2026-11-19) ', ''))[0], /A2: claimed task has no/);
  assert.match(check(ok.replace('blocked on an owner', 'waits on an owner'))[0], /A3: blocked task does not say why/);
});
