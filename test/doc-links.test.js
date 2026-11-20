'use strict';
// BL8: relative links (and #anchors) in PROGRESS.md, TASKS.md and docs/*.md point at files and headings that exist.
// Links inside fenced code blocks and `inline code` do not count (task text describes links in code spans).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { anchorsOf, inlineLinks } = require('./helpers/links');

const root = path.join(__dirname, '..');
const files = ['PROGRESS.md', 'TASKS.md', ...fs.readdirSync(path.join(root, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`)];

// Known dead links that need an owner decision: `file -> target`. Empty today.
const EXCLUDED = new Set([]);

function check(rel, text) {
  const bad = [];
  let n = 0;
  for (const { target, line } of inlineLinks(text)) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue; // http:, https:, mailto:, ...
    const [file, anchor] = target.split('#');
    if (!file && !anchor) continue;
    n++;
    if (EXCLUDED.has(`${rel} -> ${target}`)) continue;
    const abs = file ? path.resolve(root, path.dirname(rel), file) : path.join(root, rel);
    if (!fs.existsSync(abs)) { bad.push(`${rel}:${line} links ${target}, which does not exist`); continue; }
    if (anchor && abs.endsWith('.md') && !anchorsOf(abs).has(anchor)) bad.push(`${rel}:${line} links ${target}, but ${path.relative(root, abs)} has no such heading`);
  }
  return { n, bad };
}

test('relative links in PROGRESS.md, TASKS.md and docs/*.md resolve (file and anchor)', () => {
  let total = 0;
  const bad = [];
  for (const rel of files) {
    const r = check(rel, fs.readFileSync(path.join(root, rel), 'utf8'));
    total += r.n;
    bad.push(...r.bad);
  }
  assert.ok(total >= 20, `expected many relative links, found ${total}`);
  assert.deepStrictEqual(bad, []);
});

test('the checker ignores code and external links and reports dead ones', () => {
  const text = [
    '# T', '', '[ok](#test-suite-time-bl6) [ext](https://example.com/x.md) [mail](mailto:a@b.c)',
    'text `[code](nope.md)` more', '```', '[fenced](nope2.md)', '```',
    '[dead](missing-file.md) [badanchor](PERF.md#no-such-heading)',
  ].join('\n');
  const r = check('docs/PERF.md', text);
  assert.strictEqual(r.n, 3);
  assert.strictEqual(r.bad.length, 2);
  assert.match(r.bad[0], /docs\/PERF\.md:8 links missing-file\.md/);
  assert.match(r.bad[1], /PERF\.md#no-such-heading/);
});
