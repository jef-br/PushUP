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

// CV3: direction rounding, beside-edge samples, and the window option of overshoot9.
const { stepOf, besideSamples, sobel } = require('../bench/edges-real.js');

test('stepOf rounds the gradient direction to one of 8 steps', () => {
  assert.deepStrictEqual(stepOf(100, 0), [1, 0]);
  assert.deepStrictEqual(stepOf(-100, 0), [-1, 0]);
  assert.deepStrictEqual(stepOf(0, -7), [0, -1]);
  assert.deepStrictEqual(stepOf(100, 100), [1, 1]);
  assert.deepStrictEqual(stepOf(100, -100), [1, -1]);
  assert.deepStrictEqual(stepOf(100, 20), [1, 0]); // 0.2 rounds to 0
  assert.deepStrictEqual(stepOf(100, 60), [1, 1]); // 0.6 rounds to 1
  assert.deepStrictEqual(stepOf(0, 0), [0, 0]);
  assert.ok(Object.is(stepOf(100, -50)[1], 0) || stepOf(100, -50)[1] === 0, 'an exact -0.5 gives 0, not -0');
  assert.strictEqual(Object.is(stepOf(100, -50)[1], -0), false);
});

test('besideSamples: two pixels 2 px left and right of a vertical step, window centred on the edge pixel; none near the border', () => {
  const w = 40, h = 40;
  const step = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) step[y * w + x] = x < 20 ? 40 : 200;
  const p = 20 * w + 19; // the dark side of the step, gradient points towards +x
  assert.ok(sobel(step, w, p)[0] > 0);
  const b = besideSamples(step, w, h, p);
  assert.strictEqual(b.skipped, 0);
  assert.deepStrictEqual(b.samples.map((q) => [q.x, q.y, q.cx, q.cy]), [[17, 20, 19, 20], [21, 20, 19, 20]]);
  // 5 px from the left border: the 13x13 window (half-width 6) would leave the image
  assert.deepStrictEqual(besideSamples(step, w, h, 20 * w + 5), { samples: [], skipped: 2 });
  // Border rule (13x13 window, half-width 6), tested where the gradient is non-zero so the zero-gradient skip cannot hide it:
  // a step between x = 5 and 6 gives a gradient at x = 5 and 6; x = 5 is too close to the border, x = 6 is the closest allowed.
  const near = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) near[y * w + x] = x < 6 ? 40 : 200;
  assert.ok(sobel(near, w, 20 * w + 5)[0] > 0 && sobel(near, w, 20 * w + 6)[0] > 0);
  assert.deepStrictEqual(besideSamples(near, w, h, 20 * w + 5), { samples: [], skipped: 2 });
  assert.strictEqual(besideSamples(near, w, h, 20 * w + 6).samples.length, 2);
  // the same on the right: a step between x = w-7 and w-6; x = w-7 is allowed (x < w-6), x = w-6 is too close
  const far = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) far[y * w + x] = x < w - 6 ? 40 : 200;
  assert.strictEqual(besideSamples(far, w, h, 20 * w + (w - 7)).samples.length, 2);
  assert.deepStrictEqual(besideSamples(far, w, h, 20 * w + (w - 6)), { samples: [], skipped: 2 });
  // and the top: a step between rows 5 and 6
  const top = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) top[y * w + x] = y < 6 ? 40 : 200;
  assert.deepStrictEqual(besideSamples(top, w, h, 5 * w + 20), { samples: [], skipped: 2 });
  assert.strictEqual(besideSamples(top, w, h, 6 * w + 20).samples.length, 2);
  // a flat plane has no gradient direction
  assert.deepStrictEqual(besideSamples(new Float32Array(w * h), w, h, 20 * w + 20), { samples: [], skipped: 2 });
});

test('overshoot9 with { half, cx, cy } scores a pixel against a window centred elsewhere', () => {
  const w = 30;
  const ref = new Float32Array(w * w);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) ref[y * w + x] = x < 15 ? 40 : 200;
  const out = Float32Array.from(ref);
  out[10 * w + 13] = 215; // 2 px left of the window centre (15, 10): 15 above the max 200
  // 13x13 window centred on (15, 10) spans 40..200 -> 15
  assert.strictEqual(overshoot9(out, ref, w, 13, 10, { half: 6, cx: 15, cy: 10 }), 15);
  // the default 9x9 window centred on the pixel itself (13, 10) covers x = 9..17: also 40..200 -> 15
  assert.strictEqual(overshoot9(out, ref, w, 13, 10), 15);
  // a window centred further left (cx = 8: x 2..14, only dark) judges the same pixel against 40..40 -> 175
  assert.strictEqual(overshoot9(out, ref, w, 13, 10, { half: 6, cx: 8, cy: 10 }), 175);
});

// BL82: a value flag as the last argument (checkFlags leaves it to the script) exits 1 with one line, no stack trace.
{
  const { spawnSync } = require('node:child_process');
  const path = require('node:path');
  for (const flag of ['--dir', '--limit']) {
    test(`edges-real.js ${flag} with no value exits 1 with one stderr line`, () => {
      const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bench', 'edges-real.js'), flag], { encoding: 'utf8', timeout: 20000 });
      assert.strictEqual(r.status, 1);
      assert.strictEqual(r.stderr.trim(), `${flag} needs a value`);
      assert.strictEqual(r.stdout, '');
    });
  }
}
