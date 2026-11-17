'use strict';
// CV2: bench/edges-real.js: the overshoot of a pixel against its 9x9 reference window, the edge picker,
// and the argument checks (one line on stderr, exit 1, before the model is loaded).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { overshoot9, pickEdges } = require('../bench/edges-real.js');

const SCRIPT = path.join(__dirname, '..', 'bench', 'edges-real.js');

// A 9x9 reference window: left half 40, right half 200 (the centre pixel (4,4) sits on the edge).
const W = 9;
const ref = new Float32Array(W * W);
for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) ref[y * W + x] = x < 4 ? 40 : 200;
const outWith = (v) => { const o = Float32Array.from(ref); o[4 * W + 4] = v; return o; };

test('overshoot9: inside the window is 0, above the max and below the min is the distance', () => {
  assert.strictEqual(overshoot9(outWith(120), ref, W, 4, 4), 0);
  assert.strictEqual(overshoot9(outWith(200), ref, W, 4, 4), 0);
  assert.strictEqual(overshoot9(outWith(210), ref, W, 4, 4), 10);
  assert.strictEqual(overshoot9(outWith(33), ref, W, 4, 4), 7);
});

test('pickEdges: finds the pixels on a step edge, none on a flat image or a low-contrast edge', () => {
  const w = 40, h = 40;
  const step = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) step[y * w + x] = x < 20 ? 40 : 200;
  const p = pickEdges(step, w, h, 30);
  assert.strictEqual(p.length, 30);
  for (const i of p) assert.ok([19, 20].includes(i % w), `pixel ${i} is not next to the step`);
  assert.deepStrictEqual(pickEdges(new Float32Array(w * h).fill(100), w, h, 30), []);
  const low = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) low[y * w + x] = x < 20 ? 100 : 150; // contrast 50 < 80
  assert.deepStrictEqual(pickEdges(low, w, h, 30), []);
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-edges-real-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
function run(args) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 20000 });
  return { status: r.status, out: r.stdout, firstErr: r.stderr.split('\n')[0], elapsed: Date.now() - t0 };
}

test('argument checks end in one line, exit 1, no stdout', () => {
  const emptyDir = path.join(tmp, 'empty');
  fs.mkdirSync(emptyDir);
  const file = path.join(tmp, 'a-file.txt');
  fs.writeFileSync(file, 'x');
  const cases = [
    [['--bogus'], 'unknown flag --bogus'],
    [['--limit', '0'], '--limit must be a positive integer'],
    [['--limit', 'abc'], '--limit must be a positive integer'],
    [['--dir', path.join(tmp, 'missing')], 'does not exist'],
    [['--dir', file], 'is not a directory'],
    [['--dir', emptyDir], 'no images in'],
  ];
  for (const [args, msg] of cases) {
    const r = run(args);
    assert.strictEqual(r.status, 1, args.join(' '));
    assert.strictEqual(r.out, '', args.join(' '));
    assert.ok(r.firstErr.includes(msg), `${args.join(' ')}: ${r.firstErr}`);
    assert.ok(r.elapsed < 5000, `${args.join(' ')} took ${r.elapsed} ms`);
  }
});
