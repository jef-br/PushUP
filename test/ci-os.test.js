'use strict';
// BL77: CI runs the tests on Windows and macOS too, and the README says so. Text only, no network.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const ci = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

// The text of one top-level job (from "  <name>:" to the next job or the end).
function job(text, name) {
  const m = new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  \\S|(?![\\s\\S]))`, 'm').exec(text);
  return m ? m[1] : null;
}

test('ci.yml has a test-os job for windows-latest and macos-latest that runs npm test', () => {
  const j = job(ci, 'test-os');
  assert.ok(j, 'no job "test-os" in .github/workflows/ci.yml');
  assert.match(j, /os:\s*windows-latest/);
  assert.match(j, /os:\s*macos-latest/);
  assert.match(j, /run: npm test/);
  assert.match(j, /fail-fast: false/);
});

test('the macOS job is pinned to PUSHUP_DEVICE=cpu and says why (docs/DECISIONS.md D17)', () => {
  const j = job(ci, 'test-os');
  assert.match(j, /os: macos-latest\n\s+device: cpu/);
  assert.match(j, /PUSHUP_DEVICE: \$\{\{ matrix\.device \}\}/);
  assert.match(fs.readFileSync(path.join(root, 'docs', 'DECISIONS.md'), 'utf8'), /^## D17 /m);
});

test('the README says CI also runs the tests on Windows and macOS', () => {
  assert.match(readme, /CI also runs them on Windows and macOS/);
});

test('job() finds a job and reports a missing one', () => {
  const yml = 'jobs:\n  a:\n    x: 1\n  b:\n    y: 2\n';
  assert.strictEqual(job(yml, 'a'), '    x: 1\n');
  assert.strictEqual(job(yml, 'b'), '    y: 2\n');
  assert.strictEqual(job(yml, 'c'), null);
});
