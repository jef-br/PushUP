'use strict';
// DOC13: every `docs/*.md` link in the README points at a file that exists, and its #anchor (if any)
// matches a heading of that file (GitHub slug rules: lower case, punctuation removed, spaces to hyphens).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { anchorsOf } = require('./helpers/links');

const root = path.join(__dirname, '..');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

test('README has links to docs/*.md and each one resolves (file and anchor)', () => {
  const links = [...readme.matchAll(/\]\((docs\/[\w.-]+\.md)(?:#([^)\s]*))?\)/g)].map((m) => ({ file: m[1], anchor: m[2] }));
  assert.ok(links.length >= 5, `expected several docs links in the README, found ${links.length}`);
  assert.ok(links.some((l) => l.file === 'docs/EDGES.md') && links.some((l) => l.file === 'docs/COLOR.md'), 'README links EDGES.md and COLOR.md');
  for (const { file, anchor } of links) {
    const p = path.join(root, file);
    assert.ok(fs.existsSync(p), `README links ${file}, which does not exist`);
    if (anchor) assert.ok(anchorsOf(p).has(anchor), `README links ${file}#${anchor}, but ${file} has no such heading`);
  }
});

// DOC14: the links inside docs/OWNER_DECISIONS.md (relative to docs/) resolve too: file and anchor.
test('docs/OWNER_DECISIONS.md links resolve (file and anchor)', () => {
  const file = path.join(root, 'docs', 'OWNER_DECISIONS.md');
  const text = fs.readFileSync(file, 'utf8');
  const links = [...text.matchAll(/\]\(([\w.-]+\.md)(?:#([^)\s]*))?\)/g)].map((m) => ({ file: m[1], anchor: m[2] }));
  assert.ok(links.length >= 8, `expected several links in OWNER_DECISIONS.md, found ${links.length}`);
  assert.ok(links.some((l) => l.file === 'PAD.md') && links.some((l) => l.file === 'EDGES.md' && l.anchor), 'new entries link PAD.md and EDGES.md#...');
  for (const { file: f, anchor } of links) {
    const p = path.join(root, 'docs', f);
    assert.ok(fs.existsSync(p), `OWNER_DECISIONS.md links ${f}, which does not exist`);
    if (anchor) assert.ok(anchorsOf(p).has(anchor), `OWNER_DECISIONS.md links ${f}#${anchor}, but ${f} has no such heading`);
  }
});
