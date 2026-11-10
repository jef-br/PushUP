# Latency profile

## Methodology

`node bench/profile.js [--runs 5] [--sizes 400,600,800] [--factor 1.5]`

- Synthetic 4:3 images (gradient + noise). Latency depends on pixel count, not content.
- `total` is the public `upscale()` call, median of N runs after one warm-up call (so the
  one-off ONNX session load is excluded). Stage columns replay the same steps in the
  script, median of N runs, and are indicative (they don't sum exactly to `total`).
- Machine: 4 vCPU cloud container, Node 22, onnxruntime-node 1.31, sharp 0.35,
  `DEFAULT_LANCZOS_MIX` 0.2, full input fed to the model. Re-measure on your own hardware.

## Results (median ms)

Current (2026-11-09): model 4xLSDIRCompactC3, faster byte conversion (T5). Factor 1.5
(800 px input is capped to a 1000 px output). `total` and the stage columns come from
separate timed passes, so stages don't sum exactly to `total`; small stages are noisy:

| Input | total | toTensor | inference | fromTensor | Lanczos resize | Lanczos mix (incl. plain resize) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 400×300 | 452 | 6 | 399 | 13 | 6 | 18 |
| 600×450 | 1039 | 2 | 955 | 32 | 11 | 36 |
| 800×600 | 1792 | 3 | 1784 | 48 | 17 | 46 |

Conversion stage before → after T5 (same machine, median of 5): 63 → 13 ms @400,
148 → 32 ms @600, 250 → 48 ms @800. Same-session end-to-end totals: 493 → 468 ms @400,
1999 → 1921 ms @800 (the gain is about the stage saving; inference dominates).

Earlier (2026-11-07, realesr-general-wdn-x4v3, old conversion): 823 / 1933 / 3513 ms total.
Totals vary run to run by ±100-200 ms (inference); compare stages, or totals measured in
the same session (T5 same-session: 1999 → 1921 ms @800 px).
The model always runs at 4×, so the factor barely changes latency.

## Findings

- **Model inference is ~90-99% of the time** and scales roughly with input pixel count.
- `fromTensor` (float → bytes over the 4× output) was ~6% and is now ~2-3% (T5: inline
  `floor(v*255+0.5)`, byte-identical to `Math.round` + clamp for float32 inputs).
- Pre/post resizing with sharp and the Lanczos mix are each ≲ 1–2%.
- First call additionally pays session creation: small for `fast`, a few seconds for `high`
  (see "Cold start" below).

## Follow-up ideas (not implemented)

Further speed has to come from inference: fp16/int8 quantisation, thread tuning, or a GPU.
These change output quality or depend on hardware, so they need a human decision first.

## Cold start (Q3, 2026-11-10)

`node bench/cold.js` runs each measurement in a **fresh process** (sessions are cached per
model, so a second size in the same process would not be cold), on CPU, factor 1.5, synthetic
4:3 image. `require` = loading `src/index.js` (onnxruntime-node, sharp); `cold` = the first
`upscale()` call (includes creating the ONNX session); `warm` = median of the following calls.
Same machine as above (4 vCPU Xeon @ 2.1 GHz, Node 22.23). ms:

| Mode | Input | require | cold (1st call) | warm median | cold − warm | warm calls |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `fast` | 400×300 | 50 | 589 | 522 | 67 | 5 |
| `fast` | 800×600 | 42 | 2203 | 2131 | 72 | 5 |
| `high` | 400×300 | 57 | 15585 | 14254 | 1331 | 1 |
| `high` | 800×600 | 49 | 61150 | 57955 | 3195 | 1 |

A first `fast` run of the same script gave cold − warm of 65 ms @400 and 148 ms @800, so the
`fast` overhead is about 0.07-0.15 s and within run-to-run noise. `high` has one warm call
only (it takes about 14 s @400 and 58 s @800 per call), so its cold − warm figure is rougher;
the 67 MB model costs roughly 1.3-3 s extra on the first call.

**Would pre-warming help?** Not for `fast`: the first call costs about 0.1 s more than later
ones, which is below the noise of one request. For `high` it would save about 1-3 s once per
process, small next to the 14-58 s per call, and `high` is meant for GPU machines anyway
(not measured here). A pre-warm call would need a new API or a dummy upscale at start-up, so
there is no case for it now.
