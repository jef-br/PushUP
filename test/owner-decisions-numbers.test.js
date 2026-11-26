'use strict';
// BL52: the figures quoted in row 13 of docs/OWNER_DECISIONS.md equal the tables of docs/COLOR.md they come from. Row 13 was edited
// by hand in BL43, BL46, BL47, BL48, BL49, BL50 and BL51; this keeps it from drifting. Reads the two files only, no model run.
// Rounding rule: COLOR.md tables hold shares with two decimals; the row quotes them with one decimal (Math.round(v * 10) / 10);
// other figures (percentiles, PSNR, SSIM, GMSD differences) are quoted exactly as the table or result line prints them.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const r1 = (v) => Math.round(v * 10) / 10;

// The section of `doc` that starts at `heading` (a prefix of its heading line) and ends at the next ## or ### heading.
function section(doc, heading) {
  const at = doc.indexOf(heading);
  if (at < 0) throw new Error(`docs/COLOR.md has no section "${heading}"`);
  const end = doc.slice(at + heading.length).search(/\n#{2,3} /);
  return end < 0 ? doc.slice(at) : doc.slice(at, at + heading.length + end);
}
// Table rows of a section as arrays of trimmed cells, header and separator dropped.
const rowsOf = (sec) => sec.split('\n').filter((l) => l.startsWith('|')).slice(2).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
const find = (rows, pred, what) => { const r = rows.find(pred); if (!r) throw new Error(`COLOR.md table row not found: ${what}`); return r; };

// Each check: a pattern for the sentence in the row (its capture groups are the quoted figures) and a function that returns
// [label, quoted, expected] triples read from COLOR.md. Returns the list of problems (empty when row 13 agrees).
function figureProblems(row, doc) {
  const s46 = rowsOf(section(doc, '## Neutral backdrops on real photos (BL46'));
  const s47 = rowsOf(section(doc, '### Model alone against the Lanczos mix (BL47'));
  const s48 = rowsOf(section(doc, '### 800 px and 600 px input (BL48'));
  const s49 = rowsOf(section(doc, '### `high` mode on CPU (BL49'));
  const s50 = rowsOf(section(doc, '### Cost of a larger Lanczos mix (BL50'));
  const sec51 = section(doc, '### Grey-preserving step, offline (BL51');
  const s51 = rowsOf(sec51);
  const f46 = find(s46, (r) => r[0] === '`fast`', 'BL46 fast'), l46 = find(s46, (r) => r[0] === 'Lanczos', 'BL46 Lanczos');
  const f48 = (px) => find(s48, (r) => r[0].startsWith(px) && r[4] === '`fast`', `BL48 ${px} fast`);
  const l48 = (px) => find(s48, (r) => r[0].startsWith(px) && r[4] === 'Lanczos', `BL48 ${px} Lanczos`);
  const mix = (m) => find(s47, (r) => r[0].startsWith(m), `BL47 mix ${m}`);
  const h49 = find(s49, (r) => r[0] === '`high`', 'BL49 high');
  const d50 = (px) => find(s50, (r) => r[0] === `${px} px` && r[1].startsWith('`sr-full@0.4`'), `BL50 ${px} px @0.4`);
  const t51 = (n) => find(s51, (r) => r[0].includes(`T=${n}`), `BL51 T=${n}`);
  const none51 = find(s51, (r) => r[0].startsWith('`fast` (no step)'), 'BL51 no step'), lan51 = find(s51, (r) => r[0] === 'Lanczos', 'BL51 Lanczos');
  const t4 = /\*\*T=4:\*\* PSNR (-?[\d.]+), SSIM (-?[\d.]+), GMSD (-?[\d.]+)/.exec(sec51);
  const t4at800 = /\*\*T=4:\*\* PSNR (-?[\d.]+)/.exec(section(doc, '### Grey-preserving step at 800 px (BL53'));
  if (!t4at800) throw new Error('COLOR.md BL53 section has no "**T=4:** PSNR ..." line');
  if (!t4) throw new Error('COLOR.md BL51 section has no "**T=4:** PSNR ..., SSIM ..., GMSD ..." line');
  const sec54 = section(doc, '### Grey-preserving step on `high` (BL54');
  const s54 = rowsOf(sec54);
  const h54 = (n) => find(s54, (r) => r[0].includes(`T=${n}`), `BL54 T=${n}`), h54none = find(s54, (r) => r[0].startsWith('`high` (no step)'), 'BL54 no step');
  const t6 = /\*\*T=6:\*\* PSNR (-?[\d.]+)/.exec(sec54);
  if (!t6) throw new Error('COLOR.md BL54 section has no "**T=6:** PSNR ..." line');
  const sec55 = section(doc, '### What the grey-preserving step changes (BL55');
  const s55 = rowsOf(sec55);
  const t55 = find(s55, (r) => r[0] === '4', 'BL55 T=4');
  const sec56 = section(doc, '### Grey-preserving step on the 60-image set (BL56');
  const t56 = (re, what) => { const m = re.exec(sec56); if (!m) throw new Error(`COLOR.md BL56 section has no ${what}`); return m; };
  const g400 = t56(/\*\*T=4 at 400 px:\*\* PSNR (-?[\d.]+)/, '"**T=4 at 400 px:** PSNR ..." line'), g800 = t56(/\*\*T=4 at 800 px:\*\* PSNR (-?[\d.]+)/, '"**T=4 at 800 px:** PSNR ..." line');
  const c56 = t56(/^\| 4 \| (\d+\.\d\d) \| (\d+\.\d\d) \|/m, 'changed-pixels row for T=4'), n56 = t56(/^\| `fast` \+ step T=4 \| [\d.]+ \| [\d.]+ \| [\d.]+ \| [\d.]+ \| (\d+\.\d\d) \|$/m, 'T=4 row of the 400 px table');
  const s57 = rowsOf(section(doc, '### Neutral backdrops by JPEG quality (BL57'));
  const q57 = (q) => find(s57, (r) => r[0] === q, `BL57 ${q}`);
  const s58 = rowsOf(section(doc, '### Flat coloured backdrops (BL58'));
  const f58 = find(s58, (r) => r[0] === '`fast`', 'BL58 fast'), l58 = find(s58, (r) => r[0] === 'Lanczos', 'BL58 Lanczos');
  const twice58 = Number(f58[2]) >= 2 * Number(l58[2]) && Number(f58[3]) >= 2 * Number(l58[3]);
  const sec59 = section(doc, '### Region-limited grey-preserving step (BL59');
  const g59 = (px) => { const m = new RegExp(`\\*\\*T=4 at ${px} px:\\*\\* PSNR (-?[\\d.]+)`).exec(sec59); if (!m) throw new Error(`COLOR.md BL59 section has no "**T=4 at ${px} px:** PSNR ..." line`); return m; };
  const r59 = (px) => { const m = new RegExp(`^\\| \`fast\` \\+ region step T=4 \\| [\\d.]+ \\| [\\d.]+ \\| [\\d.]+ \\| [\\d.]+ \\| (\\d+\\.\\d\\d) \\|$`, 'gm'); const all = [...sec59.matchAll(m)]; if (all.length !== 2) throw new Error('COLOR.md BL59 section needs one T=4 row in each table'); return all[px === 400 ? 0 : 1]; };
  const pct = (cell) => r1(Number(cell));

  const checks = [
    [/(\d+\.\d)% of `fast` output pixels in such regions/, (m) => [['BL46 fast share', m[1], pct(f46[4])]]],
    [/against (\d+\.\d)% for plain Lanczos \(99th percentile (\d+) against (\d+)\)/, (m) => [['BL46 Lanczos share', m[1], pct(l46[4])], ['BL46 fast p99', m[2], Number(f46[3])], ['BL46 Lanczos p99', m[3], Number(l46[3])]]],
    [/at 600 and 800 px input it is also present \((\d+\.\d)% and (\d+\.\d)% against (\d+\.\d)% and (\d+\.\d)%\)/, (m) => [['BL48 600 px fast share', m[1], pct(f48('600')[7])], ['BL48 800 px fast share', m[2], pct(f48('800')[7])], ['BL48 600 px Lanczos share', m[3], pct(l48('600')[7])], ['BL48 800 px Lanczos share', m[4], pct(l48('800')[7])]]],
    [/The model alone gives (\d+\.\d)%/, (m) => [['BL47 model alone share', m[1], pct(mix('0 (model only)')[3])]]],
    [/a 40% mix gives (\d+\.\d)%, a 60% mix (\d+\.\d)%/, (m) => [['BL47 40% share', m[1], pct(mix('0.4')[3])], ['BL47 60% share', m[2], pct(mix('0.6')[3])]]],
    [/(\d+\.\d)% of pixels with spread of 3 or more at 400 px input \(99th percentile (\d+)\)/, (m) => [['BL49 high share', m[1], pct(h49[3])], ['BL49 high p99', m[2], Number(h49[2])]]],
    [/PSNR (-[\d.]+) and (-[\d.]+) dB against the shipped 20%, GMSD (\+[\d.]+) and (\+[\d.]+);/, (m) => [['BL50 400 px PSNR diff', m[1], d50('400')[5]], ['BL50 800 px PSNR diff', m[2], d50('800')[5]], ['BL50 400 px GMSD diff', m[3], d50('400')[7]], ['BL50 800 px GMSD diff', m[4], d50('800')[7]]]],
    [/passes the quality gate at 400 px \(PSNR (-[\d.]+) dB, SSIM (-[\d.]+), GMSD (-[\d.]+)\) but fails it at 800 px \(PSNR (-[\d.]+) dB against a limit of 0\.02/, (m) => [['BL51 T=4 PSNR diff', m[1], t4[1]], ['BL51 T=4 SSIM diff', m[2], t4[2]], ['BL51 T=4 GMSD diff', m[3], t4[3]], ['BL53 T=4 PSNR diff at 800 px', m[4], t4at800[1]]]],
    [/from (\d+\.\d)% to (\d+\.\d)% \(Lanczos (\d+\.\d)%\); T=3 gives (\d+\.\d)%/, (m) => [['BL51 no-step share', m[1], pct(none51[5])], ['BL51 T=4 share', m[2], pct(t51(4)[5])], ['BL51 Lanczos share', m[3], pct(lan51[5])], ['BL51 T=3 share', m[4], pct(t51(3)[5])]]],
    [/for T=2 to 6 \(T=6: PSNR (-[\d.]+) dB\) but none brings the share of spread of 3 or more within 1 point of Lanczos's \(T=4 (\d+\.\d)%, T=6 (\d+\.\d)%, from (\d+\.\d)%\)/, (m) => [['BL54 T=6 PSNR diff', m[1], t6[1]], ['BL54 T=4 share', m[2], pct(h54(4)[5])], ['BL54 T=6 share', m[3], pct(h54(6)[5])], ['BL54 no-step share', m[4], pct(h54none[5])]]],
    [/The T=4 step changes (\d+\.\d)% of all `fast` output pixels at 400 px and does not move them closer to the ground truth on average \(mean absolute error (\d+\.\d+) before, (\d+\.\d+) after\); (\d+\.\d)% of the changed pixels had a real tint/, (m) => [['BL55 T=4 changed share', m[1], pct(t55[1])], ['BL55 T=4 error before', m[2], t55[3]], ['BL55 T=4 error after', m[3], t55[4]], ['BL55 T=4 real-tint share', m[4], pct(t55[2])]]],
    [/On the 60-image set \(the 20 plus 40 more\) T=4 passes the gate at 400 px \(PSNR (-[\d.]+) dB\) and fails it at 800 px \(PSNR (-[\d.]+) dB\), the same pass\/fail as on the 20 images; there it changes (\d+\.\d)% of all pixels, (\d+\.\d)% of the changed pixels had a real tint, and at 400 px it leaves (\d+\.\d)% of spread/, (m) => [['BL56 T=4 PSNR diff at 400 px', m[1], g400[1]], ['BL56 T=4 PSNR diff at 800 px', m[2], g800[1]], ['BL56 T=4 changed share', m[3], pct(c56[1])], ['BL56 T=4 real-tint share', m[4], pct(c56[2])], ['BL56 T=4 remaining share at 400 px', m[5], pct(n56[1])]]],
    [/at q60 and q95 the `fast` share of spread of 3 or more in neutral backdrops is (\d+\.\d)% and (\d+\.\d)% \(q85: (\d+\.\d)%\), a difference of (\d+\.\d) points, so not more than 5 points/, (m) => [['BL57 q60 share', m[1], pct(q57('q60')[3])], ['BL57 q95 share', m[2], pct(q57('q95')[3])], ['BL57 q85 share', m[3], pct(q57('q85')[3])], ['BL57 q60-q95 difference', m[4], r1(Math.abs(Number(q57('q60')[3]) - Number(q57('q95')[3])))], ['BL57 not more than 5 points', String(Math.abs(Number(q57('q60')[3]) - Number(q57('q95')[3])) <= 5), 'true']]],
    [/on flat coloured backdrops \((\d+) of 20 images, (\d+) blocks\) `fast` chroma noise \(standard deviation of R-G and B-G\) is (\d+\.\d\d) and (\d+\.\d\d) levels against (\d+\.\d\d) and (\d+\.\d\d) for Lanczos, at least twice as much \((yes|no)\)/, (m) => [['BL58 blocks', m[2], f58[1]], ['BL58 fast R-G', m[3], f58[2]], ['BL58 fast B-G', m[4], f58[3]], ['BL58 Lanczos R-G', m[5], l58[2]], ['BL58 Lanczos B-G', m[6], l58[3]], ['BL58 at least twice', m[7], twice58 ? 'yes' : 'no']]],
    [/\(5x5 window of the output, luma range 12\) does not help: T=4 passes the gate at 400 px \(PSNR (-[\d.]+) dB\) and fails it at 800 px \(PSNR (-[\d.]+) dB\), and leaves (\d+\.\d)% and (\d+\.\d)% of spread/, (m) => [['BL59 T=4 PSNR diff at 400 px', m[1], g59(400)[1]], ['BL59 T=4 PSNR diff at 800 px', m[2], g59(800)[1]], ['BL59 T=4 share at 400 px', m[3], pct(r59(400)[1])], ['BL59 T=4 share at 800 px', m[4], pct(r59(800)[1])]]],
  ];
  const problems = [];
  for (const [re, get] of checks) {
    const m = re.exec(row);
    if (!m) { problems.push(`row 13 no longer contains the sentence matching ${re}`); continue; }
    for (const [label, quoted, expected] of get(m)) {
      const same = typeof expected === 'number' ? Number(quoted) === expected : quoted === expected;
      if (!same) problems.push(`${label}: row 13 says ${quoted}, docs/COLOR.md table gives ${expected}`);
    }
  }
  return problems;
}

const row13 = read('docs', 'OWNER_DECISIONS.md').split('\n').find((l) => l.startsWith('| 13 '));
const colorDoc = read('docs', 'COLOR.md');

test('every figure row 13 of docs/OWNER_DECISIONS.md quotes from docs/COLOR.md matches its table cell', () => {
  assert.ok(row13, 'row 13 missing');
  assert.deepStrictEqual(figureProblems(row13, colorDoc), []);
});

test('a changed figure in row 13 is reported with its name and the table value', () => {
  const swap = (from, to) => { assert.ok(row13.includes(from), `fixture: row 13 lacks "${from}"`); return row13.replace(from, to); };
  assert.deepStrictEqual(figureProblems(swap('16.3% of `fast` output pixels', '16.9% of `fast` output pixels'), colorDoc), ['BL46 fast share: row 13 says 16.9, docs/COLOR.md table gives 16.3']);
  assert.deepStrictEqual(figureProblems(swap('(99th percentile 7)', '(99th percentile 8)'), colorDoc), ['BL49 high p99: row 13 says 8, docs/COLOR.md table gives 7']);
  assert.deepStrictEqual(figureProblems(swap('GMSD +0.0020 and +0.0076', 'GMSD +0.0020 and +0.0077'), colorDoc), ['BL50 800 px GMSD diff: row 13 says +0.0077, docs/COLOR.md table gives +0.0076']);
  assert.deepStrictEqual(figureProblems(swap('(mean absolute error 1.493 before, 1.745 after)', '(mean absolute error 1.493 before, 1.745 after)'.replace('1.745', '1.645')), colorDoc), ['BL55 T=4 error after: row 13 says 1.645, docs/COLOR.md table gives 1.745']);
  // A reworded sentence is reported, not silently skipped.
  assert.match(figureProblems(row13.replace('The model alone gives', 'The model by itself gives'), colorDoc)[0], /^row 13 no longer contains the sentence matching/);
});

test('a changed table cell in docs/COLOR.md is reported against row 13', () => {
  const bad = colorDoc.replace('| 0.4 | 1.39 | 4 | 11.70 |', '| 0.4 | 1.39 | 4 | 12.70 |');
  assert.notStrictEqual(bad, colorDoc, 'fixture: BL47 0.4 row not found');
  assert.deepStrictEqual(figureProblems(row13, bad), ['BL47 40% share: row 13 says 11.7, docs/COLOR.md table gives 12.7']);
});
