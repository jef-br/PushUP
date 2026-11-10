'use strict';
// B1: bench/gate.js applies the playbook §2 quality gate to two bench.js --json runs.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { MAX_PSNR_DROP, MAX_SSIM_DROP, MAX_GMSD_RISE } = require('../bench/gate.js');

const GATE = path.join(__dirname, '..', 'bench', 'gate.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-gate-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const base = () => ({
  images: 20,
  rows: [
    { setting: '400px lanczos', psnr: 27.5, ssim: 0.81, gmsd: 0.09, ms: 5 },
    { setting: '400px sr-full', psnr: 28.25, ssim: 0.84, gmsd: 0.07, ms: 600 },
    { setting: '800px sr-full', psnr: 31.5, ssim: 0.9, gmsd: 0.05, ms: 2000 },
    { setting: '400px sr-full [abo]', psnr: 29, ssim: 0.85, gmsd: 0.06, ms: 600 },
  ],
});

let n = 0;
function run(before, after) {
  const b = path.join(dir, `b${n}.json`), a = path.join(dir, `a${n++}.json`);
  fs.writeFileSync(b, JSON.stringify(before));
  fs.writeFileSync(a, JSON.stringify(after));
  const r = spawnSync(process.execPath, [GATE, b, a], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
// Copy of base() with one field of one row changed.
function edit(setting, key, delta) {
  const j = base();
  const r = j.rows.find((x) => x.setting === setting);
  r[key] += delta;
  return j;
}

test('identical runs pass', () => {
  const r = run(base(), base());
  assert.strictEqual(r.code, 0, r.out + r.err);
  assert.match(r.out, /GATE: PASS\s*$/);
  assert.strictEqual((r.out.match(/^(?!GATE:).* PASS$/gm) || []).length, 3, 'one PASS line per overall row');
});

test('thresholds match the playbook §2 numbers', () => {
  assert.strictEqual(MAX_PSNR_DROP, 0.02);
  assert.strictEqual(MAX_SSIM_DROP, 0.001);
  assert.strictEqual(MAX_GMSD_RISE, 0.001);
});

for (const [key, delta, label] of [
  ['psnr', -MAX_PSNR_DROP, 'PSNR drop'],
  ['ssim', -MAX_SSIM_DROP, 'SSIM drop'],
  ['gmsd', +MAX_GMSD_RISE, 'GMSD rise'],
]) {
  test(`${label} exactly at the threshold passes, just over fails`, () => {
    const at = run(base(), edit('800px sr-full', key, delta));
    assert.strictEqual(at.code, 0, `at threshold: ${at.out}`);
    const over = run(base(), edit('800px sr-full', key, delta * 1.01));
    assert.strictEqual(over.code, 1, `over threshold: ${over.out}`);
    assert.match(over.out, /^800px sr-full .*FAIL$/m);
    assert.match(over.out, /GATE: FAIL\s*$/);
  });
}

test('improvements pass', () => {
  const j = base();
  for (const r of j.rows) { r.psnr += 1; r.ssim += 0.01; r.gmsd -= 0.01; }
  assert.strictEqual(run(base(), j).code, 0);
});

test('a setting missing in after fails', () => {
  const j = base();
  j.rows = j.rows.filter((r) => r.setting !== '400px lanczos');
  const r = run(base(), j);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /400px lanczos: missing in after/);
});

test('a different image count fails', () => {
  const j = base();
  j.images = 19;
  const r = run(base(), j);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /images differ/);
});

test('per-source rows are ignored', () => {
  const worse = edit('400px sr-full [abo]', 'psnr', -5);
  assert.strictEqual(run(base(), worse).code, 0, 'a worse per-source row must not fail the gate');
  const missing = base();
  missing.rows = missing.rows.filter((r) => !r.setting.endsWith(']'));
  assert.strictEqual(run(base(), missing).code, 0, 'a missing per-source row must not fail the gate');
});

test('bad input and missing arguments fail clearly', () => {
  const bad = path.join(dir, 'bad.json');
  fs.writeFileSync(bad, 'images: 20');
  const r = spawnSync(process.execPath, [GATE, bad, bad], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /cannot read bench --json output/);
  const u = spawnSync(process.execPath, [GATE], { encoding: 'utf8' });
  assert.strictEqual(u.status, 2);
  assert.match(u.stderr, /Usage: node bench\/gate\.js/);
});
