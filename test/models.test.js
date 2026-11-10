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
