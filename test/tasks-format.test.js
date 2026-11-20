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

test('TASKS.md follows its conventions', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'TASKS.md'), 'utf8');
  const count = (s) => (text.match(new RegExp(`^### \\[${s}\\] `, 'gm')) || []).length;
  assert.ok(count('x') >= 100, `only ${count('x')} finished tasks found; is the scan broken?`);
  assert.deepStrictEqual(check(text), []);
});

test('the legacy set is still needed: T4 really has no done marker', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'TASKS.md'), 'utf8');
  const t4 = text.split(/^(?=### )/m).find((p) => p.startsWith('### [x] T4 '));
  assert.ok(t4, 'T4 not found');
  assert.ok(!/\(done/.test(t4.split('\n', 1)[0]) && !/\*\*Done/.test(t4));
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
