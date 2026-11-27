'use strict';
// BL8: relative links (and #anchors) in PROGRESS.md, TASKS.md and docs/*.md point at files and headings that exist.
// Links inside fenced code blocks and `inline code` do not count (task text describes links in code spans).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { anchorsOf, inlineLinks, slug } = require('./helpers/links');

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

// BL69: the "**Contents**" list of docs/COLOR.md links every `##`/`###` heading of the file, in file order, with GitHub's anchor
// (`slug` of the heading; a repeated slug gets -1, -2 ...), and links nothing else. The list is the lines starting "- [" that follow
// the "**Contents**" line up to the next heading. The Contents line is not a heading, so it is not in the list it checks.
function contentsProblems(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith('**Contents**'));
  if (start < 0) return ['no "**Contents**" line'];
  const listed = [];
  for (let i = start + 1; i < lines.length && !/^#{1,6} /.test(lines[i]); i++) {
    const m = /^- \[(.*)\]\(#([^)\s]+)\)/.exec(lines[i]);
    if (m) listed.push({ text: m[1], anchor: m[2] });
  }
  const seen = new Map(), wanted = [];
  let fence = false;
  for (const l of lines) {
    if (/^```/.test(l)) fence = !fence;
    const m = !fence && /^(#{2,3}) (.*)$/.exec(l);
    if (!m) continue;
    let a = slug(m[2]);
    const n = seen.get(a) || 0;
    seen.set(a, n + 1);
    if (n) a += `-${n}`;
    wanted.push({ heading: m[2], anchor: a });
  }
  const problems = [];
  const have = new Set(listed.map((x) => x.anchor)), want = new Set(wanted.map((x) => x.anchor));
  for (const w of wanted) if (!have.has(w.anchor)) problems.push(`heading "${w.heading}" is not in the Contents list`);
  for (const x of listed) if (!want.has(x.anchor)) problems.push(`Contents links #${x.anchor} ("${x.text}"), which is no heading`);
  if (!problems.length) {
    const order = listed.map((x) => x.anchor);
    wanted.forEach((w, i) => { if (order[i] !== w.anchor) problems.push(`Contents entry ${i + 1} is #${order[i]}, file order has #${w.anchor} ("${w.heading}")`); });
  }
  return problems;
}

test('the Contents list of docs/COLOR.md links every ## and ### heading in file order (BL69)', () => {
  const text = fs.readFileSync(path.join(root, 'docs', 'COLOR.md'), 'utf8');
  assert.deepStrictEqual(contentsProblems(text), []);
});

test('a missing heading, a dead link and a wrong order in a Contents list are reported by name (BL69)', () => {
  const doc = (list) => ['# T', '', '**Contents**', '', ...list, '', '## One', 'x', '### Two (A)', 'y', '## Three', ''].join('\n');
  const ok = ['- [One](#one): a', '- [Two (A)](#two-a): b', '- [Three](#three): c'];
  assert.deepStrictEqual(contentsProblems(doc(ok)), []);
  assert.deepStrictEqual(contentsProblems(doc([ok[0], ok[2]])), ['heading "Two (A)" is not in the Contents list']);
  assert.deepStrictEqual(contentsProblems(doc([...ok, '- [Four](#four): d'])), ['Contents links #four ("Four"), which is no heading']);
  assert.deepStrictEqual(contentsProblems(doc([ok[0], ok[2], ok[1]])), ['Contents entry 2 is #three, file order has #two-a ("Two (A)")', 'Contents entry 3 is #two-a, file order has #three ("Three")']);
  assert.deepStrictEqual(contentsProblems('# T\n## One\n'), ['no "**Contents**" line']);
  // A repeated heading gets GitHub's -1 suffix.
  assert.deepStrictEqual(contentsProblems(['# T', '**Contents**', '- [A](#a)', '- [A](#a-1)', '## A', '## A', ''].join('\n')), []);
});
