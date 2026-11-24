'use strict';
// BL45: the tables printed by bench/banding.js (docs/BANDING.md) and bench/neutral.js (docs/COLOR.md, "Neutral greys")
// equal the tables quoted in the docs, cell by cell as text. Opt-in: PUSHUP_SLOW_TESTS=1 (same pattern as
// test/bench-run-colors.test.js). Only the helper cases run by default.
//
// Measured 2026-11-24 on 4 vCPU, PUSHUP_DEVICE=cpu: banding.js 25.9 s, neutral.js 4.9 s, exit 0. Timeouts 150 s and
// 60 s (about 6x and 12x). Skipped by default, so exempt from the 5x rule of test/bench-run-timeouts.test.js,
// but still above its 20 s floor.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const skip = process.env.PUSHUP_SLOW_TESTS === '1' ? false : 'set PUSHUP_SLOW_TESTS=1';

const isRow = (l) => l.trim().startsWith('|');
const cells = (l) => l.trim().split('|').slice(1, -1).map((c) => c.trim());

// Markdown table (rows as cell arrays) that follows the first heading line starting with `heading` (prefix match).
// Returns { problem } when the heading or a table is missing.
function tableAfterHeading(text, heading) {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => /^#{1,6} /.test(l) && l.replace(/^#{1,6} /, '').startsWith(heading));
  if (at < 0) return { problem: `heading "${heading}" not found` };
  let i = at + 1;
  while (i < lines.length && !isRow(lines[i])) {
    if (/^#{1,6} /.test(lines[i])) return { problem: `no table under "${heading}"` };
    i++;
  }
  if (i >= lines.length) return { problem: `no table under "${heading}"` };
  const rows = [];
  for (; i < lines.length && isRow(lines[i]); i++) rows.push(cells(lines[i]));
  return { rows };
}

// Problems (list of strings) between the printed table (stdout) and the doc's table.
function tableProblems(stdout, docText, heading) {
  const doc = tableAfterHeading(docText, heading);
  if (doc.problem) return [doc.problem];
  const printed = stdout.split('\n').filter(isRow).map(cells);
  const out = [];
  if (printed.length !== doc.rows.length) out.push(`row count: script ${printed.length}, doc ${doc.rows.length}`);
  for (let r = 0; r < Math.min(printed.length, doc.rows.length); r++) {
    const a = printed[r];
    const b = doc.rows[r];
    if (a.length !== b.length) { out.push(`row ${r}: ${a.length} cells, doc ${b.length}`); continue; }
    for (let c = 0; c < a.length; c++) if (a[c] !== b[c]) out.push(`row ${r} cell ${c}: script "${a[c]}", doc "${b[c]}"`);
  }
  return out;
}

const DOC = ['# T', '', '## Other', '| x |', '|---|', '| 9 |', '', '## Neutral greys (BL43, date)', 'text', '| a | b |', '|---|---|', '| 1 | 2 |', '', 'after'].join('\n');
const PRINTED = '| a | b |\n|---|---|\n| 1 | 2 |\n';

test('tableAfterHeading finds the table after a prefix-matched heading', () => {
  assert.deepStrictEqual(tableAfterHeading(DOC, 'Neutral greys').rows, [['a', 'b'], ['---', '---'], ['1', '2']]);
});

test('tableProblems: equal tables, missing heading, changed cell, missing row', () => {
  assert.deepStrictEqual(tableProblems(PRINTED, DOC, 'Neutral greys'), []);
  assert.match(tableProblems(PRINTED, DOC, 'Nope')[0], /not found/);
  assert.match(tableProblems(PRINTED, DOC.replace('| 1 | 2 |', '| 1 | 3 |'), 'Neutral greys')[0], /cell 1: script "2", doc "3"/);
  assert.match(tableProblems(PRINTED + '| 5 | 6 |\n', DOC, 'Neutral greys')[0], /row count/);
  assert.match(tableProblems(PRINTED, '## Neutral greys\n\nno table\n## Next\n| a |', 'Neutral greys')[0], /no table/);
});

for (const [script, docFile, heading, timeout] of [
  ['banding.js', 'BANDING.md', 'Method', 150000],
  ['neutral.js', 'COLOR.md', 'Neutral greys', 60000],
]) {
  test(`${script} prints the table that docs/${docFile} quotes`, { skip }, () => {
    const r = spawnSync(process.execPath, [path.join(root, 'bench', script)], {
      encoding: 'utf8', timeout, env: { ...process.env, PUSHUP_DEVICE: 'cpu' },
    });
    assert.strictEqual(r.status, 0, r.stderr);
    const doc = fs.readFileSync(path.join(root, 'docs', docFile), 'utf8');
    const problems = tableProblems(r.stdout, doc, heading);
    assert.deepStrictEqual(problems, [], problems.join('\n'));
  });
}
