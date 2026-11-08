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
    'models/realesr-general-wdn-x4v3.onnx']) {
    assert.ok(files.includes(must), `missing ${must}`);
  }
  for (const f of files) {
    assert.ok(!/^(bench|tools|test|docs|\.claude)\//.test(f), `unexpected ${f}`);
  }
});
