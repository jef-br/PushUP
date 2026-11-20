'use strict';
// Shared by test/readme-links.test.js and test/doc-links.test.js: GitHub heading slugs and the
// anchors a markdown file offers.
const fs = require('node:fs');

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

// Inline links `[text](target)` outside fenced code blocks and inline code spans.
function inlineLinks(text) {
  const out = [];
  let fence = false;
  text.split('\n').forEach((line, i) => {
    if (/^\s*```/.test(line)) { fence = !fence; return; }
    if (fence) return;
    const bare = line.replace(/`[^`]*`/g, '');
    for (const m of bare.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) out.push({ target: m[1], line: i + 1 });
  });
  return out;
}

module.exports = { slug, anchorsOf, inlineLinks };
