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
let packed; // BL36: `npm pack --dry-run` takes about 3 s, so run it once for all the cases that need its result
function packInfo() {
  if (packed) return packed;
  const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  packed = JSON.parse(out)[0];
  return packed;
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

// BL36: README "Install" says "(~70 MB download, ...)". Compare that figure with the real packed size (decimal MB,
// within 15%) so a model swap cannot leave the sentence wrong. Only the text between `## Install` and the next
// `## ` is read. Returns a list of problems (empty when the figure is within 15% of `packedBytes`).
function installSizeProblems(readme, packedBytes) {
  const at = readme.indexOf('\n## Install');
  if (at < 0) return ['README: no "## Install" section'];
  const rest = readme.slice(at + 1);
  const end = rest.indexOf('\n## ', 3);
  const m = /~(\d+(?:\.\d+)?) MB/.exec(end < 0 ? rest : rest.slice(0, end));
  if (!m) return ['README "Install": no "~<n> MB" download size'];
  const said = Number(m[1]), real = packedBytes / 1e6;
  return Math.abs(said - real) > 0.15 * real
    ? [`README "Install" says ~${said} MB but the packed tarball is ${real.toFixed(1)} MB (more than 15% apart)`] : [];
}
test('the download size in README "Install" is within 15% of the packed tarball', () => {
  const readme = require('node:fs').readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  assert.deepStrictEqual(installSizeProblems(readme, packInfo().size), []);
});
test('the Install size check reports a figure 20% off, and accepts one 8% off', () => {
  const doc = (n) => `# T\n## Install\nthe package (~${n} MB download).\n## Usage\n(~1 MB elsewhere)\n`;
  assert.deepStrictEqual(installSizeProblems(doc(70), 64.3e6), []);
  assert.deepStrictEqual(installSizeProblems(doc(40), 64.3e6), ['README "Install" says ~40 MB but the packed tarball is 64.3 MB (more than 15% apart)']);
  assert.deepStrictEqual(installSizeProblems(doc(77.2), 64.3e6), ['README "Install" says ~77.2 MB but the packed tarball is 64.3 MB (more than 15% apart)']);
  assert.deepStrictEqual(installSizeProblems(doc(69.4), 64.3e6), []); // 8% off
  assert.deepStrictEqual(installSizeProblems('# T\n## Install\nno size here\n## Usage\n', 64.3e6), ['README "Install": no "~<n> MB" download size']);
  assert.deepStrictEqual(installSizeProblems('# T\n', 64.3e6), ['README: no "## Install" section']);
});
