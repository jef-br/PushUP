'use strict';
// BL11: the Node versions in package.json `engines`, the CI matrix and the README agree, so that raising
// one and forgetting another (CI testing an unsupported version, the README promising an untested one) fails here.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

// `>=20.9` (or `>=20`) -> { major: 20, minor: 9 }. Any other form fails on purpose: update this test when the form changes.
function parseEngines(range) {
  const m = /^>=(\d+)(?:\.(\d+))?$/.exec(String(range).trim());
  assert.ok(m, `engines.node is "${range}", not the ">=X.Y" form this test understands`);
  return { major: Number(m[1]), minor: Number(m[2] || 0) };
}

// The `node-version: [a, b, c]` list of the job named `job` (plain text, no YAML parser).
function ciMatrix(yml, job) {
  const lines = yml.split('\n');
  const start = lines.findIndex((l) => l === `  ${job}:`);
  assert.ok(start >= 0, `no job "${job}" in the workflow`);
  let end = lines.findIndex((l, i) => i > start && /^ {2}\S/.test(l));
  if (end < 0) end = lines.length;
  const m = lines.slice(start, end).map((l) => /^\s*node-version:\s*\[([^\]]*)\]\s*$/.exec(l)).find(Boolean);
  assert.ok(m, `job "${job}" has no "node-version: [...]" list`);
  return m[1].split(',').map((s) => Number(s.trim()));
}

// "Requires Node.js >= 20.9" in the README.
function readmeMinimum(text) {
  const m = /Requires Node\.js >= (\d+)(?:\.(\d+))?/.exec(text);
  assert.ok(m, 'README has no "Requires Node.js >= X.Y" sentence');
  return { major: Number(m[1]), minor: Number(m[2] || 0) };
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const ci = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

test('the CI matrix, package.json engines and the README name the same minimum Node version', () => {
  const eng = parseEngines(pkg.engines && pkg.engines.node);
  const matrix = ciMatrix(ci, 'test');
  const rd = readmeMinimum(readme);
  assert.strictEqual(Math.min(...matrix), eng.major, `package.json engines needs Node ${eng.major}, but the lowest version in the CI "test" matrix is ${Math.min(...matrix)} (.github/workflows/ci.yml)`);
  assert.deepStrictEqual(rd, eng, `README says Node >= ${rd.major}.${rd.minor}, package.json engines says >= ${eng.major}.${eng.minor}`);
  assert.deepStrictEqual(matrix, [...new Set(matrix)].sort((a, b) => a - b), 'the CI node-version list must be sorted with no duplicates');
  const [cur, curMinor] = process.versions.node.split('.').map(Number);
  assert.ok(cur > eng.major || (cur === eng.major && curMinor >= eng.minor), `this Node (${process.versions.node}) does not satisfy engines ">=${eng.major}.${eng.minor}"`);
});

test('the parsers read the forms they claim to and reject the rest', () => {
  assert.deepStrictEqual(parseEngines('>=20.9'), { major: 20, minor: 9 });
  assert.deepStrictEqual(parseEngines(' >=22 '), { major: 22, minor: 0 });
  assert.throws(() => parseEngines('^20.9.0'), /not the ">=X.Y" form/);
  assert.throws(() => parseEngines(undefined), /not the ">=X.Y" form/);
  const yml = ['jobs:', '  test:', '    strategy:', '      matrix:', '        node-version: [20, 22, 24]', '  other:', '    node-version: [18]'].join('\n');
  assert.deepStrictEqual(ciMatrix(yml, 'test'), [20, 22, 24]);
  assert.deepStrictEqual(ciMatrix(yml, 'other'), [18]);
  assert.throws(() => ciMatrix(yml, 'missing'), /no job "missing"/);
  assert.throws(() => ciMatrix('jobs:\n  test:\n    steps: []\n', 'test'), /no "node-version/);
  assert.deepStrictEqual(readmeMinimum('Requires Node.js >= 20.9 (x)'), { major: 20, minor: 9 });
  assert.throws(() => readmeMinimum('Node 20'), /no "Requires Node/);
});
