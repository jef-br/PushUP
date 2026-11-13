# PushUP

Async, in-memory image upscaler for e-commerce photos (on-model apparel,
lifestyle shots, packaged goods, appliances, sports gear). It runs
Real-ESRGAN-style models through ONNX Runtime. It runs on any CPU and uses a GPU
automatically when one is available. No Python at runtime.

## Install

```bash
npm install pushup
```

Requires Node.js >= 20.9 (a `sharp` requirement). Both ONNX models ship in the
package (~70 MB download, mostly the high-quality model). No Python or GPU is needed.

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

### Errors

`upscale` is async, so every error arrives as a rejected promise:

| Trigger | Rejects with |
|---|---|
| `arr` is not a byte array (`Uint8Array`, `Buffer`) or a plain `Array` (an `Array` is not checked: its values are converted to bytes as by `Uint8Array.from`) | `TypeError` |
| `upscale_factor` is not a finite number > 0 | `RangeError` |
| `stride` is not an integer >= 3 | `TypeError` |
| `arr` is shorter than one row (`width * 3` bytes) | `RangeError` |
| Largest side outside 400-800 px | `RangeError` |
| `PUSHUP_QUALITY` or `PUSHUP_DEVICE` is not one of its allowed values | `RangeError` |

Checks run in that order, so only the first problem is reported.

## Quality modes and GPU

Two modes, picked automatically; the function signature never changes.

| Mode | Model | 4-core CPU (400 / 800 px input) | Used when |
|---|---|---|---|
| `fast` | 4xLSDIRCompactC3 (2.5 MB) | ~0.5 s / ~2 s | No GPU (default on CPU) |
| `high` | 4x_foolhardy_Remacri (67 MB) | ~15 s / ~60 s | A GPU is available |

`high` keeps the most fabric texture and the roundest buttons. On the 20-image subset
(PSNR / SSIM / GMSD, lower GMSD is better): 400 px 31.12 / 0.899 / 0.102 vs fast
31.51 / 0.894 / 0.108; 800 px 36.32 / 0.960 / 0.039 vs fast 36.28 / 0.954 / 0.049.

GPU support (whatever onnxruntime-node ships for the platform):

| Platform | GPU provider | Needs |
|---|---|---|
| Windows x64/arm64 | DirectML | Any DirectX 12 GPU (NVIDIA, AMD, Intel) |
| Linux x64 | CUDA | NVIDIA GPU + CUDA 13 runtime libraries (cuBLAS, cuDNN) |
| macOS arm64 | CoreML | Apple silicon |

If the GPU can't load the model, or fails while running, PushUP falls back to the CPU
(and to `fast` mode in auto) and keeps going. It never fails just because there is no
GPU. GPU speeds were not measured (no GPU in the test environment).

On Linux without CUDA, the first call logs one red onnxruntime error ("Failed to load
library ... libonnxruntime_providers_cuda.so"). It is harmless: PushUP catches it and uses
the CPU (the attempt costs ~nothing and happens once per process). Set
`PUSHUP_DEVICE=cpu` on CPU-only servers to skip the attempt and the message.

Override with environment variables, read on every call:

| Variable | Values | Default |
|---|---|---|
| `PUSHUP_QUALITY` | `auto` (high on GPU, fast on CPU), `fast`, `high` | `auto` |
| `PUSHUP_DEVICE` | `auto`, `cpu`, `gpu` (falls back to CPU with a warning) | `auto` |

Any other value throws a `RangeError`. `PUSHUP_QUALITY=high` works on CPU, just slowly.

Licenses: `fast` is CC BY 4.0. `high` (Remacri) is **CC BY-NC-SA 4.0, non-commercial
only**; see `models/LICENSES.md`.

## How it works

1. The model upscales the image 4x. In `fast` mode,
   [4xLSDIRCompactC3](https://openmodeldb.info/models/4x-LSDIRCompactC3)
   (2.5 MB ONNX) does the whole image in one pass, so there are no tile seams.
   In `high` mode, Remacri runs in 192 px tiles with 16 px of overlap to keep
   memory down (about 0.9 GB at a 400 px input; 800 px is not measured, see
   [docs/PERF.md](docs/PERF.md#memory-m1-2026-11-12)). It's a community model by
   Philip Hofmann (helaman), trained on real photos with JPEG damage. License:
   CC BY-NC-SA 4.0, non-commercial only (see `models/LICENSES.md`).
2. sharp's Lanczos resize takes that down to the target size.
3. 20% of a plain Lanczos upscale is mixed in (`DEFAULT_LANCZOS_MIX` in
   `src/index.js`). Both images agree on the coarse shapes, so the mix only
   brings back some real fine texture that the model smooths away. It takes
   a few ms.

### Model choice

Compared on the same 20 e-commerce photos (13 Amazon, 7 Lamoda; protocol
below), 4-core CPU:

| Model (design, license) | 400 px: PSNR / GMSD / time | 600 px: PSNR / GMSD / time |
|---|---|---|
| realesr-general-wdn-x4v3 + 20% (previous default) | 30.96 / 0.114 / 1.0 s | 32.96 / 0.085 / 2.2 s |
| **4xLSDIRCompactC3 + 20% (default)** | **31.51 / 0.108 / 0.55 s** | **34.05 / 0.075 / 1.3 s** |
| 4x_foolhardy_Remacri (ESRGAN, CC BY-NC-SA 4.0) | 31.12 / 0.102 / 16 s | 33.47 / 0.070 / 36 s |

At 800 px, LSDIRCompactC3 + 20% scores PSNR 36.28 and GMSD 0.049 in 2.3 s;
the previous default scored 35.13 and 0.059 in 3.9 s.

The large ESRGAN community models (Remacri, NMKD-Siax, 4x-UltraSharp) keep
the most fabric texture, but on CPU they are 15-30x slower and need tiled
inference to fit in memory. The stock Real-ESRGAN general model erased small
details such as shirt buttons, which is why it was replaced.

### Where the model files come from

Community models are published as PyTorch weights. `tools/` converts them
to ONNX without PyTorch:

- `tools/build_compact_onnx.py`: compact models (realesr-general-x4v3,
  LSDIRCompact, Rybu).
- `tools/build_rrdb_onnx.py`: ESRGAN models (Remacri, UltraSharp, Siax,
  RealESRGAN_x4plus).
- `tools/pth_weights.py`: reads `.pth` (zip and legacy formats) and
  `.safetensors`. Its restricted unpickler only rebuilds tensors and
  refuses to run any other code in the file.

Both builders were checked against reference ONNX exports of the official
Real-ESRGAN models: max difference 0.0 (compact) and 3e-7 (ESRGAN).

```bash
python tools/build_compact_onnx.py 4xLSDIRCompactC3.pth models/4xLSDIRCompactC3.onnx
```

Download sources and SHA-256 hashes are listed in
[OpenModelDB](https://openmodeldb.info/models/4x-LSDIRCompactC3). The
`4xLSDIRCompactC3.pth` used here has SHA-256 `a330cac38d95...` and comes
from [Phhofm/models](https://github.com/Phhofm/models).

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

The usual route, as the overnight runs do it: `bench/fetch_testset.sh` downloads the source
parquet files from Hugging Face and builds `bench/out/set` (60 images) and `bench/out/sub20`
(20 images, the quality-gate subset). To check that a change doesn't lower quality, score
`sub20` before and after it and compare the two runs:

```bash
bash bench/fetch_testset.sh
PUSHUP_QUALITY=fast PUSHUP_DEVICE=cpu node bench/bench.js bench/out/sub20 --sizes 400,800 --methods lanczos,sr-full --json > before.json
# ...make the change...
PUSHUP_QUALITY=fast PUSHUP_DEVICE=cpu node bench/bench.js bench/out/sub20 --sizes 400,800 --methods lanczos,sr-full --json > after.json
node bench/gate.js before.json after.json   # GATE: PASS / FAIL (exit 0 / 1)
```

The gate is defined for CPU and the `fast` mode, hence the two variables (on a GPU machine
`auto` would score `high`). `--json` prints the scores as one JSON object instead of the
table; `--by-source` adds rows per image source (`abo`, `lamoda`), so you can see whether an
average hides a regression in one of them, and `--by-aspect` adds rows for `portrait`,
`landscape` and `square` images. `bench/gate.js` applies the limits from
`docs/OVERNIGHT_RUN.md` §2 (PSNR may drop at most 0.02 dB, SSIM 0.001, GMSD may rise 0.001)
to every size; it checks the overall rows only, not the per-source or per-aspect ones.

Current default, `fast` mode (4xLSDIRCompactC3 + 20% Lanczos), CPU, 60 images, measured
2026-11-11 with
`PUSHUP_QUALITY=fast PUSHUP_DEVICE=cpu node bench/bench.js bench/out/set --methods lanczos,sr-full`
on a 4-core CPU (higher PSNR/SSIM is better, lower GMSD is better):

| Input | Method | PSNR | SSIM | GMSD | Time |
|---|---|---|---|---|---|
| 400 px | Lanczos | 28.71 | 0.883 | 0.132 | 0.02 s |
| | **4xLSDIRCompactC3 + 20% Lanczos (default)** | **31.02** | **0.901** | **0.111** | **0.42 s** |
| 600 px | Lanczos | 30.30 | 0.917 | 0.098 | 0.02 s |
| | **4xLSDIRCompactC3 + 20% Lanczos (default)** | **33.41** | **0.936** | **0.076** | **0.90 s** |
| 800 px | Lanczos | 30.38 | 0.929 | 0.090 | 0.02 s |
| | **4xLSDIRCompactC3 + 20% Lanczos (default)** | **36.53** | **0.962** | **0.046** | **1.6 s** |

The "Model choice" figures above come from the 20-image subset, so they differ from these
60-image ones; both measure the same model, and this 2026-11-11 run is the newer measurement
(the "Model choice" table was added to this README on 2026-11-06). Times also vary between
sessions and machine load, so compare times only within one table. The Lanczos quality
metrics here match the earlier 60-image run exactly, so the set and protocol are unchanged.

Earlier results on a 4-core CPU for the realesr-general models (60 images). Higher PSNR/SSIM is better;
lower GMSD is better (GMSD compares edges, which tracks perceived
sharpness).

| Input | Method | PSNR | SSIM | GMSD | Time |
|---|---|---|---|---|---|
| 400 px | Lanczos | 28.71 | 0.883 | 0.132 | 0.03 s |
| | stock x4v3 | 28.57 | 0.892 | 0.132 | 0.9 s |
| | wdn-x4v3 | 29.92 | 0.892 | 0.119 | 1.0 s |
| | wdn-x4v3 + 20% Lanczos (previous default) | 30.61 | 0.897 | 0.117 | 1.0 s |
| 600 px | Lanczos | 30.30 | 0.917 | 0.098 | 0.03 s |
| | stock x4v3 | 29.96 | 0.920 | 0.105 | 2.2 s |
| | wdn-x4v3 | 31.61 | 0.922 | 0.093 | 2.2 s |
| | wdn-x4v3 + 20% Lanczos (previous default) | 32.64 | 0.928 | 0.086 | 2.2 s |
| 800 px | Lanczos | 30.38 | 0.929 | 0.090 | 0.03 s |
| | stock x4v3 | 32.38 | 0.947 | 0.074 | 3.9 s |
| | wdn-x4v3 | 34.68 | 0.953 | 0.060 | 4.0 s |
| | wdn-x4v3 + 20% Lanczos (previous default) | 35.87 | 0.957 | 0.054 | 3.9 s |

Feeding the model a shrunken input to save time made results worse in every
case, so the model always gets the full-size input.

## Known limits / next steps

- **Speed:** time grows with the number of input pixels. `fast` mode on CPU takes
  about 0.44 s for a 400×300 image and 1.85 s for 800×600 (median, 4 vCPU cloud
  container; [docs/PERF.md](docs/PERF.md#results-median-ms)). `high` mode on CPU is
  about 30x slower.
- **Memory:** one `fast` call peaks at about 0.2 GB (400 px) to 0.57 GB (800 px); `high`
  at 400 px about 0.9 GB ([docs/PERF.md](docs/PERF.md#memory-m1-2026-11-12)).
- **Fine texture** (fabric weave, suede grain) that isn't present in a small input
  can't be restored faithfully. A model can only invent it. Compared with Claid.ai's
  own published sample, PushUP is clean and faithful but behind on perceived texture
  ([docs/SAAS.md](docs/SAAS.md)). None of the community models and the one diffusion
  model we tried closes the gap; a candidate for the GPU `high` mode is waiting for an
  owner decision ([docs/TEXTURE.md](docs/TEXTURE.md)).
- **Text on packaging** (ingredient lists, labels) is handled by the general model;
  there is no text-specific path. Whether one is needed has not been measured yet: the
  planned OCR test found too few text lines in the benchmark set (7 usable crops,
  15 needed) and is waiting on a decision about the test data. A text detector plus a
  text-specific upscaler is a possible next step.
- **Other vendors:** only Claid.ai has been compared, using the vendor's own published
  before/after images. Comparing more vendors needs their sites added to the network
  allowlist. The bench can score any output folder.

## Development

```bash
npm install                           # if the CUDA download fails: npm install --onnxruntime-node-install-cuda=skip
npm test                              # unit + contract tests (node --test)
bash scripts/pack-smoke.sh            # pack the package, install it in a temp dir, run one upscale there
node bench/profile.js                 # per-stage latency of the fast pipeline (synthetic images)
node bench/cold.js --modes fast       # first-call vs warm latency, each in a fresh process
node bench/threads.js                 # inference time vs ONNX Runtime thread count
```

- `npm install --onnxruntime-node-install-cuda=skip` skips the CUDA libraries download
  (Linux x64 only; Windows and macOS don't download them). Use it where that download is
  blocked or not wanted; PushUP then runs on the CPU there (see "Quality modes and GPU").
- `bench/cold.js` measures `high` mode too unless given the modes option shown above (`high`
  takes minutes on a CPU).
- `scripts/pack-smoke.sh` is what CI's `pack-smoke` job runs; pass extra `npm install`
  arguments in `PUSHUP_SMOKE_NPM_ARGS` (e.g. the CUDA skip flag above).
- The latency scripts, their options and results are in [docs/PERF.md](docs/PERF.md).
  Quality benchmarking is described under "Benchmark" above.
