# CLAUDE.md — PushUP

Guidance for any Claude session working in this repo. Read this first, every session.

## What PushUP is

An async, in-memory **image upscaler for e-commerce photos**, published as a Node.js
package. It runs **Real-ESRGAN through ONNX Runtime** — no Python and no GPU at runtime.

Public API (CommonJS):

```js
const { upscale } = require('pushup');
// arr: 8-bit RGB bytes, row by row. stride: bytes per row (width * 3).
const [arr_out, stride_out] = await upscale(arr, stride, 1.5);
```

**Contract** (keep this exact — tests and README depend on it):

| Rule | Value |
| --- | --- |
| Input | 8-bit RGB. Largest side 400–800 px, else `RangeError`. |
| `stride` | Bytes per row = `width * 3` (+0–2 padding). Width = `floor(stride / 3)`. |
| `upscale_factor` | Default `1.0`. Output largest side = `min(round(input_largest * factor), 1000)`. |
| Output | `[arr_out, stride_out]`, tightly packed RGB, `stride_out = out_width * 3`. |

Calls are async and run off the main thread, one at a time (each uses all CPU cores).

## Stack

- Node.js, **CommonJS** (`require`), plain `.js` (no TypeScript).
- Inference: `onnxruntime-node`. Resize: `sharp` (Lanczos down from the 4× model output).
- Tests: Node's built-in runner (`node:test` / `node --test`). Package manager: npm.
- Build/bench tooling in `tools/` and `bench/` uses **Python** — build-time only, never a
  runtime dependency.

## Commands

```bash
npm install
npm test
node bench/bench.js bench/out/set --methods lanczos,sr-full
python bench/build_testset.py abo.parquet lamoda.parquet bench/out/set
```

## Model

- Ships `models/realesr-general-wdn-x4v3.onnx` (~4.9 MB), the weak-denoise Real-ESRGAN
  variant at denoise strength 0 (chosen because stock x4v3 erased small detail like shirt
  buttons). At runtime only this ONNX file is used.
- Rebuilding the model (rare) needs Hugging Face (`tamnvcc/Real-ESRGAN-General-x4v3_float`)
  and the `.pth` weights from the Real-ESRGAN v0.2.5.0 GitHub release, then
  `tools/make_dynamic.py` → `tools/blend_denoise.py`. See `docs/DECISIONS.md`.

## Pipeline

1. Real-ESRGAN upscales the whole image 4× in one pass (no tile seams).
2. `sharp` Lanczos-resizes down to target size.
3. Optional: mix in a share of plain Lanczos (`DEFAULT_LANCZOS_MIX` in `src/index.js`).

Feeding the model a shrunken input always made results worse, so it gets the full input.

## How this project runs itself

This repo is built partly by **unattended overnight sessions**. The system that makes that
safe lives in three files — treat them as the source of truth:

- `docs/OVERNIGHT_RUN.md` — the operating playbook every autonomous run follows.
- `TASKS.md` — the backlog and task conventions. Pick work from here.
- `PROGRESS.md` — the run log / hand-off note. Append to it every run.

Decisions and their rationale go in `docs/DECISIONS.md`. Reusable helpers (benchmark
runner, model builder, reviewer) are defined as subagents in `.claude/agents/`.

### Working agreement (all sessions, human or scheduled)

- Small, verified increments. Finish one task fully — code **and** tests — before the next.
- `npm test` must pass before you commit. Run the benchmark when a change can affect output
  quality, and record the numbers.
- Never skip, disable, or weaken a test to go green.
- Commit with a clear message, update `PROGRESS.md` and `TASKS.md`, then push.
- Don't guess on ambiguity or a blocked dependency — record the blocker in `PROGRESS.md`
  and stop.
