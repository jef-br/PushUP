'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.join(__dirname, '..', 'bench', 'fetch_testset.sh');
const text = fs.readFileSync(script, 'utf8');
const code = text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

test('fetch_testset.sh has no bare pip command', () => {
  assert.doesNotMatch(code, /(?<!-m )(?<![\w.\/-])pip3?\s+install/m);
  assert.match(code, /-m pip install/);
});

test('build_testset.py runs with the interpreter that checked the imports', () => {
  assert.match(code, /PY=python3/);
  assert.match(code, /"\$PY" -c "import pyarrow; from PIL import Image"/);
  assert.match(code, /"\$PY" build_testset\.py/);
  assert.doesNotMatch(code, /^\s*python3 build_testset\.py/m);
});

test('bench/fetch_testset.sh passes bash -n', () => {
  const r = spawnSync('bash', ['-n', script], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
});
