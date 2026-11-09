# CLAUDE.md — PushUP

Guidance for any Claude session working in this repo. Read this first, every session.

## What PushUP is

An async, in-memory **image upscaler for e-commerce photos**, published as a Node.js
package. It runs super-resolution models through **ONNX Runtime** — no Python at runtime.
**Every path must run on CPU only; a GPU is used automatically when present** (owner rule).

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
bash bench/fetch_testset.sh            # builds bench/out/set (60) + bench/out/sub20 (20)
node bench/profile.js                  # per-stage latency
```

## Model

- Two modes (`MODES` in `src/index.js`), chosen per call from `PUSHUP_QUALITY`
  (`auto|fast|high`) and `PUSHUP_DEVICE` (`auto|cpu|gpu`):
  - `fast`: `models/4xLSDIRCompactC3.onnx` (~2.5 MB, CC BY 4.0), whole image, 20% Lanczos mix.
  - `high`: `models/4x_foolhardy_Remacri.onnx` (~67 MB, **CC BY-NC-SA 4.0, non-commercial**),
    192 px tiles, no mix. ~30x slower on CPU.
  - `auto` = `high` on a GPU, `fast` on CPU. GPU providers: DirectML (Windows), CUDA
    (Linux x64), CoreML (macOS arm64). Any GPU load or run failure falls back to CPU.
- Converters: `tools/build_compact_onnx.py`, `tools/build_rrdb_onnx.py`; attribution and
  source hashes in `models/LICENSES.md`. See `docs/DECISIONS.md`.

## Pipeline

1. The model upscales the image 4× (`fast`: one pass, no seams; `high`: 192 px tiles).
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
