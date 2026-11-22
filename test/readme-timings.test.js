'use strict';
// BL35: README "Known limits" quotes the `fast` timings ("about 0.44 s for a 400×300 image and 1.85 s for 800×600")
// that docs/PERF.md "Results (median ms)" measures (the `total` column of the first table under that heading).
// A re-measurement of PERF.md must not leave the README stale. Read only: the test never edits either file.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// Seconds quoted in the README sentence, as numbers: { small, large } or null.
// Only the "## Known limits" section is read: the Usage section has a similar sentence for the event loop (rounded to 0.1 s).
function readmeSeconds(readme) {
  const at = readme.indexOf('\n## Known limits');
  if (at < 0) return null;
  const m = /about ([\d.]+) s for a 400×300 image and ([\d.]+) s for 800×600/.exec(readme.slice(at).replace(/\s+/g, ' '));
  return m ? { small: Number(m[1]), large: Number(m[2]) } : null;
}

// `total` (ms) of the 400×300 and 800×600 rows of the first table under "## Results (median ms)", or null.
function perfTotals(perf) {
  const at = perf.indexOf('\n## Results (median ms)');
  if (at < 0) return null;
  const rest = perf.slice(at + 1);
  const end = rest.indexOf('\n## ', 3);
  const section = end < 0 ? rest : rest.slice(0, end);
  const rows = section.split('\n').filter((l) => /^\|\s*\d+×\d+\s*\|/.test(l));
  const total = (size) => {
    const r = rows.find((l) => l.startsWith(`| ${size} |`));
    return r ? Number(r.split('|')[2]) : NaN;
  };
  const small = total('400×300'), large = total('800×600');
  return Number.isFinite(small) && Number.isFinite(large) ? { small, large } : null;
}

// Returns a list of problems (empty when each README figure is within 0.01 s of the PERF.md total).
function timingProblems(readme, perf) {
  const r = readmeSeconds(readme), p = perfTotals(perf);
  if (!r) return ['README: no sentence "about <a> s for a 400×300 image and <b> s for 800×600"'];
  if (!p) return ['PERF.md: no 400×300 / 800×600 total in the first table under "Results (median ms)"'];
  const problems = [];
  for (const k of ['small', 'large']) {
    const size = k === 'small' ? '400×300' : '800×600';
    if (Math.abs(r[k] - p[k] / 1000) > 0.01 + 1e-9) problems.push(`README says ${r[k]} s for ${size} but PERF.md says ${p[k]} ms`);
  }
  return problems;
}

test('README fast timings match the docs/PERF.md results table', () => {
  assert.deepStrictEqual(timingProblems(read('README.md'), read('docs/PERF.md')), []);
});

test('the timing check reports a mismatch and a missing figure, and accepts a match', () => {
  const readme = (a, b) => `Intro: about 0.4 s for a 400×300 image and 1.8 s for 800×600.\n## Known limits\nSpeed: about ${a} s for a 400×300 image and ${b} s\nfor 800×600 (median).`;
  const perf = (a, b) => `\n## Results (median ms)\n\n| Input | total |\n| --- | ---: |\n| 400×300 | ${a} |\n| 600×450 | 1014 |\n| 800×600 | ${b} |\n\n## Other\n| 400×300 | 9999 |\n`;
  assert.deepStrictEqual(timingProblems(readme('0.44', '1.85'), perf(443, 1854)), []);
  assert.deepStrictEqual(timingProblems(readme('0.44', '1.85'), perf(450, 1850)), []);
  assert.deepStrictEqual(timingProblems(readme('0.50', '1.85'), perf(443, 1854)), ['README says 0.5 s for 400×300 but PERF.md says 443 ms']);
  assert.deepStrictEqual(timingProblems(readme('0.44', '2.10'), perf(443, 1854)), ['README says 2.1 s for 800×600 but PERF.md says 1854 ms']);
  assert.match(timingProblems('nothing here', perf(443, 1854))[0], /^README: no sentence/);
  assert.match(timingProblems(readme('0.44', '1.85'), 'nothing here')[0], /^PERF\.md: no 400×300/);
});
