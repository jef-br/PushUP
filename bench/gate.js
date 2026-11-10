#!/usr/bin/env node
'use strict';
// Quality gate: compare two `bench/bench.js --json` runs.
// Usage: node bench/gate.js <before.json> <after.json>
// Exit 0 = GATE: PASS, 1 = GATE: FAIL (or bad input), 2 = usage error.
const fs = require('node:fs');

// Thresholds from docs/OVERNIGHT_RUN.md §2 ("Quality gate"), applied to every overall row.
// A delta exactly at a threshold passes.
const MAX_PSNR_DROP = 0.02; // dB
const MAX_SSIM_DROP = 0.001;
const MAX_GMSD_RISE = 0.001; // lower GMSD is better

// Float noise allowance so that "exactly at the threshold" passes despite binary rounding.
const EPS = 1e-9;

function load(file) {
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    throw new Error(`${file}: cannot read bench --json output (${e.message})`);
  }
  if (!j || !Number.isInteger(j.images) || !Array.isArray(j.rows)) {
    throw new Error(`${file}: expected {images, rows: [...]} from bench.js --json`);
  }
  return j;
}

function gate(before, after) {
  const lines = [];
  let ok = true;
  if (before.images !== after.images) {
    return { ok: false, lines: [`images differ: before ${before.images}, after ${after.images} (not the same set)`] };
  }
  const afterBy = new Map(after.rows.map((r) => [r.setting, r]));
  const overall = before.rows.filter((r) => !String(r.setting).endsWith(']'));
  if (overall.length === 0) return { ok: false, lines: ['no overall rows in before'] };
  for (const b of overall) {
    const a = afterBy.get(b.setting);
    if (!a) { ok = false; lines.push(`${b.setting}: missing in after  FAIL`); continue; }
    const dPsnr = a.psnr - b.psnr, dSsim = a.ssim - b.ssim, dGmsd = a.gmsd - b.gmsd;
    const pass = -dPsnr <= MAX_PSNR_DROP + EPS && -dSsim <= MAX_SSIM_DROP + EPS && dGmsd <= MAX_GMSD_RISE + EPS;
    if (!pass) ok = false;
    const f = (v, d) => (v >= 0 ? '+' : '') + v.toFixed(d);
    lines.push(`${b.setting.padEnd(18)} PSNR ${f(dPsnr, 4)}  SSIM ${f(dSsim, 5)}  GMSD ${f(dGmsd, 5)}  ${pass ? 'PASS' : 'FAIL'}`);
  }
  return { ok, lines };
}

if (require.main === module) {
  const [beforeFile, afterFile] = process.argv.slice(2);
  if (!beforeFile || !afterFile) {
    console.error('Usage: node bench/gate.js <before.json> <after.json>');
    process.exit(2);
  }
  let res;
  try { res = gate(load(beforeFile), load(afterFile)); } catch (e) {
    console.error(e.message);
    console.log('GATE: FAIL');
    process.exit(1);
  }
  for (const l of res.lines) console.log(l);
  console.log(res.ok ? 'GATE: PASS' : 'GATE: FAIL');
  process.exit(res.ok ? 0 : 1);
}

module.exports = { gate, MAX_PSNR_DROP, MAX_SSIM_DROP, MAX_GMSD_RISE };
