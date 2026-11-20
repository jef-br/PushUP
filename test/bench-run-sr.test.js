'use strict';
// BL12: bench/bench.js runs the model path (`--methods sr-full`), the branch of method() that every other
// bench test skips by using only the model-free `lanczos`. A break there would corrupt every quality number
// in the PRs without failing a test. Two generated images, 400 px, `fast` mode on CPU.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');

test('bench.js --methods lanczos,sr-full runs the model and reports different, finite figures', { timeout: 90000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-bench-sr-'));
  try {
    for (const name of ['abo_a.png', 'abo_b.png']) {
      const w = 1000, h = 750;
      const raw = Buffer.alloc(w * h * 3);
      // Smooth gradients plus a coarse checker, so that the model and plain Lanczos give different results.
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = (y * w + x) * 3, c = ((x >> 5) + (y >> 5)) & 1 ? 40 : 0;
        raw[k] = (x * 255 / w + c + name.length) & 255;
        raw[k + 1] = (y * 255 / h + c) & 255;
        raw[k + 2] = ((x + y) * 255 / (w + h) + c) & 255;
      }
      await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(dir, name));
    }
    const r = spawnSync(process.execPath,
      [path.join(__dirname, '..', 'bench', 'bench.js'), dir, '--sizes', '400', '--methods', 'lanczos,sr-full', '--json'],
      { encoding: 'utf8', timeout: 60000, env: { ...process.env, PUSHUP_DEVICE: 'cpu', PUSHUP_QUALITY: 'fast' } });
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.images, 2);
    assert.deepStrictEqual(out.rows.map((x) => x.setting), ['400px lanczos', '400px sr-full']);
    for (const row of out.rows) {
      for (const k of ['psnr', 'ssim', 'gmsd', 'ms']) assert.ok(Number.isFinite(row[k]), `${row.setting}: ${k} is not a number`);
    }
    const [lan, sr] = out.rows;
    assert.ok(lan.psnr !== sr.psnr && lan.ssim !== sr.ssim, 'sr-full gives the same figures as lanczos: the model did not run');
    // BL14: the model really contributes, not only differs. Measured on this fixture (identical in three runs, CPU `fast`):
    // lanczos PSNR 28.09 / SSIM 0.878 / GMSD 0.213, sr-full 35.42 / 0.977 / 0.094; with the shipped `fast` Lanczos mix
    // (MODES.fast.lanczosMix, 0.2) raised to 0.999 or 1 the sr-full row equals the lanczos row (the check above fails), at 0.9
    // it reads PSNR 28.94 / SSIM 0.898 (only the margins below fail). The margins are about half the measured gaps.
    assert.ok(sr.psnr - lan.psnr >= 3, `sr-full PSNR ${sr.psnr.toFixed(2)} is not at least 3 dB above lanczos ${lan.psnr.toFixed(2)}: the model is bypassed or degraded`);
    assert.ok(sr.ssim - lan.ssim >= 0.05, `sr-full SSIM ${sr.ssim.toFixed(4)} is not at least 0.05 above lanczos ${lan.ssim.toFixed(4)}`);
    assert.ok(lan.gmsd - sr.gmsd >= 0.05, `sr-full GMSD ${sr.gmsd.toFixed(4)} is not at least 0.05 below lanczos ${lan.gmsd.toFixed(4)}`);
    assert.ok(sr.psnr > 30, `sr-full PSNR ${sr.psnr.toFixed(2)} is below the sanity floor of 30 dB`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
