'use strict';
// S2: docs/CONTRACT_TESTS.md maps each contract row in CLAUDE.md to the tests that cover it.
// This keeps that map true: every listed test must exist, every section must list one, and
// every row of the contract table must have a section.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const doc = fs.readFileSync(path.join(root, 'docs', 'CONTRACT_TESTS.md'), 'utf8').split(/\r?\n/);

// Sections: "## <heading>" followed by bullets "- `test/x.js`: "name"" until the next "## ".
function sections() {
  const out = [];
  for (const line of doc) {
    const h = line.match(/^## (.+)$/);
    if (h) { out.push({ heading: h[1], tests: [] }); continue; }
    const b = line.match(/^- `(test\/[\w.-]+\.js)`: "(.+)"\s*$/);
    if (b && out.length) out[out.length - 1].tests.push({ file: b[1], name: b[2] });
  }
  return out;
}

// Does the file declare test('<name>' ...) or test("<name>" ...) with a string literal?
function declares(file, name) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  // Anchored at the start of a line (after indentation), so a commented-out test does not count.
  return src.split(/\r?\n/).some((l) => /^\s*test\(/.test(l) && (l.includes(`test('${name}'`) || l.includes(`test("${name}"`)));
}

test('every test listed in docs/CONTRACT_TESTS.md exists', () => {
  const secs = sections();
  assert.ok(secs.length >= 5, 'expected one section per contract row plus the async sentence');
  assert.ok(secs.some((s) => /^Async/.test(s.heading)), 'docs/CONTRACT_TESTS.md needs an "Async" section for the one-at-a-time sentence in CLAUDE.md');
  for (const s of secs) {
    assert.ok(s.tests.length > 0, `section "${s.heading}" lists no test`);
    for (const t of s.tests) {
      assert.ok(fs.existsSync(path.join(root, t.file)), `${t.file} (section "${s.heading}") does not exist`);
      assert.ok(declares(t.file, t.name), `${t.file} has no test named "${t.name}" (section "${s.heading}")`);
    }
  }
});

test('every contract row in CLAUDE.md has a section in docs/CONTRACT_TESTS.md', () => {
  const md = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8').split(/\r?\n/);
  const start = md.findIndex((l) => /^\*\*Contract\*\*/.test(l));
  assert.ok(start >= 0, 'CLAUDE.md has no **Contract** table (update this test if it moved)');
  const rows = [];
  for (let i = start + 1; i < md.length; i++) {
    if (md[i].trim() === '' && rows.length) break;
    const m = md[i].match(/^\|\s*([^|]+?)\s*\|/);
    if (m && !/^(Rule|-+)/.test(m[1])) rows.push(m[1].replace(/`/g, ''));
  }
  assert.deepStrictEqual(rows.length, 4, `expected 4 contract rows, found ${JSON.stringify(rows)}`);
  const headings = sections().map((s) => s.heading.replace(/`/g, ''));
  for (const r of rows) {
    assert.ok(headings.some((h) => h.startsWith(r)), `contract row "${r}" has no section in docs/CONTRACT_TESTS.md`);
  }
});
