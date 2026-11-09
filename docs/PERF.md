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

Earlier (2026-11-07, realesr-general-wdn-x4v3, old conversion): 823 / 1933 / 3513 ms total.
Totals vary run to run by ±100-200 ms (inference); compare stages, or totals measured in
the same session (T5 same-session: 1999 → 1921 ms @800 px).
The model always runs at 4×, so the factor barely changes latency.

## Findings

- **Model inference is ~90-99% of the time** and scales roughly with input pixel count.
- `fromTensor` (float → bytes over the 4× output) was ~6% and is now ~2-3% (T5: inline
  `floor(v*255+0.5)`, byte-identical to `Math.round` + clamp for float32 inputs).
- Pre/post resizing with sharp and the Lanczos mix are each ≲ 1–2%.
- First call additionally pays session creation (not measured here).

## Follow-up ideas (not implemented)

Further speed has to come from inference: fp16/int8 quantisation, thread tuning, or a GPU.
These change output quality or depend on hardware, so they need a human decision first.
