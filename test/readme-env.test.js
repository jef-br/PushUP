'use strict';
// BK6: every PUSHUP_* / P4_* / P5_* environment variable that the code, scripts or CI read is
// listed in the README table under "Quality modes and GPU" (and the table lists nothing nobody reads).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const PREFIX = '(?:PUSHUP|P4|P5)_[A-Z0-9_]+';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'out' || e.name.startsWith('.git')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function readNames() {
  const names = new Set();
  const dirs = ['src', 'bench', 'scripts', 'tools', '.github/workflows'].map((d) => path.join(root, d));
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of walk(dir)) {
      const text = fs.readFileSync(file, 'utf8');
      const patterns = [];
      if (/\.(?:js|cjs|mjs)$/.test(file)) {
        patterns.push(new RegExp(`process\\.env\\.(${PREFIX})`, 'g'));
        patterns.push(new RegExp(`process\\.env\\[['"](${PREFIX})['"]\\]`, 'g'));
        patterns.push(new RegExp(`readSetting\\(\\s*['"](${PREFIX})['"]`, 'g'));
      }
      if (/\.(?:sh|ya?ml)$/.test(file)) {
        patterns.push(new RegExp(`\\$\\{?(${PREFIX})`, 'g'));
        patterns.push(new RegExp(`^\\s*(${PREFIX}):`, 'gm'));
      }
      for (const re of patterns) for (const m of text.matchAll(re)) names.add(m[1]);
    }
  }
  return names;
}

// Names in the first-column cells of the table under the "Quality modes and GPU" heading.
function readmeNames() {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const start = readme.indexOf('\n## Quality modes and GPU');
  assert.ok(start >= 0, 'README has no "## Quality modes and GPU" section');
  const rest = readme.slice(start + 1);
  const end = rest.slice(3).search(/\n## /);
  const section = end < 0 ? rest : rest.slice(0, end + 3);
  const names = new Set();
  for (const line of section.split('\n')) {
    if (!/^\|/.test(line)) continue;
    const first = line.split('|')[1] || '';
    for (const m of first.matchAll(new RegExp(`\`(${PREFIX})\``, 'g'))) names.add(m[1]);
  }
  return names;
}

test('the README variable table matches the variables the code reads', () => {
  const read = readNames();
  const doc = readmeNames();
  assert.ok(read.has('PUSHUP_QUALITY') && read.has('PUSHUP_DEVICE'), `scan found ${[...read]}`);
  const missing = [...read].filter((n) => !doc.has(n));
  const extra = [...doc].filter((n) => !read.has(n));
  assert.deepStrictEqual(missing, [], `read in the code but missing from the README table: ${missing}`);
  assert.deepStrictEqual(extra, [], `listed in the README table but read nowhere: ${extra}`);
});

test('the scan sees the variables read in each place (guards the patterns)', () => {
  const read = readNames();
  for (const n of ['PUSHUP_QUALITY', 'PUSHUP_DEVICE', 'PUSHUP_SMOKE_NPM_ARGS', 'P4_THREADS', 'P4_SIZE', 'P5_CHILD_INDEX', 'P5_FAIL_CHILD']) {
    assert.ok(read.has(n), `${n} not found by the scan`);
  }
});
