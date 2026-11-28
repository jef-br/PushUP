'use strict';
// BL79: the README "GPU support" table is the user-facing statement of gpuProviders() in
// src/index.js. This test compares them, so a provider added or dropped in code only (or in
// the README only) fails here.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { _gpuProviders } = require('../src');

const PROVIDER_NAMES = { directml: 'dml', cuda: 'cuda', coreml: 'coreml' };
const PLATFORMS = { windows: 'win32', linux: 'linux', macos: 'darwin' };
// Every platform/arch pair the check looks at; pairs no row names must return [].
const PAIRS = [
  ['win32', 'x64'], ['win32', 'arm64'], ['linux', 'x64'], ['linux', 'arm64'],
  ['darwin', 'x64'], ['darwin', 'arm64'], ['freebsd', 'x64'],
];

// Rows of the table whose header is "Platform | GPU provider | Needs" (found by heading text).
function parseGpuTable(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\|\s*Platform\s*\|\s*GPU provider\s*\|\s*Needs\s*\|/i.test(l));
  if (start < 0) throw new Error('README has no "Platform | GPU provider | Needs" table');
  const rows = [];
  for (let i = start + 2; i < lines.length && /^\|/.test(lines[i]); i++) {
    const cells = lines[i].split('|').slice(1, -1).map((c) => c.trim());
    rows.push({ platform: cells[0], provider: cells[1], line: lines[i] });
  }
  return rows;
}

// Returns a list of problems (empty = README table and code agree).
function checkTable(rows, gpuProviders) {
  const problems = [];
  const covered = new Set();
  for (const row of rows) {
    const os = Object.keys(PLATFORMS).find((k) => row.platform.toLowerCase().includes(k));
    const archs = ['x64', 'arm64'].filter((a) => row.platform.toLowerCase().includes(a));
    const prov = Object.keys(PROVIDER_NAMES).find((k) => row.provider.toLowerCase().includes(k));
    if (!os || !archs.length || !prov) {
      problems.push(`README row "${row.line}" is not understood (needs OS, arch and a known provider)`);
      continue;
    }
    for (const arch of archs) {
      covered.add(`${PLATFORMS[os]}/${arch}`);
      const got = gpuProviders(PLATFORMS[os], arch);
      if (got.length !== 1 || got[0] !== PROVIDER_NAMES[prov]) {
        problems.push(`README row "${row.platform}" names ${row.provider} (${PROVIDER_NAMES[prov]}) but ` +
          `_gpuProviders('${PLATFORMS[os]}', '${arch}') returns [${got.join(', ')}] in src/index.js`);
      }
    }
  }
  for (const [platform, arch] of PAIRS) {
    if (covered.has(`${platform}/${arch}`)) continue;
    const got = gpuProviders(platform, arch);
    if (got.length) {
      problems.push(`src/index.js returns [${got.join(', ')}] for ${platform}/${arch} but the README table has no row for it`);
    }
  }
  return problems;
}

test('README GPU table matches _gpuProviders', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  const rows = parseGpuTable(text);
  assert.ok(rows.length >= 3, 'the table has the three platform rows');
  const problems = checkTable(rows, _gpuProviders);
  assert.deepStrictEqual(problems, [], problems.join('\n'));
});

test('the check reports a row that names the wrong provider', () => {
  const text = [
    '| Platform | GPU provider | Needs |', '|---|---|---|',
    '| Windows x64/arm64 | CUDA | x |',
    '| Linux x64 | CUDA | x |',
    '| macOS arm64 | CoreML | x |',
  ].join('\n');
  const problems = checkTable(parseGpuTable(text), _gpuProviders);
  assert.strictEqual(problems.length, 2); // x64 and arm64 of the Windows row
  assert.match(problems[0], /README row "Windows x64\/arm64" names CUDA/);
  assert.match(problems[0], /_gpuProviders\('win32', 'x64'\) returns \[dml\]/);
});

test('the check reports a code provider that has no README row', () => {
  const text = [
    '| Platform | GPU provider | Needs |', '|---|---|---|',
    '| Windows x64/arm64 | DirectML | x |',
    '| Linux x64 | CUDA | x |',
  ].join('\n');
  const problems = checkTable(parseGpuTable(text), _gpuProviders);
  assert.deepStrictEqual(problems.length, 1);
  assert.match(problems[0], /darwin\/arm64 but the README table has no row/);
});

test('the check reports a README row for a pair the code does not support', () => {
  const text = [
    '| Platform | GPU provider | Needs |', '|---|---|---|',
    '| Windows x64/arm64 | DirectML | x |',
    '| Linux x64/arm64 | CUDA | x |',
    '| macOS arm64 | CoreML | x |',
  ].join('\n');
  const problems = checkTable(parseGpuTable(text), _gpuProviders);
  assert.strictEqual(problems.length, 1);
  assert.match(problems[0], /Linux x64\/arm64.*_gpuProviders\('linux', 'arm64'\) returns \[\]/);
});
