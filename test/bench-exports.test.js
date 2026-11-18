'use strict';
// SM1: the bench/ scripts reach into src/index.js through underscore exports (`_run`, `_MODES`, ...). If one is
// renamed or removed, only the script that uses it breaks, and nobody notices until someone runs it (most take
// minutes). This test (1) runs `node --check` on every bench/*.js and bench/saas/*.js and (2) finds the names each
// file takes from `require('<...>/src')` or `require('<...>/src/index.js')` and checks that the real export object
// has them. (`scripts/` holds only pack-smoke.sh, so nothing there.)
//
// Forms of use the scan understands (plain regexes, no parser):
//   - destructuring: `const { a, b: c } = require('../src/index.js');`, at any indentation, inside functions,
//     possibly twice in one file with different names (bench/memory-breakdown.js);
//   - the inline form `require('../src/index.js')._NAME` (bench/throughput.js);
//   - `const x = require('../src');` followed by `x.name` uses.
// Comments are stripped first (so a commented-out require or a comment inside a destructuring list is ignored), `...rest`
// keys are skipped, and `/index` may omit `.js`. Not understood (none of these is used in bench/ today): a require stored in a
// variable and passed around or destructured later, dynamic paths, bracket access, `import`, object defaults
// (`{ a = {} }`), and a name `x` of `const x = require(...)` that is shadowed elsewhere in the file (every `x.name` counts).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
// No capture groups in SRC, so the group numbers in the regexes below stay simple.
const SRC = String.raw`require\(\s*['"](?:\.\./)+src(?:/index(?:\.js)?)?['"]\s*\)`;

// All export names a source text takes from src. Pure function of the text.
function usedExports(source) {
  // Strip comments (a string containing `//` could fool this; none of the require paths does).
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const names = new Set();
  for (const m of text.matchAll(new RegExp(String.raw`\{([^{}]*)\}\s*=\s*` + SRC, 'g'))) {
    for (const part of m[1].split(',')) {
      const key = part.split(':')[0].split('=')[0].trim();
      if (key && !key.startsWith('...')) names.add(key);
    }
  }
  for (const m of text.matchAll(new RegExp(SRC + String.raw`\s*\.\s*([A-Za-z_$][\w$]*)`, 'g'))) names.add(m[1]);
  for (const m of text.matchAll(new RegExp(String.raw`(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*` + SRC, 'g'))) {
    for (const u of text.matchAll(new RegExp(String.raw`\b${m[1].replace(/\$/g, '\\$')}\s*\.\s*([A-Za-z_$][\w$]*)`, 'g'))) names.add(u[1]);
  }
  return names;
}

// Names that are not own properties of `exportsObj`, as `file: name` strings.
function missingExports(exportsObj, usedByFile) {
  const missing = [];
  for (const [file, names] of usedByFile) {
    for (const n of names) if (!Object.prototype.hasOwnProperty.call(exportsObj, n)) missing.push(`${file}: ${n}`);
  }
  return missing;
}

const files = [
  ...fs.readdirSync(path.join(root, 'bench')).filter((f) => f.endsWith('.js')).map((f) => path.join('bench', f)),
  ...fs.readdirSync(path.join(root, 'bench', 'saas')).filter((f) => f.endsWith('.js')).map((f) => path.join('bench', 'saas', f)),
].sort();

test('every bench script is valid JavaScript (node --check)', () => {
  assert.ok(files.length >= 17, `expected at least 17 bench scripts, found ${files.length}`);
  for (const f of files) {
    const r = spawnSync(process.execPath, ['--check', path.join(root, f)], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, `${f} does not parse:\n${r.stderr}`);
  }
});

test('every export a bench script takes from src exists', () => {
  const real = require('../src');
  const usedByFile = new Map(files.map((f) => [f, usedExports(fs.readFileSync(path.join(root, f), 'utf8'))]));
  const all = new Set([...usedByFile.values()].flatMap((s) => [...s]));
  // A floor, so a scan that silently finds nothing cannot pass.
  for (const n of ['_run', '_MODES', '_sessionOptions', '_toTensor', '_copyFromTensor', '_mixLanczos', '_reset', 'upscale']) {
    assert.ok(all.has(n), `the scan did not find any use of ${n}; the regexes may be broken`);
  }
  assert.deepStrictEqual(missingExports(real, usedByFile), [], 'bench scripts use exports that src/index.js does not have');
});

test('the check fails when an export is missing (mutation on a copy of the export object)', () => {
  const usedByFile = new Map(files.map((f) => [f, usedExports(fs.readFileSync(path.join(root, f), 'utf8'))]));
  const mutated = { ...require('../src') };
  delete mutated._MODES;
  const missing = missingExports(mutated, usedByFile);
  assert.ok(missing.some((m) => m.endsWith(': _MODES')), `expected _MODES to be reported missing, got ${missing}`);
  assert.ok(missing.some((m) => m.startsWith(`bench${path.sep}throughput.js`)), 'the inline require(...)._MODES form is read');
});

test('the scan understands each form of use', () => {
  const t = (text) => [...usedExports(text)].sort();
  assert.deepStrictEqual(t("const { a, b: c, d = 1 } = require('../src/index.js');"), ['a', 'b', 'd']);
  assert.deepStrictEqual(t("  function f() {\n    const { _run } = require('../../src');\n  }"), ['_run']);
  assert.deepStrictEqual(t("x(require('../src/index.js')._MODES.fast)"), ['_MODES']);
  assert.deepStrictEqual(t("const p = require('../src');\np.upscale(1); p._run(2);"), ['_run', 'upscale']);
  assert.deepStrictEqual(t("const { x } = require('onnxruntime-node');"), []);
  assert.deepStrictEqual(t("const { a, // why\n  b, ...rest } = require('../src/index');"), ['a', 'b']);
  assert.deepStrictEqual(t("// const { gone } = require('../src');\n/* const { gone2 } = require('../src'); */\nconst { kept } = require('../src'); // trailing"), ['kept']);
});
