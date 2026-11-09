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
