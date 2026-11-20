'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

// Guards the publish tarball contents (task I3): runtime files in, tooling out.
test('npm pack tarball has runtime files and no dev tooling', () => {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const files = JSON.parse(out)[0].files.map((f) => f.path);
  for (const must of ['package.json', 'README.md', 'LICENSE', 'src/index.js',
    'models/4xLSDIRCompactC3.onnx', 'models/4x_foolhardy_Remacri.onnx', 'models/LICENSES.md']) {
    assert.ok(files.includes(must), `missing ${must}`);
  }
  const rootAllowed = new Set(['package.json', 'README.md', 'LICENSE']);
  for (const f of files) {
    assert.ok(rootAllowed.has(f) || /^src\//.test(f) || /^models\/[^/]+\.onnx$/.test(f) || f === 'models/LICENSES.md',
      `unexpected ${f}`);
  }
});

// BL19: the models the code loads (MODES in src/index.js) are the ones that are packed, and the tarball stays
// under a size budget. 75 000 000 bytes: measured 64 306 157 packed on 2026-11-20 (7 files), about 17% headroom.
const PACK_BUDGET_BYTES = 75000000;
function packInfo() {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return JSON.parse(out)[0];
}
test('the model files named in MODES are packed, and the tarball is under its size budget', () => {
  const { _MODES } = require('../src');
  const info = packInfo();
  const files = info.files.map((f) => f.path);
  for (const mode of ['fast', 'high']) {
    const rel = `models/${path.basename(_MODES[mode].modelPath)}`;
    assert.ok(files.includes(rel), `MODES.${mode} loads ${rel}, which is not in the packed file list`);
  }
  assert.ok(info.size < PACK_BUDGET_BYTES,
    `packed size is ${info.size} bytes, over the budget of ${PACK_BUDGET_BYTES} bytes (raise the budget on purpose, with a reason)`);
});
