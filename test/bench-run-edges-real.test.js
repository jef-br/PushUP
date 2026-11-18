'use strict';
// HP6: a valid run of bench/edges-real.js on generated images (the real run needs bench/out/sub20, which CI lacks).
// Asserts the shape of the output: header, control rows before real-photo rows, finite numeric cells, and the
// final `control:` decision line. No absolute overshoot value is asserted. Helpers and argument checks are in
// test/edges-real.test.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');

const SCRIPT = path.join(__dirname, '..', 'bench', 'edges-real.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-edgesrun-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// Large dark/light checkerboard (strong edges), longest side above 800 px.
async function writeImage(file, w, h) {
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) buf.fill(((x >> 7) + (y >> 7)) & 1 ? 215 : 40, (y * w + x) * 3, (y * w + x) * 3 + 3);
  await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toFile(file);
}

const cells = (line) => line.split('|').slice(1, -1).map((c) => c.trim());

test('bench/edges-real.js on two generated images prints control rows, then real-photo rows, then the decision', async () => {
  const dir = path.join(tmp, 'two');
  fs.mkdirSync(dir);
  await writeImage(path.join(dir, 'a.png'), 1000, 800);
  await writeImage(path.join(dir, 'b.png'), 800, 1000);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [SCRIPT, '--dir', dir, '--limit', '2'], {
    encoding: 'utf8', timeout: 60000, env: { ...process.env, PUSHUP_DEVICE: 'cpu' },
  });
  console.log(`bench/edges-real.js two-image run: ${Date.now() - t0} ms`);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stderr, '');
  const lines = r.stdout.split('\n');
  assert.match(lines[0], /^images used: 2 of 2; /);

  const rows = lines.filter((l) => /^\| (control|real photos) \|/.test(l)).map(cells);
  assert.strictEqual(rows.length, 8);
  assert.deepStrictEqual(rows.map((c) => c[0]), [...Array(4).fill('control'), ...Array(4).fill('real photos')]);
  for (const c of rows) {
    assert.strictEqual(c.length, 8);
    assert.ok(['on the edge', 'beside the edge'].includes(c[1]));
    assert.ok(['`fast`', 'Lanczos'].includes(c[2]));
    assert.ok(Number.isFinite(Number(c[3])), `mean overshoot "${c[3]}"`);
    assert.ok(Number.isFinite(Number(c[4].replace(/\s*%$/, ''))), `share "${c[4]}"`);
    assert.match(c[5], /^\d+ of \d+$/);
    assert.ok(Number.isFinite(Number(c[6])), `largest "${c[6]}"`);
    assert.ok(c[1] === 'on the edge' ? c[7] === '-' : Number.isInteger(Number(c[7])), `skipped "${c[7]}"`);
  }
  const last = lines.filter((l) => l.startsWith('control:'));
  assert.strictEqual(last.length, 1);
  assert.match(last[0], /inconclusive|a result/i);
  assert.ok(lines.findIndex((l) => l.startsWith('| control |')) < lines.findIndex((l) => l.startsWith('| real photos |')));
  assert.ok(lines.indexOf(last[0]) > lines.findIndex((l) => l.startsWith('| real photos |')));
});
