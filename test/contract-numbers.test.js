'use strict';
// BL28: the contract numbers written in CLAUDE.md and the README must match the code. Input side range,
// output cap and the `fast` Lanczos mix are enforced by MIN_INPUT / MAX_INPUT / MAX_OUTPUT (exported as `_LIMITS`)
// and `MODES.fast.lanczosMix` (`_MODES`; DEFAULT_LANCZOS_MIX is NOT the fast mix: it only applies to an explicit
// modelPath). The default factor 1.0 is a parameter default, so it is checked by behaviour. Read only: this test
// never edits CLAUDE.md or the README.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

process.env.PUSHUP_DEVICE = 'cpu';
process.env.PUSHUP_QUALITY = 'fast';
const pushup = require('../src');
const { upscale, _LIMITS: L, _MODES } = pushup;

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const row = (text, re) => text.split('\n').find((l) => l.startsWith('|') && re.test(l));

// `dash` is the character between the two numbers: CLAUDE.md writes an en dash, the README a hyphen.
// Returns a list of problems for one document (empty when its numbers match).
function numberProblems(file, text, { dash, mix }) {
  const problems = [];
  const input = row(text, /^\|\s*Input\s*\|/);
  const factor = row(text, /^\|\s*`upscale_factor`\s*\|/);
  if (!input) problems.push(`${file}: no "| Input |" table row`);
  else if (!input.includes(`${L.MIN_INPUT}${dash}${L.MAX_INPUT}`)) problems.push(`${file}: Input row does not contain ${L.MIN_INPUT}${dash}${L.MAX_INPUT} (MIN_INPUT/MAX_INPUT): ${input.trim()}`);
  if (!factor) problems.push(`${file}: no "| \`upscale_factor\` |" table row`);
  else {
    if (!factor.includes(String(L.MAX_OUTPUT))) problems.push(`${file}: upscale_factor row does not contain ${L.MAX_OUTPUT} (MAX_OUTPUT): ${factor.trim()}`);
    if (!factor.includes('1.0')) problems.push(`${file}: upscale_factor row does not contain the default 1.0`);
  }
  if (mix !== undefined) {
    const pct = `${Math.round(mix * 100)}%`;
    const fast = text.split('\n').find((l) => l.includes('`fast`:'));
    if (!fast) problems.push(`${file}: no "\`fast\`:" mode line`);
    else if (!fast.includes(`${pct} Lanczos mix`)) problems.push(`${file}: fast mode line does not say "${pct} Lanczos mix" (MODES.fast.lanczosMix): ${fast.trim()}`);
  }
  return problems;
}

test('CLAUDE.md: input range, output cap, default factor and fast Lanczos mix match src/index.js', () => {
  assert.deepStrictEqual(numberProblems('CLAUDE.md', read('CLAUDE.md'), { dash: '–', mix: _MODES.fast.lanczosMix }), []);
});

test('README.md: input range, output cap and default factor match src/index.js', () => {
  assert.deepStrictEqual(numberProblems('README.md', read('README.md'), { dash: '-' }), []);
});

test('the number check reports a wrong range, cap, default and mix, and accepts a good document', () => {
  const good = [
    '| `fast` | 400–800 |', '| Input | 8-bit RGB. Largest side 400–800 px. |',
    '| `upscale_factor` | Default `1.0`. min(..., 1000). |', '- `fast`: model, whole image, 20% Lanczos mix.',
  ].join('\n');
  const opts = { dash: '–', mix: 0.2 };
  assert.deepStrictEqual(numberProblems('x.md', good, opts), []);
  assert.ok(numberProblems('x.md', good.replace('400–800 px', '400–900 px'), opts).some((p) => p.includes('Input row')));
  assert.ok(numberProblems('x.md', good.replace('1000', '2000'), opts).some((p) => p.includes('MAX_OUTPUT')));
  assert.ok(numberProblems('x.md', good.replace('`1.0`', '`2.0`'), opts).some((p) => p.includes('default 1.0')));
  assert.ok(numberProblems('x.md', good.replace('20%', '30%'), opts).some((p) => p.includes('Lanczos mix')));
  assert.ok(numberProblems('x.md', 'nothing here', opts).length >= 3);
  assert.ok(numberProblems('x.md', good, { dash: '-', mix: 0.2 }).some((p) => p.includes('Input row')), 'a hyphen is not an en dash');
});

test('the default factor is 1.0 by behaviour', async () => {
  const w = 400, h = 300;
  const arr = new Uint8Array(w * h * 3);
  for (let i = 0; i < arr.length; i++) arr[i] = (i * 7 + (i >> 5)) & 255;
  const [dflt, s1] = await upscale(arr, w * 3);
  const [one, s2] = await upscale(arr, w * 3, 1.0);
  assert.strictEqual(s1, w * 3);
  assert.strictEqual(s2, w * 3);
  assert.strictEqual(dflt.length, w * h * 3, 'with the default factor the largest side stays 400 px');
  assert.ok(Buffer.from(dflt).equals(Buffer.from(one)), 'upscale(arr, stride) differs from upscale(arr, stride, 1.0)');
});
