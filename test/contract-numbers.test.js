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

// BL29: README "How it works" step 3 names where the `fast` Lanczos mix really comes from (`MODES.fast.lanczosMix`;
// DEFAULT_LANCZOS_MIX only applies to an explicit modelPath) and states the same percentage. Returns a list of problems.
function pipelineMixProblems(readme, mix) {
  const m = readme.match(/\n## How it works\n([\s\S]*?)\n### Model choice/);
  if (!m) return ['README.md: no section between "## How it works" and "### Model choice"'];
  const text = m[1].replace(/\s+/g, ' ');
  const problems = [];
  if (!text.includes('`MODES.fast.lanczosMix`')) problems.push('README.md "How it works" does not name `MODES.fast.lanczosMix`');
  if (text.includes('DEFAULT_LANCZOS_MIX')) problems.push('README.md "How it works" still names DEFAULT_LANCZOS_MIX (only used with an explicit modelPath)');
  const pct = text.match(/(\d+)% of a plain Lanczos upscale/);
  const want = Math.round(mix * 100);
  if (!pct) problems.push('README.md "How it works" has no "<n>% of a plain Lanczos upscale"');
  else if (Number(pct[1]) !== want) problems.push(`README.md "How it works" says ${pct[1]}% but MODES.fast.lanczosMix is ${want}%`);
  return problems;
}

test('README "How it works" step 3 names MODES.fast.lanczosMix and the same percentage', () => {
  assert.deepStrictEqual(pipelineMixProblems(read('README.md'), _MODES.fast.lanczosMix), []);
});

test('the pipeline-mix check reports a wrong percentage, the old constant name and a missing section', () => {
  const doc = (body) => `\n## How it works\n${body}\n### Model choice\n`;
  const good = doc('3. In `fast` mode, 20% of a plain\n   Lanczos upscale is mixed in (`MODES.fast.lanczosMix`).');
  assert.deepStrictEqual(pipelineMixProblems(good, 0.2), []);
  assert.ok(pipelineMixProblems(good.replace('20%', '30%'), 0.2).some((p) => p.includes('says 30%')));
  assert.ok(pipelineMixProblems(good.replace('`MODES.fast.lanczosMix`', '`DEFAULT_LANCZOS_MIX`'), 0.2).length >= 2);
  assert.ok(pipelineMixProblems('# nothing', 0.2).some((p) => p.includes('no section')));
  assert.ok(pipelineMixProblems(doc('3. mixes some Lanczos in `MODES.fast.lanczosMix`'), 0.2).some((p) => p.includes('no "<n>%')));
});

// BL30: CLAUDE.md names the model file and size of each mode (`fast`: `models/4xLSDIRCompactC3.onnx` (~2.5 MB ...)).
// They must match MODES (the file name) and the file on disk (size within 15%, MB read as decimal MB).
// `modes` is { fast: { file, bytes }, high: { file, bytes } }. Returns a list of problems.
function modelLineProblems(file, text, modes) {
  const problems = [];
  for (const [mode, { file: name, bytes }] of Object.entries(modes)) {
    const line = text.split('\n').find((l) => l.includes(`\`${mode}\`:`));
    if (!line) { problems.push(`${file}: no "\`${mode}\`:" mode line`); continue; }
    if (!line.includes(`models/${name}`)) problems.push(`${file}: ${mode} line does not name models/${name} (MODES.${mode}.modelPath): ${line.trim()}`);
    const size = line.match(/~(\d+(?:\.\d+)?) MB/);
    const mb = bytes / 1e6;
    if (!size) problems.push(`${file}: ${mode} line has no "~<n> MB" size`);
    else if (Math.abs(Number(size[1]) - mb) > 0.15 * mb) problems.push(`${file}: ${mode} line says ~${size[1]} MB but ${name} is ${mb.toFixed(1)} MB (more than 15% off)`);
  }
  return problems;
}

test('CLAUDE.md model lines name the MODES model files and state their sizes within 15%', () => {
  const modes = {};
  for (const mode of ['fast', 'high']) {
    const p = _MODES[mode].modelPath;
    modes[mode] = { file: path.basename(p), bytes: fs.statSync(p).size };
  }
  assert.deepStrictEqual(modelLineProblems('CLAUDE.md', read('CLAUDE.md'), modes), []);
});

test('the model-line check reports a wrong file name, a size more than 15% off and a missing line', () => {
  const modes = { fast: { file: 'a.onnx', bytes: 2_500_000 }, high: { file: 'b.onnx', bytes: 67_000_000 } };
  const good = '  - `fast`: `models/a.onnx` (~2.5 MB, CC BY 4.0), whole image.\n  - `high`: `models/b.onnx` (~67 MB, x).';
  assert.deepStrictEqual(modelLineProblems('x.md', good, modes), []);
  assert.ok(modelLineProblems('x.md', good.replace('models/a.onnx', 'models/c.onnx'), modes).some((p) => p.includes('fast line does not name models/a.onnx')));
  assert.ok(modelLineProblems('x.md', good.replace('~67 MB', '~80 MB'), modes).some((p) => p.includes('high line says ~80 MB')));
  assert.ok(modelLineProblems('x.md', good.replace('~2.5 MB', '~2.0 MB'), modes).some((p) => p.includes('fast line says ~2.0 MB')), '2.0 is 20% off 2.5');
  assert.deepStrictEqual(modelLineProblems('x.md', good.replace('~2.5 MB', '~2.3 MB'), modes), [], '8% off passes');
  assert.ok(modelLineProblems('x.md', good.replace('~67 MB', 'big'), modes).some((p) => p.includes('no "~<n> MB"')));
  assert.ok(modelLineProblems('x.md', '  - `fast`: `models/a.onnx` (~2.5 MB)', modes).some((p) => p.includes('no "`high`:" mode line')));
});
