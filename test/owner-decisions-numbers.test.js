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
  const s61 = rowsOf(section(doc, '### Flat coloured backdrops on the 60-image set (BL61'));
  const f61 = find(s61, (r) => r[0] === '`fast`', 'BL61 fast'), l61 = find(s61, (r) => r[0] === 'Lanczos', 'BL61 Lanczos');
  const twice61 = Number(f61[2]) >= 2 * Number(l61[2]) && Number(f61[3]) >= 2 * Number(l61[3]);
  const s60 = rowsOf(section(doc, '### Flat coloured backdrops by size and JPEG quality (BL60'));
  const r60 = (k) => find(s60, (r) => r[0].startsWith(k), `BL60 ${k}`);
  const twice60 = s60.every((r) => Number(r[7].replace('x', '')) >= 2 && Number(r[8].replace('x', '')) >= 2);
  const s62 = rowsOf(section(doc, '### Flat coloured backdrops by size and JPEG quality on the 60-image set (BL62'));
  const r62 = (k) => find(s62, (r) => r[0].startsWith(k), `BL62 ${k}`);
  const only62 = s62.filter((r) => Number(r[7].replace('x', '')) >= 2 && Number(r[8].replace('x', '')) >= 2).map((r) => r[0]);
  const order = (rows) => [...rows].sort((a, b) => Number(b[7].replace('x', '')) - Number(a[7].replace('x', ''))).map((r) => r[0].split(' ').slice(0, 3).join(' ')).join(',');
  const sameOrder62 = order(s62) === order(s60);
  const s64 = rowsOf(section(doc, '### Flat coloured backdrops in `high` mode (BL64'));
  const h64 = find(s64, (r) => r[0] === '`high`', 'BL64 high'), f64 = find(s64, (r) => r[0] === '`fast`', 'BL64 fast'), l64 = find(s64, (r) => r[0] === 'Lanczos', 'BL64 Lanczos');
  const s65 = rowsOf(section(doc, '### Flat coloured backdrops in `high` mode on the 60-image set (BL65'));
  const h65 = find(s65, (r) => r[0] === '`high`', 'BL65 high'), f65 = find(s65, (r) => r[0] === '`fast`', 'BL65 fast'), l65 = find(s65, (r) => r[0] === 'Lanczos', 'BL65 Lanczos');
  const lower65 = Number(h65[3]) < Number(f65[3]) && Number(h65[4]) < Number(f65[4]);
  const twice65 = Number(h65[3]) >= 2 * Number(l65[3]) && Number(h65[4]) >= 2 * Number(l65[4]);
  const lower64 = Number(h64[2]) < Number(f64[2]) && Number(h64[3]) < Number(f64[3]);
  const twice64 = Number(h64[2]) >= 2 * Number(l64[2]) && Number(h64[3]) >= 2 * Number(l64[3]);
  const x2 = (a, b) => (Number(a) / Number(b)).toFixed(1), d2 = (a, b) => (Number(a) - Number(b)).toFixed(2);
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
    [/\(15 images with a flat coloured block, (\d+) blocks\) the `fast` chroma noise is (\d+\.\d\d) and (\d+\.\d\d) levels against (\d+\.\d\d) and (\d+\.\d\d) for Lanczos, (\d+\.\d)x and (\d+\.\d)x, so not at least twice as much \((yes|no)\).*?excess over Lanczos is about the same \((\d+\.\d\d) and (\d+\.\d\d) levels/, (m) => [['BL61 blocks', m[1], f61[1]], ['BL61 fast R-G', m[2], f61[2]], ['BL61 fast B-G', m[3], f61[3]], ['BL61 Lanczos R-G', m[4], l61[2]], ['BL61 Lanczos B-G', m[5], l61[3]], ['BL61 R-G ratio', m[6], x2(f61[2], l61[2])], ['BL61 B-G ratio', m[7], x2(f61[3], l61[3])], ['BL61 at least twice', m[8], twice61 ? 'yes' : 'no'], ['BL61 R-G excess', m[9], d2(f61[2], l61[2])], ['BL61 B-G excess', m[10], d2(f61[3], l61[3])]]],
    [/By size and JPEG quality \(sub20\) the `fast` chroma noise on flat coloured backdrops is (\d+\.\d\d) and (\d+\.\d\d) levels at 400 px q60, (\d+\.\d\d) and (\d+\.\d\d) at q95 and (\d+\.\d\d) and (\d+\.\d\d) at 800 px \(q85: (\d+\.\d\d) and (\d+\.\d\d)\), at least twice Lanczos in all four rows \((yes|no)\): the ratios are (\d+\.\d\dx) and (\d+\.\d\dx) at q60, (\d+\.\d\dx) and (\d+\.\d\dx) at q95, (\d+\.\d\dx) and (\d+\.\d\dx) at 800 px/, (m) => [['BL60 q60 R-G', m[1], r60('400 px q60')[3]], ['BL60 q60 B-G', m[2], r60('400 px q60')[4]], ['BL60 q95 R-G', m[3], r60('400 px q95')[3]], ['BL60 q95 B-G', m[4], r60('400 px q95')[4]], ['BL60 800 R-G', m[5], r60('800 px')[3]], ['BL60 800 B-G', m[6], r60('800 px')[4]], ['BL60 q85 R-G', m[7], r60('400 px q85')[3]], ['BL60 q85 B-G', m[8], r60('400 px q85')[4]], ['BL60 all four', m[9], twice60 ? 'yes' : 'no'], ['BL60 q60 ratio R-G', m[10], r60('400 px q60')[7]], ['BL60 q60 ratio B-G', m[11], r60('400 px q60')[8]], ['BL60 q95 ratio R-G', m[12], r60('400 px q95')[7]], ['BL60 q95 ratio B-G', m[13], r60('400 px q95')[8]], ['BL60 800 ratio R-G', m[14], r60('800 px')[7]], ['BL60 800 ratio B-G', m[15], r60('800 px')[8]]]],
    [/On the 60 images the `fast` chroma ratios to Lanczos \(R-G and B-G\) are (\d+\.\d\dx) and (\d+\.\d\dx) at 400 px q60, (\d+\.\d\dx) and (\d+\.\d\dx) at q85, (\d+\.\d\dx) and (\d+\.\d\dx) at q95 and (\d+\.\d\dx) and (\d+\.\d\dx) at 800 px, so at least twice only at (q60|q85|q95|800 px) \(yes for that row, no for the other three\), and the order of the rows by ratio agrees with sub20's \((yes|no)\)/, (m) => [['BL62 q60 R-G', m[1], r62('400 px q60')[7]], ['BL62 q60 B-G', m[2], r62('400 px q60')[8]], ['BL62 q85 R-G', m[3], r62('400 px q85')[7]], ['BL62 q85 B-G', m[4], r62('400 px q85')[8]], ['BL62 q95 R-G', m[5], r62('400 px q95')[7]], ['BL62 q95 B-G', m[6], r62('400 px q95')[8]], ['BL62 800 R-G', m[7], r62('800 px')[7]], ['BL62 800 B-G', m[8], r62('800 px')[8]], ['BL62 only row at twice', m[9], only62.length === 1 ? only62[0].split(' ').slice(only62[0].startsWith('800') ? 0 : 2, only62[0].startsWith('800') ? 2 : 3).join(' ') : 'none or several'], ['BL62 same order', m[10], sameOrder62 ? 'yes' : 'no']]],
    [/In `high` mode on CPU \(sub20, 400 px, q85\) the chroma noise on flat coloured backdrops is (\d+\.\d\d) and (\d+\.\d\d) levels against (\d+\.\d\d) and (\d+\.\d\d) for `fast`, lower than `fast` in both \((yes|no)\), and not at least twice Lanczos's (\d+\.\d\d) and (\d+\.\d\d) \((yes|no); (\d+\.\d)x and (\d+\.\d)x\)/, (m) => [['BL64 high R-G', m[1], h64[2]], ['BL64 high B-G', m[2], h64[3]], ['BL64 fast R-G', m[3], f64[2]], ['BL64 fast B-G', m[4], f64[3]], ['BL64 lower than fast', m[5], lower64 ? 'yes' : 'no'], ['BL64 Lanczos R-G', m[6], l64[2]], ['BL64 Lanczos B-G', m[7], l64[3]], ['BL64 at least twice', m[8], twice64 ? 'yes' : 'no'], ['BL64 R-G ratio', m[9], x2(h64[2], l64[2])], ['BL64 B-G ratio', m[10], x2(h64[3], l64[3])]]],
    [/On the 60 images \((\d+) with a block, (\d+) blocks\) `high` chroma noise is (\d+\.\d\d) and (\d+\.\d\d) levels against (\d+\.\d\d) and (\d+\.\d\d) for `fast`, lower than `fast` in both \((yes|no)\), and not at least twice Lanczos's (\d+\.\d\d) and (\d+\.\d\d) \((yes|no); (\d+\.\d)x and (\d+\.\d)x\)/, (m) => [['BL65 images', m[1], Number(h65[1])], ['BL65 blocks', m[2], Number(h65[2])], ['BL65 high R-G', m[3], h65[3]], ['BL65 high B-G', m[4], h65[4]], ['BL65 fast R-G', m[5], f65[3]], ['BL65 fast B-G', m[6], f65[4]], ['BL65 lower than fast', m[7], lower65 ? 'yes' : 'no'], ['BL65 Lanczos R-G', m[8], l65[3]], ['BL65 Lanczos B-G', m[9], l65[4]], ['BL65 at least twice', m[10], twice65 ? 'yes' : 'no'], ['BL65 R-G ratio', m[11], x2(h65[3], l65[3])], ['BL65 B-G ratio', m[12], x2(h65[4], l65[4])]]],
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

// BL63: the figures derived by hand in the Reading line of the BL60 section and in the Result line of the BL61 section of docs/COLOR.md
// equal what the tables give (`fast` minus Lanczos, min and max of columns). Returns the list of problems (empty when they agree).
function readingProblems(doc) {
  const problems = [];
  const d2 = (a, b) => (Number(a) - Number(b)).toFixed(2);
  const check = (label, said, want) => { if (said !== want) problems.push(`${label}: text says ${said}, table gives ${want}`); };
  const line = (sec, key, what) => { const l = sec.split('\n').find((x) => x.startsWith(key)); if (!l) throw new Error(`COLOR.md ${what} has no line starting "${key}"`); return l; };

  const sec60 = section(doc, '### Flat coloured backdrops by size and JPEG quality (BL60');
  const rows60 = rowsOf(sec60), reading = line(sec60, '- **Reading:**', 'BL60 section');
  const rowOf = { q60: '400 px q60', q85: '400 px q85', q95: '400 px q95', '800 px': '800 px' };
  const pairs = [...reading.matchAll(/(\d+\.\d\d) \/ (\d+\.\d\d) \(([^)]+)\)/g)];
  if (pairs.length !== 4) problems.push(`BL60 Reading line: expected 4 "a / b (label)" pairs, found ${pairs.length}`);
  for (const [, a, b, label] of pairs) {
    const r = rows60.find((x) => x[0].startsWith(rowOf[label] || '?'));
    if (!r) { problems.push(`BL60 Reading line: label (${label}) matches no table row`); continue; }
    check(`BL60 excess R-G (${label})`, a, d2(r[3], r[5]));
    check(`BL60 excess B-G (${label})`, b, d2(r[4], r[6]));
  }
  const range = (re, cols, what) => {
    const m = re.exec(reading);
    if (!m) { problems.push(`BL60 Reading line no longer contains the ${what} range`); return; }
    const v = rows60.flatMap((r) => cols.map((c) => Number(r[c])));
    check(`BL60 ${what} min`, m[1], Math.min(...v).toFixed(2));
    check(`BL60 ${what} max`, m[2], Math.max(...v).toFixed(2));
  };
  range(/in every row \((\d+\.\d\d) to (\d+\.\d\d)\)/, [3, 4], '`fast` noise');
  range(/Lanczos's own noise \((\d+\.\d\d) to (\d+\.\d\d)\)/, [5, 6], 'Lanczos noise');

  const res61 = line(section(doc, '### Flat coloured backdrops on the 60-image set (BL61'), '- **Result:**', 'BL61 section');
  const m61 = /excess over Lanczos in levels is about the same \((\d+\.\d\d) and (\d+\.\d\d) on the 60 images, (\d+\.\d\d) and (\d+\.\d\d) on the 20\)/.exec(res61);
  if (!m61) { problems.push('BL61 Result line no longer contains the excess sentence'); return problems; }
  const pick = (head, label) => { const t = rowsOf(section(doc, head)); return [find(t, (r) => r[0] === '`fast`', `${label} fast`), find(t, (r) => r[0] === 'Lanczos', `${label} Lanczos`)]; };
  const [f61, l61] = pick('### Flat coloured backdrops on the 60-image set (BL61', 'BL61'), [f58, l58] = pick('### Flat coloured backdrops (BL58', 'BL58');
  check('BL61 excess R-G (60 images)', m61[1], d2(f61[2], l61[2])); check('BL61 excess B-G (60 images)', m61[2], d2(f61[3], l61[3]));
  check('BL61 excess R-G (20 images)', m61[3], d2(f58[2], l58[2])); check('BL61 excess B-G (20 images)', m61[4], d2(f58[3], l58[3]));
  return problems;
}

test('the derived figures in the BL60 Reading line and the BL61 Result line match their tables (BL63)', () => {
  assert.deepStrictEqual(readingProblems(colorDoc), []);
});

test('a changed derived figure or table cell in the BL60 and BL61 sections is reported with its label (BL63)', () => {
  const swap = (from, to) => { assert.ok(colorDoc.includes(from), `fixture: COLOR.md lacks "${from}"`); return colorDoc.replace(from, to); };
  assert.deepStrictEqual(readingProblems(swap('0.56 / 0.58 (q60)', '0.57 / 0.58 (q60)')), ['BL60 excess R-G (q60): text says 0.57, table gives 0.56']);
  assert.deepStrictEqual(readingProblems(swap('0.31 / 0.28 (800 px)', '0.31 / 0.29 (800 px)')), ['BL60 excess B-G (800 px): text says 0.29, table gives 0.28']);
  assert.deepStrictEqual(readingProblems(swap('in every row (0.83 to 0.95)', 'in every row (0.83 to 0.96)')), ['BL60 `fast` noise max: text says 0.96, table gives 0.95']);
  assert.deepStrictEqual(readingProblems(swap("Lanczos's own noise (0.34 to 0.83)", "Lanczos's own noise (0.35 to 0.83)")), ['BL60 Lanczos noise min: text says 0.35, table gives 0.34']);
  assert.deepStrictEqual(readingProblems(swap('(0.45 and 0.41 on the 60 images, 0.47', '(0.45 and 0.42 on the 60 images, 0.47')), ['BL61 excess B-G (60 images): text says 0.42, table gives 0.41']);
  // A table cell that changes without the text is reported too (BL60 q95 `fast` R-G 0.91 -> 0.92 moves the q95 excess).
  assert.deepStrictEqual(readingProblems(swap('| 400 px q95 | 6 | 38 | 0.91 | 0.95 |', '| 400 px q95 | 6 | 38 | 0.92 | 0.95 |')), ['BL60 excess R-G (q95): text says 0.15, table gives 0.16']);
  // A reworded line is reported, not skipped.
  assert.deepStrictEqual(readingProblems(swap("Lanczos's own noise (0.34 to 0.83)", 'Lanczos noise varies')), ['BL60 Reading line no longer contains the Lanczos noise range']);
});

// BL66: the summary table "Summary: flat coloured backdrops (BL66" of docs/COLOR.md. Every images, blocks and sd cell equals the cell of
// the source section named in its last column; the ratio and excess cells are computed from the sd cells (two decimals); the two
// sentences below the table equal the computed range of the excess over the `fast` rows and the number of `fast` rows with both ratios >= 2.00.
function summaryProblems(doc) {
  const problems = [];
  const sum = section(doc, '### Summary: flat coloured backdrops (BL66');
  const rows = rowsOf(sum);
  const fx = (v) => Number(v).toFixed(2);
  const heads = { BL60: '### Flat coloured backdrops by size and JPEG quality (BL60', BL62: '### Flat coloured backdrops by size and JPEG quality on the 60-image set (BL62', BL64: '### Flat coloured backdrops in `high` mode (BL64', BL65: '### Flat coloured backdrops in `high` mode on the 60-image set (BL65' };
  const excess = []; let both = 0, nFast = 0;
  for (const r of rows) {
    const label = `${r[0]} ${r[1]}`;
    const cond = r[0].replace(/^(sub20|60 images), /, '');
    const secText = section(doc, heads[r[12]]);
    const src = rowsOf(secText);
    let want; // [images, blocks, m1, m2, l1, l2]
    if (r[12] === 'BL60' || r[12] === 'BL62') {
      const s = src.find((x) => x[0].startsWith(cond));
      if (!s) { problems.push(`${label}: no row "${cond}" in ${r[12]} table`); continue; }
      want = [s[1], s[2], s[3], s[4], s[5], s[6]];
    } else if (r[12] === 'BL64') {
      const h = src.find((x) => x[0] === '`high`'), l = src.find((x) => x[0] === 'Lanczos'), im = /\((\d+) images with a block/.exec(secText);
      if (!h || !l || !im) { problems.push(`${label}: BL64 table or images text missing`); continue; }
      want = [im[1], h[1], h[2], h[3], l[2], l[3]];
    } else {
      const h = src.find((x) => x[0] === '`high`'), l = src.find((x) => x[0] === 'Lanczos');
      if (!h || !l) { problems.push(`${label}: BL65 table row missing`); continue; }
      want = [h[1], h[2], h[3], h[4], l[3], l[4]];
    }
    ['images', 'blocks', 'model sd R-G', 'model sd B-G', 'Lanczos sd R-G', 'Lanczos sd B-G'].forEach((n, i) => {
      if (r[2 + i] !== want[i]) problems.push(`${label}: ${n} says ${r[2 + i]}, ${r[12]} table gives ${want[i]}`);
    });
    const x1 = fx(Number(r[4]) / Number(r[6])), x2 = fx(Number(r[5]) / Number(r[7])), e1 = fx(Number(r[4]) - Number(r[6])), e2 = fx(Number(r[5]) - Number(r[7]));
    [['ratio R-G', r[8], `${x1}x`], ['ratio B-G', r[9], `${x2}x`], ['excess R-G', r[10], e1], ['excess B-G', r[11], e2]].forEach(([n, got, exp]) => {
      if (got !== exp) problems.push(`${label}: ${n} says ${got}, computed ${exp}`);
    });
    if (r[1] === '`fast`') { nFast++; excess.push(Number(e1), Number(e2)); if (Number(x1) >= 2 && Number(x2) >= 2) both++; }
  }
  if (rows.length !== 10) problems.push(`summary table has ${rows.length} rows, expected 10`);
  const m1 = /from (-?[\d.]+) to (-?[\d.]+) levels of standard deviation/.exec(sum);
  if (!m1) problems.push('summary has no "from A to B levels of standard deviation" sentence');
  else {
    if (m1[1] !== fx(Math.min(...excess))) problems.push(`excess min says ${m1[1]}, computed ${fx(Math.min(...excess))}`);
    if (m1[2] !== fx(Math.max(...excess))) problems.push(`excess max says ${m1[2]}, computed ${fx(Math.max(...excess))}`);
  }
  const m2 = /(\d+) of (\d+) `fast` rows have both ratios at least 2\.00/.exec(sum);
  if (!m2) problems.push('summary has no "N of M `fast` rows have both ratios at least 2.00" sentence');
  else if (Number(m2[1]) !== both || Number(m2[2]) !== nFast) problems.push(`ratio count says ${m2[1]} of ${m2[2]}, computed ${both} of ${nFast}`);
  return problems;
}

test('the BL66 summary table of docs/COLOR.md matches its source tables and its computed columns', () => {
  assert.deepStrictEqual(summaryProblems(colorDoc), []);
});

test('a changed cell or sentence in the BL66 summary is reported with its row label', () => {
  const swap = (from, to) => { assert.ok(colorDoc.includes(from), `fixture: COLOR.md lacks "${from}"`); return colorDoc.replace(from, to); };
  assert.deepStrictEqual(summaryProblems(swap('| 60 images, 400 px q95 | `fast` | 13 | 124 |', '| 60 images, 400 px q95 | `fast` | 13 | 125 |')), ['60 images, 400 px q95 `fast`: blocks says 125, BL62 table gives 124']);
  assert.deepStrictEqual(summaryProblems(swap('| 1.51x | 1.21x | 0.25 | 0.15 | BL65 |', '| 1.51x | 1.21x | 0.25 | 0.16 | BL65 |')), ['60 images, 400 px q85 `high`: excess B-G says 0.16, computed 0.15']);
  assert.deepStrictEqual(summaryProblems(swap('from 0.12 to 0.58 levels', 'from 0.12 to 0.59 levels')), ['excess max says 0.59, computed 0.58']);
  assert.deepStrictEqual(summaryProblems(swap('3 of 8 `fast` rows have both', '4 of 8 `fast` rows have both')), ['ratio count says 4 of 8, computed 3 of 8']);
  assert.deepStrictEqual(summaryProblems(swap('| sub20, 400 px q85 | `high` | 7 | 59 |', '| sub20, 400 px q85 | `high` | 8 | 59 |')), ['sub20, 400 px q85 `high`: images says 8, BL64 table gives 7']);
});
