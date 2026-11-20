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

Calls are async (`upscale` returns a promise) and run one at a time, because each one
already uses every CPU core. They do **not** leave the Node.js event loop free: while the model
runs, timers and I/O in the same process are delayed for about the length of the call. In `fast`
mode on a 4 vCPU machine that is about 0.4 s for a 400×300 image and 1.8 s for 800×600. The block
is inside ONNX Runtime ([docs/PERF.md](docs/PERF.md#event-loop-el1-2026-11-15)). Calling
`upscale` from a worker thread keeps the main loop free in `fast` mode: in a test it stayed responsive (longest gap
6–7 ms), with no measurable change in call time at 400×300 and about 30–50 ms (2–3%) more at 800×600, tens of ms up to
about 200 ms more on the first call, and about 40 MB more memory at 800×600 (not resolved at 400×300;
[docs/PERF.md](docs/PERF.md#worker-el2-2026-11-15)). A worker with `high` mode and a separate process were not tested.
`high` mode blocks the loop too: a 400×300 image takes about 12 s on this machine, with timers delayed up to
3.8 s at a time ([docs/PERF.md](docs/PERF.md#high-mode-el3-2026-11-15)). A GPU was not measured.

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
library ... libonnxruntime_providers_shared.so"). It is harmless: PushUP catches it and uses
the CPU (the attempt costs ~nothing and happens once per process). Set
`PUSHUP_DEVICE=cpu` on CPU-only servers to skip the attempt and the message.

Override with environment variables, read on every call:

| Variable | Values | Default | Read by |
|---|---|---|---|
| `PUSHUP_QUALITY` | `auto` (high on GPU, fast on CPU), `fast`, `high` | `auto` | `src/index.js` (every call); the `bench/` scripts only set them for the model they start |
| `PUSHUP_DEVICE` | `auto`, `cpu`, `gpu` (falls back to CPU with a warning) | `auto` | `src/index.js` (every call); the `bench/` scripts only set them for the model they start |
| `PUSHUP_SMOKE_NPM_ARGS` | extra arguments for the `npm install` of the tarball, e.g. `--onnxruntime-node-install-cuda=skip` | none | `scripts/pack-smoke.sh` and the CI `pack-smoke` job (not used at runtime) |
| `P4_THREADS`, `P4_SIZE`, `P5_CHILD_INDEX` | internal | none | `bench/throughput.js`, which sets them for its own child processes; not for users |
| `P5_FAIL_CHILD` | `load` or `run` (test hook) | none | `bench/throughput.js`: makes child 0 crash before the session is created (`load`) or after the warm-up (`run`); for testing the script only |

For `PUSHUP_QUALITY` and `PUSHUP_DEVICE`, any other value throws a `RangeError`.
`PUSHUP_QUALITY=high` works on CPU, just slowly. The other variables do not affect `upscale`.

Licenses: `fast` is CC BY 4.0. `high` (Remacri) is **CC BY-NC-SA 4.0, non-commercial
only**; see `models/LICENSES.md`.

## How it works

1. The model upscales the image 4x. In `fast` mode,
   [4xLSDIRCompactC3](https://openmodeldb.info/models/4x-LSDIRCompactC3)
   (2.5 MB ONNX) does the whole image in one pass, so there are no tile seams.
   In `high` mode, Remacri runs in 192 px tiles with 16 px of overlap to keep
   memory down (about 0.9 GB at a 400 px input and 1.5 GB at 800 px, see
   [docs/PERF.md](docs/PERF.md#memory-m1-2026-11-12)). It's a community model by
   foolhardy, trained on real photos with JPEG damage. License:
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
(20 images, the quality-gate subset). It installs `pyarrow` and `pillow` with `python3 -m pip`, or into a virtual environment under `bench/out/venv` if a global install is refused. To check that a change doesn't lower quality, score
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
  about 0.9 GB (400 px) to 1.5 GB (800 px) ([docs/PERF.md](docs/PERF.md#memory-m1-2026-11-12)).
  A process does not give memory back between calls (a second `high` call creeps up a little
  more). `high` grows with input size mainly (not only) because of the ONNX Runtime memory
  arena; the image arrays explain only a few percent of it (details: [docs/PERF.md](docs/PERF.md#high-memory-breakdown-m4-2026-11-13));
  budget about 1.5 GB per `high` process at 800 px.
  A `fast` process that has made two or more calls settles at about 0.37–0.39 GB (400 px),
  0.61 GB (600 px) and 0.93 GB (800 px, about 1 GB peak), and stays flat afterwards (no creep
  over 30 calls at 600 and 800 px, 100 calls at 400 px). The step above the first-call
  figure comes from the ONNX Runtime memory arena: with the arena switched off in a test run it
  disappears at 800 px (about 0.26 GB settled instead of 0.93 GB) and at 600 px (about 0.19 GB
  instead of 0.61 GB), and shrinks but does not disappear at 400 px (the settled value varied
  between 0.20 and 0.39 GB over four runs); calls were about 1.2–1.6× (400 px), 1.9× (600 px)
  and 1.65× (800 px) slower (sizes measured on 4:3 images 400×300, 600×450 and 800×600; tables and the arena-off runs:
  [docs/PERF.md](docs/PERF.md#does-fast-mode-creep-over-repeated-calls-m5-2026-11-14)).
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
- **Hard edges** (garment edge, thin line, small dark shape): on synthetic edges `fast` overshoots
  more than plain Lanczos in every case, by 2 to 18 bytes on a 175-byte contrast (worst: a 1 px
  dark line at factor 2.5, 31 bytes below the dark level where Lanczos has none), but its edges
  are sharper (a step edge 0.97 to 0.99 px wide against 1.44 to 1.81). `high` is not better than
  `fast` here: about the same on a step edge and a small disc, worse on the 1 px line, with the sharpest
  edges ([docs/EDGES.md](docs/EDGES.md)). A check on 20 real photos found almost no overshoot on or beside the strongest edges (at most 9 levels for `fast`, 12 for Lanczos, in under 1 % of the samples), but its positive control (a degraded ideal step) read only 2 levels, so the check is inconclusive and does not show that halos are absent ([docs/EDGES.md](docs/EDGES.md#real-photos-cv2)); thin real features were not measured.
- **Flat saturated colours** move through the model: the largest single-channel shift of the
  shipped `fast` pipeline on 27 uniform test colours is 29 bytes (the blue channel of magenta,
  255,0,255), 26 on saturated green. The model causes it (plain Lanczos returns every colour
  exactly; the 20 % mix only scales it by about 0.8). Most of it is a band within about 8 px of the
  image border (model alone, more than 16 px from the border: magenta 6 bytes); saturated green also shifts by
  10 to 14 bytes in the interior ([docs/COLOR.md](docs/COLOR.md)). On 20 real photos the shipped `fast` pipeline has a mean bias of about −1 byte in red and green
  (Lanczos −0.1), none in blue, and about the same mean error as Lanczos (lower in blue) ([docs/COLOR.md](docs/COLOR.md#real-photos-bl13)); one input size, 20 images.
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
node bench/throughput.js              # model calls per second: one N-thread process vs several smaller ones
node bench/memory.js                  # peak memory (RSS) of one call, each size in a fresh process
node bench/memory-breakdown.js        # where `high` mode's extra memory comes from (add --arena for the arena test)
node bench/arena.js                   # latency, memory and output bytes with the ONNX Runtime CPU arena on vs off
node bench/memory-creep.js            # does memory keep growing over repeated `fast` calls? (30 calls, one process)
node bench/edges.js                   # overshoot and edge width on synthetic hard edges, `fast` vs plain Lanczos (--quality high: Remacri)
node bench/colors.js                  # how far flat colours move through `fast` (27 colours; model vs mix; border vs interior)
node bench/colors-real.js              # colour bias of `fast` vs plain Lanczos on real photos (needs bench/out/sub20; results: docs/COLOR.md "Real photos (BL13)")
node bench/pad.js                     # does mirror-padding the model input help at the image border? (needs bench/out/sub20)
node bench/edges-real.js              # overshoot of `fast` vs plain Lanczos at the strongest edges of real photos (needs bench/out/sub20; results: docs/EDGES.md "Real photos (CV2)")
node bench/eventloop.js               # is the event loop blocked during a call? (timer probe around `upscale` and a bare `session.run`; results: docs/PERF.md "Event loop")
node bench/worker.js                  # cost of running `upscale` in a worker_threads worker: latency, cold start, memory, event loop (results: docs/PERF.md "Worker")
```

- `PUSHUP_SLOW_TESTS=1 npm test` also runs the tests that are skipped by default because they are slow on a CPU (today: the `high` case of `bench/arena.js`, about 50 s, `bench/memory-breakdown.js`, about 15 s, and `bench/colors.js`, about 25 s). Only the value `1` turns it on.
- `npm install --onnxruntime-node-install-cuda=skip` skips the CUDA libraries download
  (Linux x64 only; Windows and macOS don't download them). Use it where that download is
  blocked or not wanted; PushUP then runs on the CPU there (see "Quality modes and GPU").
- `bench/cold.js` measures `high` mode too unless given the modes option shown above (`high`
  takes minutes on a CPU).
- `scripts/pack-smoke.sh` is what CI's `pack-smoke` job runs; pass extra `npm install`
  arguments in `PUSHUP_SMOKE_NPM_ARGS` (e.g. the CUDA skip flag above).
- The results of the throughput, memory and arena scripts are in [docs/PERF.md](docs/PERF.md#throughput-p4-2026-11-11)
  ("Throughput"), [Memory](docs/PERF.md#memory-m1-2026-11-12) (with the
  [`high` breakdown](docs/PERF.md#high-memory-breakdown-m4-2026-11-13)) and
  [Arena](docs/PERF.md#arena-p6-2026-11-13).
- The edge script's results are in [docs/EDGES.md](docs/EDGES.md), the colour script's in [docs/COLOR.md](docs/COLOR.md), the padding experiment's in [docs/PAD.md](docs/PAD.md).
- The latency scripts, their options and results are in [docs/PERF.md](docs/PERF.md).
  Quality benchmarking is described under "Benchmark" above.
- Every `bench/` script that takes flags (`bench/colors.js` takes none, `bench/gate.js` and `bench/saas/` take file
  names) checks them before it loads a model: a malformed or out-of-range number or list, an unknown or misspelled
  flag, or the `--flag=value` form ends in one line on stderr that names the problem, with exit 1 (the usage error of
  `bench/bench.js` and of `bench/gate.js` exits 2). The names given to `bench/bench.js --methods` are checked too
  (`lanczos`, `sr-full`, `sr-<max input px>`, `sr:<model path>`, each with optional `#<tile>` and `@<mix 0-1>`): a typo such as
  `sr-ful` ends in one line, exit 1, instead of a row of meaningless numbers. The checks are kept true by `test/flags.test.js` and the
  `test/*-args.test.js` files (`bench-args`, `memory-args`, `throughput-breakdown-args`, `arena-cold-args`,
  `threads-profile-args`, `eventloop-args`, `worker-args`, `memory-creep-args`, `edges-args`, `pad-args`).
