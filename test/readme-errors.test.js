'use strict';
// Q6: the README "Errors" list must match what upscale() actually throws.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { upscale } = require('../src');

const W = 400, H = 4; // smallest valid largest side; tiny so each trigger is cheap
const valid = () => new Uint8Array(W * H * 3).fill(100);

function withEnv(vars, fn) {
  return async () => {
    const saved = {};
    for (const k of Object.keys(vars)) { saved[k] = process.env[k]; process.env[k] = vars[k]; }
    try { return await fn(); } finally {
      for (const k of Object.keys(vars)) {
        if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
      }
    }
  };
}

// Each README row is matched to its trigger(s) by a pattern on the row's first cell, in the
// order run() checks them (arr type, factor, stride, short arr, size, then the env settings).
// Every trigger gets valid earlier arguments, so it fails for its own reason (checked by message).
const TRIGGERS = [
  { match: /`arr` is not a byte array/, message: /arr must be a byte array/, calls: [
    () => upscale('nope', W * 3),
    () => upscale({ length: 3 }, W * 3),
    () => upscale(new Float32Array(W * H * 3), W * 3),
  ] },
  { match: /`upscale_factor` is not a finite number/, message: /upscale_factor must be a number > 0/, calls: [
    () => upscale(valid(), W * 3, 0),
    () => upscale(valid(), W * 3, -1),
    () => upscale(valid(), W * 3, NaN),
    () => upscale(valid(), W * 3, Infinity),
    () => upscale(valid(), W * 3, '1.5'),
  ] },
  { match: /`stride` is not an integer/, message: /stride must be an integer/, calls: [
    () => upscale(valid(), 2.5),
    () => upscale(valid(), 2),
    () => upscale(valid(), '1200'),
  ] },
  { match: /`arr` is shorter than one row/, message: /arr is shorter than one row/, calls: [
    () => upscale(new Uint8Array(W * 3 - 1), W * 3),
    () => upscale(new Uint8Array(0), W * 3 + 2),
  ] },
  { match: /Largest side outside/, message: /largest input side must be 400-800px/, calls: [
    () => upscale(new Uint8Array(399 * H * 3), 399 * 3),
    () => upscale(new Uint8Array(801 * H * 3), 801 * 3),
    () => upscale(new Uint8Array(4 * 801 * 3), 4 * 3), // tall: height is the largest side
  ] },
  { match: /`PUSHUP_QUALITY` or `PUSHUP_DEVICE`/, message: /PUSHUP_(QUALITY|DEVICE) must be one of/, calls: [
    withEnv({ PUSHUP_QUALITY: 'ultra', PUSHUP_DEVICE: 'cpu' }, () => upscale(valid(), W * 3)),
    withEnv({ PUSHUP_QUALITY: 'fast', PUSHUP_DEVICE: 'tpu' }, () => upscale(valid(), W * 3)),
  ] },
];

function readErrorRows() {
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  const section = readme.match(/^### Errors\s*$([\s\S]*?)(?=^#{1,3} )/m);
  assert.ok(section, 'README.md has no "### Errors" section (followed by another heading)');
  const rows = section[1].split('\n')
    .filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l) && !/^\|\s*Trigger\s*\|/.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
  assert.ok(rows.length > 0, 'the README Errors table has no rows');
  return rows;
}

test('every row of the README Errors list rejects with the documented error class', async () => {
  const used = new Set();
  for (const [trigger, cls] of readErrorRows()) {
    const name = cls.replace(/`/g, '');
    assert.ok(name === 'TypeError' || name === 'RangeError', `unknown error class "${cls}" for: ${trigger}`);
    const t = TRIGGERS.find((x) => x.match.test(trigger));
    assert.ok(t, `README Errors row has no trigger in this test: ${trigger}`);
    assert.ok(!used.has(t), `two README rows map to the same trigger: ${trigger}`);
    used.add(t);
    for (const [i, call] of t.calls.entries()) {
      await assert.rejects(call(), (err) => {
        assert.strictEqual(err.constructor.name, name, `"${trigger}" call ${i}: got ${err.constructor.name}: ${err.message}`);
        assert.match(err.message, t.message, `"${trigger}" call ${i} failed for another reason`);
        return true;
      });
    }
  }
  const missing = TRIGGERS.filter((t) => !used.has(t)).map((t) => t.match);
  assert.deepStrictEqual(missing, [], 'triggers in this test with no README row');
});

test('README rows are in check order, and only the first problem is reported', async () => {
  const order = readErrorRows().map(([trigger]) => TRIGGERS.findIndex((t) => t.match.test(trigger)));
  assert.deepStrictEqual(order, TRIGGERS.map((_, i) => i), 'README Errors rows must list the checks in the order run() makes them');
  const [arrT, factorT, strideT, shortT, sizeT] = TRIGGERS;
  // Each call breaks two neighbouring rules; the earlier one must win.
  const pairs = [
    [arrT, () => upscale('nope', W * 3, 0)],
    [factorT, () => upscale(valid(), 2.5, 0)],
    [strideT, () => upscale(new Uint8Array(0), 2.5)],
    [shortT, () => upscale(new Uint8Array(10), 399 * 3)],
    [sizeT, withEnv({ PUSHUP_QUALITY: 'ultra' }, () => upscale(new Uint8Array(399 * H * 3), 399 * 3))],
  ];
  for (const [t, call] of pairs) await assert.rejects(call(), t.message);
});

test('a valid call with the same tiny image resolves (the triggers are not failing for another reason)', async () => {
  const [out, stride] = await upscale(valid(), W * 3, 1);
  assert.strictEqual(stride, W * 3);
  assert.strictEqual(out.length, W * H * 3);
});
