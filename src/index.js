'use strict';

const path = require('node:path');
const os = require('node:os');
const ort = require('onnxruntime-node');
const sharp = require('sharp');

const MIN_INPUT = 400;
const MAX_INPUT = 800;
const MAX_OUTPUT = 1000; // hard cap on the output's largest side
const MODEL_SCALE = 4;

// Largest side (px) fed to the model. Smaller = faster, larger = keeps more
// of the input's detail. Tuned with bench/bench.js.
const DEFAULT_MODEL_INPUT_MAX = Infinity;

// Share of a plain Lanczos upscale mixed into the model output (0 = model only).
const DEFAULT_LANCZOS_MIX = 0;

const MODEL_PATH = path.join(__dirname, '..', 'models', 'realesr-general-wdn-x4v3.onnx');

const sessions = new Map();
function getSession(modelPath = MODEL_PATH) {
  if (!sessions.has(modelPath)) {
    const p = ort.InferenceSession.create(modelPath, {
      graphOptimizationLevel: 'all',
      intraOpNumThreads: os.availableParallelism(),
      executionMode: 'sequential',
    });
    p.catch(() => sessions.delete(modelPath));
    sessions.set(modelPath, p);
  }
  return sessions.get(modelPath);
}

// One inference at a time: each run already uses every core, so running two
// in parallel only makes both slower.
let queue = Promise.resolve();
function serialize(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

function readDims(arr, stride) {
  if (!Number.isInteger(stride) || stride < 3) {
    throw new TypeError('stride must be an integer >= 3 (bytes per image row)');
  }
  const width = Math.floor(stride / 3);
  const rowBytes = width * 3;
  let height = Math.floor(arr.length / stride);
  if (arr.length - height * stride >= rowBytes) height += 1; // last row may skip padding
  if (height < 1) throw new RangeError('arr is shorter than one row');
  return { width, height, rowBytes };
}

// Copy rows into a tightly packed RGB buffer (drops any row padding).
function packRows(arr, stride, width, height, rowBytes) {
  if (stride === rowBytes && arr.length === rowBytes * height) return arr;
  const out = Buffer.allocUnsafe(rowBytes * height);
  for (let y = 0; y < height; y++) {
    out.set(arr.subarray(y * stride, y * stride + rowBytes), y * rowBytes);
  }
  return out;
}

function toTensor(rgb, w, h) {
  const plane = w * h;
  const data = new Float32Array(3 * plane);
  for (let i = 0, j = 0; i < plane; i++, j += 3) {
    data[i] = rgb[j] / 255;
    data[plane + i] = rgb[j + 1] / 255;
    data[2 * plane + i] = rgb[j + 2] / 255;
  }
  return new ort.Tensor('float32', data, [1, 3, h, w]);
}

function fromTensor(tensor) {
  const [, , h, w] = tensor.dims;
  const src = tensor.data;
  const plane = w * h;
  const out = Buffer.allocUnsafe(plane * 3);
  for (let i = 0, j = 0; i < plane; i++, j += 3) {
    out[j] = clampByte(src[i]);
    out[j + 1] = clampByte(src[plane + i]);
    out[j + 2] = clampByte(src[2 * plane + i]);
  }
  return { data: out, width: w, height: h };
}

function clampByte(v) {
  const x = Math.round(v * 255);
  return x < 0 ? 0 : x > 255 ? 255 : x;
}

function resizeRaw(data, width, height, outW, outH) {
  return sharp(data, { raw: { width, height, channels: 3 } })
    .resize(outW, outH, { kernel: 'lanczos3', fit: 'fill' })
    .raw()
    .toBuffer();
}

/**
 * Upscale an 8-bit RGB image.
 *
 * @param {Uint8Array|Buffer|number[]} arr  RGB bytes, row by row.
 * @param {number} stride  Bytes per row: width * 3, plus 0-2 padding bytes
 *   (width is read as floor(stride / 3), so 3+ padding bytes would look like pixels).
 * @param {number} [upscale_factor=1.0]  Output largest side =
 *   min(round(input largest side * factor), 1000). 1.0 keeps the size but
 *   still runs the model (cleans compression artifacts, sharpens edges).
 * @returns {Promise<[Buffer, number]>}  [arr_out, stride_out], tightly packed RGB.
 */
async function upscale(arr, stride, upscale_factor = 1.0) {
  return run(arr, stride, upscale_factor);
}

// Internal entry point; the bench uses it to compare settings.
async function run(
  arr,
  stride,
  upscale_factor,
  { modelInputMax = DEFAULT_MODEL_INPUT_MAX, modelPath, lanczosMix = DEFAULT_LANCZOS_MIX } = {},
) {
  if (upscale_factor === undefined) upscale_factor = 1.0;
  if (Array.isArray(arr)) arr = Uint8Array.from(arr);
  if (!(arr instanceof Uint8Array)) throw new TypeError('arr must be a byte array');
  if (typeof upscale_factor !== 'number' || !Number.isFinite(upscale_factor) || upscale_factor <= 0) {
    throw new RangeError('upscale_factor must be a number > 0');
  }

  const { width, height, rowBytes } = readDims(arr, stride);
  const longest = Math.max(width, height);
  if (longest < MIN_INPUT || longest > MAX_INPUT) {
    throw new RangeError(`largest input side must be ${MIN_INPUT}-${MAX_INPUT}px, got ${longest}px`);
  }

  const target = Math.max(1, Math.min(Math.round(longest * upscale_factor), MAX_OUTPUT));
  const outW = Math.max(1, Math.round((width * target) / longest));
  const outH = Math.max(1, Math.round((height * target) / longest));

  let rgb = packRows(arr, stride, width, height, rowBytes);
  let w = width;
  let h = height;

  // Optionally shrink what the model sees, but never below what a 4x model
  // needs to reach the target size.
  const modelMax = Math.max(Math.ceil(target / MODEL_SCALE), Math.min(longest, modelInputMax));
  if (modelMax < longest) {
    w = Math.max(1, Math.round((width * modelMax) / longest));
    h = Math.max(1, Math.round((height * modelMax) / longest));
    rgb = await resizeRaw(rgb, width, height, w, h);
  }

  const session = await getSession(modelPath);
  const result = await serialize(() =>
    session.run({ [session.inputNames[0]]: toTensor(rgb, w, h) }),
  );
  const sr = fromTensor(result[session.outputNames[0]]);

  const out =
    sr.width === outW && sr.height === outH
      ? sr.data
      : await resizeRaw(sr.data, sr.width, sr.height, outW, outH);

  // Mix in a plain Lanczos upscale of the original. The model's output and
  // Lanczos agree on coarse shapes, so this only brings back fine real
  // texture (fabric weave, print) that the model smooths away.
  if (lanczosMix > 0) {
    const plain = await resizeRaw(packRows(arr, stride, width, height, rowBytes), width, height, outW, outH);
    const a = 1 - lanczosMix;
    for (let i = 0; i < out.length; i++) out[i] = Math.round(a * out[i] + lanczosMix * plain[i]);
  }

  return [out, outW * 3];
}

module.exports = { upscale };
module.exports.default = upscale;
module.exports._run = run;
