'use strict';
// BL26: the array `upscale` returns must own its memory: offset 0 and exactly out_width * out_height * 3 bytes,
// not a view into a bigger or shared ArrayBuffer (a caller may pass `arr_out.buffer` on to a worker, sharp or a
// file write), and two calls must never share bytes (a later call must not change an earlier result).
const test = require('node:test');
const assert = require('node:assert');

process.env.PUSHUP_DEVICE = 'cpu';
process.env.PUSHUP_QUALITY = 'fast';
const { upscale } = require('../src');

function image(w, h, seed) {
  const arr = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    arr[i] = (x * 3 + y * seed) & 255;
    arr[i + 1] = (x ^ (y * 5 + seed)) & 255;
    arr[i + 2] = (128 + 100 * Math.sin(x / (9 + seed)) * Math.cos(y / 13)) | 0;
  }
  return arr;
}

// Returns a list of problems with one result (empty when it owns exactly its bytes).
function ownershipProblems(out, stride_out, h_expected) {
  const problems = [];
  if (out.byteOffset !== 0) problems.push(`byteOffset is ${out.byteOffset}, not 0`);
  if (out.buffer instanceof SharedArrayBuffer) problems.push('buffer is a SharedArrayBuffer');
  if (out.byteLength !== out.buffer.byteLength) problems.push(`byteLength ${out.byteLength} != buffer.byteLength ${out.buffer.byteLength}`);
  if (out.byteLength !== stride_out * h_expected) problems.push(`byteLength ${out.byteLength} != stride_out * height ${stride_out * h_expected}`);
  return problems;
}

const cases = [
  { w: 400, h: 300, factor: 1.0 },
  { w: 400, h: 300, factor: 1.5 },
  { w: 300, h: 400, factor: 1.0 },
  { w: 300, h: 400, factor: 1.5 },
];

for (const { w, h, factor } of cases) {
  test(`the result owns its memory (${w}x${h}, factor ${factor})`, async () => {
    const [out, stride_out] = await upscale(image(w, h, 1), w * 3, factor);
    const longest = Math.min(Math.round(Math.max(w, h) * factor), 1000);
    const outH = Math.max(1, Math.round((h * longest) / Math.max(w, h)));
    assert.deepStrictEqual(ownershipProblems(out, stride_out, outH), []);
  });
}

test('the ownership check reports a view, a shared buffer and a wrong length, and accepts a good array', () => {
  const good = new Uint8Array(12);
  assert.deepStrictEqual(ownershipProblems(good, 6, 2), []);
  const view = new Uint8Array(new ArrayBuffer(20), 4, 12);
  assert.ok(ownershipProblems(view, 6, 2).some((p) => p.includes('byteOffset')));
  assert.ok(ownershipProblems(view, 6, 2).some((p) => p.includes('buffer.byteLength')));
  assert.ok(ownershipProblems(new Uint8Array(new SharedArrayBuffer(12)), 6, 2).some((p) => p.includes('SharedArrayBuffer')));
  assert.ok(ownershipProblems(good, 6, 3).some((p) => p.includes('stride_out * height')));
});

test('two sequential calls return different ArrayBuffers; zeroing the first leaves the second unchanged', async () => {
  const [a] = await upscale(image(400, 300, 1), 1200, 1.0);
  const [b] = await upscale(image(400, 300, 2), 1200, 1.0);
  assert.notStrictEqual(a.buffer, b.buffer);
  const bCopy = Buffer.from(b);
  a.fill(0);
  assert.ok(Buffer.from(b).equals(bCopy), 'filling the first result changed the second');
});

test('two calls started together return different ArrayBuffers and independent bytes', async () => {
  const [[a], [b]] = await Promise.all([upscale(image(400, 300, 1), 1200, 1.0), upscale(image(400, 300, 2), 1200, 1.0)]);
  assert.notStrictEqual(a.buffer, b.buffer);
  const aCopy = Buffer.from(a);
  const bCopy = Buffer.from(b);
  b.fill(0);
  assert.ok(Buffer.from(a).equals(aCopy), 'filling the second result changed the first');
  a.fill(255);
  assert.ok(Buffer.from(b).equals(Buffer.alloc(bCopy.length)), 'filling the first result changed the second');
});
