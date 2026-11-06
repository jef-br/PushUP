# PushUP

Async, in-memory image upscaler for e-commerce photos (on-model apparel,
lifestyle shots, packaged goods, appliances, sports gear). It runs
Real-ESRGAN through ONNX Runtime and needs no Python or GPU at runtime.

## Usage

```js
const { upscale } = require('pushup');

// arr: 8-bit RGB bytes, row by row. stride: bytes per row (width * 3).
const [arr_out, stride_out] = await upscale(arr, stride, 1.5);
```

| Rule | Value |
|---|---|
| Input | 8-bit RGB. Largest side must be 400-800 px, otherwise `RangeError`. |
| `stride` | Bytes per row: `width * 3`, plus 0-2 padding bytes. Width is read as `floor(stride / 3)`. |
| `upscale_factor` | Default `1.0`. Output largest side = `min(round(input largest side * factor), 1000)`. |
| Output | `[arr_out, stride_out]`: tightly packed RGB, `stride_out = out_width * 3`. |

Examples: 800 px at 1.5 gives 1000 px (1200, capped); 400 px at 2.5 gives
1000 px; 400 px at 1.5 gives 600 px. With 1.0 the size stays the same, but the
model still runs, so JPEG blocks are removed and edges get sharper.

Calls are async; the model runs off the main thread. Calls run one at a
time, because each one already uses every CPU core.

## How it works

1. Real-ESRGAN `realesr-general-wdn-x4v3` (4.9 MB ONNX) upscales the whole
   image 4x in one pass, so there are no tile seams.
2. sharp's Lanczos resize takes that down to the target size.
3. 20% of a plain Lanczos upscale is mixed in (`DEFAULT_LANCZOS_MIX` in
   `src/index.js`). Both images agree on the coarse shapes, so the mix only
   brings back some real fine texture that the model smooths away. It takes
   a few ms.

### Why the weak-denoise model

The stock `realesr-general-x4v3` removes noise aggressively. On product
photos it erased small details: shirt buttons disappeared and fabric looked
painted. Real-ESRGAN also publishes a weak-denoise version of the same
network, meant for exactly this. We use it at 100% (Real-ESRGAN's "denoise
strength 0"). It costs nothing extra in speed.

### Where the model file comes from

Hugging Face has no ONNX export of the weak-denoise weights, so the shipped
ONNX file is built from official files without PyTorch:

1. Download the stock ONNX graph from Hugging Face
   (`tamnvcc/Real-ESRGAN-General-x4v3_float`).
2. Make its height and width accept any size. Only the size settings
   change: `python tools/make_dynamic.py model.onnx base.onnx`.
3. Get the official `realesr-general-x4v3.pth` and
   `realesr-general-wdn-x4v3.pth` from the
   [Real-ESRGAN releases](https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0).
4. Run `python tools/blend_denoise.py base.onnx realesr-general-x4v3.pth realesr-general-wdn-x4v3.pth 0 models/realesr-general-wdn-x4v3.onnx`.
   The tool first checks that every weight in `base.onnx` equals the stock
   checkpoint, then writes the blended weights. The `.pth` files are read
   with a restricted unpickler (`tools/pth_weights.py`), which only rebuilds
   tensors and refuses to run any other code in the file.

At runtime only the ONNX file is used.

## Benchmark

Test set: 60 real e-commerce photos, built by `bench/build_testset.py`.
40 come from [Amazon Berkeley Objects](https://huggingface.co/datasets/huggingface/amazon-berkeley-objects)
(Amazon catalog photos, CC BY 4.0) and 20 from
[Lamoda](https://huggingface.co/datasets/PestoRosso/lamoda-fashion-product-images)
(on-model fashion). Each photo is resized to 1000 px and used as the
reference. That reference is shrunk to 400/600/800 px and saved as JPEG
quality 85, the way a typical marketplace upload looks. Each method then
upscales it back to 1000 px, and the result is scored against the
reference.

COCO doesn't work for this: its images are at most 640 px, so there is no
1000 px reference to score against.

```bash
python bench/build_testset.py abo.parquet lamoda.parquet bench/out/set
node bench/bench.js bench/out/set --methods lanczos,sr-full
```

Results on a 4-core CPU. Higher PSNR/SSIM is better;
lower GMSD is better (GMSD compares edges, which tracks perceived
sharpness).

| Input | Method | PSNR | SSIM | GMSD | Time |
|---|---|---|---|---|---|
| 400 px | Lanczos | 28.71 | 0.883 | 0.132 | 0.03 s |
| | stock x4v3 | 28.57 | 0.892 | 0.132 | 0.9 s |
| | wdn-x4v3 | 29.92 | 0.892 | 0.119 | 1.0 s |
| | **wdn-x4v3 + 20% Lanczos (shipped)** | **30.61** | **0.897** | **0.117** | 1.0 s |
| 600 px | Lanczos | 30.30 | 0.917 | 0.098 | 0.03 s |
| | stock x4v3 | 29.96 | 0.920 | 0.105 | 2.2 s |
| | wdn-x4v3 | 31.61 | 0.922 | 0.093 | 2.2 s |
| | **wdn-x4v3 + 20% Lanczos (shipped)** | **32.64** | **0.928** | **0.086** | 2.2 s |
| 800 px | Lanczos | 30.38 | 0.929 | 0.090 | 0.03 s |
| | stock x4v3 | 32.38 | 0.947 | 0.074 | 3.9 s |
| | wdn-x4v3 | 34.68 | 0.953 | 0.060 | 4.0 s |
| | **wdn-x4v3 + 20% Lanczos (shipped)** | **35.87** | **0.957** | **0.054** | 3.9 s |

Feeding the model a shrunken input to save time made results worse in every
case, so the model always gets the full-size input.

## Known limits / next steps

- **Speed:** time grows with the number of input pixels (~1 s at 400 px,
  ~4 s at 800 px on 4 cores).
- **Fine texture** (fabric weave) that isn't present in a small input
  can't be restored faithfully. A model can only invent it.
- **Text on packaging** (ingredient lists, labels) is handled by the
  general model. A separate text detector plus a text-specific upscaler is
  a possible next step.
- **SaaS comparison** (e.g. Claid.ai) needs an account and API access. The
  bench can score any output folder once results are available.

## Development

```bash
npm install
npm test
```
