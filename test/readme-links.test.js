'use strict';
// DOC13: every `docs/*.md` link in the README points at a file that exists, and its #anchor (if any)
// matches a heading of that file (GitHub slug rules: lower case, punctuation removed, spaces to hyphens).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

function anchorsOf(file) {
  const text = fs.readFileSync(file, 'utf8');
  const seen = new Map();
  const out = new Set();
  let fence = false;
  for (const line of text.split('\n')) {
    if (/^```/.test(line)) fence = !fence;
    const m = !fence && /^#{1,6}\s+(.*)$/.exec(line);
    if (!m) continue;
    let s = slug(m[1]);
    const n = seen.get(s) || 0;
    seen.set(s, n + 1);
    out.add(n ? `${s}-${n}` : s);
  }
  return out;
}

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
