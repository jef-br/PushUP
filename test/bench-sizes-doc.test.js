'use strict';
// BL75: docs/COLOR.md "Sizes between 400 and 800 (BL75)" quotes `bench/bench.js` output at 500, 600 and 700 px. No model runs here
// (the benchmark itself takes about 2 minutes and needs bench/out/sub20, which CI lacks): the test checks that the section names its
// command, that its table has the shape bench.js prints, and that the "Result" sentence and its differences follow from the table.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'COLOR.md'), 'utf8');
const start = doc.indexOf('### Sizes between 400 and 800 (BL75');
assert.ok(start >= 0, 'docs/COLOR.md has no "Sizes between 400 and 800 (BL75" section');
const next = doc.indexOf('\n### ', start + 1);
const section = doc.slice(start, next < 0 ? undefined : next);
const rows = [...section.matchAll(/^\|\s*(\d+) px\s*\|\s*(lanczos|sr-full)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*(\d+)\s*\|$/gm)]
  .map((m) => ({ size: Number(m[1]), method: m[2], psnr: Number(m[3]), ssim: Number(m[4]), gmsd: Number(m[5]), ms: Number(m[6]) }));

test('the section names the command with the sizes and methods that were run', () => {
  assert.ok(section.includes('node bench/bench.js bench/out/sub20 --sizes 500,600,700 --methods lanczos,sr-full'));
  assert.ok(section.includes('PUSHUP_QUALITY=fast PUSHUP_DEVICE=cpu'));
});

test('the table has a lanczos and an sr-full row for each of 500, 600 and 700 px, in that order', () => {
  assert.deepStrictEqual(rows.map((r) => `${r.size} ${r.method}`), ['500 lanczos', '500 sr-full', '600 lanczos', '600 sr-full', '700 lanczos', '700 sr-full']);
  assert.ok(section.includes('| input | method | PSNR | SSIM | GMSD | ms |'));
});

test('the "fast beats Lanczos" sentence and the quoted differences follow from the table', () => {
  const by = (s, m) => rows.find((r) => r.size === s && r.method === m);
  const sizes = [500, 600, 700];
  const beats = sizes.every((s) => by(s, 'sr-full').psnr > by(s, 'lanczos').psnr && by(s, 'sr-full').ssim > by(s, 'lanczos').ssim && by(s, 'sr-full').gmsd < by(s, 'lanczos').gmsd);
  assert.match(section, new RegExp(`at each of the three sizes: ${beats ? 'yes' : 'no'}`));
  const fmt = (v, d) => `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(d)}`;
  const diff = (k, d) => sizes.map((s) => fmt(by(s, 'sr-full')[k] - by(s, 'lanczos')[k], d));
  assert.ok(section.includes(`PSNR ${diff('psnr', 2).join(', ')} dB`), `PSNR differences ${diff('psnr', 2)}`);
  assert.ok(section.includes(`SSIM ${diff('ssim', 4).join(', ')}`), `SSIM differences ${diff('ssim', 4)}`);
  assert.ok(section.includes(`GMSD ${diff('gmsd', 4).join(', ')}`), `GMSD differences ${diff('gmsd', 4)}`);
});
