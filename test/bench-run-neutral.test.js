'use strict';
// BL43: neutral greys through `fast` (bench/neutral.js, docs/COLOR.md "Neutral greys (BL43)").
// Measured 2026-11-24, 4 vCPU, CPU, `fast`: a flat grey 400x300 image at factor 1 comes out with a per-pixel channel spread
// (max(R,G,B) - min(R,G,B)) of at most 2 for 64, 128, 192 (3 for 240 over the whole image, 1 away from the border) and a mean of
// about 1.0 (1.00-1.03). The product test below allows that figure plus 1, so a later model change that adds a colour cast fails it.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeNeutral, spread, parseArgs, CASES } = require('../bench/neutral.js');
const { upscale } = require('../src/index.js');

test('makeNeutral builds exactly neutral, seeded images; spread measures the channel spread', () => {
  for (const kind of CASES) {
    const img = makeNeutral(kind, 40, 30);
    for (let i = 0; i < img.length; i += 3) assert.ok(img[i] === img[i + 1] && img[i] === img[i + 2], `${kind}: pixel ${i / 3} is not grey`);
  }
  assert.deepStrictEqual(makeNeutral('noise', 40, 30), makeNeutral('noise', 40, 30));
  assert.strictEqual(makeNeutral('flat192', 4, 4)[0], 192);
  assert.throws(() => makeNeutral('nope'), /unknown case/);
  // 3x3 image, edge 1: only the centre pixel counts as "away from the border".
  const img = new Uint8Array(27).fill(100);
  img.set([100, 110, 90], 12); // pixel 4 (the centre): spread 20
  img.set([0, 0, 50], 0);      // pixel 0 (a corner): spread 50
  const s = spread(img, 3, 3, 1);
  assert.deepStrictEqual([s.allMax, s.inMax], [50, 20]);
  assert.strictEqual(s.inMean, 20);
  assert.ok(Math.abs(s.allMean - 70 / 9) < 1e-9);
  assert.deepStrictEqual(parseArgs(['--cases', 'ramp,noise', '--factors', '1,2']), { cases: ['ramp', 'noise'], factors: [1, 2] });
  assert.throws(() => parseArgs(['--bogus', '1']), /usage/);
});

test('a flat grey image keeps its channels within the measured spread plus 1', async () => {
  for (const g of [64, 128, 192, 240]) {
    const w = 400, h = 300;
    const [out, stride] = await upscale(makeNeutral(`flat${g}`), w * 3, 1);
    const s = spread(out, stride / 3, out.length / stride);
    assert.ok(s.allMax <= 3 + 1, `flat ${g}: largest spread ${s.allMax} (measured 3 at most)`);
    assert.ok(s.inMax <= 2 + 1, `flat ${g}: largest spread away from the border ${s.inMax} (measured 2 at most)`);
    assert.ok(s.inMean <= 1.2, `flat ${g}: mean spread ${s.inMean} (measured 1.00-1.02)`);
  }
});

test('neutral.js prints the table header and one row for one case', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bench', 'neutral.js'), '--cases', 'flat128', '--factors', '1'], {
    encoding: 'utf8', timeout: 120000, env: { ...process.env, PUSHUP_DEVICE: 'cpu' },
  });
  assert.strictEqual(r.status, 0, r.stderr);
  const lines = r.stdout.split('\n').filter((l) => l !== '');
  assert.match(lines[0], /^\| case \| factor \| out \| max spread \(whole image\) \| mean spread \(whole image\) \| max spread \(away from the border\) \| mean spread \(away from the border\) \|$/);
  assert.strictEqual(lines.length, 3, r.stdout);
  const c = lines[2].split('|').slice(1, -1).map((x) => x.trim());
  assert.deepStrictEqual(c.slice(0, 3), ['flat128', '1', '400x300']);
  assert.match(c[4], /^\d+\.\d{3}$/);
});
