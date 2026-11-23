'use strict';
// BL4: decisions are cited by number (D8, D14, ...) from the README, PROGRESS.md, TASKS.md and docs/.
// Every cited D-number must be defined by a `## D<n> — title` heading in docs/DECISIONS.md, so a
// mistyped or renumbered citation cannot point at the wrong or a missing decision.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const defined = [...read('docs/DECISIONS.md').matchAll(/^## D(\d+) — /gm)].map((m) => Number(m[1]));

// Files that may cite a decision.
const files = ['README.md', 'PROGRESS.md', 'TASKS.md', 'CLAUDE.md',
  ...fs.readdirSync(path.join(root, 'docs')).filter((f) => f.endsWith('.md')).map((f) => 'docs/' + f)];

// Matches that are not decisions. BL4's own text uses D65 and D140 as examples of numbers that do not exist; it
// was in TASKS.md and, finished, moved to docs/TASKS_DONE.md (BL40). The same numbers in any other file still fail.
const NOT_DECISIONS = { 'TASKS.md': new Set(['D65', 'D140']), 'docs/TASKS_DONE.md': new Set(['D65', 'D140']) };

const citations = [];
for (const rel of files) {
  // A definition heading is not a citation; the rest of its line (e.g. "superseded by D6") is.
  const text = read(rel).replace(/^## D\d+ — /gm, '');
  for (const m of text.matchAll(/\bD\d+\b/g)) {
    if (NOT_DECISIONS[rel] && NOT_DECISIONS[rel].has(m[0])) continue;
    citations.push({ rel, id: m[0] });
  }
}

test('the definitions in docs/DECISIONS.md are unique and run D1..Dn without gaps', () => {
  assert.ok(defined.length >= 16, `found ${defined.length} definitions`);
  assert.strictEqual(new Set(defined).size, defined.length, 'a D-number is defined twice');
  assert.deepStrictEqual(defined, defined.map((_, i) => i + 1), 'definitions are not D1..Dn in order');
});

test('every D-number cited in the README, PROGRESS.md, TASKS.md, CLAUDE.md and docs/ is defined', () => {
  assert.ok(citations.length >= 70, `only ${citations.length} citations found; is the scan broken?`);
  const known = new Set(defined.map((n) => 'D' + n));
  const dead = citations.filter((c) => !known.has(c.id)).map((c) => `${c.rel}: ${c.id}`);
  assert.deepStrictEqual(dead, [], 'cited but not defined in docs/DECISIONS.md');
});

test('the exclusion list is still needed: its numbers are not defined decisions', () => {
  const known = new Set(defined.map((n) => 'D' + n));
  for (const set of Object.values(NOT_DECISIONS)) for (const id of set) assert.ok(!known.has(id), id);
});
