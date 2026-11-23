'use strict';
// S1: every shipped model file must match the full SHA-256 recorded in models/LICENSES.md,
// so a corrupted or swapped .onnx (or a stale hash) fails here, not as a quality regression.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'models');

// Rows of the table in LICENSES.md: first cell `file.onnx`, last cell `<64 hex>` (ONNX SHA-256 column).
function recordedHashes() {
  const text = fs.readFileSync(path.join(dir, 'LICENSES.md'), 'utf8');
  const lines = text.split(/\r?\n/);
  const header = lines.find((l) => l.startsWith('|') && l.includes('ONNX SHA-256'));
  assert.ok(header, 'models/LICENSES.md has no "ONNX SHA-256" column');
  const cols = header.split('|').slice(1, -1).map((c) => c.trim());
  const col = cols.indexOf('ONNX SHA-256');
  const out = {};
  for (const l of lines) {
    const m = l.match(/^\|\s*`([^`]+\.onnx)`\s*\|/);
    if (!m) continue;
    const cells = l.split('|').slice(1, -1).map((c) => c.trim());
    const h = cells[col] && cells[col].match(/^`([0-9a-f]{64})`$/);
    assert.ok(h, `${m[1]}: the ONNX SHA-256 cell must be a full 64-hex hash in backticks, got "${cells[col]}"`);
    out[m[1]] = h[1];
  }
  return out;
}

test('every .onnx in models/ has a recorded hash, and it matches the file', () => {
  const recorded = recordedHashes();
  const shipped = fs.readdirSync(dir).filter((f) => f.endsWith('.onnx')).sort();
  assert.ok(shipped.length >= 2, 'expected at least the fast and high models in models/');
  for (const f of shipped) {
    assert.ok(recorded[f], `${f} has no hash in models/LICENSES.md (add it to the ONNX SHA-256 column)`);
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex');
    assert.strictEqual(actual, recorded[f], `${f} does not match the hash in models/LICENSES.md`);
  }
  for (const f of Object.keys(recorded)) {
    assert.ok(shipped.includes(f), `LICENSES.md records ${f} but it is not in models/`);
  }
});

// BL39: the README "Licenses:" paragraph and the sentence "Both ONNX models ship in the package" must agree with
// models/LICENSES.md and with the files in models/. The license is the link text of the "License" column
// (for example `[CC BY 4.0](https://...)` gives "CC BY 4.0"). Returns a list of problems (empty when they agree).
function licenseCell(licensesMd, file) {
  const lines = licensesMd.split(/\r?\n/);
  const header = lines.find((l) => l.startsWith('|') && /\|\s*License\s*\|/.test(l));
  if (!header) return null;
  const col = header.split('|').slice(1, -1).map((c) => c.trim()).indexOf('License');
  const row = lines.find((l) => l.startsWith(`| \`${file}\``));
  if (!row) return null;
  const cell = row.split('|').slice(1, -1).map((c) => c.trim())[col] || '';
  const m = /^\[([^\]]+)\]/.exec(cell);
  return m ? m[1] : cell;
}
function readmeLicenseProblems(readme, licensesMd, onnxFiles) {
  const problems = [];
  const flat = readme.replace(/\s+/g, ' ');
  const para = /(?:^|\n)(Licenses: [\s\S]*?)(?:\n\s*\n|$)/.exec(readme);
  const text = para ? para[1].replace(/\s+/g, ' ') : '';
  if (!para) problems.push('README: no paragraph that starts with "Licenses:"');
  const checks = [['4xLSDIRCompactC3.onnx', /`fast` is (.+?)\. `high`/, 'fast'],
    ['4x_foolhardy_Remacri.onnx', /`high` \([^)]*\) is \*{0,2}(CC [A-Z-]+ [\d.]*\d)/, 'high']];
  for (const [file, re, mode] of checks) {
    const want = licenseCell(licensesMd, file);
    if (!want) { problems.push(`models/LICENSES.md: no License cell for ${file}`); continue; }
    const m = re.exec(text);
    if (para && !m) problems.push(`README "Licenses:" has no ${mode} sentence in the expected form`);
    else if (m && m[1] !== want) problems.push(`README says ${mode} is ${m[1]}, but models/LICENSES.md says ${want} for ${file}`);
  }
  const ship = /\b(Both|Three|Two|One|Four) ONNX models? ships? in the package/.exec(flat);
  if (!ship) problems.push('README: no "Both ONNX models ship in the package" sentence');
  else if (ship[1] !== 'Both' || onnxFiles.length !== 2) {
    problems.push(`README says "${ship[1]} ONNX models ship" but models/ has ${onnxFiles.length} .onnx files`);
  }
  return problems;
}
test('the README "Licenses:" paragraph and "Both ONNX models ship" agree with models/LICENSES.md and models/', () => {
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  const md = fs.readFileSync(path.join(dir, 'LICENSES.md'), 'utf8');
  const onnx = fs.readdirSync(dir).filter((f) => f.endsWith('.onnx'));
  assert.deepStrictEqual(readmeLicenseProblems(readme, md, onnx), []);
});
test('the README license check reports a wrong license, a missing paragraph and a wrong model count', () => {
  const md = '| File | License |\n|---|---|\n| `4xLSDIRCompactC3.onnx` | [CC BY 4.0](u) |\n| `4x_foolhardy_Remacri.onnx` | [CC BY-NC-SA 4.0](u) |\n';
  const two = ['a.onnx', 'b.onnx'];
  const doc = (fast, high, ship = 'Both ONNX models ship in the\npackage') =>
    `# T\n${ship} (~1 MB).\n\nLicenses: \`fast\` is ${fast}. \`high\` (Remacri) is **${high}, non-commercial\nonly**; see x.\n\n## Next\n`;
  assert.deepStrictEqual(readmeLicenseProblems(doc('CC BY 4.0', 'CC BY-NC-SA 4.0'), md, two), []);
  assert.deepStrictEqual(readmeLicenseProblems(doc('CC BY-SA 4.0', 'CC BY-NC-SA 4.0'), md, two),
    ['README says fast is CC BY-SA 4.0, but models/LICENSES.md says CC BY 4.0 for 4xLSDIRCompactC3.onnx']);
  assert.deepStrictEqual(readmeLicenseProblems(doc('CC BY 4.0', 'CC BY 4.0'), md, two),
    ['README says high is CC BY 4.0, but models/LICENSES.md says CC BY-NC-SA 4.0 for 4x_foolhardy_Remacri.onnx']);
  assert.deepStrictEqual(readmeLicenseProblems('# T\nBoth ONNX models ship in the package.\n', md, two),
    ['README: no paragraph that starts with "Licenses:"']);
  assert.deepStrictEqual(readmeLicenseProblems(doc('CC BY 4.0', 'CC BY-NC-SA 4.0'), md, ['a.onnx', 'b.onnx', 'c.onnx']),
    ['README says "Both ONNX models ship" but models/ has 3 .onnx files']);
});
