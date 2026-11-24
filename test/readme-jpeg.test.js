'use strict';
// BL44: README "Usage" quotes the JPEG result of docs/JPEG.md (BL42): "about two thirds of the excess block contrast is gone
// at JPEG quality 50 and 75; PSNR rises 0.7 dB at quality 50 and falls 0.4 dB at quality 75". Re-measuring docs/JPEG.md
// must not leave the README stale. Read only: the test runs no model and edits neither file.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// Rows of the docs/JPEG.md table, by quality: { psnrIn, psnrOut, bRef, bIn, bOut } (numbers), or null.
function jpegRows(doc) {
  const rows = new Map();
  for (const l of doc.split('\n')) {
    const c = l.split('|').slice(1, -1).map((x) => x.trim());
    if (c.length === 8 && /^\d+$/.test(c[0]) && c.slice(2, 7).every((x) => /^-?\d+(\.\d+)?$/.test(x))) {
      const [psnrIn, psnrOut, bRef, bIn, bOut] = c.slice(2, 7).map(Number);
      rows.set(Number(c[0]), { psnrIn, psnrOut, bRef, bIn, bOut });
    }
  }
  return rows;
}

// Problems between the README "Usage" JPEG sentence and the docs/JPEG.md table (empty when they agree).
function jpegProblems(readme, doc) {
  const problems = [];
  const text = readme.replace(/\s+/g, ' ');
  const rows = jpegRows(doc);
  for (const q of [50, 75]) if (!rows.has(q)) problems.push(`docs/JPEG.md has no table row for quality ${q}`);
  if (problems.length) return problems;
  if (!/about two thirds of the excess block contrast is gone at JPEG quality 50 and 75/.test(text)) {
    problems.push('README no longer says "about two thirds of the excess block contrast is gone at JPEG quality 50 and 75"');
  }
  const m = /PSNR (rises|falls) ([\d.]+) dB at quality 50 and (rises|falls) ([\d.]+) dB at quality 75/.exec(text);
  if (!m) return [...problems, 'README has no "PSNR rises|falls X dB at quality 50 and rises|falls Y dB at quality 75" sentence'];
  const quoted = new Map([[50, (m[1] === 'rises' ? 1 : -1) * Number(m[2])], [75, (m[3] === 'rises' ? 1 : -1) * Number(m[4])]]);
  for (const q of [50, 75]) {
    const r = rows.get(q);
    const delta = Number((r.psnrOut - r.psnrIn).toFixed(1));
    if (Math.abs(delta - quoted.get(q)) > 1e-9) problems.push(`quality ${q}: README says ${quoted.get(q)} dB, docs/JPEG.md gives ${delta} dB`);
    const share = 1 - (r.bOut - r.bRef) / (r.bIn - r.bRef);
    if (!(share >= 0.62 && share <= 0.72)) problems.push(`quality ${q}: share of the excess blockiness removed is ${share.toFixed(2)}, not about two thirds (0.62-0.72)`);
  }
  return problems;
}

const DOC = [
  '| JPEG quality | images | PSNR decoded JPEG (dB) | PSNR `fast` output (dB) | blockiness reference | blockiness decoded JPEG | blockiness `fast` output | blockiness change |',
  '|---|---|---|---|---|---|---|---|',
  '| 50 | 60 | 36.65 | 37.39 | 1.012 | 1.325 | 1.107 | -16.5% |',
  '| 75 | 60 | 39.67 | 39.27 | 1.012 | 1.174 | 1.062 | -9.6% |',
].join('\n');
const SENTENCE = 'it makes JPEG block borders less visible (about two thirds of the excess\nblock contrast is gone at JPEG quality 50 and 75; PSNR rises 0.7 dB at quality 50 and falls 0.4 dB\nat quality 75, docs/JPEG.md)';

test('the README JPEG sentence agrees with the docs/JPEG.md table', () => {
  assert.deepStrictEqual(jpegProblems(read('README.md'), read('docs/JPEG.md')), []);
});

test('jpegProblems accepts a good sentence and reports each kind of disagreement', () => {
  assert.deepStrictEqual(jpegProblems(SENTENCE, DOC), []);
  assert.match(jpegProblems(SENTENCE.replace('rises 0.7', 'rises 0.9'), DOC)[0], /quality 50: README says 0.9 dB, docs\/JPEG.md gives 0.7 dB/);
  assert.match(jpegProblems(SENTENCE.replace('falls 0.4', 'rises 0.4'), DOC)[0], /quality 75: README says 0.4 dB, docs\/JPEG.md gives -0.4 dB/);
  assert.match(jpegProblems(SENTENCE.replace('two thirds', 'half'), DOC)[0], /no longer says "about two thirds/);
  assert.match(jpegProblems('nothing here about two thirds of the excess block contrast is gone at JPEG quality 50 and 75', DOC)[0], /no "PSNR rises\|falls/);
  assert.match(jpegProblems(SENTENCE, DOC.replace('| 1.107 |', '| 1.300 |'))[0], /quality 50: share of the excess blockiness removed is 0.0\d/);
  assert.deepStrictEqual(jpegProblems(SENTENCE, DOC.split('\n').filter((l) => !l.startsWith('| 75')).join('\n')), ['docs/JPEG.md has no table row for quality 75']);
});
