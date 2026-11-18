'use strict';
// CV4: bench/degrade.js, the reference / degraded-input construction shared by bench/pad.js and bench/edges-real.js.
// Sizes only (hashes depend on the sharp build): longest side of gt is 800, inp is gt halved with Math.round.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { degrade, raw } = require('../bench/degrade.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-degrade-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

async function source(name, w, h) {
  const buf = Buffer.alloc(w * h * 3);
  for (let i = 0; i < buf.length; i++) buf[i] = (i * 31 + (i >> 7)) & 255;
  const file = path.join(tmp, name);
  await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toFile(file);
  return file;
}

test('800x600 source: gt 800x600, inp 400x300, packed RGB', async () => {
  const { gt, inp } = await degrade(await source('a.png', 800, 600));
  assert.deepStrictEqual([gt.w, gt.h, inp.w, inp.h], [800, 600, 400, 300]);
  assert.strictEqual(gt.data.length, 800 * 600 * 3);
  assert.strictEqual(inp.data.length, 400 * 300 * 3);
});

test('600x900 source: gt 533x800 (round(533.33)), inp 267x400 (round(266.5) = 267)', async () => {
  const { gt, inp } = await degrade(await source('b.png', 600, 900));
  assert.deepStrictEqual([gt.w, gt.h, inp.w, inp.h], [533, 800, 267, 400]);
});

test('650x900 source: gt 578x800 (577.78 rounds up; a floor would give 577), inp 289x400', async () => {
  const { gt, inp } = await degrade(await source('e.png', 650, 900));
  assert.deepStrictEqual([gt.w, gt.h, inp.w, inp.h], [578, 800, 289, 400]);
});

test('a source smaller than 800 px is scaled up to an 800 px reference; the input is always 400 px on its longest side', async () => {
  for (const [w, h] of [[500, 300], [300, 500], [1200, 1200]]) {
    const { gt, inp } = await degrade(await source(`c${w}x${h}.png`, w, h));
    assert.strictEqual(Math.max(gt.w, gt.h), 800);
    assert.strictEqual(Math.max(inp.w, inp.h), 400);
  }
});

test('raw drops an alpha channel and returns packed RGB with its size', async () => {
  const rgba = Buffer.alloc(10 * 4 * 4, 200);
  const r = await raw(sharp(rgba, { raw: { width: 10, height: 4, channels: 4 } }));
  assert.deepStrictEqual([r.w, r.h, r.data.length], [10, 4, 10 * 4 * 3]);
});

test('degrade is deterministic', async () => {
  const f = await source('d.png', 640, 480);
  const a = await degrade(f), b = await degrade(f);
  assert.ok(Buffer.compare(a.inp.data, b.inp.data) === 0 && Buffer.compare(a.gt.data, b.gt.data) === 0);
});
