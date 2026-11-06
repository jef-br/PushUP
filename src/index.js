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
const DEFAULT_LANCZOS_MIX = 0.2;

// Tile size (input px) and context padding for inference. The small default
// model fits in memory whole; large RRDBNet models need tiles.
const DEFAULT_TILE = Infinity;
const DEFAULT_TILE_PAD = 16;

const MODEL_PATH = path.join(__dirname, '..', 'models', '4xLSDIRCompactC3.onnx');

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

// Region (x0, y0, cw, ch) of a packed RGB image -> NCHW float tensor in [0, 1].
function toTensor(rgb, w, x0, y0, cw, ch) {
  const plane = cw * ch;
  const data = new Float32Array(3 * plane);
  for (let y = 0, i = 0; y < ch; y++) {
    for (let x = 0, j = ((y0 + y) * w + x0) * 3; x < cw; x++, i++, j += 3) {
      data[i] = rgb[j] / 255;
      data[plane + i] = rgb[j + 1] / 255;
      data[2 * plane + i] = rgb[j + 2] / 255;
    }
  }
  return new ort.Tensor('float32', data, [1, 3, ch, cw]);
}

// Copy region (sx, sy, cw, ch) of an NCHW output tensor into a packed RGB
// buffer of width outW at (dx, dy).
function copyFromTensor(tensor, sx, sy, cw, ch, out, outW, dx, dy) {
  const [, , th, tw] = tensor.dims;
  const src = tensor.data;
  const plane = tw * th;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = (sy + y) * tw + sx + x;
      const j = ((dy + y) * outW + dx + x) * 3;
      out[j] = clampByte(src[i]);
      out[j + 1] = clampByte(src[plane + i]);
      out[j + 2] = clampByte(src[2 * plane + i]);
    }
  }
}

// Run the model over the image in tiles of `tile` px (plus `pad` px of
// context on each side, which is cut away again). Big models need this to
// keep memory bounded; tile = Infinity runs the whole image in one pass.
async function infer(session, rgb, w, h, tile, pad) {
  const inName = session.inputNames[0];
  const outName = session.outputNames[0];
  const step = Math.min(tile, Math.max(w, h));
  let out = null;
  let scale = 0;
  for (let ty = 0; ty < h; ty += step) {
    for (let tx = 0; tx < w; tx += step) {
      const x1 = Math.min(tx + step, w);
      const y1 = Math.min(ty + step, h);
      const px0 = Math.max(tx - pad, 0);
      const py0 = Math.max(ty - pad, 0);
      const px1 = Math.min(x1 + pad, w);
      const py1 = Math.min(y1 + pad, h);
      const result = await session.run({ [inName]: toTensor(rgb, w, px0, py0, px1 - px0, py1 - py0) });
      const t = result[outName];
      if (!out) {
        scale = t.dims[3] / (px1 - px0);
        out = Buffer.allocUnsafe(w * scale * h * scale * 3);
      }
      copyFromTensor(t, (tx - px0) * scale, (ty - py0) * scale, (x1 - tx) * scale, (y1 - ty) * scale,
        out, w * scale, tx * scale, ty * scale);
    }
  }
  return { data: out, width: w * scale, height: h * scale };
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
  {
    modelInputMax = DEFAULT_MODEL_INPUT_MAX,
    modelPath,
    lanczosMix = DEFAULT_LANCZOS_MIX,
    tile = DEFAULT_TILE,
    tilePad = DEFAULT_TILE_PAD,
  } = {},
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
  const sr = await serialize(() => infer(session, rgb, w, h, tile, tilePad));

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
